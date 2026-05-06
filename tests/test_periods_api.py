"""Tests for GET /api/v1/periods and GET /api/v1/periods/{id}/balance endpoints (DSH-06).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviors:
- GET /periods requires X-Telegram-Init-Data (403 without)
- GET /periods returns [] for empty DB
- GET /periods returns all periods sorted by period_start DESC
- GET /periods response shape includes all required fields
- GET /periods/{id}/balance requires X-Telegram-Init-Data (403 without)
- GET /periods/{id}/balance returns BalanceResponse for existing period
- GET /periods/{id}/balance returns 404 for missing period_id
- GET /periods/{id}/balance works for closed periods
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
async def seed_periods(db_setup, owner_tg_id):
    """Seed 3 BudgetPeriod rows with different period_start dates.

    Returns dict with period ids for use in tests.
    """
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import BudgetPeriod, PeriodStatus

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        # Oldest — closed
        p1 = BudgetPeriod(
            user_id=user_id,
            period_start=date(2026, 3, 5),
            period_end=date(2026, 4, 4),
            starting_balance_cents=10000,
            ending_balance_cents=12000,
            status=PeriodStatus.closed,
        )
        # Middle — closed
        p2 = BudgetPeriod(
            user_id=user_id,
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=12000,
            ending_balance_cents=15000,
            status=PeriodStatus.closed,
        )
        # Newest — active
        p3 = BudgetPeriod(
            user_id=user_id,
            period_start=date(2026, 5, 5),
            period_end=date(2026, 6, 4),
            starting_balance_cents=15000,
            status=PeriodStatus.active,
        )
        session.add_all([p1, p2, p3])
        await session.commit()
        await session.refresh(p1)
        await session.refresh(p2)
        await session.refresh(p3)
        return {
            "oldest_id": p1.id,
            "middle_id": p2.id,
            "newest_id": p3.id,
        }


# ---------- Tests for GET /api/v1/periods ----------

@pytest.mark.asyncio
async def test_list_periods_requires_init_data(async_client):
    """GET /api/v1/periods without X-Telegram-Init-Data → 403."""
    response = await async_client.get("/api/v1/periods")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_periods_empty_returns_empty_list(db_setup, auth_headers):
    """Empty DB → GET /periods returns 200 + []."""
    client, _ = db_setup
    response = await client.get("/api/v1/periods", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_periods_returns_all_sorted_desc(db_setup, seed_periods, auth_headers):
    """3 periods inserted → GET /periods returns 3 items sorted period_start DESC."""
    client, _ = db_setup
    response = await client.get("/api/v1/periods", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    # Verify descending order by period_start
    starts = [item["period_start"] for item in data]
    assert starts == sorted(starts, reverse=True), f"Not sorted DESC: {starts}"


@pytest.mark.asyncio
async def test_list_periods_response_shape(db_setup, seed_periods, auth_headers):
    """Each period item must contain all required fields."""
    client, _ = db_setup
    response = await client.get("/api/v1/periods", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    required_keys = {
        "id", "period_start", "period_end",
        "starting_balance_cents", "ending_balance_cents",
        "status", "closed_at",
    }
    for item in data:
        assert required_keys.issubset(item.keys()), f"Missing keys: {required_keys - item.keys()}"


# ---------- Tests for GET /api/v1/periods/{id}/balance ----------

@pytest.mark.asyncio
async def test_get_period_balance_requires_init_data(async_client):
    """GET /api/v1/periods/1/balance without header → 403."""
    response = await async_client.get("/api/v1/periods/1/balance")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_period_balance_returns_balance_for_existing_period(
    db_setup, auth_headers
):
    """Create period + planned + actual → GET /periods/{id}/balance returns 200 + BalanceResponse."""
    client, SessionLocal = db_setup
    from app.db.models import (
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        Category,
        CategoryKind,
        PeriodStatus,
        PlannedTransaction,
        PlanSource,
    )

    async with SessionLocal() as session:
        cat = Category(
            name="Тест", kind=CategoryKind.expense, is_archived=False, sort_order=1
        )
        session.add(cat)
        await session.flush()

        period = BudgetPeriod(
            period_start=date(2026, 5, 5),
            period_end=date(2026, 6, 4),
            starting_balance_cents=50000,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.flush()

        planned = PlannedTransaction(
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=10000,
            category_id=cat.id,
            source=PlanSource.manual,
        )
        actual = ActualTransaction(
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=5000,
            category_id=cat.id,
            tx_date=date(2026, 5, 10),
            source=ActualSource.mini_app,
        )
        session.add_all([planned, actual])
        await session.commit()
        period_id = period.id

    response = await client.get(
        f"/api/v1/periods/{period_id}/balance", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "period_id" in data
    assert "balance_now_cents" in data
    assert "delta_total_cents" in data
    assert "by_category" in data
    assert data["period_id"] == period_id


@pytest.mark.asyncio
async def test_get_period_balance_404_when_period_missing(db_setup, auth_headers):
    """GET /periods/99999/balance → 404 with id in detail."""
    client, _ = db_setup
    response = await client.get("/api/v1/periods/99999/balance", headers=auth_headers)
    assert response.status_code == 404
    detail = response.json().get("detail", "")
    assert "99999" in str(detail) or "not found" in str(detail).lower()


@pytest.mark.asyncio
async def test_get_period_balance_works_for_closed_period(db_setup, auth_headers):
    """Closed period → GET /periods/{id}/balance returns 200 (not blocked)."""
    client, SessionLocal = db_setup
    from app.db.models import BudgetPeriod, PeriodStatus

    async with SessionLocal() as session:
        closed_period = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=20000,
            ending_balance_cents=22000,
            status=PeriodStatus.closed,
        )
        session.add(closed_period)
        await session.commit()
        period_id = closed_period.id

    response = await client.get(
        f"/api/v1/periods/{period_id}/balance", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["period_id"] == period_id
