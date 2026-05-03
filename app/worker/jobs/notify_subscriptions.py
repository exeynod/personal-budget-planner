"""notify_subscriptions worker job — SUB-03 (D-78, D-79).

Runs daily at 09:00 Europe/Moscow via APScheduler (main_worker.py).

Behaviour:
    1. Acquire pg_try_advisory_xact_lock(ADVISORY_LOCK_KEY=20250502); bail if False.
       Transaction-level lock is automatically released on COMMIT/ROLLBACK —
       no explicit unlock needed, no risk of leaking the lock on connection reuse.
    2. Fetch AppUser; skip job if tg_chat_id is None (push nowhere to send).
    3. Query: active subscriptions where next_charge_date == today + notify_days_before.
    4. For each due subscription: send Telegram push via aiogram Bot API client.
    5. Close bot session in finally.

Threat mitigations:
    T-06-07: pg_try_advisory_xact_lock prevents concurrent runs (key 20250502).
    T-06-09: BOT_TOKEN never logged — only chat_id and sub_id appear in logs.
"""
import logging
from datetime import date

from aiogram import Bot
from sqlalchemy import select, text

from app.core.settings import settings
from app.db.models import AppUser, Subscription
from app.db.session import AsyncSessionLocal
from app.services.periods import _today_in_app_tz

logger = logging.getLogger(__name__)

# Unique advisory lock key for notify_subscriptions coordination.
# 8-digit yyyymmdd-style int disjoint from other job keys.
# See close_period.py comment: notify=20250502, charge=20250503.
ADVISORY_LOCK_KEY = 20250502


def _format_amount_rub(cents: int) -> str:
    """Format kopeck amount as human-readable rubles string.

    Example: 150050 → "1 500,50"
    """
    rub = cents / 100
    # Format with 2 decimal places, then swap separators to Russian convention
    formatted = f"{rub:,.2f}"  # e.g. "1,500.50"
    return formatted.replace(",", " ").replace(".", ",")  # "1 500,50"


async def notify_subscriptions_job() -> None:
    """SUB-03: send push notifications for subscriptions due in notify_days_before days.

    Advisory lock key: 20250502. Idempotent: repeated runs on same day are no-ops.
    Bot session is created only when there are notifications to send and closed in finally.
    """
    async with AsyncSessionLocal() as db:
        bot: Bot | None = None
        try:
            # Wrap all work in an explicit transaction so pg_try_advisory_xact_lock
            # is automatically released on COMMIT or ROLLBACK (transaction-level lock).
            # This avoids leaking session-level locks on connection pool reuse.
            async with db.begin():
                # Step 1: acquire advisory xact lock (non-blocking).
                lock_result = await db.execute(
                    text("SELECT pg_try_advisory_xact_lock(:key)"),
                    {"key": ADVISORY_LOCK_KEY},
                )
                lock_acquired = bool(lock_result.scalar())
                if not lock_acquired:
                    logger.info("notify_subscriptions: lock busy, skip")
                    return

                # Step 2: fetch app user, check tg_chat_id.
                user = await db.scalar(select(AppUser).limit(1))
                if user is None or user.tg_chat_id is None:
                    logger.info(
                        "notify_subscriptions: no tg_chat_id configured, skip"
                    )
                    return

                # Step 3: find subscriptions due exactly in notify_days_before days.
                today: date = _today_in_app_tz()
                rows = (
                    await db.execute(
                        select(Subscription).where(Subscription.is_active == True)  # noqa: E712
                    )
                ).scalars().all()

                due = [
                    s
                    for s in rows
                    if (s.next_charge_date - today).days == s.notify_days_before
                ]

                if not due:
                    logger.info("notify_subscriptions: nothing to notify today")
                    return

                # Step 4: send notifications via aiogram Bot API client (D-79).
                # Bot is used as a pure HTTP client — no dispatcher needed.
                bot = Bot(token=settings.BOT_TOKEN)

                for sub in due:
                    text_msg = (
                        f"\U0001f514 Подписка «{sub.name}»\n"
                        f"   Спишется {_format_amount_rub(sub.amount_cents)} ₽ "
                        f"через {sub.notify_days_before} дн. "
                        f"({sub.next_charge_date.strftime('%d.%m')})"
                    )
                    try:
                        await bot.send_message(
                            chat_id=user.tg_chat_id, text=text_msg
                        )
                        logger.info(
                            "notify_subscriptions: sent notification",
                            extra={"sub_id": sub.id, "chat_id": user.tg_chat_id},
                        )
                    except Exception:
                        # Log but continue — one failed send must not block others.
                        logger.exception(
                            "notify_subscriptions: send_message failed",
                            extra={"sub_id": sub.id},
                        )
                # Lock released automatically when `async with db.begin()` commits here.

        except Exception:
            logger.exception("notify_subscriptions: unexpected error")
        finally:
            # Close bot HTTP session (T-06-09: no token in logs).
            if bot is not None:
                try:
                    await bot.session.close()
                except Exception:
                    logger.exception("notify_subscriptions: bot session close failed")
