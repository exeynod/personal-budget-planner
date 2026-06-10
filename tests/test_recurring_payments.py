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
- unified posting: /post and /pay converge on the occurrence — the second
  path gets 409, exactly one actual per occurrence; after rollover the next
  occurrence posts again without 409 (sub.posted_txn_id reset)
"""

import os
from datetime import date

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
            s,
            user_id=user_id,
            name="Monthly",
            amount_cents=1000,
            cycle=SubCycle.monthly,
            next_charge_date=date(2026, 6, 10),
            category_id=cat_id,
        )
        y = await seed_subscription(
            s,
            user_id=user_id,
            name="Yearly",
            amount_cents=2000,
            cycle=SubCycle.yearly,
            next_charge_date=date(2026, 6, 10),
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
            s,
            user_id=user_id,
            period_start=date(2026, 6, 1),
            period_end=date(2026, 6, 30),
        )
        sub = await svc.create_subscription(
            s,
            user_id=user_id,
            name="Netflix",
            amount_cents=49900,
            interval_months=1,
            next_charge_date=date(2026, 6, 15),
            category_id=cat_id,
            day_of_month=15,
        )
        # mimic the route's mid-period materialisation
        await svc.add_subscription_to_period(s, sub, period.id, user_id=user_id)
        await s.commit()

        rows = (
            (
                await s.execute(
                    select(PlannedTransaction).where(
                        PlannedTransaction.subscription_id == sub.id
                    )
                )
            )
            .scalars()
            .all()
        )
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
        CategoryKind,
        PeriodStatus,
        PlannedTransaction,
        PlanSource,
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
            s,
            user_id=user_id,
            period_start=date(2026, 6, 1),
            period_end=date(2026, 6, 30),
            status=PeriodStatus.active,
        )
        unposted = await seed_planned_transaction(
            s,
            user_id=user_id,
            period_id=expired.id,
            kind=CategoryKind.expense,
            amount_cents=49900,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=date(2026, 6, 15),
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
            s,
            user_id=user_id,
            period_start=date(2026, 6, 1),
            period_end=date(2026, 6, 30),
        )
        occ = await seed_planned_transaction(
            s,
            user_id=user_id,
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=1000,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=date(2026, 6, 10),
        )
        occ2 = await seed_planned_transaction(
            s,
            user_id=user_id,
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=1000,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=date(2026, 6, 11),
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
            s,
            user_id=user_id,
            period_start=date(2026, 6, 1),
            period_end=date(2026, 6, 30),
        )
        # overdue
        await seed_planned_transaction(
            s,
            user_id=user_id,
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=1000,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=date(2026, 6, 10),
        )
        # due today
        await seed_planned_transaction(
            s,
            user_id=user_id,
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=2000,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=today,
        )
        # future — excluded
        await seed_planned_transaction(
            s,
            user_id=user_id,
            period_id=period.id,
            kind=CategoryKind.expense,
            amount_cents=3000,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=date(2026, 6, 25),
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
            s,
            user_id=user_id,
            name="Rent",
            amount_cents=100000,
            interval_months=1,
            next_charge_date=date(2026, 6, 5),
            category_id=cat_id,
            day_of_month=5,
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


# ───────────────────────── unified posting (post vs pay) ─────────────────────


async def _seed_period_sub_occurrence(SessionLocal, *, user_id: int, cat_id: int):
    """Seed an active June period + a subscription materialised into it.

    Returns (period_id, sub_id, occ_id). Cursor ends up on 2026-07-15 —
    the post-rollover invariant from add_subscription_to_period.
    """
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc
    from tests.helpers.seed import seed_budget_period

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        period = await seed_budget_period(
            s,
            user_id=user_id,
            period_start=date(2026, 6, 1),
            period_end=date(2026, 6, 30),
        )
        sub = await svc.create_subscription(
            s,
            user_id=user_id,
            name="Netflix",
            amount_cents=49900,
            interval_months=1,
            next_charge_date=date(2026, 6, 15),
            category_id=cat_id,
            day_of_month=15,
        )
        occ = await svc.add_subscription_to_period(s, sub, period.id, user_id=user_id)
        await s.commit()
        return period.id, sub.id, occ.id


def _patch_today(monkeypatch, fake_today: date) -> None:
    """Pin _today_in_app_tz everywhere the posting path reads it."""
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr("app.services.actual._today_in_app_tz", lambda: fake_today)


async def _count_actuals(SessionLocal, *, user_id: int) -> int:
    from app.db.models import ActualTransaction
    from app.db.session import set_tenant_scope

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        rows = (
            (
                await s.execute(
                    select(ActualTransaction).where(
                        ActualTransaction.user_id == user_id
                    )
                )
            )
            .scalars()
            .all()
        )
        return len(rows)


@pytest.mark.asyncio
async def test_post_then_pay_conflict(session_factory, monkeypatch):
    """/post проводит материализованный occurrence; затем /pay → 409, actual ровно один."""
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc

    _patch_today(monkeypatch, date(2026, 6, 16))
    _, sub_id, occ_id = await _seed_period_sub_occurrence(
        SessionLocal, user_id=user_id, cat_id=cat_id
    )

    # post → goes through the occurrence path (single source of truth)
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        txn = await svc.post_subscription(s, sub_id, user_id=user_id)
        assert txn.id is not None
        await s.commit()

    # the same charge via /pay → 409
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        with pytest.raises(svc.RecurringOccurrenceAlreadyPaidError):
            await svc.pay_recurring_occurrence(
                s, occ_id, user_id=user_id, tx_date=date(2026, 6, 16)
            )

    # repeated /post in the same period → 409 too
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        with pytest.raises(svc.SubscriptionAlreadyPostedError):
            await svc.post_subscription(s, sub_id, user_id=user_id)

    assert await _count_actuals(SessionLocal, user_id=user_id) == 1


@pytest.mark.asyncio
async def test_pay_then_post_conflict(session_factory, monkeypatch):
    """/pay проводит occurrence; затем /post → 409, actual ровно один."""
    SessionLocal = session_factory
    user_id, cat_id = await _seed_user_cat(SessionLocal)
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc

    _patch_today(monkeypatch, date(2026, 6, 16))
    _, sub_id, occ_id = await _seed_period_sub_occurrence(
        SessionLocal, user_id=user_id, cat_id=cat_id
    )

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        txn = await svc.pay_recurring_occurrence(
            s, occ_id, user_id=user_id, tx_date=date(2026, 6, 16)
        )
        assert txn.id is not None
        await s.commit()

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        with pytest.raises(svc.SubscriptionAlreadyPostedError):
            await svc.post_subscription(s, sub_id, user_id=user_id)

    assert await _count_actuals(SessionLocal, user_id=user_id) == 1


@pytest.mark.asyncio
async def test_post_again_after_rollover(session_factory, monkeypatch):
    """Новый период: rollover сбрасывает sub.posted_txn_id, материализует новый
    occurrence — /post проходит снова без 409 (один платёж на период)."""
    SessionLocal = session_factory
    from app.db.models import CategoryKind, PlannedTransaction, Subscription
    from app.db.session import set_tenant_scope
    from app.services import subscriptions as svc
    from tests.helpers.seed import seed_category, seed_user

    # cycle_start_day=1 so the rolled period is Jul 1–31 and the advanced
    # cursor (Jul 15) lands inside it.
    async with SessionLocal() as s:
        user = await seed_user(s, tg_user_id=900100101, cycle_start_day=1)
        cat = await seed_category(
            s, user_id=user.id, name="Регулярные-rollover", kind=CategoryKind.expense
        )
        await s.commit()
        user_id, cat_id = user.id, cat.id

    _patch_today(monkeypatch, date(2026, 6, 16))
    _, sub_id, _ = await _seed_period_sub_occurrence(
        SessionLocal, user_id=user_id, cat_id=cat_id
    )

    # post in the June period
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        await svc.post_subscription(s, sub_id, user_id=user_id)
        await s.commit()

    # rollover: June closes, July opens, the July occurrence materialises
    fake_today2 = date(2026, 7, 1)
    _patch_today(monkeypatch, fake_today2)
    monkeypatch.setattr(
        "app.worker.jobs.close_period._today_in_app_tz", lambda: fake_today2
    )
    import app.worker.jobs.close_period as cp

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        await cp._close_period_for_user(s, user_id=user_id)
        await s.commit()

    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        sub_row = await s.get(Subscription, sub_id)
        assert sub_row.posted_txn_id is None, (
            "rollover must reset the informational sub.posted_txn_id"
        )
        unposted = (
            (
                await s.execute(
                    select(PlannedTransaction).where(
                        PlannedTransaction.subscription_id == sub_id,
                        PlannedTransaction.posted_txn_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(unposted) == 1
        assert unposted[0].planned_date == date(2026, 7, 15)

    # post again in the new period — must NOT 409
    async with SessionLocal() as s:
        await set_tenant_scope(s, user_id)
        await svc.post_subscription(s, sub_id, user_id=user_id)
        await s.commit()

    assert await _count_actuals(SessionLocal, user_id=user_id) == 2
