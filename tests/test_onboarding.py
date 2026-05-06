"""Integration tests for Onboarding (ONB-01, PER-02, PER-03, CAT-03, atomicity).

Covers D-09 (negative balance allowed), D-10 (409 on repeat),
T-double-onboard (idempotency), T-cycle-validation (Pydantic 1..28).

Wave 0 RED state: route /api/v1/onboarding/complete will be created
in Plan 02-03 (service) + 02-04 (route). DB fixture self-skips
when DATABASE_URL is unset.
"""
import os

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
async def db_client(async_client, bot_token, owner_tg_id):
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    from tests.helpers.seed import truncate_db
    await truncate_db()

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db

    # Bootstrap AppUser via GET /me so onboarding can find it (D-11).
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )

    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_complete_creates_period_and_seeds_categories(db_client, auth_headers):
    """ONB-01 / PER-02 / CAT-03: complete creates period + 14 cats + onboarded_at."""
    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 1000000,
            "cycle_start_day": 5,
            "seed_default_categories": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200

    me = await db_client.get("/api/v1/me", headers=auth_headers)
    assert me.json()["onboarded_at"] is not None

    period = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert period.status_code == 200
    assert period.json()["starting_balance_cents"] == 1000000

    cats = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert len(cats.json()) == 14


@pytest.mark.asyncio
async def test_repeat_complete_returns_409(db_client, auth_headers):
    """D-10 / T-double-onboard: повторный POST → 409 Conflict."""
    body = {
        "starting_balance_cents": 0,
        "cycle_start_day": 5,
        "seed_default_categories": False,
    }
    first = await db_client.post(
        "/api/v1/onboarding/complete", json=body, headers=auth_headers
    )
    assert first.status_code == 200
    second = await db_client.post(
        "/api/v1/onboarding/complete", json=body, headers=auth_headers
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_no_seed_when_flag_false(db_client, auth_headers):
    """seed_default_categories=false → period создан, категории НЕ создаются."""
    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": 5,
            "seed_default_categories": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    cats = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert len(cats.json()) == 0
    period = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert period.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_day", [0, 29, 30, 31, -1])
async def test_invalid_cycle_start_day_422(db_client, auth_headers, invalid_day):
    """T-cycle-validation: Pydantic Field(ge=1, le=28) → 422 на out-of-range."""
    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": invalid_day,
            "seed_default_categories": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_negative_starting_balance_allowed(db_client, auth_headers):
    """D-09: отрицательный balance = долг, разрешено (BIGINT signed)."""
    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": -50000,
            "cycle_start_day": 5,
            "seed_default_categories": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
