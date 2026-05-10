"""close_period worker job — PER-04 / PER-03.

Runs daily at 00:01 Europe/Moscow via APScheduler (main_worker.py).

Phase 11 (Plan 11-06): per-tenant iteration. Outer session получает список
active users (``role IN ('owner', 'member')``); для каждого юзера открывается
isolated session, ставится ``set_tenant_scope`` и выполняется existing
close-period логика scoped по user_id. Failure одного юзера логируется и
continue к следующему — не валит весь job.

Behaviour:
    1. Outer session: acquire pg_try_advisory_lock(ADVISORY_LOCK_KEY); bail if False.
    2. Outer session: SELECT app_user WHERE role IN ('owner','member') —
       список ID активных юзеров.
    3. Release outer advisory lock + commit (advisory лок — global, один на job).
    4. Per-user loop: для каждого юзера:
       a. Open isolated AsyncSessionLocal session.
       b. set_tenant_scope(session, user.id).
       c. Run existing close-period логика scoped по user_id.
       d. Commit per-user OR rollback + log.exception on failure.

Idempotency: повторный запуск в тот же день — no-op (нет expired active period
после успешного close+create для каждого юзера).
"""
from datetime import datetime, timezone

import structlog
from sqlalchemy import func, select, text

from sqlalchemy.orm import selectinload

from app.core.period import period_for
from app.db.models import (
    ActualKind,
    ActualTransaction,
    AppUser,
    BudgetPeriod,
    PeriodStatus,
    Subscription,
    UserRole,
)
from app.db.session import AsyncSessionLocal, set_tenant_scope
from app.services.actual import compute_balance
from app.services.periods import _today_in_app_tz
from app.services.rollover import do_period_rollover
from app.services.subscriptions import add_subscription_to_period

logger = structlog.get_logger(__name__)

# Unique advisory lock key for close_period coordination.
# 8-digit yyyymmdd-style int — disjoint from future job keys (Phase 6
# notify=20250502, charge=20250503).
ADVISORY_LOCK_KEY = 20250501


async def _resolve_cycle_start_day(session, *, user_id: int) -> int:
    """Resolve cycle_start_day for user_id с fallback to 5.

    Phase 11: читаем AppUser.cycle_start_day напрямую через PK (user_id).
    app.services.settings.get_cycle_start_day оставлен на tg_user_id (Plan 11-05).
    """
    cycle = await session.scalar(
        select(AppUser.cycle_start_day).where(AppUser.id == user_id)
    )
    if cycle is None:
        return 5
    return cycle


async def close_period_job() -> None:
    """PER-04: close expired active period + create next period (per-tenant).

    Phase 11: iterates over active app_users; per-user transaction isolation
    means failure for one user does not roll back work done for others.

    Coordinated via pg_try_advisory_lock to prevent concurrent runs.
    """
    user_ids: list[int] = []

    async with AsyncSessionLocal() as outer:
        lock_acquired = False
        try:
            # Step 1: try to acquire advisory lock (non-blocking).
            lock_result = await outer.execute(
                text("SELECT pg_try_advisory_lock(:key)"),
                {"key": ADVISORY_LOCK_KEY},
            )
            lock_acquired = bool(lock_result.scalar())
            if not lock_acquired:
                logger.info("close_period.skipped.lock_not_acquired")
                return

            # Step 2: collect active users (owner + member, NOT revoked).
            users = (
                await outer.execute(
                    select(AppUser).where(
                        AppUser.role.in_([UserRole.owner, UserRole.member])
                    )
                )
            ).scalars().all()
            user_ids = [u.id for u in users]
        finally:
            if lock_acquired:
                try:
                    await outer.execute(
                        text("SELECT pg_advisory_unlock(:key)"),
                        {"key": ADVISORY_LOCK_KEY},
                    )
                    await outer.commit()
                except Exception:
                    logger.exception("close_period.unlock_failed")

    # Per-tenant iteration вне advisory lock — каждый user в своей session
    # (isolation: failure одного не валит остальных).
    for user_id in user_ids:
        async with AsyncSessionLocal() as session:
            try:
                await set_tenant_scope(session, user_id)
                await _close_period_for_user(session, user_id=user_id)
                await session.commit()
            except Exception:
                await session.rollback()
                logger.exception(
                    "close_period.failed_for_user", user_id=user_id
                )


async def _close_period_for_user(session, *, user_id: int) -> None:
    """Close-period логика scoped по user_id.

    Phase 11: existing single-user logic, но каждый query/INSERT
    фильтруется/ставит user_id.

    1. SELECT expired active period (scoped по user_id).
    2. compute_balance — scoped по user_id.
    3. Mark closed, INSERT next BudgetPeriod (user_id=user_id).
    4. Add subscription planned rows для нового периода (subs + planned scoped по user_id).
    """
    today = _today_in_app_tz()

    # Step 2: find expired active period for this user.
    stmt = (
        select(BudgetPeriod)
        .where(
            BudgetPeriod.user_id == user_id,
            BudgetPeriod.status == PeriodStatus.active,
            BudgetPeriod.period_end < today,
        )
        .order_by(BudgetPeriod.period_start.desc())
        .limit(1)
    )
    expired = (await session.execute(stmt)).scalar_one_or_none()

    if expired is None:
        logger.info("close_period.skipped.no_expired_period", user_id=user_id)
        return

    # Step 3: compute ending_balance via shared service (scoped по user_id).
    # This is the PRE-rollover number — only expense/income kinds are summed
    # (deposit/roundup excluded by compute_balance). It feeds the new period's
    # starting_balance_cents seed; once rollover deposits land in step 5 we
    # subtract them so the seed stays consistent with account.balance_cents
    # (CR-02 fix below).
    bal = await compute_balance(session, expired.id, user_id=user_id)
    pre_rollover_ending = int(bal["balance_now_cents"])

    # Step 4: create next period FIRST (PER-03 inheritance) so we have an id
    # for misc-rollover accumulation in step 5. Status flip on expired comes
    # after rollover so a rollover failure rolls back the entire per-user tx
    # (T-22-10-05 — rollover_processed_at NULL on failure → clean retry).
    #
    # starting_balance_cents is seeded with the pre-rollover number; we
    # adjust it (and ending_balance_cents on the expired period) AFTER
    # do_period_rollover() so the rollover deposits' effect on
    # account.balance_cents is reflected in both period markers
    # (CR-02 fix — keeps Σ account.balance_cents == Σ starting_balance_cents).
    cycle_start_day = await _resolve_cycle_start_day(session, user_id=user_id)
    p_start, p_end = period_for(today, cycle_start_day)
    new_period = BudgetPeriod(
        user_id=user_id,
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=pre_rollover_ending,
        status=PeriodStatus.active,
    )
    session.add(new_period)
    await session.flush()  # populate new_period.id

    # Step 5: BE-14 rollover — must run BEFORE expired.status=closed so that
    # rollover queries see expired period as the "current" closing period.
    # Returns False on advisory-lock contention (rare; only if another worker
    # tick races inside same second). On contention we still proceed with the
    # close + new period — rollover_processed_at remains NULL and next tick
    # retries the rollover (no-op for the close logic since expired.status
    # will already be 'closed' and the SELECT in step 2 won't pick it up
    # again; PER-04 idempotency holds).
    await do_period_rollover(
        session,
        period_id=expired.id,
        user_id=user_id,
        next_period_id=new_period.id,
    )

    # Step 5b: CR-02 fix — adjust the period markers to include rollover
    # deposits so Σ account.balance_cents stays in lockstep with both
    # ``expired.ending_balance_cents`` and ``new_period.starting_balance_cents``.
    #
    # do_period_rollover inserts ActualTransaction(kind=deposit,
    # amount_cents=-remainder, period_id=expired.id) for each savings-rollover
    # category whose plan was under-spent. The deposits' negative amount
    # represents an outflow from the user's primary account into the savings
    # bucket. compute_balance excludes deposit/roundup kinds, so the number
    # we computed above is rollover-naive.
    #
    # We compensate by summing all deposit amounts inserted for this period
    # by this rollover (parent_txn_id IS NULL filter excludes any unrelated
    # roundup children that might happen to share the period). Each deposit
    # row reduces account balance by abs(amount_cents) (it's stored negative);
    # subtracting Σ |deposit.amount_cents| from the pre-rollover ending
    # balance yields the post-rollover ending balance.
    deposits_total_q = select(
        func.coalesce(
            func.sum(func.abs(ActualTransaction.amount_cents)), 0
        )
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.period_id == expired.id,
        ActualTransaction.kind == ActualKind.deposit,
        ActualTransaction.parent_txn_id.is_(None),
    )
    rollover_deposits_total = int(
        (await session.execute(deposits_total_q)).scalar_one() or 0
    )
    ending_balance = pre_rollover_ending - rollover_deposits_total
    new_period.starting_balance_cents = ending_balance

    # Step 6: close expired period.
    expired.status = PeriodStatus.closed
    expired.ending_balance_cents = ending_balance
    expired.closed_at = datetime.now(timezone.utc)

    # Add subscription planned rows for the new period (scoped по user_id).
    subs_result = await session.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.is_active.is_(True),
            Subscription.next_charge_date >= p_start,
            Subscription.next_charge_date <= p_end,
        )
        .options(selectinload(Subscription.category))
    )
    for sub in subs_result.scalars().all():
        await add_subscription_to_period(
            session, sub, new_period.id, user_id=user_id
        )

    logger.info(
        "close_period.done",
        user_id=user_id,
        period_id_closed=expired.id,
        period_id_created=new_period.id,
        ending_balance_cents=ending_balance,
    )
