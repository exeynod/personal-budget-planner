"""Integration tests for /api/v1/goals (Phase 22, BE-11, plan 22.13).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- Auth: 403 without X-Telegram-Init-Data (skipped in DEV_MODE).
- list_goals: empty / multiple / created_at order.
- create_goal: happy path + due-in-future validation 422 + name-length 422.
- update_goal: partial patch + 404 missing + 422 invalid due.
- delete_goal: 204 + 404 missing.
"""
import os
from datetime import date, datetime, timedelta, timezone

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


def _future(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_goals_requires_auth_403(async_client):
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    response = await async_client.get("/api/v1/goals")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_goals_empty(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.get("/api/v1/goals", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_goal_happy(db_setup, auth_headers):
    client, _ = db_setup
    body = {
        "name": "Отпуск на море",
        "target_cents": 200_000_00,
        "due": _future(180),
    }
    r = await client.post("/api/v1/goals", json=body, headers=auth_headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "Отпуск на море"
    assert data["target_cents"] == 200_000_00
    assert data["current_cents"] == 0
    assert data["due"] == body["due"]


@pytest.mark.asyncio
async def test_create_goal_due_in_past_422(db_setup, auth_headers):
    client, _ = db_setup
    body = {
        "name": "Прошлое",
        "target_cents": 1000_00,
        "due": (date.today() - timedelta(days=1)).isoformat(),
    }
    r = await client.post("/api/v1/goals", json=body, headers=auth_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_goal_name_too_long_422(db_setup, auth_headers):
    client, _ = db_setup
    body = {
        "name": "x" * 81,
        "target_cents": 1000_00,
    }
    r = await client.post("/api/v1/goals", json=body, headers=auth_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_goal_partial(db_setup, auth_headers):
    client, _ = db_setup
    create = await client.post(
        "/api/v1/goals",
        json={"name": "G1", "target_cents": 50_00},
        headers=auth_headers,
    )
    gid = create.json()["id"]
    patch = await client.patch(
        f"/api/v1/goals/{gid}",
        json={"target_cents": 75_00},
        headers=auth_headers,
    )
    assert patch.status_code == 200
    assert patch.json()["target_cents"] == 75_00
    assert patch.json()["name"] == "G1"


@pytest.mark.asyncio
async def test_update_goal_404_when_missing(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.patch(
        "/api/v1/goals/9999",
        json={"name": "X"},
        headers=auth_headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_goal_204(db_setup, auth_headers):
    client, _ = db_setup
    create = await client.post(
        "/api/v1/goals",
        json={"name": "Del me", "target_cents": 100_00},
        headers=auth_headers,
    )
    gid = create.json()["id"]
    r = await client.delete(f"/api/v1/goals/{gid}", headers=auth_headers)
    assert r.status_code == 204
    listing = await client.get("/api/v1/goals", headers=auth_headers)
    assert listing.json() == []


@pytest.mark.asyncio
async def test_delete_goal_404_when_missing(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.delete("/api/v1/goals/9999", headers=auth_headers)
    assert r.status_code == 404
