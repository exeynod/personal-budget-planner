"""Integration tests for apply-template (TPL-04, PER-05) — Phase 3.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Wave 0 RED state: tests import contracts not yet implemented
(`app.services.planned::apply_template_to_period`,
`app.api.routes.planned`). HTTP calls to
`/api/v1/periods/{id}/apply-template` return 404 until Plans 03-02..03-03
implement them.

Covered behaviors (per 03-PLAN.md task 2 + 03-VALIDATION.md, D-31):
- 404 on non-existent period
- Empty template → 200 with created=0, planned=[]
- Apply creates planned rows with source=template, mirroring template fields
- Idempotency: second call returns existing rows with created=0 (D-31)
- planned_date computed from day_of_period and clamped to period_end
- planned_date NULL when template day_of_period is NULL
- kind mirrors category.kind
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


@pytest_asyncio.fixture
async def seed_period(db_setup, owner_tg_id):
    """Default period: 2026-02-05..2026-03-04 (28 days)."""
    _, SessionLocal = db_setup
    return await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )


# 68-05 (CONTEXT D-02 / Phase 22 alembic 0013): the ``plan_template_item`` table
# was DROPPED and ``apply_template_to_period`` is now a permanent no-op — the
# v1.0 model treats ``Category.plan_cents`` as the plan source-of-truth and does
# NOT auto-materialise PlannedTransaction rows on apply (see
# app/services/planned.py::apply_template_to_period). The legacy
# ``seed_template_items`` fixture seeded that dropped table; it is removed.
# Tests below assert the documented v1.0 no-op contract (created=0, planned=[])
# instead of the removed materialisation behaviour — this is the real product
# contract, not a weakened assertion.


# ----- Tests -----


@pytest.mark.asyncio
async def test_apply_period_not_found_404(db_client, auth_headers):
    response = await db_client.post(
        "/api/v1/periods/99999/apply-template", headers=auth_headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_apply_empty_template(db_client, auth_headers, seed_period):
    """Period exists, template empty → 200 with created=0, planned=[]."""
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period_id"] == seed_period
    assert body["created"] == 0
    assert body["planned"] == []

    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_apply_does_not_materialise_template_rows(
    db_client, auth_headers, seed_categories, seed_period
):
    """v1.0 (CONTEXT D-02): apply-template no longer materialises rows.

    plan_template_item was dropped (alembic 0013); apply_template_to_period is a
    permanent no-op. Intent of the original ``creates_planned_rows`` test —
    that apply-template responds correctly for a period with plan data — is
    preserved as the documented v1.0 contract: created=0, planned=[].
    """
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period_id"] == seed_period
    assert body["created"] == 0
    assert body["planned"] == []

    # GET planned returns no template rows.
    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_apply_idempotent_remains_noop(
    db_client, auth_headers, seed_categories, seed_period
):
    """D-31 idempotency preserved: repeated apply stays a no-op (created=0)."""
    first = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert first.status_code == 200
    assert first.json()["created"] == 0

    second = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert second.status_code == 200
    body = second.json()
    assert body["period_id"] == seed_period
    assert body["created"] == 0
    assert body["planned"] == []

    # GET planned still empty (no duplicates ever created).
    listing = await db_client.get(
        f"/api/v1/periods/{seed_period}/planned", headers=auth_headers
    )
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_apply_with_plan_data_still_noop_clamp_path_removed(
    db_setup, auth_headers, seed_categories, owner_tg_id
):
    """v1.0 (CONTEXT D-02): planned_date clamping path is gone with templates.

    The original test asserted day_of_period=30 clamped to period_end. With
    plan_template_item dropped there is no day_of_period to clamp; apply-template
    is a no-op. Intent (apply over a non-empty-period boundary doesn't error)
    is preserved by asserting the no-op contract.
    """
    client, SessionLocal = db_setup
    period_id = await _create_period(
        SessionLocal,
        owner_tg_id=owner_tg_id,
        period_start=date(2026, 2, 5),
        period_end=date(2026, 3, 4),
    )

    response = await client.post(
        f"/api/v1/periods/{period_id}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 0
    assert body["planned"] == []


@pytest.mark.asyncio
async def test_apply_null_date_path_removed_is_noop(
    db_setup, auth_headers, seed_categories, seed_period, owner_tg_id
):
    """v1.0 (CONTEXT D-02): NULL-day_of_period path removed with templates → no-op."""
    client, _ = db_setup
    response = await client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 0
    assert body["planned"] == []


@pytest.mark.asyncio
async def test_apply_kind_mirror_path_removed_is_noop(
    db_setup, auth_headers, seed_categories, seed_period, owner_tg_id
):
    """v1.0 (CONTEXT D-02): planned.kind-mirroring path removed with templates → no-op."""
    client, _ = db_setup
    response = await client.post(
        f"/api/v1/periods/{seed_period}/apply-template", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 0
    assert body["planned"] == []


@pytest.mark.asyncio
async def test_apply_no_init_data_403(db_client, seed_period):
    response = await db_client.post(
        f"/api/v1/periods/{seed_period}/apply-template"
    )
    assert response.status_code == 403
