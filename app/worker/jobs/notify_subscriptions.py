"""notify_subscriptions worker job — SUB-03 (D-78, D-79).

Runs daily at 09:00 Europe/Moscow via APScheduler (main_worker.py).

Phase 11 (Plan 11-06): per-tenant iteration. Outer session получает список
active users с tg_chat_id IS NOT NULL (без чата некуда push'ить); для каждого
ставится tenant scope, выбираются due subscriptions, и push отправляются с
user.tg_chat_id. Bot session — глобальная (один Bot инстанс на всех юзеров;
chat_id per user).

Behaviour:
    1. Outer session: acquire pg_try_advisory_xact_lock(ADVISORY_LOCK_KEY=20250502).
    2. Outer session: SELECT users WHERE role IN ('owner','member') AND
       tg_chat_id IS NOT NULL — список (id, tg_chat_id).
    3. Per-user inside the same outer transaction: для каждого юзера ставим
       set_tenant_scope, fetch due subscriptions, отправляем push'и.
    4. Bot HTTP session открывается lazily (если есть кому слать) и закрывается
       в finally.

Threat mitigations:
    T-06-07: pg_try_advisory_xact_lock prevents concurrent runs (key 20250502).
    T-06-09: BOT_TOKEN never logged — only chat_id and sub_id appear in logs.
    T-11-06-03: per-user try/except — failure одного юзера логируется и
                continue к следующему.
"""
import logging
from datetime import date

from aiogram import Bot
from sqlalchemy import select, text

from app.core.settings import settings
from app.db.models import AppUser, Subscription, UserRole
from app.db.session import AsyncSessionLocal, set_tenant_scope
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

    Phase 11: per-tenant iteration. Advisory lock — global (one per job).
    Idempotent: повторные запуски в тот же день — no-op (notify_days_before
    matches только конкретные subscriptions).
    """
    bot: Bot | None = None
    today: date = _today_in_app_tz()
    try:
        async with AsyncSessionLocal() as db:
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

                # Step 2: collect active users with tg_chat_id (push target).
                users = (
                    await db.execute(
                        select(AppUser).where(
                            AppUser.role.in_(
                                [UserRole.owner, UserRole.member]
                            ),
                            AppUser.tg_chat_id.is_not(None),
                        )
                    )
                ).scalars().all()

                if not users:
                    logger.info(
                        "notify_subscriptions: no active users with tg_chat_id, skip"
                    )
                    return

                # Step 3: per-tenant iteration внутри outer transaction.
                # Все запросы выполняются с set_tenant_scope для этого юзера.
                # Bot создаётся lazily если есть что отправлять.
                for user in users:
                    try:
                        await set_tenant_scope(db, user.id)

                        rows = (
                            await db.execute(
                                select(Subscription).where(
                                    Subscription.user_id == user.id,
                                    Subscription.is_active == True,  # noqa: E712
                                )
                            )
                        ).scalars().all()

                        due = [
                            s
                            for s in rows
                            if (s.next_charge_date - today).days
                            == s.notify_days_before
                        ]

                        if not due:
                            logger.info(
                                "notify_subscriptions: nothing for user_id=%s",
                                user.id,
                            )
                            continue

                        # Step 4: send notifications via aiogram Bot API client (D-79).
                        # Bot is used as a pure HTTP client — no dispatcher needed.
                        if bot is None:
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
                                    extra={
                                        "user_id": user.id,
                                        "sub_id": sub.id,
                                        "chat_id": user.tg_chat_id,
                                    },
                                )
                            except Exception:
                                # Log but continue — one failed send must not block others.
                                logger.exception(
                                    "notify_subscriptions: send_message failed",
                                    extra={
                                        "user_id": user.id,
                                        "sub_id": sub.id,
                                    },
                                )
                    except Exception:
                        logger.exception(
                            "notify_subscriptions: failed for user",
                            extra={"user_id": user.id},
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
