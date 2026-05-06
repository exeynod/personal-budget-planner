"""Tests for internal bot API endpoints (POST /api/v1/internal/bot/*).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviors:
- POST /bot/actual: status=created, ambiguous, not_found
- POST /bot/balance: returns period balance data
- POST /bot/today: returns today's actuals grouped by category
- Authentication: 403 without X-Internal-Token
"""
import os
from datetime import date, timedelta

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def internal_headers():
    from app.core.settings import settings
    return {"X-Internal-Token": settings.INTERNAL_TOKEN}


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
async def seed_data(db_setup, owner_tg_id):
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        BudgetPeriod, Category, CategoryKind, PeriodStatus,
    )

    today = date.today()
    async with SessionLocal() as session:
        # AppUser already seeded by db_setup fixture; look up its id.
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        exp_cat = Category(user_id=user_id, name="Продукты", kind=CategoryKind.expense, is_archived=False, sort_order=10)
        inc_cat = Category(user_id=user_id, name="Зарплата", kind=CategoryKind.income, is_archived=False, sort_order=20)
        session.add_all([exp_cat, inc_cat])

        period = BudgetPeriod(
            user_id=user_id,
            period_start=today - timedelta(days=15),
            period_end=today + timedelta(days=15),
            starting_balance_cents=0,
            status=PeriodStatus.active,
        )
        session.add(period)
        await session.commit()
        await session.refresh(exp_cat)
        await session.refresh(inc_cat)
        await session.refresh(period)
        return {
            "period_id": period.id,
            "exp_cat_id": exp_cat.id,
            "inc_cat_id": inc_cat.id,
            "tg_user_id": owner_tg_id,
        }


@pytest.mark.asyncio
async def test_bot_actual_created(db_client, internal_headers, seed_data):
    from app.services.internal_bot import process_bot_actual  # noqa: F401 — RED import check
    response = await db_client.post(
        "/api/v1/internal/bot/actual",
        json={
            "tg_user_id": seed_data["tg_user_id"],
            "kind": "expense",
            "amount_cents": 50000,
            "category_query": "Продукты",
        },
        headers=internal_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "created"
    assert data["actual"] is not None
    assert data["actual"]["source"] == "bot"


@pytest.mark.asyncio
async def test_bot_actual_ambiguous(db_client, internal_headers, seed_data, db_setup, owner_tg_id):
    """Two categories matching query → status=ambiguous."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()
        cat2 = Category(user_id=user_id, name="Продуктовый рынок", kind=CategoryKind.expense, is_archived=False, sort_order=15)
        session.add(cat2)
        await session.commit()

    response = await db_client.post(
        "/api/v1/internal/bot/actual",
        json={
            "tg_user_id": seed_data["tg_user_id"],
            "kind": "expense",
            "amount_cents": 50000,
            "category_query": "Продукт",
        },
        headers=internal_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ambiguous"
    assert len(data["candidates"]) >= 2


@pytest.mark.asyncio
async def test_bot_actual_not_found(db_client, internal_headers, seed_data):
    response = await db_client.post(
        "/api/v1/internal/bot/actual",
        json={
            "tg_user_id": seed_data["tg_user_id"],
            "kind": "expense",
            "amount_cents": 50000,
            "category_query": "НесуществующаяКатегория",
        },
        headers=internal_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "not_found"


@pytest.mark.asyncio
async def test_bot_balance(db_client, internal_headers, seed_data):
    from app.services.internal_bot import format_balance_for_bot  # noqa: F401 — RED import check
    response = await db_client.post(
        "/api/v1/internal/bot/balance",
        json={"tg_user_id": seed_data["tg_user_id"]},
        headers=internal_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "balance_now_cents" in data
    assert "by_category" in data


@pytest.mark.asyncio
async def test_bot_today_empty(db_client, internal_headers, seed_data):
    from app.services.internal_bot import format_today_for_bot  # noqa: F401 — RED import check
    response = await db_client.post(
        "/api/v1/internal/bot/today",
        json={"tg_user_id": seed_data["tg_user_id"]},
        headers=internal_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["actuals"] == []
    assert data["total_expense_cents"] == 0


@pytest.mark.asyncio
async def test_bot_actual_no_token_403(db_client, seed_data):
    response = await db_client.post(
        "/api/v1/internal/bot/actual",
        json={
            "tg_user_id": seed_data["tg_user_id"],
            "kind": "expense",
            "amount_cents": 50000,
            "category_query": "Продукты",
        },
    )
    assert response.status_code == 403
