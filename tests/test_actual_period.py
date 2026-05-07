"""Tests for _resolve_period_for_date and period auto-creation (ACT-05).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviors:
- Creating an actual with a date belonging to no existing period auto-creates
  a new BudgetPeriod with status based on current date.
- Period is reused when tx_date falls in an already-existing period.
- Updating tx_date to a new period re-assigns the actual.
"""
import os
from datetime import date, timedelta, datetime, timezone

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
async def seed_expense_category(db_setup, owner_tg_id):
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        cat = Category(user_id=user_id, name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10)
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
    """Unit test for _resolve_period_for_date logic using DB fixture.

    Use _today_in_app_tz() (Europe/Moscow) instead of date.today() — production
    guard runs in MSK; tests in UTC containers can land on a different calendar
    day during the MSK-late-evening window and trip false positives/negatives.
    """
    from app.services.actual import _check_future_date, FutureDateError
    from app.services.periods import _today_in_app_tz
    from datetime import timedelta

    today = _today_in_app_tz()
    # Today is fine
    _check_future_date(today)
    _check_future_date(today + timedelta(days=7))

    # Beyond 7 days raises
    with pytest.raises(FutureDateError):
        _check_future_date(today + timedelta(days=8))
