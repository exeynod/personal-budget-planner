"""Tests for BE-14 rollover service + close_period_job integration.

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Coverage (PLAN 22.10 §behavior):
- savings rollover creates deposit txn with correct amount/category/account
- misc rollover does NOT create txn but accumulates into next_period.misc_rollover_cents
- paused category skipped
- rollover idempotent via processed_at (double-call no-op)
- rollover idempotent via advisory lock contention
- remainder == 0 (or overspend) is no-op
- error paths: no primary account, no savings category
- savings rollover uses primary account.id for deposit txn
- close_period_job integration: full job → rollover_processed_at set + deposit txn created
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def db_setup(monkeypatch):
    """Set up a fresh DB + AppUser + patch worker AsyncSessionLocal.

    Note: we intentionally avoid the ``async_client`` fixture (which boots
    the FastAPI app) because plan 22.13 has not yet rewritten
    ``app.services.templates`` to drop the legacy ``PlanTemplateItem``
    import — booting the full app from this test module would trip that
    pre-existing import error. The rollover service does NOT depend on the
    HTTP layer, so we open the DB session directly.
    """
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.models import AppUser, UserRole

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    # Truncate domain tables. plan_template_item dropped in 22.05; use a custom
    # set that is correct for v1.0 schema.
    from sqlalchemy import text
    admin_url = os.environ.get("ADMIN_DATABASE_URL") or db_url
    admin_engine = create_async_engine(admin_url, echo=False)
    try:
        async with admin_engine.begin() as conn:
            await conn.execute(text(
                "TRUNCATE TABLE "
                "actual_transaction, planned_transaction, subscription, "
                "category_embedding, category, budget_period, "
                "savings_config, goal, account, "
                "ai_message, ai_conversation, app_user "
                "RESTART IDENTITY CASCADE"
            ))
    finally:
        await admin_engine.dispose()

    async with SessionLocal() as session:
        user = AppUser(
            tg_user_id=987654321,
            role=UserRole.owner,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        owner_user_id = user.id

    import app.db.session as db_session_module
    import app.worker.jobs.close_period as close_period_module
    monkeypatch.setattr(db_session_module, "AsyncSessionLocal", SessionLocal)
    monkeypatch.setattr(close_period_module, "AsyncSessionLocal", SessionLocal)

    yield None, SessionLocal, owner_user_id
    await engine.dispose()


def _patch_today(monkeypatch, fake_today: date):
    monkeypatch.setattr(
        "app.services.periods._today_in_app_tz", lambda: fake_today
    )
    monkeypatch.setattr(
        "app.worker.jobs.close_period._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )


async def _seed_savings_category(session, *, user_id: int):
    """Seed the system 'savings' category (paused, ord='99', expense)."""
    from app.db.models import CategoryKind, RolloverPolicy
    from tests.helpers.seed import seed_category
    cat = await seed_category(
        session,
        user_id=user_id,
        name="КОПИЛКА",
        kind=CategoryKind.expense,
        is_archived=False,
        sort_order=99,
        plan_cents=0,
        code="savings",
        ord="99",
        rollover=RolloverPolicy.savings,
        paused=True,
    )
    await session.refresh(cat)
    return cat


async def _seed_account(session, *, user_id: int, primary: bool = True):
    from app.db.models import Account, AccountKind
    acct = Account(
        user_id=user_id,
        bank="Т-Банк",
        kind=AccountKind.card,
        balance_cents=100_000_00,
        is_primary=primary,
    )
    session.add(acct)
    await session.flush()
    await session.refresh(acct)
    return acct


async def _seed_period(
    session, *, user_id: int,
    period_start: date = date(2026, 4, 5),
    period_end: date = date(2026, 5, 4),
    starting_balance_cents: int = 100_000_00,
):
    from app.db.models import BudgetPeriod, PeriodStatus
    p = BudgetPeriod(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        starting_balance_cents=starting_balance_cents,
        status=PeriodStatus.active,
    )
    session.add(p)
    await session.flush()
    await session.refresh(p)
    return p


async def _seed_category(
    session, *, user_id: int, name: str, code: str, ord: str,
    plan_cents: int = 0, rollover: str = "misc", paused: bool = False,
):
    from app.db.models import CategoryKind, RolloverPolicy
    from tests.helpers.seed import seed_category as _seed_category_helper
    cat = await _seed_category_helper(
        session,
        user_id=user_id,
        name=name,
        kind=CategoryKind.expense,
        is_archived=False,
        sort_order=int(ord),
        plan_cents=plan_cents,
        code=code,
        ord=ord,
        rollover=RolloverPolicy(rollover),
        paused=paused,
    )
    await session.refresh(cat)
    return cat


async def _seed_expense_txn(
    session, *, user_id: int, period_id: int, category_id: int,
    amount_cents: int, account_id: int, tx_date: date = date(2026, 4, 20),
):
    from app.db.models import ActualKind, ActualSource, ActualTransaction
    txn = ActualTransaction(
        user_id=user_id,
        period_id=period_id,
        kind=ActualKind.expense,
        amount_cents=amount_cents,
        description="test",
        category_id=category_id,
        tx_date=tx_date,
        source=ActualSource.mini_app,
        account_id=account_id,
    )
    session.add(txn)
    await session.flush()
    await session.refresh(txn)
    return txn


# ---------- pure rollover service tests ----------


@pytest.mark.asyncio
async def test_rollover_savings_creates_deposit_txn(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import ActualKind, ActualTransaction
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        savings_cat = await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        # spent 7000 ₽ (stored as positive — same as compute_balance convention)
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=7_000_00, account_id=acct.id,
        )
        await session.commit()

        result = await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
        )
        await session.commit()

    assert result is True

    async with SessionLocal() as session:
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert len(deposits) == 1
        d = deposits[0]
        assert d.amount_cents == -3_000_00  # remainder = 10000 - 7000 = 3000
        assert d.category_id == savings_cat.id
        assert d.account_id == acct.id
        assert d.description and "Еда" in d.description
        assert "копилку" in d.description.lower() or "копилк" in d.description.lower()


@pytest.mark.asyncio
async def test_rollover_misc_does_not_create_txn(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import ActualKind, ActualTransaction
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        cafe = await _seed_category(
            session, user_id=owner_user_id, name="Кафе", code="cafe", ord="02",
            plan_cents=5_000_00, rollover="misc",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=cafe.id, amount_cents=2_000_00, account_id=acct.id,
        )
        await session.commit()

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
        )
        await session.commit()

    async with SessionLocal() as session:
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert deposits == []


@pytest.mark.asyncio
async def test_rollover_misc_accumulates_into_next_period(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from app.db.models import BudgetPeriod
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        next_period = await _seed_period(
            session, user_id=owner_user_id,
            period_start=date(2026, 5, 5), period_end=date(2026, 6, 4),
            starting_balance_cents=0,
        )
        cafe = await _seed_category(
            session, user_id=owner_user_id, name="Кафе", code="cafe", ord="02",
            plan_cents=5_000_00, rollover="misc",
        )
        home = await _seed_category(
            session, user_id=owner_user_id, name="Дом", code="home", ord="03",
            plan_cents=8_000_00, rollover="misc",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=cafe.id, amount_cents=2_000_00, account_id=acct.id,
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=home.id, amount_cents=3_000_00, account_id=acct.id,
        )
        await session.commit()

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
            next_period_id=next_period.id,
        )
        await session.commit()
        next_period_id = next_period.id

    async with SessionLocal() as session:
        np = await session.get(BudgetPeriod, next_period_id)
        # cafe remainder=3000, home remainder=5000 → misc total 8000
        assert np.misc_rollover_cents == 8_000_00


@pytest.mark.asyncio
async def test_rollover_paused_category_skipped(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import ActualKind, ActualTransaction, BudgetPeriod
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        next_period = await _seed_period(
            session, user_id=owner_user_id,
            period_start=date(2026, 5, 5), period_end=date(2026, 6, 4),
        )
        # paused with savings rollover — should NOT create deposit
        await _seed_category(
            session, user_id=owner_user_id, name="Подарки", code="gifts", ord="04",
            plan_cents=10_000_00, rollover="savings", paused=True,
        )
        # paused with misc rollover — should NOT contribute to misc total
        await _seed_category(
            session, user_id=owner_user_id, name="Мусор", code="trash", ord="05",
            plan_cents=1_000_00, rollover="misc", paused=True,
        )
        await session.commit()

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
            next_period_id=next_period.id,
        )
        await session.commit()
        next_period_id = next_period.id

    async with SessionLocal() as session:
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert deposits == []
        np = await session.get(BudgetPeriod, next_period_id)
        assert np.misc_rollover_cents == 0


@pytest.mark.asyncio
async def test_rollover_idempotent_via_processed_at(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import ActualKind, ActualTransaction, BudgetPeriod
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=4_000_00, account_id=acct.id,
        )
        await session.commit()

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
        )
        await session.commit()
        period_id = period.id

    async with SessionLocal() as session:
        first = await session.get(BudgetPeriod, period_id)
        first_processed_at = first.rollover_processed_at
        assert first_processed_at is not None
        deposits_after_first = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert len(deposits_after_first) == 1

    # Second call — must be a no-op (no new txn, processed_at unchanged).
    async with SessionLocal() as session:
        result = await do_period_rollover(
            session, period_id=period_id, user_id=owner_user_id,
        )
        await session.commit()
        assert result is True

    async with SessionLocal() as session:
        second = await session.get(BudgetPeriod, period_id)
        assert second.rollover_processed_at == first_processed_at
        deposits_after_second = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert len(deposits_after_second) == 1  # unchanged


@pytest.mark.asyncio
async def test_rollover_idempotent_via_advisory_lock_contention(db_setup):
    """Hold the advisory lock from another connection — rollover bails out
    without setting rollover_processed_at."""
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from app.db.models import BudgetPeriod
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=2_000_00, account_id=acct.id,
        )
        await session.commit()
        period_id = period.id

    # Hold a session-level advisory lock keyed identically. Use a separate engine.
    lock_engine = create_async_engine(os.environ["DATABASE_URL"])
    async with lock_engine.connect() as lock_conn:
        # session-level lock survives across statements.
        await lock_conn.execute(
            text("SELECT pg_advisory_lock(hashtext(:k))"),
            {"k": f"close_period:{period_id}"},
        )
        await lock_conn.commit()

        # Run rollover in fresh tx — advisory_xact_lock must fail to acquire.
        async with SessionLocal() as session:
            result = await do_period_rollover(
                session, period_id=period_id, user_id=owner_user_id,
            )
            await session.commit()

        assert result is False  # lock contention

        async with SessionLocal() as session:
            p = await session.get(BudgetPeriod, period_id)
            assert p.rollover_processed_at is None  # not marked

        # release
        await lock_conn.execute(
            text("SELECT pg_advisory_unlock(hashtext(:k))"),
            {"k": f"close_period:{period_id}"},
        )
        await lock_conn.commit()

    await lock_engine.dispose()


@pytest.mark.asyncio
async def test_rollover_remainder_zero_no_op(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import ActualKind, ActualTransaction, BudgetPeriod
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        # spent exactly = plan → remainder = 0
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=10_000_00, account_id=acct.id,
        )
        await session.commit()

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
        )
        await session.commit()
        period_id = period.id

    async with SessionLocal() as session:
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert deposits == []
        p = await session.get(BudgetPeriod, period_id)
        # processed_at must STILL be set (idempotency: no-op is success)
        assert p.rollover_processed_at is not None


@pytest.mark.asyncio
async def test_rollover_overspend_remainder_zero(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import ActualKind, ActualTransaction
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=15_000_00, account_id=acct.id,
        )
        await session.commit()

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
        )
        await session.commit()

    async with SessionLocal() as session:
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert deposits == []


@pytest.mark.asyncio
async def test_rollover_no_primary_account_raises(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from app.services.rollover import RolloverConfigError, do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        # No account at all — savings rollover should raise.
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        # Need an expense — but with no account_id (legacy NULL allowed by 0016).
        from app.db.models import ActualKind, ActualSource, ActualTransaction
        session.add(ActualTransaction(
            user_id=owner_user_id, period_id=period.id,
            kind=ActualKind.expense, amount_cents=4_000_00,
            description="legacy", category_id=food.id,
            tx_date=date(2026, 4, 20), source=ActualSource.mini_app,
            account_id=None,
        ))
        await session.commit()
        period_id = period.id

    async with SessionLocal() as session:
        with pytest.raises(RolloverConfigError):
            await do_period_rollover(
                session, period_id=period_id, user_id=owner_user_id,
            )


@pytest.mark.asyncio
async def test_rollover_no_savings_category_raises(db_setup):
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from app.services.roundup import SavingsCategoryMissingError
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        # NO savings category seeded.
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=2_000_00, account_id=acct.id,
        )
        await session.commit()
        period_id = period.id

    async with SessionLocal() as session:
        with pytest.raises(SavingsCategoryMissingError):
            await do_period_rollover(
                session, period_id=period_id, user_id=owner_user_id,
            )


@pytest.mark.asyncio
async def test_rollover_savings_uses_primary_account(db_setup):
    """Even when there are multiple accounts, deposit txn must land on primary."""
    _require_db()
    _, SessionLocal, owner_user_id = db_setup

    from sqlalchemy import select
    from app.db.models import (
        Account, AccountKind, ActualKind, ActualTransaction,
    )
    from app.services.rollover import do_period_rollover

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        primary = await _seed_account(session, user_id=owner_user_id, primary=True)
        # second account, NON-primary
        secondary = Account(
            user_id=owner_user_id,
            bank="Сбер",
            kind=AccountKind.cash,
            balance_cents=0,
            is_primary=False,
        )
        session.add(secondary)
        await session.flush()

        period = await _seed_period(session, user_id=owner_user_id)
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        # Expense booked against secondary, but rollover deposit must hit primary.
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=3_000_00, account_id=secondary.id,
        )
        await session.commit()
        primary_id = primary.id

        await do_period_rollover(
            session, period_id=period.id, user_id=owner_user_id,
        )
        await session.commit()

    async with SessionLocal() as session:
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert len(deposits) == 1
        assert deposits[0].account_id == primary_id


# ---------- close_period_job integration ----------


@pytest.mark.asyncio
async def test_close_period_job_calls_rollover(db_setup, monkeypatch):
    """Full close_period_job flow: closes expired period, runs rollover,
    creates deposit, sets rollover_processed_at, creates next period."""
    _require_db()
    _, SessionLocal, owner_user_id = db_setup
    fake_today = date(2026, 5, 5)
    _patch_today(monkeypatch, fake_today)

    from sqlalchemy import select
    from app.db.models import (
        ActualKind, ActualTransaction, BudgetPeriod, PeriodStatus,
    )
    from app.worker.jobs.close_period import close_period_job

    async with SessionLocal() as session:
        await _seed_savings_category(session, user_id=owner_user_id)
        acct = await _seed_account(session, user_id=owner_user_id)
        period = await _seed_period(
            session, user_id=owner_user_id,
            period_start=date(2026, 4, 5),
            period_end=date(2026, 5, 4),
        )
        food = await _seed_category(
            session, user_id=owner_user_id, name="Еда", code="food", ord="01",
            plan_cents=10_000_00, rollover="savings",
        )
        await _seed_expense_txn(
            session, user_id=owner_user_id, period_id=period.id,
            category_id=food.id, amount_cents=6_000_00, account_id=acct.id,
        )
        await session.commit()
        old_period_id = period.id

    await close_period_job()

    async with SessionLocal() as session:
        old = await session.get(BudgetPeriod, old_period_id)
        assert old.status == PeriodStatus.closed
        assert old.rollover_processed_at is not None

        # New period should be created (PER-03)
        all_periods = (await session.execute(select(BudgetPeriod))).scalars().all()
        assert len(all_periods) == 2

        # Rollover deposit should exist (remainder = 4000 ₽)
        deposits = (await session.execute(
            select(ActualTransaction).where(
                ActualTransaction.user_id == owner_user_id,
                ActualTransaction.kind == ActualKind.deposit,
            )
        )).scalars().all()
        assert len(deposits) == 1
        assert deposits[0].amount_cents == -4_000_00
