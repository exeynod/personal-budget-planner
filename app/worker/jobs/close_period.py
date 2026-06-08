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
from sqlalchemy import delete, select, text

from sqlalchemy.orm import selectinload

from app.core.period import period_for
from app.db.models import (
    AppUser,
    BudgetPeriod,
    PeriodStatus,
    PlannedTransaction,
    PlanSource,
    Subscription,
    UserRole,
)
from app.db.session import AsyncSessionLocal, set_tenant_scope
from app.services.actual import compute_balance
from app.services.periods import _today_in_app_tz
from app.services.planned import apply_template_to_period
from app.services.subscriptions import (
    _advance_charge_date,
    add_subscription_to_period,
)

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
                (
                    await outer.execute(
                        select(AppUser).where(
                            AppUser.role.in_([UserRole.owner, UserRole.member])
                        )
                    )
                )
                .scalars()
                .all()
            )
            user_ids = [u.id for u in users]
        finally:
            if lock_acquired:
                try:
                    # WR-06 (Phase 22 review): drop the outer.commit() — the
                    # outer session only ran a SELECT and the advisory unlock
                    # itself. ``pg_try_advisory_lock`` is connection-scoped
                    # (NOT transaction-scoped, unlike the xact variant used
                    # in rollover.py), so the unlock does not require a
                    # commit to take effect. Issuing commit here would only
                    # flush any unrelated dirty state that an autoflush had
                    # silently captured — a pure footgun for a read-only
                    # outer session.
                    await outer.execute(
                        text("SELECT pg_advisory_unlock(:key)"),
                        {"key": ADVISORY_LOCK_KEY},
                    )
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
                logger.exception("close_period.failed_for_user", user_id=user_id)


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

    # Step 2b (ADR-0007): auto-skip unposted recurring occurrences of the
    # closing period — they "didn't happen". Delete only unposted
    # subscription_auto rows; posted ones (with a linked actual) survive so the
    # ending balance reflects real spend. Done BEFORE compute_balance / close.
    await session.execute(
        delete(PlannedTransaction).where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id == expired.id,
            PlannedTransaction.source == PlanSource.subscription_auto,
            PlannedTransaction.posted_txn_id.is_(None),
        )
    )

    # Step 3: compute ending_balance via shared service (scoped по user_id).
    # Only expense/income kinds are summed (deposit/roundup excluded). v1.1:
    # rollover выпилен (AGREED §G4) — the ending balance is just this number.
    bal = await compute_balance(session, expired.id, user_id=user_id)
    ending_balance = int(bal["balance_now_cents"])

    # Step 4: create next period (PER-03 inheritance) seeded with the ending
    # balance of the expired period.
    cycle_start_day = await _resolve_cycle_start_day(session, user_id=user_id)
    p_start, p_end = period_for(today, cycle_start_day)
    # ADR-0008: the rolled period is created WITHOUT planned_at (NULL) on
    # purpose — a NULL planned_at is what flips home.needs_planning to True and
    # triggers the monthly planning gate on the user's first entry into the new
    # period. It is set later by POST /periods/{id}/confirm-plan.
    new_period = BudgetPeriod(
        user_id=user_id,
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=ending_balance,
        status=PeriodStatus.active,
    )
    session.add(new_period)
    await session.flush()  # populate new_period.id

    # Step 5: close expired period.
    expired.status = PeriodStatus.closed
    expired.ending_balance_cents = ending_balance
    expired.closed_at = datetime.now(timezone.utc)

    # Step 6 (v1.1): apply the plan template to the new period — copies
    # plan_template_item → period_category_plan and plan_template_line →
    # planned_transaction(manual). Idempotent (no-op if a per-period plan
    # already exists). Runs inside the per-user tenant scope set above.
    await apply_template_to_period(session, user_id=user_id, period_id=new_period.id)

    # Step 7 (ADR-0007): materialise recurring payments into the new period.
    # apply_template_to_period intentionally does NOT touch subscriptions
    # (different source) so these are added here. A payment may fall multiple
    # times inside the period (interval < period length), so we loop while the
    # cursor stays in bounds — add_subscription_to_period advances it by
    # ``interval_months`` after each successful materialisation.
    subs_result = await session.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.is_active.is_(True),
            Subscription.next_charge_date <= p_end,
        )
        .options(selectinload(Subscription.category))
    )
    for sub in subs_result.scalars().all():
        # Catch-up guard: if the cursor lags before the new period start (e.g.
        # a payment that was never materialised), advance it without inserting
        # into past periods until it reaches the window or passes the end.
        guard = 0
        while sub.next_charge_date < p_start and guard < 1000:
            sub.next_charge_date = _advance_charge_date(sub)
            guard += 1
        await session.flush()
        guard = 0
        while p_start <= sub.next_charge_date <= p_end and guard < 1000:
            inserted = await add_subscription_to_period(
                session, sub, new_period.id, user_id=user_id
            )
            if inserted is None:
                # Idempotent collision (already materialised for this charge
                # date) — advance manually to avoid an infinite loop.
                sub.next_charge_date = _advance_charge_date(sub)
                await session.flush()
            guard += 1

    logger.info(
        "close_period.done",
        user_id=user_id,
        period_id_closed=expired.id,
        period_id_created=new_period.id,
        ending_balance_cents=ending_balance,
    )
