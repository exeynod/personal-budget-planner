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


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


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
async def test_trend_range_1m_returns_200(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/trend?range=1M", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "points" in data
    assert isinstance(data["points"], list)


@pytest.mark.asyncio
async def test_trend_range_3m_returns_200(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/trend?range=3M", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["points"], list)


@pytest.mark.asyncio
async def test_trend_point_shape(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/trend?range=6M", headers=auth_headers
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
async def test_top_overspend_returns_200(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/top-overspend?range=1M", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_top_overspend_item_shape(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/top-overspend?range=1M", headers=auth_headers
    )
    assert response.status_code == 200
    items = response.json()["items"]
    if items:
        item = items[0]
        for key in ("category_id", "name", "planned_cents", "actual_cents", "overspend_pct"):
            assert key in item, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_top_categories_returns_200(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/top-categories?range=3M", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_top_categories_item_shape(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/top-categories?range=3M", headers=auth_headers
    )
    assert response.status_code == 200
    items = response.json()["items"]
    if items:
        item = items[0]
        for key in ("category_id", "name", "actual_cents", "planned_cents"):
            assert key in item, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_forecast_returns_200(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/forecast", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "insufficient_data" in data
    assert "current_balance_cents" in data
    assert isinstance(data["insufficient_data"], bool)


@pytest.mark.asyncio
async def test_forecast_insufficient_data_null_fields(async_client, auth_headers):
    _require_db()
    response = await async_client.get(
        "/api/v1/analytics/forecast", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    if data["insufficient_data"]:
        assert data.get("projected_end_balance_cents") is None
        assert data.get("will_burn_cents") is None
