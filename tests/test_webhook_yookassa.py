"""Phase 34 REQ-34-03, REQ-34-05: YooKassa webhook + idempotent state machine.

Endpoint: POST /webhooks/yookassa (no /api/v1 prefix — clean URL for YooKassa
admin panel registration).

Covers:
- payment.succeeded → Payment.status='succeeded' + SubscriptionBilling row.
- Duplicate webhook is idempotent (state-transition guard + UNIQUE на yookassa_payment_id).
- Unknown events → 200 (forward-compat).

Uses Phase 33-style fresh-engine fixtures (api_client + dedicated cleanup) rather
than the broken two_tenants fixture. Tests run as superuser ``budget`` which
bypasses RLS on payment / subscription_billing (FORCE RLS enabled in 0021).
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.models import AppUser, Payment, SubscriptionBilling, UserRole

pytestmark = pytest.mark.asyncio


PAYMENT_ID = "pmt_test_webhook_1"
TG_ID = 9_000_600_001  # avoid collisions with two_tenants / consent ranges


@pytest_asyncio.fixture
async def api_client():
    """ASGI client over the real FastAPI app (no dependency overrides)."""
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def db_check_session():
    """Dedicated session for verifying state — separate from the request session."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


@pytest_asyncio.fixture
async def seeded_payment():
    """Seed AppUser + pending Payment via dedicated engine.

    Uses a separate engine for setup/teardown so the test session's
    rollback semantics don't fight commit semantics here. Yields a dict
    with the seeded payment id (DB PK) + user id for downstream asserts.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    async def _cleanup():
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            # Delete subscription_billing first (FK → payment).
            await conn.execute(
                text(
                    "DELETE FROM subscription_billing WHERE payment_id IN "
                    "(SELECT id FROM payment WHERE yookassa_payment_id = :pid)"
                ),
                {"pid": PAYMENT_ID},
            )
            await conn.execute(
                text("DELETE FROM payment WHERE yookassa_payment_id = :pid"),
                {"pid": PAYMENT_ID},
            )
            await conn.execute(
                text("DELETE FROM app_user WHERE tg_user_id = :tg"),
                {"tg": TG_ID},
            )

    await _cleanup()

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        # Bypass RLS for admin seed (no GUC set — INSERT WITH CHECK would fail).
        await s.execute(text("SET LOCAL row_security = off"))
        user = AppUser(
            tg_user_id=TG_ID,
            role=UserRole.owner,
            cycle_start_day=5,
        )
        s.add(user)
        await s.flush()
        p = Payment(
            user_id=user.id,
            yookassa_payment_id=PAYMENT_ID,
            amount_cents=29900,
            status="pending",
        )
        s.add(p)
        await s.commit()
        seeded = {"user_id": user.id, "payment_pk": p.id, "yk_id": PAYMENT_ID}

    yield seeded
    await _cleanup()
    await engine.dispose()


async def test_payment_succeeded_transitions_state(
    api_client, seeded_payment, db_check_session
):
    """payment.succeeded → status flips, paid_at set, billing row inserted."""
    payload = {
        "event": "payment.succeeded",
        "object": {"id": PAYMENT_ID, "status": "succeeded"},
    }
    r = await api_client.post("/webhooks/yookassa", json=payload)
    assert r.status_code == 200, r.text

    await db_check_session.execute(text("SET LOCAL row_security = off"))
    row = (
        await db_check_session.execute(
            select(Payment).where(Payment.yookassa_payment_id == PAYMENT_ID)
        )
    ).scalar_one()
    assert row.status == "succeeded"
    assert row.paid_at is not None

    sb = (
        await db_check_session.execute(
            select(SubscriptionBilling).where(
                SubscriptionBilling.payment_id == row.id
            )
        )
    ).scalar_one()
    assert sb.tier == "pro"
    assert sb.status == "active"


async def test_duplicate_webhook_is_idempotent(
    api_client, seeded_payment, db_check_session
):
    """Same payment.succeeded twice → exactly ONE SubscriptionBilling row."""
    payload = {"event": "payment.succeeded", "object": {"id": PAYMENT_ID}}
    r1 = await api_client.post("/webhooks/yookassa", json=payload)
    r2 = await api_client.post("/webhooks/yookassa", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200

    await db_check_session.execute(text("SET LOCAL row_security = off"))
    rows = (
        await db_check_session.execute(
            select(SubscriptionBilling).where(
                SubscriptionBilling.user_id == seeded_payment["user_id"]
            )
        )
    ).scalars().all()
    assert len(rows) == 1


async def test_unknown_event_returns_200(api_client):
    """Forward-compat: unrecognised event types are accepted and ignored."""
    payload = {"event": "future.event", "object": {"id": "pmt_x"}}
    r = await api_client.post("/webhooks/yookassa", json=payload)
    assert r.status_code == 200
