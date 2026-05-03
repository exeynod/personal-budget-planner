"""Unit tests for app/bot/parsers.py — parse_amount and parse_add_command.

No DB required. These run fully offline.

Covered behaviors (per 04-PLAN.md):
- parse_amount: integer, decimal with comma/dot, kopeck conversion
- parse_amount: strips ₽/руб/р suffixes, spaces, NBSP
- parse_amount: rejects negatives, zero, non-numeric strings
- parse_amount: caps at 10^12 kopecks
- parse_add_command: parses (amount, category, description) tuple
- parse_add_command: returns None when args is None or unparseable
"""
from __future__ import annotations

import os

import pytest

# Minimal env for settings import
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
os.environ.setdefault("MINI_APP_URL", "https://example.test")


def test_parse_amount_integer():
    from app.bot.parsers import parse_amount
    assert parse_amount("1500") == 150000


def test_parse_amount_decimal_dot():
    from app.bot.parsers import parse_amount
    assert parse_amount("1500.50") == 150050


def test_parse_amount_decimal_comma():
    from app.bot.parsers import parse_amount
    assert parse_amount("1500,50") == 150050


def test_parse_amount_single_decimal():
    from app.bot.parsers import parse_amount
    # "15.5" → 1550 kopecks
    assert parse_amount("15.5") == 1550


def test_parse_amount_strips_ruble_sign():
    from app.bot.parsers import parse_amount
    assert parse_amount("1500₽") == 150000
    assert parse_amount("1500 ₽") == 150000


def test_parse_amount_strips_rub_suffix():
    from app.bot.parsers import parse_amount
    assert parse_amount("1500 руб") == 150000
    assert parse_amount("1500руб") == 150000


def test_parse_amount_strips_r_suffix():
    from app.bot.parsers import parse_amount
    assert parse_amount("1500р") == 150000
    assert parse_amount("1500 р") == 150000


def test_parse_amount_strips_nbsp():
    from app.bot.parsers import parse_amount
    # Non-breaking space between digits
    result = parse_amount("1\xa0500")
    assert result == 150000


def test_parse_amount_zero_returns_none():
    from app.bot.parsers import parse_amount
    assert parse_amount("0") is None


def test_parse_amount_negative_returns_none():
    from app.bot.parsers import parse_amount
    assert parse_amount("-100") is None


def test_parse_amount_non_numeric_returns_none():
    from app.bot.parsers import parse_amount
    assert parse_amount("abc") is None
    assert parse_amount("") is None
    assert parse_amount("1.2.3") is None


def test_parse_amount_too_large_returns_none():
    from app.bot.parsers import parse_amount
    # 10^10 rubles = 10^12 kopecks → capped
    assert parse_amount("10000000000001") is None


def test_parse_amount_cap_boundary():
    from app.bot.parsers import parse_amount
    # Exactly 10^10 rubles should succeed
    assert parse_amount("10000000000") is not None


def test_parse_add_command_amount_and_category():
    from app.bot.parsers import parse_add_command
    result = parse_add_command("1500 продукты")
    assert result == (150000, "продукты", None)


def test_parse_add_command_with_description():
    from app.bot.parsers import parse_add_command
    result = parse_add_command("750 кафе Обед с коллегами")
    assert result is not None
    amount, cat, desc = result
    assert amount == 75000
    assert cat == "кафе"
    assert desc == "Обед с коллегами"


def test_parse_add_command_none_args():
    from app.bot.parsers import parse_add_command
    assert parse_add_command(None) is None


def test_parse_add_command_only_amount_returns_none():
    from app.bot.parsers import parse_add_command
    # Need at least amount + category
    assert parse_add_command("1500") is None


def test_parse_add_command_bad_amount_returns_none():
    from app.bot.parsers import parse_add_command
    assert parse_add_command("abc продукты") is None
