"""Static checks on ``main_bot.py`` after Plan 02-05.

These tests do NOT execute ``main()`` (which would open a Telegram session).
They verify:

- module loads without raising;
- it imports ``router`` from ``app.bot.handlers`` (delegated handler);
- it no longer contains the Phase 1 stub copy;
- it still wires ``dp.include_router(router)`` and the healthz server on 8001.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest


# Settings need real-looking env vars at import time (pydantic-settings).
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
os.environ.setdefault("MINI_APP_URL", "https://example.test")


REPO_ROOT = Path(__file__).resolve().parents[1]
MAIN_BOT_PATH = REPO_ROOT / "main_bot.py"


def _read_main_bot() -> str:
    return MAIN_BOT_PATH.read_text(encoding="utf-8")


def test_main_bot_imports_router_from_app_bot_handlers() -> None:
    text = _read_main_bot()
    assert "from app.bot.handlers import router" in text


def test_main_bot_phase1_stub_removed() -> None:
    text = _read_main_bot()
    assert "Привязка push-уведомлений будет в Phase 2" not in text


def test_main_bot_no_local_cmd_start() -> None:
    """Local ``async def cmd_start`` must be removed (delegated to app.bot.handlers)."""
    text = _read_main_bot()
    # Allow `cmd_start` mentioned in comments/docstring; forbid the function definition.
    for line in text.splitlines():
        assert not line.startswith("async def cmd_start"), line


def test_main_bot_keeps_healthz_on_8001() -> None:
    text = _read_main_bot()
    assert "8001" in text
    assert "/healthz" in text


def test_main_bot_module_loads() -> None:
    """Importing the module must not fail (no Bot session is created at import)."""
    spec = importlib.util.spec_from_file_location("main_bot", str(MAIN_BOT_PATH))
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    assert hasattr(module, "main")
    assert hasattr(module, "health_handler")


def test_dp_include_router_present() -> None:
    text = _read_main_bot()
    # Phase 4: two routers registered — start_router (Phase 2) + commands_router (Phase 4)
    assert "dp.include_router(start_router)" in text
    assert "dp.include_router(commands_router)" in text
