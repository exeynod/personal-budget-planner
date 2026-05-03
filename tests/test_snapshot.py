"""Integration tests for snapshot-from-period (TPL-03) — Phase 3.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Wave 0 RED state: tests import contracts not yet implemented
(`app.api.routes.templates::snapshot_from_period`,
`app.services.templates::snapshot_from_period`). HTTP calls to
`/api/v1/template/snapshot-from-period/{period_id}` return 404 until
Plans 03-02..03-03 implement the service + route.

Covered behaviors (per 03-PLAN.md task 1 + 03-VALIDATION.md, D-32):
- 404 on non-existent period
- Empty period clears template (replaced=N counts old items)
- Snapshot includes source IN (template, manual)
- Snapshot EXCLUDES subscription_auto rows (D-32)
- Destructive overwrite of existing template
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
    """Seed two non-archived categories: expense + income."""
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
    """Create BudgetPeriod via direct DB-insert; return id."""
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


async def _create_template_item(
    SessionLocal,
    *,
    category_id: int,
    amount_cents: int,
    description: Optional[str] = None,
    day_of_period: Optional[int] = None,
    sort_order: int = 0,
) -> int:
    from app.db.models import PlanTemplateItem

    async with SessionLocal() as session:
        item = PlanTemplateItem(
            category_id=category_id,
            amount_cents=amount_cents,
            description=description,
            day_of_period=day_of_period,
            sort_order=sort_order,
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item.id


async def _create_planned(
    SessionLocal,
    *,
    period_id: int,
    category_id: int,
    kind,  # CategoryKind
    amount_cents: int,
    source,  # PlanSource
    description: Optional[str] = None,
    planned_date: Optional[date] = None,
    subscription_id: Optional[int] = None,
) -> int:
    from app.db.models import PlannedTransaction

    async with SessionLocal() as session:
        row = PlannedTransaction(
            period_id=period_id,
            kind=kind,
            amount_cents=amount_cents,
            description=description,
            category_id=category_id,
            planned_date=planned_date,
            source=source,
            subscription_id=subscription_id,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row.id


async def _create_subscription(
    SessionLocal,
    *,
    category_id: int,
    name: str = "Spotify",
    amount_cents: int = 29900,
    next_charge_date: Optional[date] = None,
) -> int:
    from app.db.models import Subscription, SubCycle

    async with SessionLocal() as session:
        sub = Subscription(
            name=name,
            amount_cents=amount_cents,
            cycle=SubCycle.monthly,
            next_charge_date=next_charge_date or date(2026, 3, 1),
            category_id=category_id,
            notify_days_before=2,
            is_active=True,
        )
        session.add(sub)
        await session.commit()
        await session.refresh(sub)
        return sub.id


# ----- Tests -----


@pytest.mark.asyncio
async def test_snapshot_period_not_found_404(db_client, auth_headers):
    response = await db_client.post(
        "/api/v1/template/snapshot-from-period/99999",
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_snapshot_empty_period_clears_template(
    db_setup, auth_headers, seed_categories
):
    """Snapshot from a period with no planned rows wipes the template.

    Setup: period exists, no planned rows. Pre-existing 2 template items.
    Expect: response.replaced == 2, template_items empty. GET /template/items returns [].
    """
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    # Pre-existing template items (will be cleared)
    await _create_template_item(
        SessionLocal,
        category_id=seed_categories["expense_cat"].id,
        amount_cents=500000,
        sort_order=0,
    )
    await _create_template_item(
        SessionLocal,
        category_id=seed_categories["expense_cat"].id,
        amount_cents=600000,
        sort_order=10,
    )

    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["template_items"] == []
    assert body["replaced"] == 2

    listing = await client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_snapshot_includes_template_and_manual(
    db_setup, auth_headers, seed_categories
):
    """Snapshot copies planned rows where source IN ('template', 'manual')."""
    from app.db.models import CategoryKind, PlanSource

    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    # Two planned rows: one template-source, one manual-source.
    await _create_planned(
        SessionLocal,
        period_id=period_id,
        category_id=seed_categories["expense_cat"].id,
        kind=CategoryKind.expense,
        amount_cents=1500000,
        source=PlanSource.template,
        description="Закупка",
        planned_date=date(2026, 2, 9),
    )
    await _create_planned(
        SessionLocal,
        period_id=period_id,
        category_id=seed_categories["income_cat"].id,
        kind=CategoryKind.income,
        amount_cents=12000000,
        source=PlanSource.manual,
        description="Аванс",
        planned_date=date(2026, 2, 25),
    )

    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["template_items"]) == 2
    assert body["replaced"] == 0  # template was empty before

    listing = await client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 2

    # Verify amounts/categories preserved
    amounts = sorted(it["amount_cents"] for it in items)
    assert amounts == [1500000, 12000000]
    cat_ids = sorted(it["category_id"] for it in items)
    assert cat_ids == sorted(
        [seed_categories["expense_cat"].id, seed_categories["income_cat"].id]
    )
    descriptions = sorted(it["description"] for it in items)
    assert descriptions == ["Аванс", "Закупка"]


@pytest.mark.asyncio
async def test_snapshot_excludes_subscription_auto(
    db_setup, auth_headers, seed_categories
):
    """D-32: snapshot must exclude rows with source='subscription_auto'."""
    from app.db.models import CategoryKind, PlanSource

    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    sub_id = await _create_subscription(
        SessionLocal, category_id=seed_categories["expense_cat"].id
    )

    # 3 planned rows: template + manual + subscription_auto.
    await _create_planned(
        SessionLocal,
        period_id=period_id,
        category_id=seed_categories["expense_cat"].id,
        kind=CategoryKind.expense,
        amount_cents=1000000,
        source=PlanSource.template,
        description="Template row",
    )
    await _create_planned(
        SessionLocal,
        period_id=period_id,
        category_id=seed_categories["expense_cat"].id,
        kind=CategoryKind.expense,
        amount_cents=2000000,
        source=PlanSource.manual,
        description="Manual row",
    )
    await _create_planned(
        SessionLocal,
        period_id=period_id,
        category_id=seed_categories["expense_cat"].id,
        kind=CategoryKind.expense,
        amount_cents=29900,
        source=PlanSource.subscription_auto,
        description="Spotify (auto)",
        subscription_id=sub_id,
    )

    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["template_items"]) == 2  # subscription_auto excluded
    assert body["replaced"] == 0

    listing = await client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 2
    descriptions = sorted(it["description"] for it in items)
    assert descriptions == ["Manual row", "Template row"]
    # Subscription row absent
    assert "Spotify (auto)" not in [it["description"] for it in items]


@pytest.mark.asyncio
async def test_snapshot_overwrites_existing_template(
    db_setup, auth_headers, seed_categories
):
    """Snapshot is destructive: prior template rows wiped, new ones derived from period."""
    from app.db.models import CategoryKind, PlanSource

    client, SessionLocal = db_setup
    # Pre-existing template-item (different amount than what snapshot will produce)
    await _create_template_item(
        SessionLocal,
        category_id=seed_categories["expense_cat"].id,
        amount_cents=999999,
        description="Old template",
        sort_order=0,
    )
    period_id = await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    # One planned row (manual) — what snapshot will produce
    await _create_planned(
        SessionLocal,
        period_id=period_id,
        category_id=seed_categories["expense_cat"].id,
        kind=CategoryKind.expense,
        amount_cents=750000,
        source=PlanSource.manual,
        description="New from period",
    )

    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["replaced"] == 1  # the old template-item
    assert len(body["template_items"]) == 1

    listing = await client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["amount_cents"] == 750000  # new, not 999999
    assert items[0]["description"] == "New from period"


@pytest.mark.asyncio
async def test_snapshot_no_init_data_403(db_setup, seed_categories):
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}"
    )
    assert response.status_code == 403
