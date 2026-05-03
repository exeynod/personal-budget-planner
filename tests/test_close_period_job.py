"""Tests for close_period_job worker (PER-04 / PER-03).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- noop when no active period exists (empty DB)
- noop when active period has not yet expired (period_end >= today)
- closes expired active period with correct ending_balance_cents
- balance computation includes income and expense transactions
- creates next period with starting_balance = ending_balance (PER-03)
- idempotent: second run in same day is a no-op
- advisory lock prevents concurrent execution
- error during close rolls back the entire transaction
"""
import os
from datetime import date, timedelta

import pytest
import pytest_asyncio

# RED-state import — will raise ImportError until Task 2 creates this module.
from app.worker.jobs.close_period import ADVISORY_LOCK_KEY, close_period_job


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def db_setup(async_client):
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
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


def _patch_today(monkeypatch, fake_today: date):
    """Patch _today_in_app_tz in both service and worker module."""
    monkeypatch.setattr(
        "app.services.periods._today_in_app_tz",
        lambda: fake_today,
    )
    monkeypatch.setattr(
        "app.worker.jobs.close_period._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )


@pytest.mark.asyncio
async def test_close_period_noop_when_no_active_period(db_setup, monkeypatch):
    """Empty DB: close_period_job runs without error, DB stays empty."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    # Should complete without raising
    await close_period_job()

    from sqlalchemy import select
    from app.db.models import BudgetPeriod
    async with SessionLocal() as session:
        count = len((await session.execute(select(BudgetPeriod))).scalars().all())
    assert count == 0


@pytest.mark.asyncio
async def test_close_period_noop_when_active_not_expired(db_setup, monkeypatch):
    """Active period with period_end >= today: job is a no-op."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from app.db.models import BudgetPeriod, PeriodStatus
    async with SessionLocal() as session:
        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 10),  # still active — not expired
            starting_balance_cents=100_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.commit()
        period_id = p.id

    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        periods = (await session.execute(select(BudgetPeriod))).scalars().all()
        assert len(periods) == 1
        assert periods[0].status == PeriodStatus.active
        assert periods[0].id == period_id


@pytest.mark.asyncio
async def test_close_period_closes_expired_period(db_setup, monkeypatch):
    """Expired active period (period_end < today): job closes it with correct balance."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from app.db.models import BudgetPeriod, PeriodStatus
    async with SessionLocal() as session:
        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),  # yesterday — expired
            starting_balance_cents=100_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.commit()
        period_id = p.id

    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        closed = await session.get(BudgetPeriod, period_id)
        assert closed.status == PeriodStatus.closed
        assert closed.ending_balance_cents == 100_000  # no transactions
        assert closed.closed_at is not None


@pytest.mark.asyncio
async def test_close_period_balance_with_transactions(db_setup, monkeypatch):
    """ending_balance = starting + income - expense."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from app.db.models import (
        ActualSource, ActualTransaction, BudgetPeriod,
        Category, CategoryKind, PeriodStatus,
    )
    async with SessionLocal() as session:
        exp_cat = Category(name="Еда", kind=CategoryKind.expense, is_archived=False, sort_order=1)
        inc_cat = Category(name="Зарплата", kind=CategoryKind.income, is_archived=False, sort_order=2)
        session.add_all([exp_cat, inc_cat])
        await session.flush()

        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=100_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.flush()

        # income +50000, expense +30000 => balance = 100000 + 50000 - 30000 = 120000
        session.add(ActualTransaction(
            period_id=p.id, kind=CategoryKind.income,
            amount_cents=50_000, category_id=inc_cat.id,
            tx_date=date(2026, 4, 20), source=ActualSource.mini_app,
        ))
        session.add(ActualTransaction(
            period_id=p.id, kind=CategoryKind.expense,
            amount_cents=30_000, category_id=exp_cat.id,
            tx_date=date(2026, 4, 22), source=ActualSource.mini_app,
        ))
        await session.commit()
        period_id = p.id

    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        closed = await session.get(BudgetPeriod, period_id)
        assert closed.status == PeriodStatus.closed
        assert closed.ending_balance_cents == 120_000


@pytest.mark.asyncio
async def test_close_period_creates_next_period_with_inherited_balance(db_setup, monkeypatch):
    """After closing expired period, a new active period is created with starting_balance_cents == ending_balance (PER-03)."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from app.db.models import BudgetPeriod, PeriodStatus
    async with SessionLocal() as session:
        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=120_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.commit()
        old_period_id = p.id

    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        periods = (await session.execute(select(BudgetPeriod))).scalars().all()
        # Should now be 2 periods: closed old + new active
        assert len(periods) == 2

        active_periods = [p for p in periods if p.status == PeriodStatus.active]
        assert len(active_periods) == 1
        new_period = active_periods[0]
        # PER-03: starting_balance of new = ending_balance of old (120000, no txns)
        assert new_period.starting_balance_cents == 120_000


@pytest.mark.asyncio
async def test_close_period_idempotent_second_run(db_setup, monkeypatch):
    """Running close_period_job twice is safe: second run is a no-op."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from app.db.models import BudgetPeriod, PeriodStatus
    async with SessionLocal() as session:
        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=50_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.commit()

    # First run: closes expired + creates new period
    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        periods_after_first = (await session.execute(select(BudgetPeriod))).scalars().all()
        count_after_first = len(periods_after_first)

    # Second run: should be a no-op (new active period is not expired)
    await close_period_job()

    async with SessionLocal() as session:
        periods_after_second = (await session.execute(select(BudgetPeriod))).scalars().all()
        assert len(periods_after_second) == count_after_first  # no new period created


@pytest.mark.asyncio
async def test_close_period_advisory_lock_prevents_concurrent(db_setup, monkeypatch):
    """If advisory lock is already held, job exits without modifying DB."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from app.db.models import BudgetPeriod, PeriodStatus

    async with SessionLocal() as session:
        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=77_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.commit()
        period_id = p.id

    # Hold the advisory lock from a separate connection
    lock_engine = create_async_engine(os.environ["DATABASE_URL"])
    async with lock_engine.connect() as lock_conn:
        await lock_conn.execute(text(f"SELECT pg_advisory_lock({ADVISORY_LOCK_KEY})"))

        # Job should bail because lock is already held
        await close_period_job()

        from sqlalchemy import select
        async with SessionLocal() as session:
            period = await session.get(BudgetPeriod, period_id)
            # Should still be active — job did nothing
            assert period.status == PeriodStatus.active

        await lock_conn.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_KEY})"))

    await lock_engine.dispose()

    # After releasing lock, job should work correctly
    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        period = await session.get(BudgetPeriod, period_id)
        assert period.status == PeriodStatus.closed


@pytest.mark.asyncio
async def test_close_period_rollback_on_error(db_setup, monkeypatch):
    """If an error occurs mid-job, the transaction is rolled back entirely."""
    _require_db()
    _, SessionLocal = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from app.db.models import BudgetPeriod, PeriodStatus
    async with SessionLocal() as session:
        p = BudgetPeriod(
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
            starting_balance_cents=88_000,
            status=PeriodStatus.active,
        )
        session.add(p)
        await session.commit()
        period_id = p.id

    # Patch period_for to raise an error, simulating failure mid-job
    monkeypatch.setattr(
        "app.worker.jobs.close_period.period_for",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("simulated failure")),
    )

    # Job should absorb the exception (not re-raise)
    await close_period_job()

    from sqlalchemy import select
    async with SessionLocal() as session:
        period = await session.get(BudgetPeriod, period_id)
        # Must still be active — rollback preserved original state
        assert period.status == PeriodStatus.active
        assert period.ending_balance_cents is None
