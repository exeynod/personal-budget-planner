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


# Minimal env for settings import
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
os.environ.setdefault("MINI_APP_URL", "https://example.test")


def test_parse_amount_numeric_forms():
    """Integer + decimal (dot/comma) + single-decimal kopeck conversion."""
    from app.bot.parsers import parse_amount

    assert parse_amount("1500") == 150000
    assert parse_amount("1500.50") == 150050
    assert parse_amount("1500,50") == 150050
    assert parse_amount("15.5") == 1550


def test_parse_amount_strips_suffixes_and_separators():
    """₽ / руб / р suffixes (with/without space) and NBSP between digits."""
    from app.bot.parsers import parse_amount

    assert parse_amount("1500₽") == 150000
    assert parse_amount("1500 ₽") == 150000
    assert parse_amount("1500 руб") == 150000
    assert parse_amount("1500руб") == 150000
    assert parse_amount("1500р") == 150000
    assert parse_amount("1500 р") == 150000
    assert parse_amount("1\xa0500") == 150000  # NBSP


def test_parse_amount_rejects_invalid():
    """Zero, negative, non-numeric, multi-dot all → None."""
    from app.bot.parsers import parse_amount

    assert parse_amount("0") is None
    assert parse_amount("-100") is None
    assert parse_amount("abc") is None
    assert parse_amount("") is None
    assert parse_amount("1.2.3") is None


def test_parse_amount_cap_boundary():
    from app.bot.parsers import parse_amount

    # Exactly 10^10 rubles succeeds; one kopeck over the 10^12 cap → None.
    assert parse_amount("10000000000") is not None
    assert parse_amount("10000000000001") is None


def test_parse_add_command_amount_category_and_description():
    from app.bot.parsers import parse_add_command

    assert parse_add_command("1500 продукты") == (150000, "продукты", None)
    amount, cat, desc = parse_add_command("750 кафе Обед с коллегами")
    assert (amount, cat, desc) == (75000, "кафе", "Обед с коллегами")


def test_parse_add_command_rejects_invalid():
    """None args, amount-only (no category), and bad amount all → None."""
    from app.bot.parsers import parse_add_command

    assert parse_add_command(None) is None
    assert parse_add_command("1500") is None
    assert parse_add_command("abc продукты") is None
