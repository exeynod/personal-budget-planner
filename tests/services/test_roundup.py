"""Unit + integration tests for app/services/roundup.py (Phase 22, Plan 22.07).

Covers BE-07 (auto-roundup hook) end-to-end:

  Pure-function tests (compute_roundup_delta, should_skip):
    - DATA-MODEL §4 formula: delta = ((|amount| + base − 1) // base) * base − |amount|
    - Skip rules (CONTEXT §Area 3): delta == 0 OR delta == base
    - Negative amount uses absolute value
    - Zero amount returns 0

  DB-touching tests (maybe_create_roundup_child):
    - SavingsConfig absent / disabled → return None
    - parent.kind != 'expense' (income / deposit / roundup) → return None (no recursion)
    - parent.kind = 'expense' + config enabled → child kind=roundup created
    - child.amount_cents == -delta, parent_txn_id, account_id, category_id wired correctly
    - SavingsCategoryMissingError raised if no system 'savings' Category for user
    - apply_balance_delta(account_id, delta=-delta) called

  End-to-end via wired create_actual_v10:
    - expense with roundup → returns (parent, child)
    - income → returns (parent, None)
    - delete parent cascades child via FK ON DELETE CASCADE
    - delete_actual_v10 restores balance for parent + cascading child

DB-backed: requires DATABASE_URL pointing to a Postgres at v1.0 schema HEAD
(0016_v10_actual_account_id, after Wave 2 fix-up migration). Self-skips otherwise.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# =============================================================================
# Section 1: Pure-function tests — no DB required (run anywhere).
# =============================================================================


def test_delta_100_base_10_returns_0_skip():
    """amount=100, base=10 → already aligned → delta=0."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(100, 10) == 0


def test_delta_101_base_10_returns_9():
    """amount=101, base=10 → next 110, delta=9 (DATA-MODEL §4 worked example)."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(101, 10) == 9


def test_delta_99_base_10_returns_1():
    """amount=99, base=10 → next 100, delta=1."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(99, 10) == 1


def test_delta_55_base_50_returns_45():
    """amount=55, base=50 → next 100, delta=45."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(55, 50) == 45


def test_delta_50_base_50_returns_0_skip():
    """amount=50, base=50 → already aligned → delta=0."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(50, 50) == 0


def test_delta_negative_amount_uses_abs():
    """Sign-agnostic: |-101| = 101, base=10 → delta=9."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(-101, 10) == 9


def test_delta_zero_amount_returns_0():
    """amount=0 → no roundup needed."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(0, 10) == 0


def test_should_skip_helper_returns_true_for_delta_0():
    """should_skip(0, base) → True (CONTEXT §Area 3)."""
    from app.services.roundup import should_skip

    assert should_skip(0, 10) is True


def test_should_skip_helper_returns_true_for_delta_eq_base():
    """should_skip(base, base) → True — defensive against math edge case."""
    from app.services.roundup import should_skip

    assert should_skip(10, 10) is True


def test_should_skip_helper_returns_false_for_normal_delta():
    """should_skip(7, 10) → False — typical roundup case."""
    from app.services.roundup import should_skip

    assert should_skip(7, 10) is False


def test_delta_base_100_spec_example():
    """DATA-MODEL §4: 1234 / 100 → next 1300, delta = 66."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(1234, 100) == 66


def test_delta_base_50_spec_example():
    """DATA-MODEL §4: 1234 / 50 → next 1250, delta = 16."""
    from app.services.roundup import compute_roundup_delta

    assert compute_roundup_delta(1234, 50) == 16


# =============================================================================
# Section 2: Test fixtures for DB-backed tests.
# =============================================================================


async def _truncate_v1_tables(session):
    """Truncate v1.0 domain tables in FK-safe order. Bypasses RLS (admin role)."""
    from sqlalchemy import text

    await session.execute(text("RESET ROLE"))
    await session.execute(text("SET LOCAL row_security = off"))
    for tbl in (
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        "subscription",
        "savings_config",
        "goal",
        "account",
        "budget_period",
        "category",
        "auth_token",
        "ai_usage_log",
        "app_user",
    ):
        await session.execute(text(f"DELETE FROM {tbl}"))
    await session.commit()


async def _seed_user(session, *, tg_user_id: int):
    from app.db.models import AppUser, UserRole

    user = AppUser(
        tg_user_id=tg_user_id,
        role=UserRole.owner,
        cycle_start_day=5,
        onboarded_at=datetime.now(timezone.utc),
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user


@pytest_asyncio.fixture
async def owner_user(db_session):
    """Truncate, seed a single owner AppUser, return its PK id."""
    _require_db()
    await _truncate_v1_tables(db_session)
    user = await _seed_user(db_session, tg_user_id=9_000_007_001)
    yield {"id": user.id, "tg_user_id": user.tg_user_id}


@pytest_asyncio.fixture
async def seeded_savings_category(db_session, owner_user):
    """Seed a system Category with code='savings' for the owner user.

    Per CONTEXT §Area 2 + plan 22.11, onboarding seeds this row at first
    completion. For service-layer roundup tests we create it directly so
    we can exercise maybe_create_roundup_child without the onboarding path.
    """
    from app.db.models import CategoryKind, RolloverPolicy
    from tests.helpers.seed import seed_category

    cat = await seed_category(
        db_session,
        user_id=owner_user["id"],
        name="КОПИЛКА",
        kind=CategoryKind.expense,
        sort_order=99,
        code="savings",
        ord="99",
        plan_cents=0,
        rollover=RolloverPolicy.savings,
        paused=True,
    )
    await db_session.flush()
    yield cat


@pytest_asyncio.fixture
async def regular_category(db_session, owner_user):
    """A regular expense Category for parent transactions (e.g. Еда)."""
    from app.db.models import CategoryKind
    from tests.helpers.seed import seed_category

    cat = await seed_category(
        db_session,
        user_id=owner_user["id"],
        name="ПРОДУКТЫ",
        kind=CategoryKind.expense,
        sort_order=1,
        code="food",
        ord="01",
        plan_cents=2000000,
    )
    await db_session.flush()
    yield cat


@pytest_asyncio.fixture
async def primary_account(db_session, owner_user):
    """A primary Card account with starting balance 100000 ₽ (10_000_000 копеек)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as acct_svc

    await set_tenant_scope(db_session, owner_user["id"])
    acct = await acct_svc.create_account(
        db_session,
        user_id=owner_user["id"],
        bank="Т-Банк",
        kind=AccountKind.card,
        balance_cents=10_000_000,
    )
    yield acct


@pytest_asyncio.fixture
async def savings_config_enabled_base_10(db_session, owner_user):
    """SavingsConfig with roundup_enabled=True, base=10 (kopecks)."""
    from app.db.models import SavingsConfig

    cfg = SavingsConfig(
        user_id=owner_user["id"],
        roundup_enabled=True,
        roundup_base=10,
    )
    db_session.add(cfg)
    await db_session.flush()
    yield cfg


@pytest_asyncio.fixture
async def savings_config_disabled(db_session, owner_user):
    """SavingsConfig with roundup_enabled=False."""
    from app.db.models import SavingsConfig

    cfg = SavingsConfig(
        user_id=owner_user["id"],
        roundup_enabled=False,
        roundup_base=10,
    )
    db_session.add(cfg)
    await db_session.flush()
    yield cfg


# =============================================================================
# Section 3: maybe_create_roundup_child — gate / skip / kind tests.
# =============================================================================


@pytest.mark.asyncio
async def test_no_savings_config_returns_None(
    db_session, owner_user, regular_category, primary_account
):
    """SavingsConfig absent → maybe_create_roundup_child returns None."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child

    await set_tenant_scope(db_session, owner_user["id"])

    # Need a budget_period for the parent FK.
    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.expense,
        amount_cents=-101,
        description="test",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    child = await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )
    assert child is None


@pytest.mark.asyncio
async def test_savings_config_disabled_returns_None(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_disabled,
    seeded_savings_category,
):
    """roundup_enabled=False → no child even with savings cat seeded."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.expense,
        amount_cents=-101,
        description="test",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    child = await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )
    assert child is None


@pytest.mark.asyncio
async def test_kind_income_returns_None(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """parent.kind=income → no child even with config enabled (kind gate)."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.income,
        amount_cents=10101,
        description="salary",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    child = await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )
    assert child is None


@pytest.mark.asyncio
async def test_kind_deposit_returns_None(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """parent.kind=deposit → no child (no recursion on manual savings deposit)."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.deposit,
        amount_cents=-501,
        description="manual savings",
        category_id=seeded_savings_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    child = await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )
    assert child is None


@pytest.mark.asyncio
async def test_kind_roundup_returns_None(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """parent.kind=roundup → no child (no infinite cascade)."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.roundup,
        amount_cents=-9,
        description="prior roundup",
        category_id=seeded_savings_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    child = await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )
    assert child is None


@pytest.mark.asyncio
async def test_expense_with_config_creates_child(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """parent.kind=expense + roundup_enabled + delta>0 → child created with right amount."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.expense,
        amount_cents=-101,
        description="lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    child = await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )
    assert child is not None
    assert child.kind == ActualKind.roundup
    assert child.amount_cents == -9  # |-101| → next 110, delta=9
    assert child.parent_txn_id == parent.id
    assert child.account_id == parent.account_id == primary_account.id
    assert child.category_id == seeded_savings_category.id


@pytest.mark.asyncio
async def test_savings_category_missing_raises(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
):
    """No system 'savings' Category for user → SavingsCategoryMissingError."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import (
        SavingsCategoryMissingError,
        maybe_create_roundup_child,
    )

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.expense,
        amount_cents=-101,
        description="lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    with pytest.raises(SavingsCategoryMissingError):
        await maybe_create_roundup_child(
            db_session, user_id=owner_user["id"], parent_txn=parent
        )


@pytest.mark.asyncio
async def test_account_balance_reduced_by_delta(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """maybe_create_roundup_child applies -delta to parent.account_id balance."""
    from app.db.models import (
        Account,
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.roundup import maybe_create_roundup_child
    from sqlalchemy import select

    await set_tenant_scope(db_session, owner_user["id"])

    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    starting_balance = primary_account.balance_cents

    parent = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.expense,
        amount_cents=-101,
        description="lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(parent)
    await db_session.flush()

    await maybe_create_roundup_child(
        db_session, user_id=owner_user["id"], parent_txn=parent
    )

    # 68-05 (class D): the roundup child applies the balance delta via a raw
    # UPDATE...RETURNING (not through the ORM), so the cached identity-map
    # Account still holds the stale pre-update balance. populate_existing forces
    # the ORM to overwrite the cached attributes from the fresh DB row (async-safe;
    # expire_all() would trigger a lazy IO load outside the greenlet → MissingGreenlet).
    refreshed = await db_session.scalar(
        select(Account)
        .where(Account.id == primary_account.id)
        .execution_options(populate_existing=True)
    )
    # Roundup child applies -9 (delta) to balance. Parent's own delta is
    # NOT applied here — that's the caller's responsibility (create_actual_v10).
    assert refreshed.balance_cents == starting_balance - 9


# =============================================================================
# Section 4: End-to-end via create_actual_v10 / delete_actual_v10.
# =============================================================================


@pytest.mark.asyncio
async def test_create_actual_v10_expense_with_roundup_creates_child(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """create_actual_v10(expense, -101) → returns (parent, child); balance reduced by 110."""
    from app.db.models import Account, ActualKind, ActualSource
    from app.db.session import set_tenant_scope
    from app.services.actual import create_actual_v10
    from sqlalchemy import select

    await set_tenant_scope(db_session, owner_user["id"])

    starting_balance = primary_account.balance_cents

    parent, child = await create_actual_v10(
        db_session,
        user_id=owner_user["id"],
        kind="expense",
        amount_cents=-101,
        description="lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )

    assert parent is not None
    assert parent.kind == ActualKind.expense
    assert parent.amount_cents == -101
    assert parent.account_id == primary_account.id

    assert child is not None
    assert child.kind == ActualKind.roundup
    assert child.amount_cents == -9
    assert child.parent_txn_id == parent.id
    assert child.account_id == primary_account.id
    assert child.category_id == seeded_savings_category.id

    # 68-05 (class D): balance applied via raw UPDATE — populate_existing forces
    # the ORM to refresh the cached row (async-safe; see note above).
    refreshed = await db_session.scalar(
        select(Account)
        .where(Account.id == primary_account.id)
        .execution_options(populate_existing=True)
    )
    # Parent (-101) + child (-9) → balance reduced by 110.
    assert refreshed.balance_cents == starting_balance - 110


@pytest.mark.asyncio
async def test_create_actual_v10_income_does_not_create_child(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """create_actual_v10(income, +X) → returns (parent, None); no roundup."""
    from app.db.models import Account, ActualSource
    from app.db.session import set_tenant_scope
    from app.services.actual import create_actual_v10
    from sqlalchemy import select

    await set_tenant_scope(db_session, owner_user["id"])

    starting_balance = primary_account.balance_cents

    # Use an income-kind category for kind validation to pass v0.x semantics.
    from app.db.models import CategoryKind
    from tests.helpers.seed import seed_category

    income_cat = await seed_category(
        db_session,
        user_id=owner_user["id"],
        name="ЗАРПЛАТА",
        kind=CategoryKind.income,
        sort_order=20,
        code="salary",
        ord="20",
        plan_cents=0,
    )
    await db_session.flush()

    parent, child = await create_actual_v10(
        db_session,
        user_id=owner_user["id"],
        kind="income",
        amount_cents=5000000,
        description="salary",
        category_id=income_cat.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )

    assert parent is not None
    assert child is None

    # 68-05 (class D): populate_existing refreshes the cached row (async-safe).
    refreshed = await db_session.scalar(
        select(Account)
        .where(Account.id == primary_account.id)
        .execution_options(populate_existing=True)
    )
    assert refreshed.balance_cents == starting_balance + 5000000


@pytest.mark.asyncio
async def test_delete_parent_cascades_child_via_FK(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """Deleting parent ActualTransaction cascades child via ON DELETE CASCADE."""
    from app.db.models import ActualSource, ActualTransaction
    from app.db.session import set_tenant_scope
    from app.services.actual import create_actual_v10
    from sqlalchemy import select

    await set_tenant_scope(db_session, owner_user["id"])

    parent, child = await create_actual_v10(
        db_session,
        user_id=owner_user["id"],
        kind="expense",
        amount_cents=-101,
        description="lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    assert child is not None
    child_id = child.id

    # Hard delete via session.delete (DB-level cascade test, not service-layer).
    await db_session.delete(parent)
    await db_session.flush()

    # Child should be gone (FK ON DELETE CASCADE).
    surviving = await db_session.scalar(
        select(ActualTransaction).where(ActualTransaction.id == child_id)
    )
    assert surviving is None


@pytest.mark.asyncio
async def test_delete_actual_v10_restores_balance_for_both_parent_and_child(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """delete_actual_v10 restores balance for parent + cascading child (positive delta)."""
    from app.db.models import Account, ActualSource
    from app.db.session import set_tenant_scope
    from app.services.actual import create_actual_v10, delete_actual_v10
    from sqlalchemy import select

    await set_tenant_scope(db_session, owner_user["id"])

    starting_balance = primary_account.balance_cents

    parent, child = await create_actual_v10(
        db_session,
        user_id=owner_user["id"],
        kind="expense",
        amount_cents=-101,
        description="lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    assert child is not None

    # Mid-test balance: starting − 110 (parent 101 + child 9).
    # 68-05 (class D): balance applied via raw UPDATE — populate_existing refreshes
    # the cached ORM row (async-safe).
    after_create = await db_session.scalar(
        select(Account)
        .where(Account.id == primary_account.id)
        .execution_options(populate_existing=True)
    )
    assert after_create.balance_cents == starting_balance - 110

    # Now delete via service-layer wrapper.
    await delete_actual_v10(db_session, parent.id, user_id=owner_user["id"])
    await db_session.flush()

    after_delete = await db_session.scalar(
        select(Account)
        .where(Account.id == primary_account.id)
        .execution_options(populate_existing=True)
    )
    # Balance fully restored: parent +101 + child +9 → back to starting.
    assert after_delete.balance_cents == starting_balance


@pytest.mark.asyncio
async def test_legacy_create_actual_unchanged_returns_single_object(
    db_session,
    owner_user,
    regular_category,
    primary_account,
    savings_config_enabled_base_10,
    seeded_savings_category,
):
    """Legacy create_actual still returns ActualTransaction (not tuple) — no breakage for v0.x callers."""
    from app.db.models import ActualSource, ActualTransaction
    from app.db.session import set_tenant_scope
    from app.services.actual import create_actual

    await set_tenant_scope(db_session, owner_user["id"])

    result = await create_actual(
        db_session,
        user_id=owner_user["id"],
        kind="expense",
        amount_cents=-101,
        description="legacy lunch",
        category_id=regular_category.id,
        tx_date=date(2026, 5, 5),
        source=ActualSource.mini_app,
    )

    # Legacy contract: single object, NOT tuple.
    assert isinstance(result, ActualTransaction)
    assert result.kind.value == "expense"
    assert result.amount_cents == -101
