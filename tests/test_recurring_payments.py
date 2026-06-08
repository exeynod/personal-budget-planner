"""Recurring-payments (ADR-0007) backend tests.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- migration backfill: cycle='monthly' -> interval_months=1, 'yearly' -> 12
- interval_months advance over multiple cycles (incl. every-2-months)
- create materialises into the current active period
- close_period auto-skip of unposted recurring rows
- skip / postpone occurrence
- due-today / overdue listing
- cashflow projection basic shape
"""
import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def session_factory():
    _require_db()
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    await truncate_db()
    yield SessionLocal
    await engine.dispose()


async def _seed_user_cat(SessionLocal):
    from app.db.models import CategoryKind
    from tests.helpers.seed import seed_category, seed_user

    async with SessionLocal() as s:
        user = await seed_user(s, tg_user_id=900100100)
        cat = await seed_category(
            s, user_id=user.id, name="Регулярные", kind=CategoryKind.expense
        )
        await s.commit()
        return user.id, cat.id


# ───────────────────────── migration backfill ─────────────────────────


@pytest.mark.asyncio
async def test_migration_backfill_interval_months(session_factory):
    """cycle='monthly' -> 1, cycle='yearly' -> 12 (column already migrated)."""
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.models import SubCycle
    from tests.helpers.seed import seed_subscription

    async with SessionLocal() as s:
        m = await seed_subscription(
            s, user_id=user_id, name="Monthly", amount_cents=1000,
            cycle=SubCycle.monthly, next_charge_date=date(2026, 6, 10),
            category_id=cat_id,
        )
        y = await seed_subscription(
            s, user_id=user_id, name="Yearly", amount_cents=2000,
            cycle=SubCycle.yearly, next_charge_date=date(2026, 6, 10),
            category_id=cat_id,
        )
        # Emulate the 0036 backfill rule explicitly (seed defaults to 1).
        await s.execute(
            text("UPDATE subscription SET interval_months = 12 WHERE cycle = 'yearly'")
        )
        await s.commit()
        await s.refresh(m)
        await s.refresh(y)
        assert m.interval_months == 1
        assert y.interval_months == 12


# ───────────────────────── advance logic ─────────────────────────


@pytest.mark.asyncio
async def test_interval_advance_multiple_cycles(session_factory):
    """interval_months advance handles 1 / 2 / 12 month steps + day normalisation."""
    from app.services.subscriptions import _advance_date

    # every 2 months, anchored to the 2nd
    d = date(2026, 1, 2)
    d = _advance_date(d, interval_months=2, day_of_month=2)
    assert d == date(2026, 3, 2)
    d = _advance_date(d, interval_months=2, day_of_month=2)
    assert d == date(2026, 5, 2)
    # yearly
    assert _advance_date(date(2026, 5, 2), interval_months=12, day_of_month=2) == date(
        2027, 5, 2
    )
    # day clamp to 28 when day_of_month set
    assert _advance_date(date(2026, 1, 31), interval_months=1, day_of_month=31) == date(
        2026, 2, 28
    )


# ───────────────────────── create materialises into current period ─────────


@pytest.mark.asyncio
async def test_create_materialises_into_current_period(session_factory):
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.models import PlannedTransaction, PlanSource
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc
    from tests.helpers.seed import seed_budget_period

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        period = await seed_budget_period(
            s, user_id=user_id,
            period_start=date(2026, 6, 1), period_end=date(2026, 6, 30),
        )
        sub = await svc.create_subscription(
            s, user_id=user_id, name="Netflix", amount_cents=49900,
            interval_months=1, next_charge_date=date(2026, 6, 15),
            category_id=cat_id, day_of_month=15,
        )
        # mimic the route's mid-period materialisation
        await svc.add_subscription_to_period(s, sub, period.id, user_id=user_id)
        await s.commit()

        rows = (
            await s.execute(
                select(PlannedTransaction).where(
                    PlannedTransaction.subscription_id == sub.id
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].source == PlanSource.subscription_auto
        assert rows[0].planned_date == date(2026, 6, 15)
        # cursor advanced to next month
        await s.refresh(sub)
        assert sub.next_charge_date == date(2026, 7, 15)


# ───────────────────────── close-period auto-skip ─────────────────────────


@pytest.mark.asyncio
async def test_close_period_auto_skips_unposted_recurring(session_factory, monkeypatch):
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.models import (
        CategoryKind, PeriodStatus, PlannedTransaction, PlanSource,
    )
    from app.db.session import set_tenant_scope
    from tests.helpers.seed import seed_budget_period, seed_planned_transaction

    fake_today = date(2026, 7, 2)
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr(
        "app.worker.jobs.close_period._today_in_app_tz", lambda: fake_today
    )

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        # expired period (ended before today)
        expired = await seed_budget_period(
            s, user_id=user_id,
            period_start=date(2026, 6, 1), period_end=date(2026, 6, 30),
            status=PeriodStatus.active,
        )
        unposted = await seed_planned_transaction(
            s, user_id=user_id, period_id=expired.id, kind=CategoryKind.expense,
            amount_cents=49900, category_id=cat_id,
            source=PlanSource.subscription_auto, planned_date=date(2026, 6, 15),
        )
        unposted_id = unposted.id
        await s.commit()

    import app.worker.jobs.close_period as cp

    # Run the per-user close logic directly within a tenant-scoped session.
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        await cp._close_period_for_user(s, user_id=user_id)
        await s.commit()

    async with SessionLocal() as s:
        gone = await s.get(PlannedTransaction, unposted_id)
        assert gone is None, "unposted recurring row must be auto-skipped on close"


# ───────────────────────── skip / postpone occurrence ─────────────────────


@pytest.mark.asyncio
async def test_skip_and_postpone_occurrence(session_factory):
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.models import CategoryKind, PlannedTransaction, PlanSource
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc
    from tests.helpers.seed import seed_budget_period, seed_planned_transaction

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        period = await seed_budget_period(
            s, user_id=user_id,
            period_start=date(2026, 6, 1), period_end=date(2026, 6, 30),
        )
        occ = await seed_planned_transaction(
            s, user_id=user_id, period_id=period.id, kind=CategoryKind.expense,
            amount_cents=1000, category_id=cat_id,
            source=PlanSource.subscription_auto, planned_date=date(2026, 6, 10),
        )
        occ2 = await seed_planned_transaction(
            s, user_id=user_id, period_id=period.id, kind=CategoryKind.expense,
            amount_cents=1000, category_id=cat_id,
            source=PlanSource.subscription_auto, planned_date=date(2026, 6, 11),
        )
        occ_id, occ2_id = occ.id, occ2.id
        await s.commit()

    # postpone within period
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        row = await svc.postpone_recurring_occurrence(
            s, occ_id, user_id=user_id, new_date=date(2026, 6, 20)
        )
        assert row.planned_date == date(2026, 6, 20)
        # out of period → error
        with pytest.raises(svc.RecurringPostponeOutOfPeriodError):
            await svc.postpone_recurring_occurrence(
                s, occ_id, user_id=user_id, new_date=date(2026, 7, 5)
            )
        await s.commit()

    # skip deletes the row
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        await svc.skip_recurring_occurrence(s, occ2_id, user_id=user_id)
        await s.commit()
    async with SessionLocal() as s:
        assert await s.get(PlannedTransaction, occ2_id) is None


# ───────────────────────── due-today / overdue listing ─────────────────────


@pytest.mark.asyncio
async def test_list_due_recurring(session_factory, monkeypatch):
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.models import CategoryKind, PlanSource
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc
    from tests.helpers.seed import seed_budget_period, seed_planned_transaction

    today = date(2026, 6, 15)

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        period = await seed_budget_period(
            s, user_id=user_id,
            period_start=date(2026, 6, 1), period_end=date(2026, 6, 30),
        )
        # overdue
        await seed_planned_transaction(
            s, user_id=user_id, period_id=period.id, kind=CategoryKind.expense,
            amount_cents=1000, category_id=cat_id,
            source=PlanSource.subscription_auto, planned_date=date(2026, 6, 10),
        )
        # due today
        await seed_planned_transaction(
            s, user_id=user_id, period_id=period.id, kind=CategoryKind.expense,
            amount_cents=2000, category_id=cat_id,
            source=PlanSource.subscription_auto, planned_date=today,
        )
        # future — excluded
        await seed_planned_transaction(
            s, user_id=user_id, period_id=period.id, kind=CategoryKind.expense,
            amount_cents=3000, category_id=cat_id,
            source=PlanSource.subscription_auto, planned_date=date(2026, 6, 25),
        )
        await s.commit()

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        rows = await svc.list_due_recurring(s, user_id=user_id, today=today)
        assert len(rows) == 2
        assert [r.planned_date for r in rows] == [date(2026, 6, 10), today]


# ───────────────────────── cashflow projection ─────────────────────────


@pytest.mark.asyncio
async def test_cashflow_projection_shape(session_factory):
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        await svc.create_subscription(
            s, user_id=user_id, name="Rent", amount_cents=100000,
            interval_months=1, next_charge_date=date(2026, 6, 5),
            category_id=cat_id, day_of_month=5,
        )
        await s.commit()

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        proj = await svc.cashflow_projection(
            s, user_id=user_id, horizon_days=90, today=date(2026, 6, 1)
        )
        assert proj["horizon_days"] == 90
        assert proj["monthly_burden_cents"] == 100000  # interval=1
        # 90-day window from Jun 1 covers Jun/Jul/Aug charges on the 5th
        assert len(proj["timeline"]) == 3
        first = proj["timeline"][0]
        assert first["date"] == date(2026, 6, 5)
        assert first["amount_cents"] == 100000
        # running balance decreases for expenses (no primary account → start 0)
        assert proj["timeline"][-1]["balance_after_cents"] == -300000
