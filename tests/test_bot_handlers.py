"""Unit tests for app/bot/handlers.py and app/bot/api_client.py (Plan 02-05).

These are RED-state tests verifying the bot module structure exists with the
contracts the plan promises:

- ``api_client.bind_chat_id`` — async function that POSTs to
  ``/api/v1/internal/telegram/chat-bind`` with ``X-Internal-Token``.
- ``api_client.InternalApiError`` — exception raised on connection / non-2xx.
- ``handlers.router`` — aiogram Router with at least one message handler.
- ``handlers.cmd_start`` — handler that:
    * rejects non-OWNER with "Бот приватный" and skips chat-bind;
    * for OWNER, calls bind_chat_id then replies with WebApp button;
    * gracefully degrades when bind_chat_id raises InternalApiError.

Tests use ``unittest.mock`` to stub bind_chat_id and aiogram message types so
no real Telegram or HTTP traffic is made. They run without DATABASE_URL.

Wave 4 RED state: tests fail with ModuleNotFoundError until Plan 02-05
implements ``app.bot.handlers`` and ``app.bot.api_client``.
"""
from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# Ensure settings can be imported even when running this file in isolation.
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
os.environ.setdefault("MINI_APP_URL", "https://example.test")


def _make_message(*, user_id: int | None, chat_id: int = 999) -> MagicMock:
    """Build a stub aiogram Message with from_user/chat/answer."""
    msg = MagicMock()
    msg.from_user = SimpleNamespace(id=user_id) if user_id is not None else None
    msg.chat = SimpleNamespace(id=chat_id)
    msg.answer = AsyncMock()
    return msg


def _make_command(args: str | None) -> MagicMock:
    cmd = MagicMock()
    cmd.args = args
    return cmd


def test_api_client_module_exports() -> None:
    """api_client exports bind_chat_id and InternalApiError."""
    from app.bot import api_client

    assert hasattr(api_client, "bind_chat_id")
    assert hasattr(api_client, "InternalApiError")
    assert issubclass(api_client.InternalApiError, Exception)


def test_handlers_module_exports_router() -> None:
    """handlers module exposes a Router with at least one message handler."""
    from aiogram import Router

    from app.bot import handlers

    assert isinstance(handlers.router, Router)
    # aiogram Router stores message handlers under .message.handlers
    assert len(handlers.router.message.handlers) >= 1


@pytest.mark.asyncio
async def test_cmd_start_rejects_non_owner() -> None:
    """Non-OWNER user gets 'Бот приватный' and bind_chat_id is NOT called."""
    from app.bot import handlers
    from app.db.models import UserRole

    message = _make_message(user_id=999_999_999)  # not OWNER
    command = _make_command(None)

    with patch("app.bot.handlers.bind_chat_id", new=AsyncMock()) as mock_bind, \
         patch("app.bot.handlers.bot_resolve_user_role", new=AsyncMock(return_value=UserRole.revoked)):
        await handlers.cmd_start(message, command)

    message.answer.assert_awaited_once()
    sent_text = message.answer.await_args.args[0]
    assert "приватный" in sent_text.lower()
    mock_bind.assert_not_called()


@pytest.mark.asyncio
async def test_cmd_start_owner_calls_bind_and_replies_with_webapp_button() -> None:
    """OWNER user triggers chat-bind and receives an InlineKeyboard with WebApp."""
    from aiogram.types import InlineKeyboardMarkup

    from app.bot import handlers
    from app.core.settings import settings
    from app.db.models import UserRole

    message = _make_message(user_id=settings.OWNER_TG_ID, chat_id=42)
    command = _make_command(None)

    with patch(
        "app.bot.handlers.bind_chat_id", new=AsyncMock(return_value=None)
    ) as mock_bind, patch(
        "app.bot.handlers.bot_resolve_user_role", new=AsyncMock(return_value=UserRole.owner)
    ):
        await handlers.cmd_start(message, command)

    mock_bind.assert_awaited_once_with(
        tg_user_id=settings.OWNER_TG_ID, tg_chat_id=42
    )
    message.answer.assert_awaited_once()

    # Check reply_markup is an InlineKeyboardMarkup containing a web_app button
    kwargs = message.answer.await_args.kwargs
    reply_markup = kwargs.get("reply_markup")
    assert isinstance(reply_markup, InlineKeyboardMarkup)
    flat_buttons = [b for row in reply_markup.inline_keyboard for b in row]
    assert any(b.web_app is not None for b in flat_buttons), (
        "Expected at least one WebApp button"
    )


@pytest.mark.asyncio
async def test_cmd_start_handles_internal_api_error_gracefully() -> None:
    """When bind_chat_id raises InternalApiError, handler still replies."""
    from app.bot import handlers
    from app.bot.api_client import InternalApiError
    from app.core.settings import settings
    from app.db.models import UserRole

    message = _make_message(user_id=settings.OWNER_TG_ID, chat_id=42)
    command = _make_command(None)

    with patch(
        "app.bot.handlers.bind_chat_id",
        new=AsyncMock(side_effect=InternalApiError("boom")),
    ), patch(
        "app.bot.handlers.bot_resolve_user_role",
        new=AsyncMock(return_value=UserRole.owner),
    ):
        # Must NOT propagate the exception
        await handlers.cmd_start(message, command)

    message.answer.assert_awaited_once()
    # Body should still be sent (degraded copy is acceptable)
    sent_text = message.answer.await_args.args[0]
    assert sent_text  # non-empty


@pytest.mark.asyncio
async def test_cmd_start_parses_onboard_payload() -> None:
    """`/start onboard` triggers the specialised greeting copy."""
    from app.bot import handlers
    from app.core.settings import settings
    from app.db.models import UserRole

    message = _make_message(user_id=settings.OWNER_TG_ID, chat_id=42)
    command = _make_command("onboard")

    with patch("app.bot.handlers.bind_chat_id", new=AsyncMock(return_value=None)), \
         patch("app.bot.handlers.bot_resolve_user_role", new=AsyncMock(return_value=UserRole.owner)):
        await handlers.cmd_start(message, command)

    message.answer.assert_awaited_once()
    sent_text = message.answer.await_args.args[0]
    # Specialised onboarding copy must be distinct (mentions push or notifications)
    lower = sent_text.lower()
    assert "push" in lower or "уведомлен" in lower


@pytest.mark.asyncio
async def test_bind_chat_id_sends_internal_token_header() -> None:
    """bind_chat_id POSTs JSON with X-Internal-Token header on success path."""
    from app.bot import api_client
    from app.core.settings import settings

    captured: dict = {}

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["client_init"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, path, json, headers):
            captured["path"] = path
            captured["json"] = json
            captured["headers"] = headers
            return _FakeResponse()

    with patch.object(api_client.httpx, "AsyncClient", _FakeAsyncClient):
        await api_client.bind_chat_id(tg_user_id=111, tg_chat_id=222)

    assert captured["path"].endswith("/api/v1/internal/telegram/chat-bind")
    assert captured["json"] == {"tg_user_id": 111, "tg_chat_id": 222}
    assert captured["headers"]["X-Internal-Token"] == settings.INTERNAL_TOKEN


@pytest.mark.asyncio
async def test_bind_chat_id_raises_internal_api_error_on_http_failure() -> None:
    """httpx.HTTPError is wrapped into InternalApiError."""
    import httpx

    from app.bot import api_client

    class _FailingClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("connection refused")

    with patch.object(api_client.httpx, "AsyncClient", _FailingClient):
        with pytest.raises(api_client.InternalApiError):
            await api_client.bind_chat_id(tg_user_id=111, tg_chat_id=222)


# ---------------------------------------------------------------
# Phase 14 MTONB-01: cmd_start branch for member with onboarded_at=None
# ---------------------------------------------------------------

async def test_cmd_start_member_not_onboarded_uses_invite_copy() -> None:
    """Member with onboarded_at=None → "Откройте приложение и пройдите настройку".

    Phase 14 D-14-02: bot extracts (role, onboarded_at) via
    bot_resolve_user_status. Existing bot_resolve_user_role helper
    cannot distinguish onboarded vs not-onboarded — Plan 14-04 adds the
    sibling. Test fails with assertion error until then (create=True
    patches the non-existing attribute so the test can reach the
    assertion line, which will fail because cmd_start has not yet
    implemented the not-onboarded branch).
    """
    from app.bot import handlers
    from app.db.models import UserRole

    msg = _make_message(user_id=555, chat_id=777)
    cmd = _make_command(args=None)

    with patch.object(
        handlers,
        "bot_resolve_user_status",
        new=AsyncMock(return_value=(UserRole.member, None)),
        create=True,  # attribute does not exist yet — RED phase
    ), patch.object(
        handlers,
        "bot_resolve_user_role",
        new=AsyncMock(return_value=UserRole.member),
    ), patch.object(
        handlers,
        "bind_chat_id",
        new=AsyncMock(return_value=None),
    ):
        await handlers.cmd_start(msg, cmd)

    msg.answer.assert_called_once()
    call_args, call_kwargs = msg.answer.call_args
    greeting = call_args[0]
    assert "Откройте приложение и пройдите настройку" in greeting, (
        f"Expected not-onboarded invite copy, got: {greeting!r}"
    )
    assert "Бот запущен и готов к работе" not in greeting, (
        f"Got onboarded copy instead of invite copy: {greeting!r}"
    )
    assert "reply_markup" in call_kwargs, "WebApp button must remain for not-onboarded member"
