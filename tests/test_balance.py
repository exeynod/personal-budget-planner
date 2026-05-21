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
    """Seed categories (with Category.plan_cents), period, actual tx for balance tests.

    Phase 71 HOME-1: the v1.0 plan source is ``Category.plan_cents`` (NOT
    PlannedTransaction rows). Expense plan comes from the category's
    ``plan_cents``; income plan comes from ``AppUser.income_cents``.
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        ActualSource, ActualTransaction, BudgetPeriod, Category,
        CategoryKind, PeriodStatus,
    )

    today = date.today()
    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        # Income plan = AppUser.income_cents (single monthly figure, v1.0).
        await session.execute(
            text("UPDATE app_user SET income_cents = :inc WHERE id = :uid"),
            {"inc": 500000, "uid": user_id},
        )

        from tests.helpers.seed import seed_category
        exp_cat = await seed_category(session, user_id=user_id, name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10, plan_cents=300000)
        inc_cat = await seed_category(session, user_id=user_id, name="Зарплата", kind=CategoryKind.income, is_archived=False, sort_order=20)
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
    # HOME-1: v1.0 has NO per-income-category plan — income plan is the
    # single AppUser.income_cents figure, surfaced only at the total level.
    assert inc_row["planned_cents"] == 0
    assert inc_row["actual_cents"] == 600000
    # income delta = actual - per-category plan = 600000 - 0 = 600000
    assert inc_row["delta_cents"] == 600000


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


@pytest_asyncio.fixture
async def savings_balance_setup(db_setup, owner_tg_id):
    """Period with expense/income PLUS savings deposit & roundup actuals.

    Phase 71 BUG-1 regression: deposit/roundup ActualTransactions (4-valued
    ActualKind) must NOT leak into compute_balance — they would break the
    BalanceCategoryRow.kind Literal['expense','income'] schema → 500.
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        ActualKind, ActualSource, ActualTransaction, BudgetPeriod, Category,
        CategoryKind, PeriodStatus,
    )

    today = date.today()
    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        # Income plan = AppUser.income_cents (single monthly figure, v1.0).
        await session.execute(
            text("UPDATE app_user SET income_cents = :inc WHERE id = :uid"),
            {"inc": 500000, "uid": user_id},
        )

        # HOME-1: plan from Category.plan_cents. The system 'savings' category
        # (code='savings', plan even if non-zero) is EXCLUDED from the expense
        # plan — it's a goal bucket, not a spend budget.
        from tests.helpers.seed import seed_category
        exp_cat = await seed_category(session, user_id=user_id, name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10, plan_cents=300000)
        inc_cat = await seed_category(session, user_id=user_id, name="Зарплата", kind=CategoryKind.income, is_archived=False, sort_order=20)
        sav_cat = await seed_category(session, user_id=user_id, name="Копилка", kind=CategoryKind.expense, is_archived=False, sort_order=30, code="savings", plan_cents=0)
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

        # Real expense (kind=expense). A roundup child references it (parent).
        expense_txn = ActualTransaction(
            user_id=user_id, period_id=period.id, kind=ActualKind.expense,
            amount_cents=200000, category_id=exp_cat.id,
            tx_date=today, source=ActualSource.mini_app,
        )
        session.add(expense_txn)
        await session.flush()

        session.add_all([
            ActualTransaction(
                user_id=user_id, period_id=period.id, kind=ActualKind.income,
                amount_cents=600000, category_id=inc_cat.id,
                tx_date=today, source=ActualSource.mini_app,
            ),
            # Manual savings deposit — must be excluded from balance.
            ActualTransaction(
                user_id=user_id, period_id=period.id, kind=ActualKind.deposit,
                amount_cents=70000, category_id=sav_cat.id,
                tx_date=today, source=ActualSource.mini_app,
            ),
            # Auto roundup child of the expense — must be excluded too.
            ActualTransaction(
                user_id=user_id, period_id=period.id, kind=ActualKind.roundup,
                amount_cents=5000, category_id=sav_cat.id,
                tx_date=today, source=ActualSource.mini_app,
                parent_txn_id=expense_txn.id,
            ),
        ])

        await session.commit()
        await session.refresh(period)
        return {
            "period_id": period.id,
            "exp_cat_id": exp_cat.id,
            "inc_cat_id": inc_cat.id,
            "sav_cat_id": sav_cat.id,
        }


@pytest.mark.asyncio
async def test_balance_excludes_deposit_and_roundup(db_client, auth_headers, savings_balance_setup):
    """Phase 71 BUG-1: deposit/roundup actuals must not break balance (500→200)."""
    response = await db_client.get("/api/v1/actual/balance", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()

    # by_category contains ONLY expense/income kinds — no deposit/roundup.
    kinds = {row["kind"] for row in data["by_category"]}
    assert kinds == {"expense", "income"}
    assert "deposit" not in kinds
    assert "roundup" not in kinds

    # The savings category (only deposit/roundup actuals, no plan) is absent.
    cat_ids = {row["category_id"] for row in data["by_category"]}
    assert savings_balance_setup["sav_cat_id"] not in cat_ids
    assert len(data["by_category"]) == 2

    # Totals unaffected by the 70000 deposit + 5000 roundup.
    assert data["starting_balance_cents"] == 50000
    assert data["planned_total_expense_cents"] == 300000
    assert data["actual_total_expense_cents"] == 200000
    assert data["planned_total_income_cents"] == 500000
    assert data["actual_total_income_cents"] == 600000
    # balance_now = 50000 + 600000 - 200000 = 450000 (deposit/roundup excluded)
    assert data["balance_now_cents"] == 450000
    # delta_total = (300000 - 200000) + (600000 - 500000) = 200000
    assert data["delta_total_cents"] == 200000

    exp_row = next(r for r in data["by_category"] if r["category_id"] == savings_balance_setup["exp_cat_id"])
    assert exp_row["actual_cents"] == 200000  # roundup child NOT folded in
    assert exp_row["delta_cents"] == 100000


@pytest_asyncio.fixture
async def home_plan_setup(db_setup, owner_tg_id):
    """HOME-1 canonical scenario: plan from Category.plan_cents, savings excluded.

    Mirrors the live-app bug: onboarding set Продукты plan_cents=30000 and a
    monthly income, but Home showed ПЛАН=0 because compute_balance summed
    (empty) PlannedTransaction rows. After HOME-1 the plan must come from
    Category.plan_cents + AppUser.income_cents.
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        ActualKind, ActualSource, ActualTransaction, BudgetPeriod,
        CategoryKind, PeriodStatus,
    )

    today = date.today()
    async with SessionLocal() as session:
        user_id = (await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"), {"tg": owner_tg_id},
        )).scalar_one()

        await session.execute(
            text("UPDATE app_user SET income_cents = :inc WHERE id = :uid"),
            {"inc": 8000000, "uid": user_id},  # 80 000 ₽ monthly income
        )

        from tests.helpers.seed import seed_category
        # Expense category with a 30 000 ₽ monthly plan.
        food_cat = await seed_category(session, user_id=user_id, name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10, plan_cents=3000000)
        # System savings bucket with a non-zero plan — must STILL be excluded.
        sav_cat = await seed_category(session, user_id=user_id, name="КОПИЛКА", kind=CategoryKind.expense, is_archived=False, sort_order=99, code="savings", plan_cents=1000000)
        await session.flush()

        period = BudgetPeriod(
            user_id=user_id,
            period_start=today - timedelta(days=10),
            period_end=today + timedelta(days=20),
            starting_balance_cents=0,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.flush()

        # One real expense of 9 570 ₽ against Продукты.
        session.add(ActualTransaction(
            user_id=user_id, period_id=period.id, kind=ActualKind.expense,
            amount_cents=957000, category_id=food_cat.id,
            tx_date=today, source=ActualSource.mini_app,
        ))
        await session.commit()
        return {
            "period_id": period.id,
            "food_cat_id": food_cat.id,
            "sav_cat_id": sav_cat.id,
            "income_cents": 8000000,
        }


@pytest.mark.asyncio
async def test_balance_plan_from_category_plan_cents(db_client, auth_headers, home_plan_setup):
    """HOME-1: per-category expense plan = Category.plan_cents; savings excluded;
    income plan = AppUser.income_cents."""
    response = await db_client.get("/api/v1/actual/balance", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()

    by_cat = {row["category_id"]: row for row in data["by_category"]}

    # Продукты: plan 30 000 ₽ from Category.plan_cents, actual 9 570 ₽.
    food = by_cat[home_plan_setup["food_cat_id"]]
    assert food["planned_cents"] == 3000000
    assert food["actual_cents"] == 957000
    # expense delta = plan - actual = 3 000 000 - 957 000 = 2 043 000 (≈ 20 430 ₽).
    assert food["delta_cents"] == 2043000

    # Savings bucket excluded from the expense plan / by_category list entirely
    # (no expense actuals, code='savings' → no plan row).
    assert home_plan_setup["sav_cat_id"] not in by_cat

    # Expense plan total = ONLY Продукты (savings 10 000 ₽ NOT counted).
    assert data["planned_total_expense_cents"] == 3000000
    assert data["actual_total_expense_cents"] == 957000

    # Income plan total derives from AppUser.income_cents (no income actual yet).
    assert data["planned_total_income_cents"] == home_plan_setup["income_cents"]
    assert data["actual_total_income_cents"] == 0
