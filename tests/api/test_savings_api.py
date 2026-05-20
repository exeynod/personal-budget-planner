"""Integration tests for /api/v1/savings (Phase 22, BE-08/09/10, plan 22.13).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- Auth: 403 without X-Telegram-Init-Data (skipped in DEV_MODE).
- GET /savings: snapshot shape (total/month/config/goals).
- PATCH /savings/config: partial update; invalid base → 422.
- POST /savings/deposit: 422 amount=0; 404 missing account; 500 if savings cat
  missing (config drift) — covered by an isolated state where onboarding-complete
  hasn't run.
"""
import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_setup(async_client, owner_tg_id):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.db.models import AppUser, UserRole
    from app.main_api import app
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    await truncate_db()
    async with SessionLocal() as session:
        session.add(AppUser(
            tg_user_id=owner_tg_id, role=UserRole.owner, cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
        ))
        await session.commit()

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db
    yield async_client, SessionLocal
    await engine.dispose()


@pytest_asyncio.fixture
async def seed_savings_cat_and_account(db_setup, owner_tg_id):
    """Seed system 'savings' Category + a primary account.

    Mirrors the post-onboarding state without going through the full
    onboarding-complete flow (which is exercised separately).
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        Account, AccountKind, Category, CategoryKind, RolloverPolicy,
    )

    async with SessionLocal() as session:
        uid = (await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )).scalar_one()

        from tests.helpers.seed import seed_category
        cat = await seed_category(
            session,
            user_id=uid,
            name="КОПИЛКА", code="savings", ord="99",
            kind=CategoryKind.expense,
            plan_cents=0,
            rollover=RolloverPolicy.savings,
            paused=True,
            sort_order=99,
        )
        acc = Account(
            user_id=uid, bank="Т-Банк", kind=AccountKind.card,
            balance_cents=1_000_00, is_primary=True,
        )
        session.add(acc)
        await session.commit()
        await session.refresh(cat)
        await session.refresh(acc)
        return {"savings_cat_id": cat.id, "account_id": acc.id}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_savings_requires_auth_403(async_client):
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    response = await async_client.get("/api/v1/savings")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /savings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_savings_default_shape(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.get("/api/v1/savings", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_cents"] == 0
    assert body["month_in_cents"] == 0
    # Default config when SavingsConfig row missing — applied by service.
    assert body["config"]["roundup_enabled"] is False
    assert body["config"]["roundup_base"] == 10
    assert body["goals"] == []


# ---------------------------------------------------------------------------
# PATCH /savings/config
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_config_toggles_enabled(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.patch(
        "/api/v1/savings/config",
        json={"roundup_enabled": True},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["roundup_enabled"] is True

    snap = await client.get("/api/v1/savings", headers=auth_headers)
    assert snap.json()["config"]["roundup_enabled"] is True


@pytest.mark.asyncio
async def test_patch_config_changes_base(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.patch(
        "/api/v1/savings/config",
        json={"roundup_base": 50},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["roundup_base"] == 50


@pytest.mark.asyncio
async def test_patch_config_invalid_base_422(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.patch(
        "/api/v1/savings/config",
        json={"roundup_base": 7},
        headers=auth_headers,
    )
    # Pydantic Literal[10,50,100] rejects 7
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /savings/deposit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_deposit_happy(
    db_setup, auth_headers, seed_savings_cat_and_account
):
    client, _ = db_setup
    seed = seed_savings_cat_and_account
    r = await client.post(
        "/api/v1/savings/deposit",
        json={"amount_cents": 500_00, "account_id": seed["account_id"]},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    data = r.json()
    # Stored signed (negative) — service-level convention
    assert data["amount_cents"] == -500_00
    assert data["account_id"] == seed["account_id"]
    assert data["category_id"] == seed["savings_cat_id"]


@pytest.mark.asyncio
async def test_post_deposit_zero_amount_422(
    db_setup, auth_headers, seed_savings_cat_and_account
):
    client, _ = db_setup
    seed = seed_savings_cat_and_account
    r = await client.post(
        "/api/v1/savings/deposit",
        json={"amount_cents": 0, "account_id": seed["account_id"]},
        headers=auth_headers,
    )
    # Pydantic gt=0 enforces this before service is called.
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_post_deposit_missing_account_404(
    db_setup, auth_headers, seed_savings_cat_and_account
):
    client, _ = db_setup
    r = await client.post(
        "/api/v1/savings/deposit",
        json={"amount_cents": 100_00, "account_id": 99999},
        headers=auth_headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_post_deposit_savings_cat_missing_500(db_setup, auth_headers):
    """No system 'savings' Category seeded → 500 with structured detail."""
    client, _ = db_setup
    # Seed only an account; no savings category.
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Account, AccountKind

    async with SessionLocal() as session:
        uid = (await session.execute(
            text("SELECT id FROM app_user LIMIT 1"),
        )).scalar_one()
        acc = Account(
            user_id=uid, bank="X", kind=AccountKind.card,
            balance_cents=10_000_00, is_primary=True,
        )
        session.add(acc)
        await session.commit()
        await session.refresh(acc)
        aid = acc.id

    r = await client.post(
        "/api/v1/savings/deposit",
        json={"amount_cents": 100_00, "account_id": aid},
        headers=auth_headers,
    )
    assert r.status_code == 500
    assert r.json()["detail"]["error"] == "savings_category_missing"
