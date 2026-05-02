"""Integration tests for Categories CRUD + seed (CAT-01, CAT-02, CAT-03).

DB-backed: requires DATABASE_URL pointing to a test Postgres database
with `alembic upgrade head` applied. Skipped via `pytest.skip` otherwise
(self-skip pattern from test_migrations.py).

Wave 0 RED state: imports of `app.api.dependencies.get_db` and
`app.main_api.app` succeed (Phase 1), but the routes themselves
(`/api/v1/categories`, `/api/v1/onboarding/complete`) do not exist yet —
all HTTP calls return 404 / fail assertions until Plans 02-03..02-04
implement them.
"""
import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    """Helper: returns headers dict with X-Telegram-Init-Data for owner."""
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_client(async_client):
    """async_client + a real DB session injected via dependency_overrides.

    Truncates relevant tables before yielding to ensure clean state.
    Self-skips if DATABASE_URL is not configured.
    """
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    # Clean state — TRUNCATE all domain tables.
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
    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_empty(db_client, auth_headers):
    response = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_category(db_client, auth_headers):
    response = await db_client.post(
        "/api/v1/categories",
        json={"name": "Спорт", "kind": "expense", "sort_order": 50},
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["name"] == "Спорт"
    assert data["kind"] == "expense"
    assert data["is_archived"] is False
    assert "id" in data


@pytest.mark.asyncio
async def test_create_then_list(db_client, auth_headers):
    await db_client.post(
        "/api/v1/categories",
        json={"name": "Хобби", "kind": "expense"},
        headers=auth_headers,
    )
    response = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["name"] == "Хобби"


@pytest.mark.asyncio
async def test_update_renames(db_client, auth_headers):
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Старое", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    update = await db_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Новое"},
        headers=auth_headers,
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Новое"


@pytest.mark.asyncio
async def test_archive_hides_from_default_list(db_client, auth_headers):
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Удалить", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    delete = await db_client.delete(
        f"/api/v1/categories/{cat_id}", headers=auth_headers
    )
    assert delete.status_code == 200

    listing = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 0


@pytest.mark.asyncio
async def test_include_archived_returns_archived(db_client, auth_headers):
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Архивная", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    await db_client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)

    listing = await db_client.get(
        "/api/v1/categories?include_archived=true",
        headers=auth_headers,
    )
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["is_archived"] is True


@pytest.mark.asyncio
async def test_archived_can_be_unarchived(db_client, auth_headers):
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Восстановимая", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    await db_client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)

    restore = await db_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"is_archived": False},
        headers=auth_headers,
    )
    assert restore.status_code == 200
    assert restore.json()["is_archived"] is False


@pytest.mark.asyncio
async def test_seed_creates_14_categories(db_client, auth_headers):
    """CAT-03: seed via /onboarding/complete (with seed_default_categories=true)."""
    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": 5,
            "seed_default_categories": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    listing = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert len(listing.json()) == 14


@pytest.mark.asyncio
async def test_seed_idempotent_skips_when_categories_exist(db_client, auth_headers):
    """Если уже есть хоть одна категория, seed не добавляет новых."""
    # Manually create one category first
    await db_client.post(
        "/api/v1/categories",
        json={"name": "Existing", "kind": "expense"},
        headers=auth_headers,
    )
    # Now run onboarding with seed=true
    await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": 5,
            "seed_default_categories": True,
        },
        headers=auth_headers,
    )
    listing = await db_client.get("/api/v1/categories", headers=auth_headers)
    # Should remain at 1 (seed skipped because >= 1 existed)
    assert len(listing.json()) == 1
