"""Integration tests for Planned Transactions CRUD (PLN-01, PLN-02, PLN-03) — Phase 3.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Wave 0 RED state: tests import contracts not yet implemented
(`app.api.routes.planned`, `app.services.planned`,
`app.api.schemas.planned`). HTTP calls to `/api/v1/periods/{id}/planned`
and `/api/v1/planned/{id}` return 404 until Plans 03-02..03-03 wire them.

Covered behaviors (per 03-PLAN.md task 2 + 03-VALIDATION.md):
- CRUD manual planned (create→list→update→delete)
- 404 on non-existent period / planned-id
- Validation: amount_cents > 0, archived category guard, kind mismatch
- subscription_auto rows are read-only (PATCH and DELETE return 400)
- List filters by kind / category_id
- Auth: 403 without X-Telegram-Init-Data
- Response schema includes: id, period_id, kind, amount_cents, description,
  category_id, planned_date, source, subscription_id
"""
import os
from datetime import date
from typing import Optional

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
    """async_client + real DB session via dependency_overrides.

    Returns (client, SessionLocal). Truncates tables before yielding.
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

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE category, planned_transaction, "
                "actual_transaction, plan_template_item, subscription, "
                "budget_period, app_user RESTART IDENTITY CASCADE"
            )
        )

    # Seed AppUser explicitly — /me no longer upserts after Phase 12 (Plan 12-03).
    async with SessionLocal() as session:
        session.add(AppUser(tg_user_id=owner_tg_id, role=UserRole.owner, cycle_start_day=5))
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
    client, _ = db_setup
    return client


@pytest_asyncio.fixture
async def seed_categories(db_setup, owner_tg_id):
    """Seed two non-archived categories: expense + income."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        expense_cat = Category(
            user_id=user_id,
            name="Продукты",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=10,
        )
        income_cat = Category(
            user_id=user_id,
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
async def seed_archived_category(db_setup, owner_tg_id):
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        cat = Category(
            user_id=user_id,
            name="Архивная",
            kind=CategoryKind.expense,
            is_archived=True,
            sort_order=99,
        )
        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        return cat


@pytest_asyncio.fixture
async def seed_period(db_setup, owner_tg_id):
    """Create one active BudgetPeriod, return its id."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import BudgetPeriod, PeriodStatus

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        period = BudgetPeriod(
            user_id=user_id,
            period_start=date(2026, 2, 5),
            period_end=date(2026, 3, 4),
            starting_balance_cents=0,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.commit()
        await session.refresh(period)
        return period.id


@pytest_asyncio.fixture
async def seed_subscription_auto_planned(db_setup, seed_categories, seed_period, owner_tg_id):
    """Create a planned row with source=subscription_auto for read-only tests.

    Returns dict {planned_id, subscription_id, period_id, category_id}.
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        CategoryKind,
        PlanSource,
        PlannedTransaction,
        SubCycle,
        Subscription,
    )

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        sub = Subscription(
            user_id=user_id,
            name="Spotify",
            amount_cents=29900,
            cycle=SubCycle.monthly,
            next_charge_date=date(2026, 3, 1),
            category_id=seed_categories["expense_cat"].id,
            notify_days_before=2,
            is_active=True,
        )
        session.add(sub)
        await session.commit()
        await session.refresh(sub)

        row = PlannedTransaction(
            user_id=user_id,
            period_id=seed_period,
            kind=CategoryKind.expense,
            amount_cents=29900,
            description="Spotify (auto)",
            category_id=seed_categories["expense_cat"].id,
            planned_date=date(2026, 2, 25),
            source=PlanSource.subscription_auto,
            subscription_id=sub.id,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

        return {
            "planned_id": row.id,
            "subscription_id": sub.id,
            "period_id": seed_period,
            "category_id": seed_categories["expense_cat"].id,
        }


# ----- Tests -----


@pytest.mark.asyncio
async def test_list_planned_empty(db_client, auth_headers, seed_period):
    response = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_manual_planned(
    db_client, auth_headers, seed_categories, seed_period
):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 750000,
            "description": "Доп. закупка",
            "category_id": seed_categories["expense_cat"].id,
            "planned_date": "2026-02-15",
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["kind"] == "expense"
    assert data["amount_cents"] == 750000
    assert data["category_id"] == seed_categories["expense_cat"].id
    assert data["source"] == "manual"
    assert data["period_id"] == seed_period
    assert "id" in data


@pytest.mark.asyncio
async def test_create_planned_period_not_found_404(
    db_client, auth_headers, seed_categories
):
    response = await db_client.post(
        "/api/v1/periods/99999/planned",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_planned_with_archived_category_400(
    db_client, auth_headers, seed_archived_category, seed_period
):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_archived_category.id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_planned_kind_mismatch_400(
    db_client, auth_headers, seed_categories, seed_period
):
    """POST with kind='income' but expense category — KindMismatchError."""
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "income",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_amount_zero_422(
    db_client, auth_headers, seed_categories, seed_period
):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 0,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_amount_negative_422(
    db_client, auth_headers, seed_categories, seed_period
):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": -100,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_filter_by_kind(
    db_client, auth_headers, seed_categories, seed_period
):
    """Create 1 expense + 1 income, GET ?kind=expense returns only expense."""
    await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "income",
            "amount_cents": 5000000,
            "category_id": seed_categories["income_cat"].id,
        },
        headers=auth_headers,
    )

    expense_only = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned?kind=expense",
        headers=auth_headers,
    )
    assert expense_only.status_code == 200
    e_items = expense_only.json()
    assert len(e_items) == 1
    assert e_items[0]["kind"] == "expense"

    income_only = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned?kind=income",
        headers=auth_headers,
    )
    assert income_only.status_code == 200
    i_items = income_only.json()
    assert len(i_items) == 1
    assert i_items[0]["kind"] == "income"


@pytest.mark.asyncio
async def test_list_filter_by_category(
    db_client, auth_headers, seed_categories, seed_period, db_setup
):
    """2 plans for cat A + 1 for cat B, GET ?category_id=A returns 2."""
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    # Create a second expense category for filter discrimination.
    async with SessionLocal() as session:
        cat_b = Category(
            name="Кафе", kind=CategoryKind.expense, is_archived=False, sort_order=15
        )
        session.add(cat_b)
        await session.commit()
        await session.refresh(cat_b)
        cat_b_id = cat_b.id

    cat_a_id = seed_categories["expense_cat"].id

    for _ in range(2):
        await db_client.post(
            f"/api/v1/periods/{seed_period}/planned",
            json={
                "kind": "expense",
                "amount_cents": 100000,
                "category_id": cat_a_id,
            },
            headers=auth_headers,
        )
    await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 50000,
            "category_id": cat_b_id,
        },
        headers=auth_headers,
    )

    filtered = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned?category_id={cat_a_id}",
        headers=auth_headers,
    )
    assert filtered.status_code == 200
    items = filtered.json()
    assert len(items) == 2
    assert all(it["category_id"] == cat_a_id for it in items)


@pytest.mark.asyncio
async def test_update_manual_planned(
    db_client, auth_headers, seed_categories, seed_period
):
    create = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    plan_id = create.json()["id"]

    update = await db_client.patch(
        f"/api/v1/planned/{plan_id}",
        json={"amount_cents": 250000, "description": "Обновлено"},
        headers=auth_headers,
    )
    assert update.status_code == 200
    body = update.json()
    assert body["amount_cents"] == 250000
    assert body["description"] == "Обновлено"

    # Confirm via list
    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    items = listing.json()
    assert any(it["id"] == plan_id and it["amount_cents"] == 250000 for it in items)


@pytest.mark.asyncio
async def test_update_planned_not_found_404(db_client, auth_headers):
    response = await db_client.patch(
        "/api/v1/planned/99999",
        json={"amount_cents": 100},
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_planned_kind_mismatch_400(
    db_client, auth_headers, seed_categories, seed_period
):
    """PATCH with category_id of opposite kind → 400."""
    create = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    plan_id = create.json()["id"]

    # Try to switch category to income kind without changing kind field
    update = await db_client.patch(
        f"/api/v1/planned/{plan_id}",
        json={"category_id": seed_categories["income_cat"].id},
        headers=auth_headers,
    )
    assert update.status_code == 400


@pytest.mark.asyncio
async def test_update_subscription_auto_400(
    db_client, auth_headers, seed_subscription_auto_planned
):
    """D-37: subscription_auto rows are server-side read-only."""
    response = await db_client.patch(
        f"/api/v1/planned/{seed_subscription_auto_planned['planned_id']}",
        json={"amount_cents": 99999},
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_subscription_auto_400(
    db_client, auth_headers, seed_subscription_auto_planned
):
    """D-37: subscription_auto rows cannot be deleted via API."""
    response = await db_client.delete(
        f"/api/v1/planned/{seed_subscription_auto_planned['planned_id']}",
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_manual_planned(
    db_client, auth_headers, seed_categories, seed_period
):
    create = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_categories["expense_cat"].id,
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    plan_id = create.json()["id"]

    delete = await db_client.delete(
        f"/api/v1/planned/{plan_id}", headers=auth_headers
    )
    assert delete.status_code == 200

    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_no_init_data_403(db_client, seed_period):
    response = await db_client.get(f"/api/v1/periods/{seed_period}/planned")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_planned_response_includes_all_fields(
    db_client, auth_headers, seed_categories, seed_period
):
    create = await db_client.post(
        f"/api/v1/periods/{seed_period}/planned",
        json={
            "kind": "expense",
            "amount_cents": 250000,
            "description": "Полный набор полей",
            "category_id": seed_categories["expense_cat"].id,
            "planned_date": "2026-02-15",
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    body = create.json()
    expected_keys = {
        "id",
        "period_id",
        "kind",
        "amount_cents",
        "description",
        "category_id",
        "planned_date",
        "source",
        "subscription_id",
    }
    assert expected_keys.issubset(body.keys())
    assert body["source"] == "manual"
    assert body["subscription_id"] is None
