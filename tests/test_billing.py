"""Phase 34-05 (REQ-34-04, REQ-34-06) — billing + subscription endpoints.

Covers:
- POST /api/v1/billing/create-payment → inserts pending Payment row,
  returns confirmation_url from YookassaClient.create_payment (mocked).
- GET  /api/v1/me/subscription → None for users without an active billing row.
- POST /api/v1/me/subscription/cancel → idempotent (двойной вызов = same body).

Fixture pattern скопирован из tests/test_webhook_yookassa.py — dedicated engine
for seed/cleanup (separate from request-session) + ``SET LOCAL row_security = off``
inside a transaction (asyncpg requires this on every connection that
seeds/inspects RLS-protected tables; tests run as superuser ``budget`` which
обходит RLS, но FORCE RLS на subscription_billing / payment требует disable
in-tx anyway).
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

from app.db.models import AppUser, Payment, UserRole

pytestmark = pytest.mark.asyncio


TG_ID = 9_000_700_001  # avoid clashes with consent / webhook ranges


@pytest_asyncio.fixture
async def api_client():
    """ASGI client over the real FastAPI app (no dependency overrides)."""
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def db_check_session():
    """Dedicated session для верификации DB state после API-вызова."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


@pytest_asyncio.fixture
async def seeded_user():
    """Seed AppUser через dedicated engine + cleanup payment / subscription / user."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    async def _cleanup():
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            await conn.execute(
                text(
                    "DELETE FROM subscription_billing WHERE user_id IN "
                    "(SELECT id FROM app_user WHERE tg_user_id = :tg)"
                ),
                {"tg": TG_ID},
            )
            await conn.execute(
                text(
                    "DELETE FROM payment WHERE user_id IN "
                    "(SELECT id FROM app_user WHERE tg_user_id = :tg)"
                ),
                {"tg": TG_ID},
            )
            await conn.execute(
                text("DELETE FROM app_user WHERE tg_user_id = :tg"),
                {"tg": TG_ID},
            )

    await _cleanup()

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        await s.execute(text("SET LOCAL row_security = off"))
        user = AppUser(
            tg_user_id=TG_ID,
            role=UserRole.owner,
            cycle_start_day=1,
        )
        s.add(user)
        await s.commit()
        await s.refresh(user)
        # Detach so test code can read .id / .tg_user_id без re-load в другой сессии.
        s.expunge(user)
        seeded = user

    yield seeded
    await _cleanup()
    await engine.dispose()


async def test_create_payment_inserts_pending_row(
    api_client, seeded_user, monkeypatch, db_check_session
):
    """POST /billing/create-payment → 201 + Payment row + mocked YooKassa client."""

    async def fake_create(
        self,
        *,
        amount_cents,
        description,
        return_url,
        idempotency_key,
        save_payment_method=False,
    ):
        from app.services.yookassa_client import YookassaPaymentResult

        return YookassaPaymentResult(
            payment_id="pmt_test_billing_1",
            confirmation_url="https://yookassa.ru/confirm/x",
            status="pending",
        )

    monkeypatch.setattr(
        "app.services.yookassa_client.YookassaClient.create_payment", fake_create
    )

    r = await api_client.post(
        "/api/v1/billing/create-payment",
        json={"amount_cents": 29900, "return_url": "https://tgbudget.app/return"},
        headers={"X-Test-User": str(seeded_user.tg_user_id)},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert "confirmation_url" in data
    assert data["confirmation_url"] == "https://yookassa.ru/confirm/x"

    # Verify row in DB.
    await db_check_session.execute(text("SET LOCAL row_security = off"))
    rows = (
        await db_check_session.execute(
            select(Payment).where(Payment.user_id == seeded_user.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].yookassa_payment_id == "pmt_test_billing_1"
    assert rows[0].status == "pending"
    assert rows[0].amount_cents == 29900


async def test_my_subscription_returns_null_for_free_user(api_client, seeded_user):
    """GET /me/subscription → 200 + null body для пользователя без active billing."""
    r = await api_client.get(
        "/api/v1/me/subscription",
        headers={"X-Test-User": str(seeded_user.tg_user_id)},
    )
    assert r.status_code == 200, r.text
    assert r.json() is None


async def test_cancel_idempotent(api_client, seeded_user):
    """POST /me/subscription/cancel дважды → одинаковый response (idempotent)."""
    r1 = await api_client.post(
        "/api/v1/me/subscription/cancel",
        headers={"X-Test-User": str(seeded_user.tg_user_id)},
    )
    r2 = await api_client.post(
        "/api/v1/me/subscription/cancel",
        headers={"X-Test-User": str(seeded_user.tg_user_id)},
    )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r1.json() == r2.json()
    assert r1.json() == {"status": "canceled"}
