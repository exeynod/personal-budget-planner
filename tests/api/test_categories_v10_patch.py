"""Phase 26 BE Plan 26-01 — integration tests for extended PATCH /api/v1/categories/{id}.

Validates that ``CategoryUpdate`` accepts the v1.0 fields (``plan_cents``,
``rollover``, ``paused``, ``parent_id``) per CAT-V10-04 / PLAN-V10-05. Existing
service-layer (``update_category`` via ``model_dump(exclude_unset=True)``) already
applies the fields once the schema admits them; these tests assert the wire
contract.

Test names use ``test_phase_26_*`` prefix so they can be filtered with
``pytest -k phase_26``.

DB-backed: requires DATABASE_URL pointing to a test Postgres (the docker
``test`` profile). Self-skips if DATABASE_URL is unset.
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
    """Seed an onboarded AppUser + 2 categories with v1.0 columns set.

    Returns the SessionLocal so tests can refetch ORM rows post-PATCH to
    confirm DB-side persistence (not just response shape).
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
        user = AppUser(
            tg_user_id=owner_tg_id,
            role=UserRole.owner,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
            income_cents=200_000_00,
        )
        session.add(user)
        await session.flush()

        from tests.helpers.seed import seed_category
        cat_a = await seed_category(
            session,
            user_id=user.id,
            name="Продукты",
            kind=CategoryKind.expense,
            sort_order=10,
            plan_cents=30_000_00,
            code="food",
            ord="01",
            rollover=RolloverPolicy.misc,
            paused=False,
        )
        cat_b = await seed_category(
            session,
            user_id=user.id,
            name="Транспорт",
            kind=CategoryKind.expense,
            sort_order=20,
            plan_cents=10_000_00,
            code="transport",
            ord="02",
            rollover=RolloverPolicy.misc,
            paused=False,
        )
        await session.commit()
        await session.refresh(cat_a)
        await session.refresh(cat_b)
        cat_a_id, cat_b_id, user_id = cat_a.id, cat_b.id, user.id

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
        "user_id": user_id,
        "cat_a_id": cat_a_id,
        "cat_b_id": cat_b_id,
    }
    await engine.dispose()


# ----------------------------------------------------------------------
# Happy-path PATCHes — each new optional field independently.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_patch_plan_cents_persists(db_setup, auth_headers):
    """T-BE-01 (plan_cents): PATCH body {plan_cents: 50_000_00} → 200 + DB row updated."""
    from app.db.models import Category
    from sqlalchemy import select

    cat_id = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{cat_id}",
        json={"plan_cents": 50_000_00},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["plan_cents"] == 50_000_00

    # DB-side confirmation
    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_id))
        ).scalar_one()
        assert row.plan_cents == 50_000_00


@pytest.mark.asyncio
async def test_phase_26_patch_rollover_persists(db_setup, auth_headers):
    """T-BE-01 (rollover): PATCH body {rollover: 'savings'} → 200 + persisted."""
    from app.db.models import Category, RolloverPolicy
    from sqlalchemy import select

    cat_id = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{cat_id}",
        json={"rollover": "savings"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["rollover"] == "savings"

    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_id))
        ).scalar_one()
        assert row.rollover == RolloverPolicy.savings


@pytest.mark.asyncio
async def test_phase_26_patch_paused_persists(db_setup, auth_headers):
    """T-BE-01 (paused): PATCH body {paused: true} → 200 + persisted."""
    from app.db.models import Category
    from sqlalchemy import select

    cat_id = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{cat_id}",
        json={"paused": True},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["paused"] is True

    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_id))
        ).scalar_one()
        assert row.paused is True


# ----------------------------------------------------------------------
# Validation rejects.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_patch_negative_plan_cents_422(db_setup, auth_headers):
    """T-BE-03 negative plan_cents → 422 (Pydantic ge=0 enforces)."""
    cat_id = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{cat_id}",
        json={"plan_cents": -1},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_phase_26_patch_invalid_rollover_422(db_setup, auth_headers):
    """T-26-01-06 SQL_INJECT-style invalid rollover → 422 (Literal enforces)."""
    cat_id = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{cat_id}",
        json={"rollover": "invalid"},
        headers=auth_headers,
    )
    assert response.status_code == 422, response.text


# ----------------------------------------------------------------------
# Combined PATCH (all four v1.0 fields + name) — single round-trip atomic.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_patch_combined_fields_apply_atomically(db_setup, auth_headers):
    """T-BE-01: PATCH с {plan_cents, rollover, paused, name} → all 4 applied."""
    from app.db.models import Category, RolloverPolicy
    from sqlalchemy import select

    cat_id = db_setup["cat_a_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{cat_id}",
        json={
            "plan_cents": 100_00,
            "rollover": "misc",
            "paused": False,
            "name": "Продукты-renamed",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["plan_cents"] == 100_00
    assert body["rollover"] == "misc"
    assert body["paused"] is False
    assert body["name"] == "Продукты-renamed"

    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == cat_id))
        ).scalar_one()
        assert row.plan_cents == 100_00
        assert row.rollover == RolloverPolicy.misc
        assert row.paused is False
        assert row.name == "Продукты-renamed"


# ----------------------------------------------------------------------
# parent_id — composite FK validation deferred to DB layer.
# Phase 26 schema accepts the value; full FK validation arrives in Phase 27.
# ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_phase_26_patch_parent_id_accepts_valid_sibling(db_setup, auth_headers):
    """parent_id pointing at sibling category in same tenant → 200 + persisted.

    Composite FK (parent_id, user_id) → (id, user_id) is satisfied because cat_b
    belongs to the same user as cat_a.
    """
    from app.db.models import Category
    from sqlalchemy import select

    child_id = db_setup["cat_a_id"]
    parent_id = db_setup["cat_b_id"]
    response = await db_setup["client"].patch(
        f"/api/v1/categories/{child_id}",
        json={"parent_id": parent_id},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["parent_id"] == parent_id

    async with db_setup["SessionLocal"]() as s:
        row = (
            await s.execute(select(Category).where(Category.id == child_id))
        ).scalar_one()
        assert row.parent_id == parent_id
