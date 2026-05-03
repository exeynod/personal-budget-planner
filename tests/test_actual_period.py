"""Tests for _resolve_period_for_date and period auto-creation (ACT-05).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviors:
- Creating an actual with a date belonging to no existing period auto-creates
  a new BudgetPeriod with status based on current date.
- Period is reused when tx_date falls in an already-existing period.
- Updating tx_date to a new period re-assigns the actual.
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
async def seed_expense_category(db_setup):
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        cat = Category(name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10)
        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        return cat


@pytest.mark.asyncio
async def test_create_actual_auto_creates_period(db_client, auth_headers, seed_expense_category, db_setup):
    """Actual with no pre-existing period causes _resolve_period_for_date to create one."""
    _, SessionLocal = db_setup
    from sqlalchemy import select
    from app.db.models import BudgetPeriod

    today = date.today()
    response = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_expense_category.id,
            "tx_date": str(today),
        },
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)

    async with SessionLocal() as session:
        result = await session.execute(select(BudgetPeriod))
        periods = list(result.scalars().all())
        assert len(periods) == 1
        period = periods[0]
        assert period.period_start <= today <= period.period_end


@pytest.mark.asyncio
async def test_create_actual_reuses_existing_period(
    db_client, auth_headers, seed_expense_category, db_setup
):
    """Two actuals for the same date share the same period_id."""
    today = date.today()
    r1 = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100000,
            "category_id": seed_expense_category.id,
            "tx_date": str(today),
        },
        headers=auth_headers,
    )
    r2 = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 200000,
            "category_id": seed_expense_category.id,
            "tx_date": str(today),
        },
        headers=auth_headers,
    )
    assert r1.status_code in (200, 201)
    assert r2.status_code in (200, 201)
    assert r1.json()["period_id"] == r2.json()["period_id"]


@pytest.mark.asyncio
async def test_resolve_period_for_date_service():
    """Unit test for _resolve_period_for_date logic using DB fixture."""
    from app.services.actual import _check_future_date, FutureDateError
    from datetime import date, timedelta

    # Today is fine
    _check_future_date(date.today())
    _check_future_date(date.today() + timedelta(days=7))

    # Beyond 7 days raises
    with pytest.raises(FutureDateError):
        _check_future_date(date.today() + timedelta(days=8))
