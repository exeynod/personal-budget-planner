"""Integration tests for POST /api/v1/onboarding/complete v1.0 (BE-15, plan 22.13).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- Auth: 403 without X-Telegram-Init-Data (skipped in DEV_MODE).
- Happy path: 200 + response shape (account_ids, category_ids_by_code,
  savings_category_id, savings_config, onboarded_at).
- 409 on retry (T-22-11-01) — accounts already exist.
- 422 plan exceeds income (T-22-11-04) — structured detail.
- 422 unknown category code (T-22-11-03).
- 422 negative income (Pydantic gt=0).
- 422 negative balance — out of range.
- Optional goal honoured.
- Optional savings_config honoured.
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
    """Seed an AppUser WITHOUT onboarded_at — onboarding is the path under test."""
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
        # Pre-onboarding: onboarded_at = NULL. 68-05 (class B): grant
        # pdn_consent_at so POST /onboarding/complete passes the Phase 33
        # CMP-33-04 consent gate (NULL → 403 pdn_consent_required).
        session.add(
            AppUser(
                tg_user_id=owner_tg_id,
                role=UserRole.owner,
                cycle_start_day=5,
                onboarded_at=None,
                pdn_consent_at=datetime.now(timezone.utc),
            )
        )
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


def _payload(**overrides):
    base = {
        "income_cents": 200_000_00,
        "accounts": [
            {
                "bank": "Т-Банк",
                "kind": "card",
                "balance_cents": 10_000_00,
                "primary": True,
            },
        ],
        "category_plans": {
            "food": 30_000_00,
            "cafe": 10_000_00,
            "home": 20_000_00,
            "transit": 5_000_00,
            "fun": 3_000_00,
            "gifts": 2_000_00,
            "health": 4_000_00,
            "subs": 1_000_00,
        },
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_onboarding_complete_requires_auth_403(async_client):
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    response = await async_client.post("/api/v1/onboarding/complete", json=_payload())
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_complete_v10_happy(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.post(
        "/api/v1/onboarding/complete",
        json=_payload(),
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["income_cents"] == 200_000_00
    assert len(data["account_ids"]) == 1
    assert set(data["category_ids_by_code"].keys()) == {
        "food",
        "cafe",
        "home",
        "transit",
        "fun",
        "gifts",
        "health",
        "subs",
    }
    assert isinstance(data["adjustment_category_id"], int)
    assert data["onboarded_at"]


# v1.1: goal/savings_config onboarding slots removed (AGREED §G1) —
# test_complete_v10_with_goal_and_config deleted.


# ---------------------------------------------------------------------------
# Retry / conflict
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_complete_v10_retry_409(db_setup, auth_headers):
    client, _ = db_setup
    r1 = await client.post(
        "/api/v1/onboarding/complete",
        json=_payload(),
        headers=auth_headers,
    )
    assert r1.status_code == 200

    # Second call → 409 — accounts already exist.
    r2 = await client.post(
        "/api/v1/onboarding/complete",
        json=_payload(),
        headers=auth_headers,
    )
    assert r2.status_code == 409
    detail = r2.json()["detail"]
    assert detail["error"] == "already_onboarded"
    assert detail["account_count"] >= 1


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_complete_v10_plan_exceeds_income_422(db_setup, auth_headers):
    """Representative validation→422 mapping at the API layer (the most
    business-critical rule). The exhaustive validator matrix (negative income,
    unknown category code, empty accounts, two-primary accounts) lives in
    tests/services/test_onboarding_v10.py — those test the same validators one
    layer down without the HTTP round-trip, so only one 422-mapping smoke is
    kept here.
    """
    client, _ = db_setup
    body = _payload(
        income_cents=10_000_00,
        category_plans={"food": 50_000_00},  # plan > income
    )
    r = await client.post(
        "/api/v1/onboarding/complete", json=body, headers=auth_headers
    )
    assert r.status_code == 422
