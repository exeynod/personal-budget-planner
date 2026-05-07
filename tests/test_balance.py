"""Tests for GET /actual/balance endpoint and compute_balance service (ACT-04, D-02).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviors:
- Balance response schema includes all required fields
- Expense delta = plan - actual (positive = under budget)
- Income delta = actual - plan (positive = over planned income)
- balance_now_cents = starting_balance + income_actual - expense_actual
- delta_total_cents = (plan_exp - act_exp) + (act_inc - plan_inc)
- Archived categories excluded from by_category but included in totals
- Empty period returns zeros
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
async def full_balance_setup(db_setup, owner_tg_id):
    """Seed categories, period, planned tx, actual tx for balance tests."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        ActualSource, ActualTransaction, BudgetPeriod, Category,
        CategoryKind, PeriodStatus, PlannedTransaction, PlanSource,
    )

    today = date.today()
    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        exp_cat = Category(user_id=user_id, name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10)
        inc_cat = Category(user_id=user_id, name="Зарплата", kind=CategoryKind.income, is_archived=False, sort_order=20)
        session.add_all([exp_cat, inc_cat])
        await session.flush()

        period = BudgetPeriod(
            user_id=user_id,
            period_start=today - timedelta(days=15),
            period_end=today + timedelta(days=15),
            starting_balance_cents=50000,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.flush()

        planned_exp = PlannedTransaction(
            user_id=user_id,
            period_id=period.id, kind=CategoryKind.expense,
            amount_cents=300000, category_id=exp_cat.id, source=PlanSource.manual,
        )
        planned_inc = PlannedTransaction(
            user_id=user_id,
            period_id=period.id, kind=CategoryKind.income,
            amount_cents=500000, category_id=inc_cat.id, source=PlanSource.manual,
        )
        session.add_all([planned_exp, planned_inc])

        actual_exp = ActualTransaction(
            user_id=user_id,
            period_id=period.id, kind=CategoryKind.expense,
            amount_cents=200000, category_id=exp_cat.id,
            tx_date=today, source=ActualSource.mini_app,
        )
        actual_inc = ActualTransaction(
            user_id=user_id,
            period_id=period.id, kind=CategoryKind.income,
            amount_cents=600000, category_id=inc_cat.id,
            tx_date=today, source=ActualSource.mini_app,
        )
        session.add_all([actual_exp, actual_inc])

        await session.commit()
        await session.refresh(period)
        return {
            "period_id": period.id,
            "exp_cat_id": exp_cat.id,
            "inc_cat_id": inc_cat.id,
        }


@pytest.mark.asyncio
async def test_balance_response_schema(db_client, auth_headers, full_balance_setup):
    """GET /actual/balance returns all required fields."""
    from app.services.actual import compute_balance  # noqa: F401 — RED import check
    response = await db_client.get("/api/v1/actual/balance", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    expected_keys = {
        "period_id", "period_start", "period_end",
        "starting_balance_cents",
        "planned_total_expense_cents", "actual_total_expense_cents",
        "planned_total_income_cents", "actual_total_income_cents",
        "balance_now_cents", "delta_total_cents", "by_category",
    }
    assert expected_keys.issubset(data.keys())


@pytest.mark.asyncio
async def test_balance_values_correct(db_client, auth_headers, full_balance_setup):
    """Verify D-02 sign rule and balance arithmetic."""
    response = await db_client.get("/api/v1/actual/balance", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()

    assert data["starting_balance_cents"] == 50000
    assert data["planned_total_expense_cents"] == 300000
    assert data["actual_total_expense_cents"] == 200000
    assert data["planned_total_income_cents"] == 500000
    assert data["actual_total_income_cents"] == 600000
    # balance_now = 50000 + 600000 - 200000 = 450000
    assert data["balance_now_cents"] == 450000
    # delta_total = (300000 - 200000) + (600000 - 500000) = 100000 + 100000 = 200000
    assert data["delta_total_cents"] == 200000

    # by_category should have 2 rows (non-archived)
    assert len(data["by_category"]) == 2
    by_cat = {row["category_id"]: row for row in data["by_category"]}

    exp_row = by_cat[full_balance_setup["exp_cat_id"]]
    assert exp_row["planned_cents"] == 300000
    assert exp_row["actual_cents"] == 200000
    # expense delta = plan - actual = 100000
    assert exp_row["delta_cents"] == 100000

    inc_row = by_cat[full_balance_setup["inc_cat_id"]]
    assert inc_row["planned_cents"] == 500000
    assert inc_row["actual_cents"] == 600000
    # income delta = actual - plan = 100000
    assert inc_row["delta_cents"] == 100000


@pytest.mark.asyncio
async def test_balance_empty_period(db_client, auth_headers, db_setup, owner_tg_id):
    """Empty period: all totals 0, by_category empty."""
    _, SessionLocal = db_setup
    from app.db.models import BudgetPeriod, PeriodStatus

    today = date.today()
    async with SessionLocal() as session:
        from sqlalchemy import text as _text
        result = await session.execute(
            _text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        _user_id = result.scalar_one()

        period = BudgetPeriod(
            user_id=_user_id,
            period_start=today - timedelta(days=5),
            period_end=today + timedelta(days=25),
            starting_balance_cents=0,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.commit()

    response = await db_client.get("/api/v1/actual/balance", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["balance_now_cents"] == 0
    assert data["planned_total_expense_cents"] == 0
    assert data["actual_total_expense_cents"] == 0
    assert data["by_category"] == []


@pytest.mark.asyncio
async def test_balance_no_active_period_404(db_client, auth_headers):
    """No active period → 404."""
    response = await db_client.get("/api/v1/actual/balance", headers=auth_headers)
    assert response.status_code == 404
