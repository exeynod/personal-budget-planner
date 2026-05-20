"""Phase 26 BE Plan 26-01 — integration tests for PATCH /api/v1/plan-month.

Atomic batch update of ``Category.plan_cents`` per PLAN-V10-06. Single
round-trip with Σplan ≤ income validation server-side; cross-tenant /
missing IDs surface as 404; negative cents / duplicate IDs / empty list
rejected by Pydantic before the service is reached.

Test names use ``test_phase_26_plan_month_*`` prefix so they can be
filtered with ``pytest -k phase_26_plan_month``.

DB-backed: requires DATABASE_URL (docker test profile). Self-skips
otherwise.
"""
import os
from datetime import datetime, timezone

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
    """Seed:
    - owner AppUser (income_cents = 100_000_00)
    - other AppUser (income_cents = 50_000_00) with one of his categories
    - owner has cat_a (plan_cents=10_000_00) + cat_b (plan_cents=20_000_00)
    - other has cat_c (plan_cents=5_000_00)

    Test exposes the IDs so cross-tenant / overflow / 404 paths can be
    exercised through one fixture.
    """
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.db.models import AppUser, Category, CategoryKind, RolloverPolicy, UserRole
    from app.main_api import app
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    await truncate_db()
    async with SessionLocal() as session:
        owner = AppUser(
            tg_user_id=owner_tg_id,
            role=UserRole.owner,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
            income_cents=100_000_00,
        )
        other = AppUser(
            tg_user_id=owner_tg_id + 1,
            role=UserRole.member,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
            income_cents=50_000_00,
        )
        session.add_all([owner, other])
        await session.flush()

        from tests.helpers.seed import seed_category
        cat_a = await seed_category(
            session,
            user_id=owner.id, name="Продукты", kind=CategoryKind.expense,
            sort_order=10, plan_cents=10_000_00, code="food", ord="01",
            rollover=RolloverPolicy.misc, paused=False,
        )
        cat_b = await seed_category(
            session,
            user_id=owner.id, name="Транспорт", kind=CategoryKind.expense,
            sort_order=20, plan_cents=20_000_00, code="transport", ord="02",
            rollover=RolloverPolicy.misc, paused=False,
        )
        cat_c = await seed_category(
            session,
            user_id=other.id, name="OtherFood", kind=CategoryKind.expense,
            sort_order=10, plan_cents=5_000_00, code="food", ord="01",
            rollover=RolloverPolicy.misc, paused=False,
        )
        await session.commit()
        await session.refresh(cat_a)
        await session.refresh(cat_b)
        await session.refresh(cat_c)
        owner_id = owner.id
        cat_a_id, cat_b_id, cat_c_id = cat_a.id, cat_b.id, cat_c.id

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db
    yield {
        "client": async_client,
        "SessionLocal": SessionLocal,
        "owner_id": owner_id,
        "cat_a_id": cat_a_id,
        "cat_b_id": cat_b_id,
        "cat_c_id_other_user": cat_c_id,
    }
    await engine.dispose()


# ----------------------------------------------------------------------
# Happy path.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_plan_month_happy_two_categories(db_setup, auth_headers):
    """T-BE-02 happy: PATCH 2 cats with Σ≤income → 200 + DB persisted."""
    from app.db.models import Category
    from sqlalchemy import select

    cat_a = db_setup["cat_a_id"]
    cat_b = db_setup["cat_b_id"]
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            {"category_id": cat_a, "plan_cents": 30_000_00},
            {"category_id": cat_b, "plan_cents": 20_000_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "categories" in body
    cats = {c["id"]: c["plan_cents"] for c in body["categories"]}
    assert cats[cat_a] == 30_000_00
    assert cats[cat_b] == 20_000_00

    async with db_setup["SessionLocal"]() as s:
        rows = (
            await s.execute(
                select(Category).where(Category.id.in_([cat_a, cat_b]))
            )
        ).scalars().all()
        persisted = {c.id: c.plan_cents for c in rows}
        assert persisted[cat_a] == 30_000_00
        assert persisted[cat_b] == 20_000_00


@pytest.mark.asyncio
async def test_phase_26_plan_month_single_item_list_valid(db_setup, auth_headers):
    """Single-item plans list still PATCHes that one category."""
    from app.db.models import Category
    from sqlalchemy import select

    cat_a = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [{"category_id": cat_a, "plan_cents": 7_500_00}]},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["categories"][0]["plan_cents"] == 7_500_00

    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_a))
        ).scalar_one()
        assert row.plan_cents == 7_500_00


# ----------------------------------------------------------------------
# Validation: overflow.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_plan_month_sum_exceeds_income_400(db_setup, auth_headers):
    """T-BE-02 overflow: Σplan > income → 400 with structured detail."""
    from app.db.models import Category
    from sqlalchemy import select

    cat_a = db_setup["cat_a_id"]
    cat_b = db_setup["cat_b_id"]
    # owner.income_cents = 100_000_00; 50_000_00 + 60_000_00 = 110_000_00 > 100_000_00
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            {"category_id": cat_a, "plan_cents": 50_000_00},
            {"category_id": cat_b, "plan_cents": 60_000_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert detail["error"] == "plan_overflow"
    assert detail["income_cents"] == 100_000_00
    assert detail["sum_plan_cents"] == 110_000_00

    # Atomicity sanity check — neither category mutated.
    async with db_setup["SessionLocal"]() as s:
        rows = (
            await s.execute(select(Category).where(Category.id.in_([cat_a, cat_b])))
        ).scalars().all()
        persisted = {c.id: c.plan_cents for c in rows}
        assert persisted[cat_a] == 10_000_00  # unchanged from seed
        assert persisted[cat_b] == 20_000_00  # unchanged from seed


@pytest.mark.asyncio
async def test_phase_26_plan_month_skips_overflow_when_income_null(
    db_setup, auth_headers
):
    """When user.income_cents is NULL (legacy v0.x), validation is skipped."""
    from sqlalchemy import text

    # Null out owner's income.
    async with db_setup["SessionLocal"]() as s:
        await s.execute(
            text("UPDATE app_user SET income_cents = NULL WHERE id = :uid"),
            {"uid": db_setup["owner_id"]},
        )
        await s.commit()

    cat_a = db_setup["cat_a_id"]
    cat_b = db_setup["cat_b_id"]
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            # Σ = 9_999_999_00 — without income ceiling this should still pass.
            {"category_id": cat_a, "plan_cents": 5_000_000_00},
            {"category_id": cat_b, "plan_cents": 4_999_999_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text


# ----------------------------------------------------------------------
# Validation: cross-tenant / missing.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_plan_month_cross_tenant_404(db_setup, auth_headers):
    """T-BE-03 cross-tenant: cat_id принадлежит другому юзеру → 404."""
    from app.db.models import Category
    from sqlalchemy import select

    cat_a = db_setup["cat_a_id"]
    cat_other = db_setup["cat_c_id_other_user"]
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            {"category_id": cat_a, "plan_cents": 1_000_00},
            {"category_id": cat_other, "plan_cents": 1_000_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 404, response.text
    assert str(cat_other) in str(response.json()["detail"])

    # Atomicity: cat_a NOT mutated despite being valid.
    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_a))
        ).scalar_one()
        assert row.plan_cents == 10_000_00  # original seed


@pytest.mark.asyncio
async def test_phase_26_plan_month_unknown_category_404(db_setup, auth_headers):
    """Non-existent category_id → 404."""
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            {"category_id": 999_999, "plan_cents": 1_000_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 404, response.text


# ----------------------------------------------------------------------
# Validation: Pydantic edge cases.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_plan_month_negative_plan_cents_422(db_setup, auth_headers):
    """T-BE-03 negative plan_cents → 422."""
    cat_a = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [{"category_id": cat_a, "plan_cents": -1}]},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_phase_26_plan_month_empty_list_422(db_setup, auth_headers):
    """Empty plans list rejected by min_length=1."""
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": []},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_phase_26_plan_month_duplicate_category_id_422(
    db_setup, auth_headers
):
    """Duplicate category_id in same body → 422 (model_validator)."""
    cat_a = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            {"category_id": cat_a, "plan_cents": 1_000_00},
            {"category_id": cat_a, "plan_cents": 2_000_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_phase_26_plan_month_atomic_rollback_on_late_404(
    db_setup, auth_headers
):
    """T-26-01-04 atomicity: when one ID is missing, NO category mutates.

    Mix valid cat_a (would succeed in isolation) with a non-existent ID;
    response = 404, AND cat_a.plan_cents stays at seed value (10_000_00).
    """
    from app.db.models import Category
    from sqlalchemy import select

    cat_a = db_setup["cat_a_id"]
    # Σ = 30_000_00 + 1_000_00 = 31_000_00 ≪ income 100_000_00 — overflow
    # check passes; failure comes ONLY from the missing 888_888 id.
    response = await db_setup["client"].patch(
        "/api/v1/plan-month",
        json={"plans": [
            {"category_id": cat_a, "plan_cents": 30_000_00},
            {"category_id": 888_888, "plan_cents": 1_000_00},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 404, response.text

    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_a))
        ).scalar_one()
        assert row.plan_cents == 10_000_00  # rollback proves atomicity
