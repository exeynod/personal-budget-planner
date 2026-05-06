"""charge_subscriptions worker job — SUB-04 (D-80).

Runs daily at 00:05 Europe/Moscow via APScheduler (main_worker.py).

Phase 11 (Plan 11-06): per-tenant iteration. Outer session получает список
active users (``role IN ('owner', 'member')``); для каждого юзера ставится
tenant scope, выбираются due-сегодня subscriptions, и каждая обрабатывается
в своей isolated session (per-sub commit isolation сохранён).

Behaviour:
    1. Outer session: acquire pg_try_advisory_lock(ADVISORY_LOCK_KEY=20250503).
    2. Outer session: SELECT active users; release lock.
    3. Per-user loop: для каждого юзера:
       a. Open session-A (per-user), set_tenant_scope, fetch due-today sub IDs +
          cycle_start_day. Close session.
       b. Per-sub loop: для каждого sub_id:
          - Open session-B (per-sub), set_tenant_scope, charge_subscription, commit.
          - AlreadyChargedError → log warning + skip (idempotency).
          - Other exceptions → log.exception + skip к следующему sub.
    4. Lock acquired в outer session; advisory лок — global (один на job),
       не per-user.

Threat mitigations:
    T-06-07: pg_try_advisory_lock prevents concurrent runs (key 20250503).
    T-06-08: AlreadyChargedError catches uq_planned_sub_charge_date violations —
             duplicate charges are no-ops.
    T-11-06-03: per-user / per-sub try/except — failure одного юзера/sub не
                валит весь job.
"""
import logging

from sqlalchemy import select, text

from app.db.models import AppUser, Subscription, UserRole
from app.db.session import AsyncSessionLocal, set_tenant_scope
from app.services.periods import _today_in_app_tz
from app.services.settings import UserNotFoundError, get_cycle_start_day
from app.services.subscriptions import AlreadyChargedError, charge_subscription

logger = logging.getLogger(__name__)

# Unique advisory lock key for charge_subscriptions coordination.
# See close_period.py comment: notify=20250502, charge=20250503.
ADVISORY_LOCK_KEY = 20250503


async def charge_subscriptions_job() -> None:
    """SUB-04: create PlannedTransaction entries for subscriptions due today.

    Phase 11: per-tenant iteration; advisory lock global (one per job, not per user).
    Per-subscription commit isolation ensures one failure does not roll back
    already-processed subscriptions.

    AlreadyChargedError is caught and treated as a no-op (idempotency).
    """
    user_ids: list[int] = []

    async with AsyncSessionLocal() as db_outer:
        lock_acquired = False
        try:
            # Step 1: acquire advisory lock (non-blocking).
            lock_result = await db_outer.execute(
                text("SELECT pg_try_advisory_lock(:key)"),
                {"key": ADVISORY_LOCK_KEY},
            )
            lock_acquired = bool(lock_result.scalar())
            if not lock_acquired:
                logger.info("charge_subscriptions: lock busy, skip")
                return

            # Step 2: collect active users (owner + member).
            users = (
                await db_outer.execute(
                    select(AppUser).where(
                        AppUser.role.in_([UserRole.owner, UserRole.member])
                    )
                )
            ).scalars().all()
            user_ids = [u.id for u in users]
        except Exception:
            logger.exception(
                "charge_subscriptions: unexpected error in outer session"
            )
        finally:
            # Release advisory lock (must happen even on error).
            if lock_acquired:
                try:
                    await db_outer.execute(
                        text("SELECT pg_advisory_unlock(:key)"),
                        {"key": ADVISORY_LOCK_KEY},
                    )
                    await db_outer.commit()
                except Exception:
                    logger.exception(
                        "charge_subscriptions: advisory unlock failed"
                    )

    # Per-tenant iteration (вне advisory lock).
    today = _today_in_app_tz()

    for user_id in user_ids:
        # Step A: per-user session — собрать due IDs и cycle_start_day.
        try:
            async with AsyncSessionLocal() as db_user:
                await set_tenant_scope(db_user, user_id)
                try:
                    cycle_start = await get_cycle_start_day(
                        db_user, user_id=user_id
                    )
                except UserNotFoundError:
                    cycle_start = 5  # AppUser.cycle_start_day default

                ids = (
                    await db_user.execute(
                        select(Subscription.id).where(
                            Subscription.user_id == user_id,
                            Subscription.is_active == True,  # noqa: E712
                            Subscription.next_charge_date == today,
                        )
                    )
                ).scalars().all()
        except Exception:
            logger.exception(
                "charge_subscriptions: failed to enumerate user subs",
                extra={"user_id": user_id},
            )
            continue

        logger.info(
            "charge_subscriptions: %d subscriptions due today for user_id=%s",
            len(ids),
            user_id,
        )

        # Step B: per-sub session — изолированный commit per subscription.
        for sub_id in ids:
            async with AsyncSessionLocal() as db:
                try:
                    await set_tenant_scope(db, user_id)
                    planned, new_date = await charge_subscription(
                        db, sub_id, user_id=user_id, cycle_start_day=cycle_start
                    )
                    await db.commit()
                    logger.info(
                        "charge_subscriptions: charged subscription",
                        extra={
                            "user_id": user_id,
                            "sub_id": sub_id,
                            "next_charge_date": str(new_date),
                        },
                    )
                except AlreadyChargedError:
                    # T-06-08: duplicate charge detected via unique constraint — safe to skip.
                    logger.warning(
                        "charge_subscriptions: user_id=%s sub_id=%s already charged today, skipping",
                        user_id,
                        sub_id,
                    )
                except Exception:
                    logger.exception(
                        "charge_subscriptions: failed to charge",
                        extra={"user_id": user_id, "sub_id": sub_id},
                    )
