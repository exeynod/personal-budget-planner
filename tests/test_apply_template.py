"""Integration tests for apply-template (TPL-04, PER-05) — Phase 3.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Wave 0 RED state: tests import contracts not yet implemented
(`app.services.planned::apply_template_to_period`,
`app.api.routes.planned`). HTTP calls to
`/api/v1/periods/{id}/apply-template` return 404 until Plans 03-02..03-03
implement them.

Covered behaviors (per 03-PLAN.md task 2 + 03-VALIDATION.md, D-31):
- 404 on non-existent period
- Empty template → 200 with created=0, planned=[]
- Apply creates planned rows with source=template, mirroring template fields
- Idempotency: second call returns existing rows with created=0 (D-31)
- planned_date computed from day_of_period and clamped to period_end
- planned_date NULL when template day_of_period is NULL
- kind mirrors category.kind
- Auth: 403 without X-Telegram-Init-Data
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
async def db_setup(async_client):
    """async_client + real DB session via dependency_overrides.

    Returns (client, SessionLocal). Truncates tables before yielding.
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
    client, _ = db_setup
    return client


@pytest_asyncio.fixture
async def seed_categories(db_setup):
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


async def _create_period(
    SessionLocal,
    *,
    period_start: date,
    period_end: date,
    starting_balance_cents: int = 0,
) -> int:
    from app.db.models import BudgetPeriod, PeriodStatus

    async with SessionLocal() as session:
        period = BudgetPeriod(
            period_start=period_start,
            period_end=period_end,
            starting_balance_cents=starting_balance_cents,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.commit()
        await session.refresh(period)
        return period.id


@pytest_asyncio.fixture
async def seed_period(db_setup):
    """Default period: 2026-02-05..2026-03-04 (28 days)."""
    _, SessionLocal = db_setup
    return await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )


@pytest_asyncio.fixture
async def seed_template_items(db_setup, seed_categories):
    """Create 3 template-items: 2 expense + 1 income."""
    _, SessionLocal = db_setup
    from app.db.models import PlanTemplateItem

    async with SessionLocal() as session:
        items = [
            PlanTemplateItem(
                category_id=seed_categories["expense_cat"].id,
                amount_cents=1500000,
                description="Закупка",
                day_of_period=5,
                sort_order=10,
            ),
            PlanTemplateItem(
                category_id=seed_categories["expense_cat"].id,
                amount_cents=3500000,
                description="Аренда",
                day_of_period=1,
                sort_order=20,
            ),
            PlanTemplateItem(
                category_id=seed_categories["income_cat"].id,
                amount_cents=12000000,
                description="Основная",
                day_of_period=5,
                sort_order=30,
            ),
        ]
        session.add_all(items)
        await session.commit()
        for it in items:
            await session.refresh(it)
        return items


# ----- Tests -----


@pytest.mark.asyncio
async def test_apply_period_not_found_404(db_client, auth_headers):
    response = await db_client.post(
        "/api/v1/periods/99999/apply-template", headers=auth_headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_apply_empty_template(db_client, auth_headers, seed_period):
    """Period exists, template empty → 200 with created=0, planned=[]."""
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period_id"] == seed_period
    assert body["created"] == 0
    assert body["planned"] == []

    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_apply_creates_planned_rows(
    db_client, auth_headers, seed_categories, seed_period, seed_template_items
):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period_id"] == seed_period
    assert body["created"] == 3
    assert len(body["planned"]) == 3

    for row in body["planned"]:
        assert row["source"] == "template"
        assert row["period_id"] == seed_period

    amounts = sorted(r["amount_cents"] for r in body["planned"])
    assert amounts == [1500000, 3500000, 12000000]
    descriptions = sorted(r["description"] for r in body["planned"])
    assert descriptions == ["Аренда", "Закупка", "Основная"]

    # GET planned returns 3 rows
    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 3
    assert all(it["source"] == "template" for it in items)


@pytest.mark.asyncio
async def test_apply_idempotent_returns_existing(
    db_client, auth_headers, seed_categories, seed_period, seed_template_items
):
    """D-31: second apply returns existing rows with created=0; no duplicates."""
    first = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert first.status_code == 200
    assert first.json()["created"] == 3

    second = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert second.status_code == 200
    body = second.json()
    assert body["period_id"] == seed_period
    assert body["created"] == 0
    assert len(body["planned"]) == 3

    # GET planned still 3 (no duplicates)
    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 3


@pytest.mark.asyncio
async def test_apply_planned_date_clamped_to_period_end(
    db_setup, auth_headers, seed_categories
):
    """Template day_of_period beyond period length → planned_date clamped to period_end.

    Period: 2026-02-05..2026-03-04 (28 days inclusive).
    Template day_of_period=30 → period_start + 29 days = 2026-03-06 > period_end → clamp.
    """
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    from app.db.models import PlanTemplateItem

    async with SessionLocal() as session:
        item = PlanTemplateItem(
            category_id=seed_categories["expense_cat"].id,
            amount_cents=100000,
            description="Late",
            day_of_period=30,
            sort_order=0,
        )
        session.add(item)
        await session.commit()

    response = await client.post(
        f"/api/v1/periods/{period_id}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["planned"][0]["planned_date"] == "2026-03-04"


@pytest.mark.asyncio
async def test_apply_planned_date_null_when_template_day_null(
    db_setup, auth_headers, seed_categories, seed_period
):
    """Template-item with day_of_period=NULL → planned_date NULL after apply."""
    _, SessionLocal = db_setup
    from app.db.models import PlanTemplateItem

    async with SessionLocal() as session:
        item = PlanTemplateItem(
            category_id=seed_categories["expense_cat"].id,
            amount_cents=200000,
            description="No date",
            day_of_period=None,
            sort_order=0,
        )
        session.add(item)
        await session.commit()

    client, _ = db_setup
    response = await client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["planned"][0]["planned_date"] is None


@pytest.mark.asyncio
async def test_apply_kind_mirrors_category_kind(
    db_setup, auth_headers, seed_categories, seed_period
):
    """Apply: planned.kind == category.kind (income for income-category)."""
    _, SessionLocal = db_setup
    from app.db.models import PlanTemplateItem

    async with SessionLocal() as session:
        item = PlanTemplateItem(
            category_id=seed_categories["income_cat"].id,
            amount_cents=12000000,
            description="Зарплата",
            day_of_period=5,
            sort_order=0,
        )
        session.add(item)
        await session.commit()

    client, _ = db_setup
    response = await client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["planned"][0]["kind"] == "income"


@pytest.mark.asyncio
async def test_apply_no_init_data_403(db_client, seed_period):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template"
    )
    assert response.status_code == 403
