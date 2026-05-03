"""charge_subscriptions worker job — SUB-04 (D-80).

Runs daily at 00:05 Europe/Moscow via APScheduler (main_worker.py).

Behaviour:
    1. Acquire pg_try_advisory_lock(ADVISORY_LOCK_KEY=20250503); bail if False.
    2. Fetch AppUser; skip if none found.
    3. Query: active subscriptions with next_charge_date == today_msk.
    4. For each subscription (isolated DB session per sub):
       a. Call charge_subscription(db, sub_id, cycle_start_day) → PlannedTransaction + new date.
       b. COMMIT per subscription (isolation: one failure doesn't rollback the rest).
       c. AlreadyChargedError → log warning + skip (idempotency via unique constraint).
       d. Other exceptions → log.exception + skip to next subscription.
    5. Release advisory lock in finally.

Threat mitigations:
    T-06-07: pg_try_advisory_lock prevents concurrent runs (key 20250503).
    T-06-08: AlreadyChargedError catches uq_planned_sub_charge_date violations — duplicate charges are no-ops.
"""
import logging

from sqlalchemy import select, text

from app.db.models import AppUser, Subscription
from app.db.session import AsyncSessionLocal
from app.services.periods import _today_in_app_tz
from app.services.settings import get_cycle_start_day
from app.services.subscriptions import AlreadyChargedError, charge_subscription

logger = logging.getLogger(__name__)

# Unique advisory lock key for charge_subscriptions coordination.
# See close_period.py comment: notify=20250502, charge=20250503.
ADVISORY_LOCK_KEY = 20250503


async def charge_subscriptions_job() -> None:
    """SUB-04: create PlannedTransaction entries for subscriptions due today.

    Advisory lock key: 20250503. Per-subscription commit isolation ensures
    one failure does not roll back already-processed subscriptions.
    AlreadyChargedError is caught and treated as a no-op (idempotency).
    """
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

            # Step 2: fetch app user.
            user = await db_outer.scalar(select(AppUser).limit(1))
            if user is None:
                logger.info("charge_subscriptions: no app user found, skip")
                return

            # Step 3: collect IDs of subscriptions due today.
            today = _today_in_app_tz()
            cycle_start = await get_cycle_start_day(db_outer, user.tg_user_id)

            ids = (
                await db_outer.execute(
                    select(Subscription.id).where(
                        Subscription.is_active == True,  # noqa: E712
                        Subscription.next_charge_date == today,
                    )
                )
            ).scalars().all()

            logger.info(
                "charge_subscriptions: %d subscriptions due today", len(ids)
            )

            # Step 4: process each subscription in its own isolated session.
            for sub_id in ids:
                async with AsyncSessionLocal() as db:
                    try:
                        planned, new_date = await charge_subscription(
                            db, sub_id, cycle_start_day=cycle_start
                        )
                        await db.commit()
                        logger.info(
                            "charge_subscriptions: charged subscription",
                            extra={"sub_id": sub_id, "next_charge_date": str(new_date)},
                        )
                    except AlreadyChargedError:
                        # T-06-08: duplicate charge detected via unique constraint — safe to skip.
                        logger.warning(
                            "charge_subscriptions: sub_id=%s already charged today, skipping",
                            sub_id,
                        )
                    except Exception:
                        logger.exception(
                            "charge_subscriptions: failed to charge sub_id=%s", sub_id
                        )

        except Exception:
            logger.exception("charge_subscriptions: unexpected error in outer session")
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
                    logger.exception("charge_subscriptions: advisory unlock failed")
