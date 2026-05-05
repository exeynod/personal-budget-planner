"""Contract tests for Phase 8 Analytics endpoints.

RED gate: routes /api/v1/analytics/* not yet implemented.
Tests FAIL with 404 until Plan 08-02 creates them.

Covered:
- 403 without auth on all 4 endpoints
- GET /api/v1/analytics/trend?range= → 200, {points: [...]}
- GET /api/v1/analytics/top-overspend?range= → 200, {items: [...]}
- GET /api/v1/analytics/top-categories?range= → 200, {items: [...]}
- GET /api/v1/analytics/forecast → 200, {insufficient_data, current_balance_cents, ...}
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
    """async_client with real DB session override. Skip if DB unavailable."""
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE category, planned_transaction, "
                "actual_transaction, plan_template_item, subscription, "
                "budget_period, app_user RESTART IDENTITY CASCADE"
            )
        )

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db

    # Bootstrap AppUser via GET /me (D-11).
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )

    yield async_client, {"X-Telegram-Init-Data": init_data}

    await engine.dispose()


# --- 403 auth tests (do NOT require DB — routes will 403 before DB) ---


@pytest.mark.asyncio
async def test_trend_requires_auth(async_client):
    response = await async_client.get("/api/v1/analytics/trend?range=1M")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_top_overspend_requires_auth(async_client):
    response = await async_client.get("/api/v1/analytics/top-overspend?range=1M")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_top_categories_requires_auth(async_client):
    response = await async_client.get("/api/v1/analytics/top-categories?range=1M")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_forecast_requires_auth(async_client):
    response = await async_client.get("/api/v1/analytics/forecast")
    assert response.status_code == 403


# --- 200 contract tests (require DB for real response) ---


@pytest.mark.asyncio
async def test_trend_range_1m_returns_200(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/trend?range=1M", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "points" in data
    assert isinstance(data["points"], list)


@pytest.mark.asyncio
async def test_trend_range_3m_returns_200(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/trend?range=3M", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["points"], list)


@pytest.mark.asyncio
async def test_trend_point_shape(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/trend?range=6M", headers=headers
    )
    assert response.status_code == 200
    points = response.json()["points"]
    if points:
        p = points[0]
        assert "period_label" in p
        assert "expense_cents" in p
        assert "income_cents" in p
        assert isinstance(p["expense_cents"], int)


@pytest.mark.asyncio
async def test_top_overspend_returns_200(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/top-overspend?range=1M", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_top_overspend_item_shape(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/top-overspend?range=1M", headers=headers
    )
    assert response.status_code == 200
    items = response.json()["items"]
    if items:
        item = items[0]
        for key in ("category_id", "name", "planned_cents", "actual_cents", "overspend_pct"):
            assert key in item, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_top_categories_returns_200(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/top-categories?range=3M", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_top_categories_item_shape(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/top-categories?range=3M", headers=headers
    )
    assert response.status_code == 200
    items = response.json()["items"]
    if items:
        item = items[0]
        for key in ("category_id", "name", "actual_cents", "planned_cents"):
            assert key in item, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_forecast_returns_200(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/forecast", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "insufficient_data" in data
    assert "current_balance_cents" in data
    assert isinstance(data["insufficient_data"], bool)


@pytest.mark.asyncio
async def test_forecast_insufficient_data_null_fields(db_client):
    client, headers = db_client
    response = await client.get(
        "/api/v1/analytics/forecast", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    if data["insufficient_data"]:
        assert data.get("projected_end_balance_cents") is None
        assert data.get("will_burn_cents") is None
