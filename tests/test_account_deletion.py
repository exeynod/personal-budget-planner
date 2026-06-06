"""Phase 33 CMP-33-02: DELETE /me/account endpoint + soft-delete helper tests.

Pure-Python tests (no DB) for the is_due_for_purge logic, plus an
integration test that drives the DELETE /me/account endpoint through
the ASGI app under DEV_MODE.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.db.models import PdnAuditEvent, PdnAuditLog
from app.services.account_deletion import (
    COOLING_DAYS,
    PURGE_ORDER,
    is_due_for_purge,
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def api_client():
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def delete_test_user():
    """Fresh AppUser for soft-delete tests.

    tg_user_id 9_000_520_001 — disjoint from other compliance fixtures.
    """
    import os
    from sqlalchemy.ext.asyncio import create_async_engine

    tg_id = 9_000_520_001
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    async def _cleanup():
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            result = await conn.execute(
                text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
                {"tg": tg_id},
            )
            row = result.first()
            if row:
                uid = row[0]
                uid_hash = hashlib.sha256(str(uid).encode("utf-8")).hexdigest()
                await conn.execute(
                    text("DELETE FROM pdn_audit_log WHERE user_id_hash = :h"),
                    {"h": uid_hash},
                )
                await conn.execute(
                    text("DELETE FROM app_user WHERE id = :id"),
                    {"id": uid},
                )

    await _cleanup()
    yield {"tg_user_id": tg_id}
    await _cleanup()
    await engine.dispose()


@pytest_asyncio.fixture
async def db_check_session():
    import os
    from sqlalchemy.ext.asyncio import (
        async_sessionmaker,
        create_async_engine,
    )

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


def test_is_due_for_purge_handles_threshold():
    """31 days old → due; 29 days old → not due; None → not due."""
    now = datetime.now(timezone.utc)
    assert is_due_for_purge(now - timedelta(days=31), now=now) is True
    assert is_due_for_purge(now - timedelta(days=29), now=now) is False
    assert is_due_for_purge(None, now=now) is False


def test_cooling_days_is_thirty():
    assert COOLING_DAYS == 30


def test_purge_order_includes_all_tenant_tables():
    """PURGE_ORDER must list every tenant-scoped domain table the
    runtime writes to (so cascade-delete leaves no orphan rows).

    NOTE: app_user is NOT in PURGE_ORDER — it's deleted in a separate
    final statement (no RLS). Tables with ON DELETE CASCADE on user_id
    (ai_usage_log, auth_token) are likewise excluded — they vanish when
    app_user drops.
    """
    expected = {
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        # v1.1: goal/savings_config dropped; plan-template + per-period plan added.
        "period_category_plan",
        "plan_template_line",
        "plan_template_item",
        "subscription",
        "budget_period",
        "account",
        "category",
    }
    assert set(PURGE_ORDER) == expected


async def test_delete_endpoint_marks_user_and_audits(
    api_client, delete_test_user, db_check_session
):
    """DELETE /me/account sets deleted_at + writes deletion_requested event."""
    headers = {"X-Test-User": str(delete_test_user["tg_user_id"])}

    r = await api_client.delete("/api/v1/me/account", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "deleted_at" in body
    assert body["purge_after_days"] == 30

    # Verify audit event written.
    ev = await db_check_session.execute(
        select(PdnAuditLog)
        .where(PdnAuditLog.event_type == PdnAuditEvent.deletion_requested)
        .order_by(PdnAuditLog.id.desc())
        .limit(1)
    )
    assert ev.scalar_one_or_none() is not None

    # Repeat call → 410 Gone (already deleted).
    r2 = await api_client.delete("/api/v1/me/account", headers=headers)
    assert r2.status_code == 410
    assert r2.json()["detail"]["error"] == "already_deleted"
