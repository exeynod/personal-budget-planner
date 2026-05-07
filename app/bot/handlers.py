"""aiogram ``/start`` handler — chat-bind + WebApp button (ONB-03).

Replaces the Phase 1 stub in ``main_bot.py``.

Behaviour
---------
- ``/start`` from non-whitelisted (revoked/unknown role) → ``"Бот приватный"``.
  Phase 12: role check via bot_resolve_user_role replaces OWNER_TG_ID-eq.
  Defence-in-depth: Telegram delivers messages from chats the user opens,
  we re-check role per HLD §5 + Phase 12 CONTEXT.
- ``/start`` from owner or member:
    1. Calls internal ``/telegram/chat-bind`` to persist ``tg_chat_id``.
    2. Resolves (role, onboarded_at) via bot_resolve_user_status (Phase 14).
    3. Branches greeting:
       - ``onboarded_at IS NULL`` (member invited but not yet onboarded) →
         MTONB-01 invite copy ("Откройте приложение и пройдите настройку").
       - Otherwise: existing onboarded greeting (deep-link payload aware).
    4. Replies with greeting + InlineKeyboardButton(web_app=WebAppInfo(MINI_APP_URL)).
- If chat-bind fails (network down, API not ready) → log a warning, continue,
  reply with degraded copy that asks the user to retry ``/start``.

The handler is unit-tested in ``tests/test_bot_handlers.py``.
"""
from __future__ import annotations

import structlog
from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from app.bot.api_client import InternalApiError, bind_chat_id
from app.bot.auth import bot_resolve_user_role, bot_resolve_user_status
from app.core.settings import settings
from app.db.models import UserRole


logger = structlog.get_logger(__name__)
router = Router()


def _open_app_keyboard() -> InlineKeyboardMarkup:
    """Single-row inline keyboard with a WebApp launcher (D-12)."""
    btn = InlineKeyboardButton(
        text="Открыть бюджет",
        web_app=WebAppInfo(url=settings.MINI_APP_URL),
    )
    return InlineKeyboardMarkup(inline_keyboard=[[btn]])


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject) -> None:
    """``/start`` — chat-bind + role-and-onboarded-aware greeting."""
    if not message.from_user:
        return  # safety: ignore service messages without a sender

    user_id = message.from_user.id

    # Phase 12 ROLE-02/03 + Phase 14 MTONB-01: resolve (role, onboarded_at)
    role, onboarded_at = await bot_resolve_user_status(user_id)
    if role not in (UserRole.owner, UserRole.member):
        # revoked, unknown, or DB unreachable → silent reject (carry-over UX)
        await message.answer("Бот приватный.")
        logger.info(
            "bot.start.rejected",
            tg_user_id=user_id,
            role=role.value if role else None,
        )
        return

    chat_id = message.chat.id

    # Step 1: bind tg_chat_id (best-effort; user can re-issue /start to retry)
    chat_bound = True
    try:
        await bind_chat_id(tg_user_id=user_id, tg_chat_id=chat_id)
    except InternalApiError:
        # Already logged inside api_client. Keep going so the user still
        # gets the WebApp button.
        chat_bound = False

    # Step 2: parse deep-link payload (Pattern 1 from RESEARCH.md)
    payload = command.args  # str | None — "onboard" if launched via deep link

    # Phase 14 MTONB-01: invited member with onboarded_at IS NULL → invite copy.
    # Owner is always considered onboarded (backfilled in Phase 11 migration);
    # member invited via Phase 13 admin UI starts with onboarded_at=NULL.
    if onboarded_at is None:
        greeting = (
            "Добро пожаловать! "
            "Откройте приложение и пройдите настройку — это займёт минуту."
        )
        await message.answer(greeting, reply_markup=_open_app_keyboard())
        logger.info(
            "bot.start.invite_pending",
            tg_user_id=user_id,
            tg_chat_id=chat_id,
            chat_bound=chat_bound,
            role=role.value,
        )
        return

    if payload == "onboard":
        greeting = (
            "Готово, push-уведомления включены.\n"
            "Откройте Mini App для настройки бюджета."
        )
    elif chat_bound:
        greeting = (
            "Бот запущен и готов к работе.\n"
            "Push-уведомления включены — откройте Mini App, "
            "чтобы управлять бюджетом."
        )
    else:
        greeting = (
            "Бот запущен, но не удалось привязать чат для push-уведомлений.\n"
            "Попробуйте /start ещё раз через минуту.\n"
            "Можно открыть Mini App — уведомления подключатся позже."
        )

    await message.answer(greeting, reply_markup=_open_app_keyboard())
    logger.info(
        "bot.start.replied",
        tg_user_id=user_id,
        tg_chat_id=chat_id,
        chat_bound=chat_bound,
        payload=payload,
    )
