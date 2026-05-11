"""Phase 33 CMP-33-04: bot /start consent-prompt tests."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

# Ensure settings can be imported even when running this file in isolation.
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
os.environ.setdefault("MINI_APP_URL", "https://example.test")

from app.bot.handlers import cmd_start  # noqa: E402
from app.db.models import UserRole  # noqa: E402


pytestmark = pytest.mark.asyncio


def _mock_message(user_id: int = 12345, chat_id: int = 12345):
    msg = MagicMock()
    msg.from_user = SimpleNamespace(id=user_id)
    msg.chat = SimpleNamespace(id=chat_id)
    msg.answer = AsyncMock()
    return msg


async def test_cmd_start_without_consent_shows_consent_prompt(monkeypatch):
    """User в whitelist (member), но без pdn_consent_at → consent prompt."""

    async def fake_resolve(uid):
        # tuple: (role, onboarded_at, pdn_consent_at)
        return UserRole.member, None, None

    async def fake_bind(**kwargs):
        return None

    monkeypatch.setattr(
        "app.bot.handlers.bot_resolve_user_status", fake_resolve
    )
    monkeypatch.setattr("app.bot.handlers.bind_chat_id", fake_bind)

    msg = _mock_message()
    cmd = MagicMock(args=None)
    await cmd_start(msg, cmd)

    msg.answer.assert_called_once()
    args, kwargs = msg.answer.call_args
    body = args[0]
    assert "политику обработки" in body
    assert "Mini App" in body


async def test_cmd_start_with_consent_skips_consent_prompt(monkeypatch):
    """User с granted consent не видит consent prompt — invite или onboarded greeting."""

    async def fake_resolve(uid):
        # consent granted, but not yet onboarded.
        return UserRole.member, None, datetime.now(timezone.utc)

    async def fake_bind(**kwargs):
        return None

    monkeypatch.setattr(
        "app.bot.handlers.bot_resolve_user_status", fake_resolve
    )
    monkeypatch.setattr("app.bot.handlers.bind_chat_id", fake_bind)

    msg = _mock_message()
    cmd = MagicMock(args=None)
    await cmd_start(msg, cmd)

    msg.answer.assert_called_once()
    args, kwargs = msg.answer.call_args
    body = args[0]
    # Should be the invite-pending copy, NOT consent prompt.
    assert "политику обработки" not in body
    assert "Откройте приложение" in body


async def test_cmd_start_rejected_for_revoked_role(monkeypatch):
    """Revoked role не доходит до consent check."""

    async def fake_resolve(uid):
        return UserRole.revoked, None, None

    monkeypatch.setattr(
        "app.bot.handlers.bot_resolve_user_status", fake_resolve
    )

    msg = _mock_message()
    cmd = MagicMock(args=None)
    await cmd_start(msg, cmd)

    msg.answer.assert_called_once_with("Бот приватный.")
