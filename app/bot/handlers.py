"""aiogram ``/start`` handler — chat-bind + WebApp button (ONB-03).

Replaces the Phase 1 stub in ``main_bot.py``.

Behaviour
---------
- ``/start`` from non-OWNER → ``"Бот приватный"``. Defence-in-depth: Telegram
  already only delivers messages from chats the OWNER opens, but we re-check
  per HLD §5 and avoid making any internal API call for stranger users.
- ``/start`` from OWNER:
    1. Calls internal ``/telegram/chat-bind`` to persist ``tg_chat_id``.
    2. Parses optional ``CommandObject.args`` (``/start onboard`` →
       specialised greeting).
    3. Replies with greeting + InlineKeyboardButton(web_app=WebAppInfo(MINI_APP_URL)).
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
from app.core.settings import settings


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
    """``/start`` — chat-bind for OWNER, otherwise reject."""
    if not message.from_user:
        return  # safety: ignore service messages without a sender

    user_id = message.from_user.id

    # OWNER_TG_ID whitelist (HLD §5, AUTH-02 carry-over from Phase 1)
    if user_id != settings.OWNER_TG_ID:
        await message.answer("Бот приватный.")
        logger.info("bot.start.rejected_non_owner", tg_user_id=user_id)
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
