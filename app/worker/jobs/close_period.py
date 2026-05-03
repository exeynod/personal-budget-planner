"""close_period worker job — PER-04 / PER-03.

Runs daily at 00:01 Europe/Moscow via APScheduler (main_worker.py).

Behaviour:
    1. Acquire pg_try_advisory_lock(ADVISORY_LOCK_KEY); bail if False.
    2. SELECT active period with period_end < today_msk (expired).
    3. If none — no-op (idempotency: subsequent runs in same day exit here).
    4. Otherwise: compute ending_balance via actual.compute_balance, mark
       old period closed, INSERT next period with starting_balance_cents
       = ending_balance (PER-03), all in single DB transaction.
    5. On any error — session.rollback() + log.exception.
    6. Always release advisory lock in finally.

Idempotency: re-running same day is safe — no expired active period exists
after a successful close+create (new period covers today).
"""
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, text

from app.core.period import period_for
from app.core.settings import settings
from app.db.models import BudgetPeriod, PeriodStatus
from app.db.session import AsyncSessionLocal
from app.services.actual import compute_balance
from app.services.periods import _today_in_app_tz
from app.services.settings import UserNotFoundError, get_cycle_start_day

logger = structlog.get_logger(__name__)

# Unique advisory lock key for close_period coordination.
# 8-digit yyyymmdd-style int — disjoint from future job keys (Phase 6
# notify=20250502, charge=20250503).
ADVISORY_LOCK_KEY = 20250501


async def _resolve_cycle_start_day(session) -> int:
    """Resolve cycle_start_day for OWNER_TG_ID with fallback to 5."""
    try:
        return await get_cycle_start_day(session, settings.OWNER_TG_ID)
    except UserNotFoundError:
        return 5


async def close_period_job() -> None:
    """PER-04: close expired active period + create next period.

    Single DB transaction. Idempotent: no-op if no expired active period.
    Coordinated via pg_try_advisory_lock to prevent concurrent runs.
    """
    async with AsyncSessionLocal() as session:
        lock_acquired = False
        try:
            # Step 1: try to acquire advisory lock (non-blocking).
            lock_result = await session.execute(
                text("SELECT pg_try_advisory_lock(:key)"),
                {"key": ADVISORY_LOCK_KEY},
            )
            lock_acquired = bool(lock_result.scalar())
            if not lock_acquired:
                logger.info("close_period.skipped.lock_not_acquired")
                return

            today = _today_in_app_tz()

            # Step 2: find expired active period.
            stmt = (
                select(BudgetPeriod)
                .where(
                    BudgetPeriod.status == PeriodStatus.active,
                    BudgetPeriod.period_end < today,
                )
                .order_by(BudgetPeriod.period_start.desc())
                .limit(1)
            )
            expired = (await session.execute(stmt)).scalar_one_or_none()

            if expired is None:
                logger.info("close_period.skipped.no_expired_period")
                return

            # Step 3: compute ending_balance via shared service.
            bal = await compute_balance(session, expired.id)
            ending_balance = bal["balance_now_cents"]

            # Step 4: close expired period.
            expired.status = PeriodStatus.closed
            expired.ending_balance_cents = ending_balance
            expired.closed_at = datetime.now(timezone.utc)

            # Step 5: create next period (PER-03 inheritance).
            cycle_start_day = await _resolve_cycle_start_day(session)
            p_start, p_end = period_for(today, cycle_start_day)
            new_period = BudgetPeriod(
                period_start=p_start,
                period_end=p_end,
                starting_balance_cents=ending_balance,
                status=PeriodStatus.active,
            )
            session.add(new_period)

            await session.commit()
            logger.info(
                "close_period.done",
                period_id_closed=expired.id,
                period_id_created=new_period.id,
                ending_balance_cents=ending_balance,
            )
        except Exception:
            await session.rollback()
            logger.exception("close_period.failed")
        finally:
            if lock_acquired:
                try:
                    await session.execute(
                        text("SELECT pg_advisory_unlock(:key)"),
                        {"key": ADVISORY_LOCK_KEY},
                    )
                    await session.commit()
                except Exception:
                    logger.exception("close_period.unlock_failed")
