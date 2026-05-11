"""Phase 33 CMP-33-04: end-to-end consent flow tests.

Covers:
- POST /api/v1/me/consent (idempotent grant + audit event).
- DELETE /api/v1/me/consent (revoke + audit event).
- POST /api/v1/onboarding/complete без consent → 403.
- Revoke-then-onboard fails too.

Uses a minimal in-test fixture `consent_test_user` instead of two_tenants —
two_tenants is currently broken (Category.code NOT NULL added in Phase 22
but conftest seed не обновлён; pre-existing issue not in 33 scope).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.db.models import PdnAuditEvent, PdnAuditLog

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def api_client():
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def consent_test_user():
    """Minimal AppUser-only fixture for consent flow tests.

    Uses a dedicated engine + connection (not db_session) so cleanup is
    not entangled with the test's own session rollback semantics.

    tg_user_id 9_000_500_001 chosen to avoid clashes with two_tenants range.
    """
    import os
    from sqlalchemy.ext.asyncio import create_async_engine

    tg_id = 9_000_500_001
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    async def _cleanup():
        import hashlib

        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            result = await conn.execute(
                text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
                {"tg": tg_id},
            )
            row = result.first()
            if row:
                uid = row[0]
                # Compute hash in Python — asyncpg dislikes nested casts in
                # parameterised text (`:u::text::bytea` confuses the parser).
                uid_hash = hashlib.sha256(str(uid).encode("utf-8")).hexdigest()
                await conn.execute(
                    text(
                        "DELETE FROM pdn_audit_log WHERE user_id_hash = :h"
                    ),
                    {"h": uid_hash},
                )
                await conn.execute(
                    text("DELETE FROM app_user WHERE id = :id"), {"id": uid}
                )

    await _cleanup()
    yield {"tg_user_id": tg_id}
    await _cleanup()
    await engine.dispose()


@pytest_asyncio.fixture
async def db_check_session():
    """Lightweight read session for verifying audit-log rows."""
    import os
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
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


async def test_onboarding_complete_without_consent_returns_403(
    api_client, consent_test_user
):
    """User who never called /me/consent cannot complete onboarding."""
    headers = {"X-Test-User": str(consent_test_user["tg_user_id"])}
    r = await api_client.post(
        "/api/v1/onboarding/complete",
        headers=headers,
        json={
            "income_cents": 1000000,
            "accounts": [
                {
                    "bank": "Tinkoff",
                    "kind": "card",
                    "balance_cents": 0,
                    "primary": True,
                }
            ],
            "category_plans": {},
        },
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    detail = r.json()["detail"]
    assert detail["error"] == "pdn_consent_required"
    assert detail["privacy_url"] == "/legal/privacy"


async def test_grant_consent_writes_timestamp_and_audit(
    api_client, consent_test_user, db_check_session
):
    headers = {"X-Test-User": str(consent_test_user["tg_user_id"])}

    r = await api_client.post("/api/v1/me/consent", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["pdn_consent_at"] is not None
    assert body["policy_version"] == "v0.1"

    # Verify audit event written.
    ev = await db_check_session.execute(
        select(PdnAuditLog)
        .where(PdnAuditLog.event_type == PdnAuditEvent.granted)
        .order_by(PdnAuditLog.id.desc())
        .limit(1)
    )
    last = ev.scalar_one_or_none()
    assert last is not None


async def test_consent_grant_is_idempotent(api_client, consent_test_user):
    headers = {"X-Test-User": str(consent_test_user["tg_user_id"])}

    r1 = await api_client.post("/api/v1/me/consent", headers=headers)
    first_ts = r1.json()["pdn_consent_at"]

    r2 = await api_client.post("/api/v1/me/consent", headers=headers)
    assert r2.status_code == 200
    # Second call preserves original timestamp (idempotency).
    second_ts = r2.json()["pdn_consent_at"]
    assert first_ts == second_ts


async def test_revoke_consent_clears_field(
    api_client, consent_test_user, db_session
):
    headers = {"X-Test-User": str(consent_test_user["tg_user_id"])}

    await api_client.post("/api/v1/me/consent", headers=headers)
    r = await api_client.delete("/api/v1/me/consent", headers=headers)
    assert r.status_code == 200
    assert r.json()["pdn_consent_at"] is None

    # Verify revoked event.
    await db_session.commit()
    ev = await db_session.execute(
        select(PdnAuditLog)
        .where(PdnAuditLog.event_type == PdnAuditEvent.revoked)
        .order_by(PdnAuditLog.id.desc())
        .limit(1)
    )
    assert ev.scalar_one_or_none() is not None


async def test_revoke_then_onboard_fails(api_client, consent_test_user):
    headers = {"X-Test-User": str(consent_test_user["tg_user_id"])}

    await api_client.post("/api/v1/me/consent", headers=headers)
    await api_client.delete("/api/v1/me/consent", headers=headers)

    r = await api_client.post(
        "/api/v1/onboarding/complete",
        headers=headers,
        json={
            "income_cents": 1000000,
            "accounts": [
                {
                    "bank": "K",
                    "kind": "card",
                    "balance_cents": 0,
                    "primary": True,
                }
            ],
            "category_plans": {},
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "pdn_consent_required"
