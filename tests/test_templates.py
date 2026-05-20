"""Integration tests for Plan Template CRUD (TPL-01, TPL-02) — Phase 3.

DB-backed: requires DATABASE_URL pointing to a test Postgres database
with `alembic upgrade head` applied. Skipped via `pytest.skip` otherwise
(self-skip pattern from `tests/test_categories.py:19-21`).

Wave 0 RED state: these tests import contracts that do not exist yet
(`app.api.routes.templates`, `app.services.templates`,
`app.api.schemas.templates`). HTTP calls to `/api/v1/template/items`
return 404 until Plans 03-02..03-03 wire the service-layer + routes.
ImportError or 404/422 mismatch — both are valid RED states for Wave 0.

Covered behaviors (per 03-PLAN.md task 1 + 03-VALIDATION.md):
- CRUD (create, list, update, delete)
- Validation: amount_cents > 0, day_of_period 1..31, category exists, not archived
- Auth: 403 without X-Telegram-Init-Data
- 404 on update/delete of non-existent item
"""
import os
from datetime import date, datetime, timezone

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
async def db_setup(async_client, owner_tg_id):
    """async_client + real DB session injected via dependency_overrides.

    Returns (client, SessionLocal) so tests can directly seed the DB before
    HTTP calls. Truncates relevant tables before yielding (clean state).
    Self-skips if DATABASE_URL is not configured.
    """
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.db.models import AppUser, UserRole
    from app.main_api import app

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    from tests.helpers.seed import truncate_db
    await truncate_db()

    # Seed AppUser explicitly — /me no longer upserts after Phase 12 (Plan 12-03).
    async with SessionLocal() as session:
        session.add(AppUser(tg_user_id=owner_tg_id, role=UserRole.owner, cycle_start_day=5, onboarded_at=datetime.now(timezone.utc)))
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
async def db_client(db_setup):
    """HTTP-only convenience: returns the async_client without SessionLocal."""
    client, _ = db_setup
    return client


@pytest_asyncio.fixture
async def seed_categories(db_setup, owner_tg_id):
    """Seed two non-archived categories: expense + income.

    Returns dict {expense_cat: Category, income_cat: Category}.
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        from tests.helpers.seed import seed_category
        expense_cat = await seed_category(
            session,
            user_id=user_id,
            name="Продукты",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=10,
        )
        income_cat = await seed_category(
            session,
            user_id=user_id,
            name="Зарплата",
            kind=CategoryKind.income,
            is_archived=False,
            sort_order=20,
        )
        await session.commit()
        await session.refresh(expense_cat)
        await session.refresh(income_cat)
        return {"expense_cat": expense_cat, "income_cat": income_cat}


@pytest_asyncio.fixture
async def seed_archived_category(db_setup, owner_tg_id):
    """Seed one archived category for archived-guard tests."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        from tests.helpers.seed import seed_category
        cat = await seed_category(
            session,
            user_id=user_id,
            name="Архивная",
            kind=CategoryKind.expense,
            is_archived=True,
            sort_order=99,
        )
        await session.commit()
        await session.refresh(cat)
        return cat


# ----- Tests -----


@pytest.mark.asyncio
async def test_list_empty(db_client, auth_headers):
    response = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


# 68-05 (class G): the template WRITE surface (POST/PATCH/DELETE on
# /template/items + snapshot-from-period) was DEPRECATED by design in Phase 22
# CR-05 — the plan_template_item table was dropped (alembic 0013) and the v1.0
# model uses Category.plan_cents as the plan source-of-truth. The deprecated
# write endpoints return 410 Gone immediately (see app/api/routes/templates.py).
# These tests assert that contract: every write is 410 Gone. GET still works
# (200 []) for legacy v0.x clients and is covered by test_list_empty above.


@pytest.mark.asyncio
async def test_create_template_item_410_gone(db_client, auth_headers, seed_categories):
    """POST /template/items is deprecated → 410 Gone (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 1500000,
            "description": "Закупка продуктов",
            "day_of_period": 5,
            "sort_order": 10,
        },
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text
    assert response.json()["detail"]["error"] == "templates_deprecated"

    # GET surface remains an empty list (no rows were ever created).
    listing = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_create_with_invalid_category_410_gone(db_client, auth_headers):
    """Deprecated POST returns 410 BEFORE any category validation (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={"category_id": 99999, "amount_cents": 100000},
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_create_with_archived_category_410_gone(
    db_client, auth_headers, seed_archived_category
):
    """Deprecated POST returns 410 BEFORE any archived-category guard (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={"category_id": seed_archived_category.id, "amount_cents": 100000},
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_create_amount_zero_410_gone(db_client, auth_headers, seed_categories):
    """Deprecated POST returns 410 BEFORE Pydantic amount validation (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={"category_id": seed_categories["expense_cat"].id, "amount_cents": 0},
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_create_amount_negative_410_gone(db_client, auth_headers, seed_categories):
    """Deprecated POST returns 410 BEFORE Pydantic amount validation (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={"category_id": seed_categories["expense_cat"].id, "amount_cents": -100},
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_create_day_of_period_32_410_gone(db_client, auth_headers, seed_categories):
    """Deprecated POST returns 410 BEFORE day_of_period validation (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 100000,
            "day_of_period": 32,
        },
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_create_day_of_period_zero_410_gone(
    db_client, auth_headers, seed_categories
):
    """Deprecated POST returns 410 BEFORE day_of_period validation (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 100000,
            "day_of_period": 0,
        },
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_update_template_item_410_gone(db_client, auth_headers, seed_categories):
    """PATCH /template/items/{id} is deprecated → 410 Gone (CR-05)."""
    update = await db_client.patch(
        "/api/v1/template/items/1",
        json={"amount_cents": 2000000, "description": "Новое"},
        headers=auth_headers,
    )
    assert update.status_code == 410, update.text


@pytest.mark.asyncio
async def test_update_not_found_410_gone(db_client, auth_headers):
    """Deprecated PATCH returns 410 (not 404) — the surface is gone (CR-05)."""
    response = await db_client.patch(
        "/api/v1/template/items/99999",
        json={"amount_cents": 100},
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_delete_template_item_410_gone(db_client, auth_headers, seed_categories):
    """DELETE /template/items/{id} is deprecated → 410 Gone (CR-05)."""
    delete = await db_client.delete(
        "/api/v1/template/items/1", headers=auth_headers
    )
    assert delete.status_code == 410, delete.text


@pytest.mark.asyncio
async def test_delete_not_found_410_gone(db_client, auth_headers):
    """Deprecated DELETE returns 410 (not 404) — the surface is gone (CR-05)."""
    response = await db_client.delete(
        "/api/v1/template/items/99999", headers=auth_headers
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_no_init_data_403(db_client):
    response = await db_client.get("/api/v1/template/items")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_returns_empty_for_deprecated_surface(
    db_client, auth_headers, seed_categories
):
    """GET /template/items always returns [] (writes are 410; no rows exist)."""
    listing = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json() == []
