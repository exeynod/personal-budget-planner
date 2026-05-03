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
from datetime import date

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
async def db_setup(async_client):
    """async_client + real DB session injected via dependency_overrides.

    Returns (client, SessionLocal) so tests can directly seed the DB before
    HTTP calls. Truncates relevant tables before yielding (clean state).
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
    yield async_client, SessionLocal
    await engine.dispose()


@pytest_asyncio.fixture
async def db_client(db_setup):
    """HTTP-only convenience: returns the async_client without SessionLocal."""
    client, _ = db_setup
    return client


@pytest_asyncio.fixture
async def seed_categories(db_setup):
    """Seed two non-archived categories: expense + income.

    Returns dict {expense_cat: Category, income_cat: Category}.
    """
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        expense_cat = Category(
            name="Продукты",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=10,
        )
        income_cat = Category(
            name="Зарплата",
            kind=CategoryKind.income,
            is_archived=False,
            sort_order=20,
        )
        session.add_all([expense_cat, income_cat])
        await session.commit()
        await session.refresh(expense_cat)
        await session.refresh(income_cat)
        return {"expense_cat": expense_cat, "income_cat": income_cat}


@pytest_asyncio.fixture
async def seed_archived_category(db_setup):
    """Seed one archived category for archived-guard tests."""
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        cat = Category(
            name="Архивная",
            kind=CategoryKind.expense,
            is_archived=True,
            sort_order=99,
        )
        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        return cat


# ----- Tests -----


@pytest.mark.asyncio
async def test_list_empty(db_client, auth_headers):
    response = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_template_item(db_client, auth_headers, seed_categories):
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
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["category_id"] == seed_categories["expense_cat"].id
    assert data["amount_cents"] == 1500000
    assert data["description"] == "Закупка продуктов"
    assert data["day_of_period"] == 5
    assert data["sort_order"] == 10
    assert "id" in data

    # Verify persistence via GET
    listing = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["id"] == data["id"]


@pytest.mark.asyncio
async def test_create_with_invalid_category_404(db_client, auth_headers):
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": 99999,
            "amount_cents": 100000,
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_with_archived_category_400(
    db_client, auth_headers, seed_archived_category
):
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_archived_category.id,
            "amount_cents": 100000,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_amount_zero_422(db_client, auth_headers, seed_categories):
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 0,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_amount_negative_422(db_client, auth_headers, seed_categories):
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": -100,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_day_of_period_32_422(db_client, auth_headers, seed_categories):
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 100000,
            "day_of_period": 32,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_day_of_period_zero_422(
    db_client, auth_headers, seed_categories
):
    response = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 100000,
            "day_of_period": 0,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_template_item(db_client, auth_headers, seed_categories):
    create = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 1000000,
            "description": "Старое",
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    item_id = create.json()["id"]

    update = await db_client.patch(
        f"/api/v1/template/items/{item_id}",
        json={"amount_cents": 2000000, "description": "Новое"},
        headers=auth_headers,
    )
    assert update.status_code == 200
    assert update.json()["amount_cents"] == 2000000
    assert update.json()["description"] == "Новое"

    listing = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["amount_cents"] == 2000000


@pytest.mark.asyncio
async def test_update_not_found_404(db_client, auth_headers):
    response = await db_client.patch(
        "/api/v1/template/items/99999",
        json={"amount_cents": 100},
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_template_item(db_client, auth_headers, seed_categories):
    create = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["expense_cat"].id,
            "amount_cents": 100000,
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    item_id = create.json()["id"]

    delete = await db_client.delete(
        f"/api/v1/template/items/{item_id}", headers=auth_headers
    )
    assert delete.status_code == 200

    listing = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_delete_not_found_404(db_client, auth_headers):
    response = await db_client.delete(
        "/api/v1/template/items/99999", headers=auth_headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_no_init_data_403(db_client):
    response = await db_client.get("/api/v1/template/items")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_includes_all_fields(
    db_client, auth_headers, seed_categories
):
    create = await db_client.post(
        "/api/v1/template/items",
        json={
            "category_id": seed_categories["income_cat"].id,
            "amount_cents": 12000000,
            "description": "Основная зарплата",
            "day_of_period": 5,
            "sort_order": 30,
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)

    listing = await db_client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    item = items[0]
    expected_keys = {
        "id",
        "category_id",
        "amount_cents",
        "description",
        "day_of_period",
        "sort_order",
    }
    assert expected_keys.issubset(item.keys())
    assert item["category_id"] == seed_categories["income_cat"].id
    assert item["amount_cents"] == 12000000
    assert item["description"] == "Основная зарплата"
    assert item["day_of_period"] == 5
    assert item["sort_order"] == 30
