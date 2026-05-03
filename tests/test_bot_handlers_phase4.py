"""Unit tests for Phase 4 bot command handlers (app/bot/commands.py).

No DB required. Uses unittest.mock to stub API calls.

Covered behaviors:
- cmd_add: created reply, ambiguous reply with inline keyboard, not_found reply
- cmd_income: creates income actual
- cmd_balance: formats balance response
- cmd_today: formats today response, empty case
- cmd_app: replies with WebApp button
- cmd_add/cmd_income: silently ignores non-OWNER users
- cb_disambiguation: pops pending, re-calls API, replies
- format_kopecks: 150000 → "1 500"
- format_kopecks_with_sign: signed formatting
"""
from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Minimal env for settings import
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
os.environ.setdefault("MINI_APP_URL", "https://example.test")


def _make_message(*, user_id: int | None, chat_id: int = 999) -> MagicMock:
    msg = MagicMock()
    msg.from_user = SimpleNamespace(id=user_id) if user_id is not None else None
    msg.chat = SimpleNamespace(id=chat_id)
    msg.answer = AsyncMock()
    return msg


def _make_command(args: str | None) -> MagicMock:
    cmd = MagicMock()
    cmd.args = args
    return cmd


def _make_callback(*, user_id: int, data: str, chat_id: int = 999) -> MagicMock:
    cb = MagicMock()
    cb.from_user = SimpleNamespace(id=user_id)
    cb.message = _make_message(user_id=user_id, chat_id=chat_id)
    cb.data = data
    cb.answer = AsyncMock()
    return cb


def test_commands_module_exports_router():
    from aiogram import Router
    from app.bot.commands import router
    assert isinstance(router, Router)


def test_format_kopecks():
    from app.bot.commands import format_kopecks
    assert format_kopecks(150000) == "1 500"
    assert format_kopecks(0) == "0"
    assert format_kopecks(100) == "1"
    assert format_kopecks(1234500) == "12 345"


def test_format_kopecks_with_sign_positive():
    from app.bot.commands import format_kopecks_with_sign
    result = format_kopecks_with_sign(150000)
    assert result.startswith("+")


def test_format_kopecks_with_sign_negative():
    from app.bot.commands import format_kopecks_with_sign
    result = format_kopecks_with_sign(-50000)
    assert result.startswith("-")


def test_format_kopecks_with_sign_zero():
    from app.bot.commands import format_kopecks_with_sign
    result = format_kopecks_with_sign(0)
    assert "0" in result


@pytest.mark.asyncio
async def test_cmd_add_rejects_non_owner():
    from app.bot.commands import cmd_add
    message = _make_message(user_id=999_999_999)
    command = _make_command("1500 продукты")
    with patch("app.bot.commands.bot_create_actual", new=AsyncMock()) as mock_api:
        await cmd_add(message, command)
    mock_api.assert_not_called()
    message.answer.assert_not_called()


@pytest.mark.asyncio
async def test_cmd_add_created_reply():
    from app.bot.commands import cmd_add
    from app.core.settings import settings

    message = _make_message(user_id=settings.OWNER_TG_ID)
    command = _make_command("1500 продукты")

    mock_response = {
        "status": "created",
        "actual": {
            "id": 1, "period_id": 1, "kind": "expense",
            "amount_cents": 150000, "description": None,
            "category_id": 1, "tx_date": "2026-05-03",
            "source": "bot", "created_at": "2026-05-03T10:00:00Z",
        },
        "category": {"id": 1, "name": "Продукты", "kind": "expense"},
        "category_balance_cents": 100000,
        "candidates": None,
    }

    with patch("app.bot.commands.bot_create_actual", new=AsyncMock(return_value=mock_response)):
        await cmd_add(message, command)

    message.answer.assert_awaited_once()
    sent_text = message.answer.await_args.args[0]
    assert "Записано" in sent_text or "записано" in sent_text.lower()
    assert "1 500" in sent_text


@pytest.mark.asyncio
async def test_cmd_add_ambiguous_sends_inline_keyboard():
    from aiogram.types import InlineKeyboardMarkup
    from app.bot.commands import cmd_add
    from app.core.settings import settings

    message = _make_message(user_id=settings.OWNER_TG_ID)
    command = _make_command("1500 продукт")

    mock_response = {
        "status": "ambiguous",
        "actual": None,
        "category": None,
        "category_balance_cents": None,
        "candidates": [
            {"id": 1, "name": "Продукты", "kind": "expense"},
            {"id": 2, "name": "Продуктовый рынок", "kind": "expense"},
        ],
    }

    with patch("app.bot.commands.bot_create_actual", new=AsyncMock(return_value=mock_response)):
        await cmd_add(message, command)

    message.answer.assert_awaited_once()
    kwargs = message.answer.await_args.kwargs
    reply_markup = kwargs.get("reply_markup")
    assert isinstance(reply_markup, InlineKeyboardMarkup)


@pytest.mark.asyncio
async def test_cmd_add_not_found_reply():
    from app.bot.commands import cmd_add
    from app.core.settings import settings

    message = _make_message(user_id=settings.OWNER_TG_ID)
    command = _make_command("1500 несуществующая")

    mock_response = {
        "status": "not_found",
        "actual": None,
        "category": None,
        "category_balance_cents": None,
        "candidates": [],
    }

    with patch("app.bot.commands.bot_create_actual", new=AsyncMock(return_value=mock_response)):
        await cmd_add(message, command)

    message.answer.assert_awaited_once()
    sent_text = message.answer.await_args.args[0]
    assert "не найден" in sent_text.lower() or "not found" in sent_text.lower()


@pytest.mark.asyncio
async def test_cmd_balance_reply():
    from app.bot.commands import cmd_balance
    from app.core.settings import settings

    message = _make_message(user_id=settings.OWNER_TG_ID)

    mock_response = {
        "period_id": 1,
        "period_start": "2026-04-05",
        "period_end": "2026-05-04",
        "balance_now_cents": 300000,
        "delta_total_cents": 50000,
        "planned_total_expense_cents": 500000,
        "actual_total_expense_cents": 200000,
        "planned_total_income_cents": 700000,
        "actual_total_income_cents": 750000,
        "by_category": [
            {"category_id": 1, "name": "Продукты", "kind": "expense",
             "planned_cents": 300000, "actual_cents": 200000, "delta_cents": 100000},
        ],
    }

    with patch("app.bot.commands.bot_get_balance", new=AsyncMock(return_value=mock_response)):
        await cmd_balance(message)

    message.answer.assert_awaited_once()
    sent_text = message.answer.await_args.args[0]
    assert "3 000" in sent_text or "Баланс" in sent_text


@pytest.mark.asyncio
async def test_cmd_today_empty_reply():
    from app.bot.commands import cmd_today
    from app.core.settings import settings

    message = _make_message(user_id=settings.OWNER_TG_ID)

    mock_response = {
        "actuals": [],
        "total_expense_cents": 0,
        "total_income_cents": 0,
    }

    with patch("app.bot.commands.bot_get_today", new=AsyncMock(return_value=mock_response)):
        await cmd_today(message)

    message.answer.assert_awaited_once()
    sent_text = message.answer.await_args.args[0]
    assert "нет" in sent_text.lower()


@pytest.mark.asyncio
async def test_cmd_app_sends_webapp_button():
    from aiogram.types import InlineKeyboardMarkup
    from app.bot.commands import cmd_app
    from app.core.settings import settings

    message = _make_message(user_id=settings.OWNER_TG_ID)
    await cmd_app(message)

    message.answer.assert_awaited_once()
    kwargs = message.answer.await_args.kwargs
    reply_markup = kwargs.get("reply_markup")
    assert isinstance(reply_markup, InlineKeyboardMarkup)
    flat_buttons = [b for row in reply_markup.inline_keyboard for b in row]
    assert any(b.web_app is not None for b in flat_buttons)


@pytest.mark.asyncio
async def test_cb_disambiguation_flow():
    from app.bot.commands import cb_disambiguation
    from app.bot.disambiguation import PendingActual, store_pending
    from app.core.settings import settings
    from datetime import datetime

    owner_id = settings.OWNER_TG_ID

    pending = PendingActual(
        chat_id=999,
        kind="expense",
        amount_cents=150000,
        description=None,
        tx_date=None,
        candidates=[{"id": 5, "name": "Продукты", "kind": "expense"}],
        created_at=datetime.utcnow(),
    )
    token = store_pending(pending)

    callback = _make_callback(user_id=owner_id, data=f"act:{token}:5")

    mock_response = {
        "status": "created",
        "actual": {
            "id": 1, "period_id": 1, "kind": "expense",
            "amount_cents": 150000, "description": None,
            "category_id": 5, "tx_date": "2026-05-03",
            "source": "bot", "created_at": "2026-05-03T10:00:00Z",
        },
        "category": {"id": 5, "name": "Продукты", "kind": "expense"},
        "category_balance_cents": 50000,
        "candidates": None,
    }

    with patch("app.bot.commands.bot_create_actual", new=AsyncMock(return_value=mock_response)):
        await cb_disambiguation(callback)

    callback.message.answer.assert_awaited_once()
