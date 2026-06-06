"""Phase 33 CMP-33-06: GET /api/v1/me/export endpoint tests.

Uses a dedicated minimal fixture (export_test_user) to avoid the
pre-existing-broken two_tenants fixture (Phase 22 Category.code NOT NULL
mismatch in conftest; out of scope here).
"""

from __future__ import annotations

import hashlib

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.db.models import PdnAuditEvent, PdnAuditLog
from app.services.data_export import _serialize_row, build_export

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def api_client():
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def export_test_user():
    """Fresh AppUser + ПДн consent for export tests.

    tg_user_id 9_000_510_001 — disjoint from consent_test_user range.
    Cleans up app_user row + pdn_audit_log entries after each test.
    """
    import os
    from sqlalchemy.ext.asyncio import create_async_engine

    tg_id = 9_000_510_001
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


async def test_export_returns_user_data_dict(api_client, export_test_user):
    """GET /me/export returns 12+ top-level keys for a fresh user."""
    headers = {"X-Test-User": str(export_test_user["tg_user_id"])}
    r = await api_client.get("/api/v1/me/export", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()

    expected_keys = (
        "user",
        "accounts",
        "categories",
        "budget_periods",
        "planned_transactions",
        "actual_transactions",
        "subscriptions",
        "ai_conversations",
        "ai_messages",
        "audit_log",
        "_meta",
    )
    for key in expected_keys:
        assert key in body, f"Missing top-level key: {key}"
    assert body["user"]["tg_user_id"] == export_test_user["tg_user_id"]
    assert body["_meta"]["format_version"] == "1.0"
    # Fresh user — domain tables are empty lists.
    for k in (
        "accounts",
        "categories",
        "budget_periods",
        "actual_transactions",
        "planned_transactions",
    ):
        assert isinstance(body[k], list)


async def test_export_writes_audit_event(
    api_client, export_test_user, db_check_session
):
    """Each /me/export call writes a `data_export` audit event."""
    headers = {"X-Test-User": str(export_test_user["tg_user_id"])}
    r = await api_client.get("/api/v1/me/export", headers=headers)
    assert r.status_code == 200

    ev = await db_check_session.execute(
        select(PdnAuditLog)
        .where(PdnAuditLog.event_type == PdnAuditEvent.data_export)
        .order_by(PdnAuditLog.id.desc())
        .limit(1)
    )
    last = ev.scalar_one_or_none()
    assert last is not None
    # Audit row references hash(user_id), not raw id (CMP-33-01).
    body = r.json()
    expected_hash = hashlib.sha256(str(body["user"]["id"]).encode("utf-8")).hexdigest()
    assert last.user_id_hash == expected_hash


def test_serialize_row_handles_datetime_and_enum():
    """_serialize_row converts datetime/enum to JSON-safe primitives."""
    from datetime import datetime, timezone

    from app.db.models import AppUser, UserRole

    # Synthesize an AppUser instance without DB.
    user = AppUser(
        tg_user_id=42,
        cycle_start_day=5,
        notify_days_before=2,
        enable_ai_categorization=True,
        spending_cap_cents=500,
        role=UserRole.member,
        onboarded_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        last_seen_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        pdn_consent_at=None,
        deleted_at=None,
    )
    out = _serialize_row(user)
    assert out["tg_user_id"] == 42
    assert out["role"] == "member"
    assert out["onboarded_at"] == "2026-01-01T00:00:00+00:00"
    assert out["pdn_consent_at"] is None


async def test_build_export_returns_empty_for_unknown_user(db_check_session):
    """build_export with a non-existent user_id returns {} (not crash)."""
    result = await build_export(db_check_session, user_id=-999_999)
    assert result == {}
