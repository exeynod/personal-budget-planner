"""Integration tests for Periods endpoints (PER-01, PER-02).

Wave 0 RED state: routes /api/v1/periods/current and
/api/v1/onboarding/complete will be created in Plans 02-03..02-04.
DB fixture self-skips when DATABASE_URL is unset.
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

    # Bootstrap AppUser via GET /me (D-11) so onboarding can find the user row.
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get("/api/v1/me", headers={"X-Telegram-Init-Data": init_data})

    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_periods_current_before_onboarding_is_404(db_client, auth_headers):
    """До onboarding активного периода нет."""
    # First trigger /me to create app_user row (Phase 1 D-11 upsert pattern)
    await db_client.get("/api/v1/me", headers=auth_headers)
    response = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_periods_current_after_onboarding_returns_period(
    db_client, auth_headers
):
    """После /onboarding/complete есть активный период с заданным balance."""
    onboard = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 1500000,  # 15 000 ₽
            "cycle_start_day": 5,
            "seed_default_categories": False,
        },
        headers=auth_headers,
    )
    assert onboard.status_code == 200

    response = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert response.status_code == 200
    period = response.json()
    assert period["starting_balance_cents"] == 1500000
    assert period["status"] == "active"
    assert "period_start" in period
    assert "period_end" in period
