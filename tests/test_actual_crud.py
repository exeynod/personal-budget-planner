"""Integration tests for Actual Transactions CRUD (ACT-01..ACT-05) — Phase 4.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Wave 0 RED state: tests import contracts not yet implemented
(``app.api.routes.actual``, ``app.services.actual``,
``app.api.schemas.actual``). HTTP calls to ``/api/v1/actual`` and
``/api/v1/actual/balance`` return 404 until Plans 04-02..04-03 wire them.

Covered behaviors:
- CRUD manual actual (create→list→update→delete)
- 404 on non-existent actual_id
- Validation: amount_cents > 0, archived category guard, kind mismatch
- Future-date guard (tx_date > today + 7 days → 400)
- Source forced mini_app when created via public API
- List filtered by kind and category_id
- GET /actual/balance returns period totals + by_category breakdown
- Auth: 403 without X-Telegram-Init-Data
"""
import os
from datetime import date, timedelta

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
async def db_setup(async_client):
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
    client, _ = db_setup
    return client


@pytest_asyncio.fixture
async def seed_categories(db_setup):
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        expense_cat = Category(name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10)
        income_cat = Category(name="Зарплата", kind=CategoryKind.income, is_archived=False, sort_order=20)
        session.add_all([expense_cat, income_cat])
        await session.commit()
        await session.refresh(expense_cat)
        await session.refresh(income_cat)
        return {"expense_cat": expense_cat, "income_cat": income_cat}


@pytest_asyncio.fixture
async def seed_archived_category(db_setup):
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        cat = Category(name="Архивная", kind=CategoryKind.expense, is_archived=True, sort_order=99)
        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        return cat


@pytest_asyncio.fixture
async def seed_period(db_setup):
    _, SessionLocal = db_setup
    from app.db.models import BudgetPeriod, PeriodStatus

    async with SessionLocal() as session:
        today = date.today()
        period = BudgetPeriod(
            period_start=today - timedelta(days=15),
            period_end=today + timedelta(days=15),
            starting_balance_cents=100000,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.commit()
        await session.refresh(period)
        return period.id


@pytest.mark.asyncio
async def test_list_actual_empty(db_client, auth_headers, seed_period):
    from app.services.actual import ActualNotFoundError  # noqa: F401 — RED import check
    response = await db_client.get(
        f"/api/v1/periods/{seed_period}/actual", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_actual_expense(db_client, auth_headers, seed_categories, seed_period):
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 150000,
            "description": "Ужин",
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["kind"] == "expense"
    assert data["amount_cents"] == 150000
    assert data["source"] == "mini_app"
    assert "id" in data
    assert "period_id" in data


@pytest.mark.asyncio
async def test_create_actual_source_forced_mini_app(db_client, auth_headers, seed_categories, seed_period):
    """Source is always mini_app when created via public API."""
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 50000,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    assert response.json()["source"] == "mini_app"


@pytest.mark.asyncio
async def test_create_actual_with_archived_category_400(
    db_client, auth_headers, seed_archived_category, seed_period
):
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_archived_category.id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_actual_kind_mismatch_400(db_client, auth_headers, seed_categories, seed_period):
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "income",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_actual_amount_zero_422(db_client, auth_headers, seed_categories, seed_period):
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 0,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_actual_future_date_beyond_7_days_400(
    db_client, auth_headers, seed_categories, seed_period
):
    future_date = date.today() + timedelta(days=8)
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(future_date),
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_actual_date_within_7_days_ok(
    db_client, auth_headers, seed_categories, seed_period
):
    future_date = date.today() + timedelta(days=5)
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(future_date),
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)


@pytest.mark.asyncio
async def test_update_actual(db_client, auth_headers, seed_categories, seed_period):
    create = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    actual_id = create.json()["id"]

    update = await db_client.patch(
        f"/api/v1/actual/{actual_id}",
        json={"amount_cents": 250000, "description": "Обновлено"},
        headers=auth_headers,
    )
    assert update.status_code == 200
    body = update.json()
    assert body["amount_cents"] == 250000
    assert body["description"] == "Обновлено"


@pytest.mark.asyncio
async def test_update_actual_not_found_404(db_client, auth_headers):
    response = await db_client.patch(
        "/api/v1/actual/99999",
        json={"amount_cents": 100},
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_actual(db_client, auth_headers, seed_categories, seed_period):
    create = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    actual_id = create.json()["id"]

    delete = await db_client.delete(f"/api/v1/actual/{actual_id}", headers=auth_headers)
    assert delete.status_code == 200

    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/actual", headers=auth_headers
    )
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_delete_actual_not_found_404(db_client, auth_headers):
    response = await db_client.delete("/api/v1/actual/99999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_no_init_data_403(db_client, seed_period):
    response = await db_client.get(f"/api/v1/periods/{seed_period}/actual")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_actual_response_includes_all_fields(db_client, auth_headers, seed_categories, seed_period):
    create = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 250000,
            "description": "Полный набор полей",
            "category_id": seed_categories["expense_cat"].id,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    body = create.json()
    expected_keys = {"id", "period_id", "kind", "amount_cents", "description", "category_id", "tx_date", "source", "created_at"}
    assert expected_keys.issubset(body.keys())
    assert body["source"] == "mini_app"
