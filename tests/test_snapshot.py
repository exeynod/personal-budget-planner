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
from datetime import date, datetime, timezone
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


async def _create_period(
    SessionLocal,
    *,
    owner_tg_id: int,
    period_start: date,
    period_end: date,
    starting_balance_cents: int = 0,
) -> int:
    """Create BudgetPeriod via direct DB-insert; return id."""
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
    owner_tg_id: int,
    category_id: int,
    amount_cents: int,
    description: Optional[str] = None,
    day_of_period: Optional[int] = None,
    sort_order: int = 0,
) -> int:
    from sqlalchemy import text
    from app.db.models import PlanTemplateItem

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        item = PlanTemplateItem(
            user_id=user_id,
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
    owner_tg_id: int,
    period_id: int,
    category_id: int,
    kind,  # CategoryKind
    amount_cents: int,
    source,  # PlanSource
    description: Optional[str] = None,
    planned_date: Optional[date] = None,
    subscription_id: Optional[int] = None,
) -> int:
    from sqlalchemy import text
    from app.db.models import PlannedTransaction

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        row = PlannedTransaction(
            user_id=user_id,
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
    owner_tg_id: int,
    category_id: int,
    name: str = "Spotify",
    amount_cents: int = 29900,
    next_charge_date: Optional[date] = None,
) -> int:
    from sqlalchemy import text
    from app.db.models import Subscription, SubCycle

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        sub = Subscription(
            user_id=user_id,
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


# 68-05 (class G): snapshot-from-period is part of the deprecated template WRITE
# surface (Phase 22 CR-05). plan_template_item was dropped (alembic 0013); the
# endpoint returns 410 Gone immediately without touching the DB
# (app/api/routes/templates.py::snapshot_from_period_deprecated). The original
# tests asserted snapshot SEMANTICS (clear/copy/exclude/overwrite template rows)
# against that dropped table; those semantics no longer exist. Tests now assert
# the 410 contract — the legacy ``_create_template_item`` helper (which inserted
# into the dropped table) is no longer called.


@pytest.mark.asyncio
async def test_snapshot_period_not_found_410_gone(db_client, auth_headers):
    """Deprecated snapshot returns 410 (not 404) — surface is gone (CR-05)."""
    response = await db_client.post(
        "/api/v1/template/snapshot-from-period/99999",
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text
    assert response.json()["detail"]["error"] == "templates_deprecated"


@pytest.mark.asyncio
async def test_snapshot_empty_period_410_gone(
    db_setup, auth_headers, seed_categories, owner_tg_id
):
    """Snapshot (empty-period clear path removed) → 410 Gone (CR-05)."""
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text

    # GET surface remains an empty list.
    listing = await client.get("/api/v1/template/items", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_snapshot_includes_template_and_manual_410_gone(
    db_setup, auth_headers, seed_categories, owner_tg_id
):
    """Snapshot (template+manual copy path removed) → 410 Gone (CR-05)."""
    from app.db.models import CategoryKind, PlanSource

    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    # Planned rows still seed fine (planned_transaction is a live table); the
    # snapshot endpoint just no longer reads them.
    await _create_planned(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_id=period_id,
        category_id=seed_categories["expense_cat"].id,
        kind=CategoryKind.expense,
        amount_cents=1500000,
        source=PlanSource.manual,
        description="Закупка",
        planned_date=date(2026, 2, 9),
    )

    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_snapshot_excludes_subscription_auto_410_gone(
    db_setup, auth_headers, seed_categories, owner_tg_id
):
    """Snapshot (subscription_auto exclude path removed) → 410 Gone (CR-05)."""
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_snapshot_overwrites_existing_template_410_gone(
    db_setup, auth_headers, seed_categories, owner_tg_id
):
    """Snapshot (destructive overwrite path removed) → 410 Gone (CR-05)."""
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}",
        headers=auth_headers,
    )
    assert response.status_code == 410, response.text


@pytest.mark.asyncio
async def test_snapshot_no_init_data_403(db_setup, seed_categories, owner_tg_id):
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )
    response = await client.post(
        f"/api/v1/template/snapshot-from-period/{period_id}"
    )
    assert response.status_code == 403
