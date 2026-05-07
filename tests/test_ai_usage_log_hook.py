"""Tests for Plan 13-03 — _record_usage hook persists to ai_usage_log table.

The hook is called from the SSE event loop in app/api/routes/ai.py
when an LLM 'usage' event arrives. It must:
  1. Continue to append to the in-memory ring buffer (existing behaviour)
  2. Persist a row in ai_usage_log table with user_id + tokens + cost
  3. Swallow DB failures (do not break the SSE stream)

Tests skip when DATABASE_URL is unset.
"""
from __future__ import annotations

import logging
import os

import pytest
import pytest_asyncio
from sqlalchemy import text


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


@pytest_asyncio.fixture
async def fresh_db():
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from tests.helpers.seed import _PHASE13_TRUNCATE_TABLES

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    admin_engine = create_async_engine(admin_url, echo=False)
    async with admin_engine.begin() as conn:
        await conn.execute(
            text(f"TRUNCATE TABLE {_PHASE13_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
        )
    await admin_engine.dispose()

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    yield SessionLocal
    await engine.dispose()


@pytest.mark.asyncio
async def test_ai_usage_log_hook_writes_row(fresh_db):
    """Happy path: hook persists 1 row to ai_usage_log."""
    from app.api.routes.ai import _record_usage
    from app.db.models import UserRole
    from tests.helpers.seed import seed_user

    async with fresh_db() as session:
        user = await seed_user(session, tg_user_id=9_777_777_001, role=UserRole.owner)
        await session.commit()
        user_id = user.id

    usage_event = {
        "model": "gpt-4o-mini",
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "cached_tokens": 10,
        "total_tokens": 150,
        "est_cost_usd": 0.0012,
    }
    await _record_usage(usage_event, user_id=user_id, session_factory=fresh_db)

    async with fresh_db() as session:
        result = await session.execute(
            text(
                "SELECT user_id, model, prompt_tokens, completion_tokens, "
                "cached_tokens, total_tokens, est_cost_usd "
                "FROM ai_usage_log WHERE user_id = :uid"
            ),
            {"uid": user_id},
        )
        rows = result.all()
    assert len(rows) == 1, f"expected 1 row, got {len(rows)}"
    row = rows[0]
    assert row[0] == user_id
    assert row[1] == "gpt-4o-mini"
    assert row[2] == 100
    assert row[3] == 50
    assert row[4] == 10
    assert row[5] == 150
    assert abs(row[6] - 0.0012) < 1e-9


@pytest.mark.asyncio
async def test_ai_usage_log_hook_db_failure_swallowed(fresh_db, caplog):
    """If DB insert fails, hook MUST NOT raise — SSE stream continues."""
    from app.api.routes.ai import _record_usage

    class BrokenFactory:
        def __call__(self):
            from sqlalchemy.exc import OperationalError

            raise OperationalError("simulated", {}, Exception("conn lost"))

    usage_event = {
        "model": "gpt-4o-mini",
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "cached_tokens": 0,
        "total_tokens": 2,
        "est_cost_usd": 0.00001,
    }

    # Should NOT raise.
    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        await _record_usage(usage_event, user_id=999, session_factory=BrokenFactory())

    # Structured log line should mention the persist failure.
    assert any(
        "ai.usage_log_persist_failed" in rec.message for rec in caplog.records
    ), f"expected log line 'ai.usage_log_persist_failed', got: {[r.message for r in caplog.records]}"


@pytest.mark.asyncio
async def test_ai_usage_log_hook_skips_when_user_id_missing(fresh_db):
    """Defensive: user_id=None or 0 → skip insert, do not raise."""
    from app.api.routes.ai import _record_usage

    usage_event = {
        "model": "gpt-4o-mini",
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "cached_tokens": 0,
        "total_tokens": 2,
        "est_cost_usd": 0.00001,
    }

    # None case.
    await _record_usage(usage_event, user_id=None, session_factory=fresh_db)
    # Zero case (defensive).
    await _record_usage(usage_event, user_id=0, session_factory=fresh_db)

    async with fresh_db() as session:
        count = (
            await session.execute(text("SELECT count(*) FROM ai_usage_log"))
        ).scalar_one()
    assert count == 0, f"no rows should persist when user_id missing, got {count}"
