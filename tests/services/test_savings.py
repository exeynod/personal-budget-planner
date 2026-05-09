"""Service tests for app/services/savings.py (Phase 22, Plan 22.08).

Covers BE-08 (config upsert), BE-09 (savings aggregator), BE-10 (deposit).

Service contract (per PLAN.md + parent scope):
- get_savings_snapshot(db, *, user_id) -> dict
    {total_cents, month_in_cents, config: {roundup_enabled, roundup_base}, goals[]}
- upsert_config(db, *, user_id, roundup_enabled=None, roundup_base=None) -> SavingsConfig
- create_deposit(db, *, user_id, amount_cents, account_id,
                 goal_id=None, description=None) -> ActualTransaction

Aggregator formulas (DATA-MODEL §2.4):
    total      = Σ |txn.amount| where kind in ('roundup', 'deposit')
    month_in   = Σ |txn.amount| where kind in ('roundup', 'deposit')
                 AND tx_date >= first_of_current_msk_month

DB-backed: requires DATABASE_URL pointing at v1.0 schema HEAD
(0016_v10_actual_account_id). Self-skips otherwise.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------- Fixtures (self-contained, mirror test_roundup.py) ----------


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
    _require_db()
    await _truncate_v1_tables(db_session)
    user = await _seed_user(db_session, tg_user_id=9_000_008_001)
    yield {"id": user.id, "tg_user_id": user.tg_user_id}


@pytest_asyncio.fixture
async def two_users(db_session):
    _require_db()
    await _truncate_v1_tables(db_session)
    a = await _seed_user(db_session, tg_user_id=9_000_008_010)
    b = await _seed_user(db_session, tg_user_id=9_000_008_011)
    yield {"a_id": a.id, "b_id": b.id}


@pytest_asyncio.fixture
async def seeded_savings_category(db_session, owner_user):
    """System Category code='savings' for the owner user."""
    from app.db.models import Category, CategoryKind, RolloverPolicy

    cat = Category(
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
    db_session.add(cat)
    await db_session.flush()
    yield cat


@pytest_asyncio.fixture
async def primary_account(db_session, owner_user):
    """Primary card account with starting balance 100000 ₽ (10_000_000 коп)."""
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


def _today_msk() -> date:
    return datetime.now(ZoneInfo("Europe/Moscow")).date()


def _first_of_msk_month() -> date:
    return _today_msk().replace(day=1)


# =============================================================================
# Section 1: get_savings_snapshot — aggregator (BE-09)
# =============================================================================


@pytest.mark.asyncio
async def test_service_module_importable():
    """Sanity: module imports cleanly with all required symbols."""
    from app.services import savings as svc

    for name in (
        "get_savings_snapshot",
        "upsert_config",
        "create_deposit",
    ):
        assert hasattr(svc, name), f"missing symbol: {name}"


@pytest.mark.asyncio
async def test_get_savings_snapshot_empty_returns_zero_total(
    db_session, owner_user
):
    """No roundup/deposit txns AND no SavingsConfig → total=0, month_in=0, default config."""
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    await set_tenant_scope(db_session, owner_user["id"])
    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])

    assert snap["total_cents"] == 0
    assert snap["month_in_cents"] == 0
    assert snap["config"]["roundup_enabled"] is False
    assert snap["config"]["roundup_base"] == 10
    assert snap["goals"] == []


@pytest.mark.asyncio
async def test_get_savings_snapshot_returns_default_config_when_missing(
    db_session, owner_user
):
    """No SavingsConfig row → snapshot returns defaults (False, 10), not None."""
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    await set_tenant_scope(db_session, owner_user["id"])
    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])

    assert snap["config"]["roundup_enabled"] is False
    assert snap["config"]["roundup_base"] == 10


@pytest.mark.asyncio
async def test_get_savings_snapshot_returns_existing_config(
    db_session, owner_user
):
    """Existing SavingsConfig is returned as-is."""
    from app.db.models import SavingsConfig
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    cfg = SavingsConfig(
        user_id=owner_user["id"], roundup_enabled=True, roundup_base=50
    )
    db_session.add(cfg)
    await db_session.flush()

    await set_tenant_scope(db_session, owner_user["id"])
    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])

    assert snap["config"]["roundup_enabled"] is True
    assert snap["config"]["roundup_base"] == 50


@pytest.mark.asyncio
async def test_get_savings_snapshot_includes_roundup_and_deposit(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """Both roundup + deposit kinds counted in total via ABS."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    await set_tenant_scope(db_session, owner_user["id"])

    today = _today_msk()
    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=today.replace(day=1),
        period_end=(today.replace(day=1) + timedelta(days=31)).replace(day=1)
        - timedelta(days=1),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    # Roundup −9 (signed negative; ABS=9)
    rnd = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.roundup,
        amount_cents=-9,
        description="round",
        category_id=seeded_savings_category.id,
        tx_date=today,
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    # Deposit −10000 (ABS=10000)
    dep = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.deposit,
        amount_cents=-10000,
        description="manual",
        category_id=seeded_savings_category.id,
        tx_date=today,
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add_all([rnd, dep])
    await db_session.flush()

    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])
    assert snap["total_cents"] == 9 + 10000
    assert snap["month_in_cents"] == 9 + 10000


@pytest.mark.asyncio
async def test_get_savings_snapshot_excludes_expense_and_income(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """Only kind in (roundup, deposit) — expense/income do NOT contribute."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        Category,
        CategoryKind,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    await set_tenant_scope(db_session, owner_user["id"])

    food = Category(
        user_id=owner_user["id"],
        name="FOOD",
        kind=CategoryKind.expense,
        sort_order=1,
        code="food",
        ord="01",
        plan_cents=100000,
    )
    db_session.add(food)
    await db_session.flush()

    today = _today_msk()
    period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=today.replace(day=1),
        period_end=(today.replace(day=1) + timedelta(days=31)).replace(day=1)
        - timedelta(days=1),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)
    await db_session.flush()

    expense = ActualTransaction(
        user_id=owner_user["id"],
        period_id=period.id,
        kind=ActualKind.expense,
        amount_cents=-50000,
        description="lunch",
        category_id=food.id,
        tx_date=today,
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add(expense)
    await db_session.flush()

    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])
    assert snap["total_cents"] == 0
    assert snap["month_in_cents"] == 0


@pytest.mark.asyncio
async def test_get_savings_snapshot_month_in_filters_to_current_msk_month(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """Txn dated previous month NOT in month_in but IS in total."""
    from app.db.models import (
        ActualKind,
        ActualSource,
        ActualTransaction,
        BudgetPeriod,
        PeriodStatus,
    )
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    await set_tenant_scope(db_session, owner_user["id"])

    today = _today_msk()
    first = today.replace(day=1)
    prev_month_day = first - timedelta(days=1)  # last day of previous month

    # Old period covering prev month
    prev_first = prev_month_day.replace(day=1)
    prev_period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=prev_first,
        period_end=prev_month_day,
        starting_balance_cents=0,
        status=PeriodStatus.closed,
    )
    cur_period = BudgetPeriod(
        user_id=owner_user["id"],
        period_start=first,
        period_end=(first + timedelta(days=31)).replace(day=1) - timedelta(days=1),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add_all([prev_period, cur_period])
    await db_session.flush()

    # Prev-month deposit −1000
    old = ActualTransaction(
        user_id=owner_user["id"],
        period_id=prev_period.id,
        kind=ActualKind.deposit,
        amount_cents=-1000,
        description="old",
        category_id=seeded_savings_category.id,
        tx_date=prev_month_day,
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    # Current-month deposit −2000
    new = ActualTransaction(
        user_id=owner_user["id"],
        period_id=cur_period.id,
        kind=ActualKind.deposit,
        amount_cents=-2000,
        description="new",
        category_id=seeded_savings_category.id,
        tx_date=today,
        source=ActualSource.mini_app,
        account_id=primary_account.id,
    )
    db_session.add_all([old, new])
    await db_session.flush()

    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])
    assert snap["total_cents"] == 1000 + 2000
    assert snap["month_in_cents"] == 2000


@pytest.mark.asyncio
async def test_get_savings_snapshot_includes_goals(
    db_session, owner_user
):
    """User's goals appear in `goals` field."""
    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    g1 = Goal(
        user_id=owner_user["id"],
        name="Велосипед",
        target_cents=5_000_000,
        current_cents=100_000,
    )
    g2 = Goal(
        user_id=owner_user["id"],
        name="Отпуск",
        target_cents=15_000_000,
        current_cents=0,
        due=date.today() + timedelta(days=180),
    )
    db_session.add_all([g1, g2])
    await db_session.flush()

    await set_tenant_scope(db_session, owner_user["id"])
    snap = await get_savings_snapshot(db_session, user_id=owner_user["id"])

    assert len(snap["goals"]) == 2
    names = {g["name"] for g in snap["goals"]}
    assert names == {"Велосипед", "Отпуск"}
    bike = next(g for g in snap["goals"] if g["name"] == "Велосипед")
    assert bike["target_cents"] == 5_000_000
    assert bike["current_cents"] == 100_000


@pytest.mark.asyncio
async def test_get_savings_snapshot_scoped_to_user(
    db_session, two_users
):
    """Cross-tenant: user_a's snapshot does NOT include user_b's goals/txns."""
    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.savings import get_savings_snapshot

    a, b = two_users["a_id"], two_users["b_id"]
    db_session.add(
        Goal(user_id=b, name="OTHER", target_cents=1_000_000, current_cents=0)
    )
    await db_session.flush()

    await set_tenant_scope(db_session, a)
    snap = await get_savings_snapshot(db_session, user_id=a)
    assert snap["goals"] == []


# =============================================================================
# Section 2: upsert_config (BE-08)
# =============================================================================


@pytest.mark.asyncio
async def test_upsert_config_creates_when_absent(db_session, owner_user):
    """First call creates SavingsConfig row."""
    from sqlalchemy import select

    from app.db.models import SavingsConfig
    from app.db.session import set_tenant_scope
    from app.services.savings import upsert_config

    await set_tenant_scope(db_session, owner_user["id"])
    cfg = await upsert_config(
        db_session,
        user_id=owner_user["id"],
        roundup_enabled=True,
        roundup_base=50,
    )
    assert cfg.user_id == owner_user["id"]
    assert cfg.roundup_enabled is True
    assert cfg.roundup_base == 50

    # Verify row in DB
    persisted = await db_session.scalar(
        select(SavingsConfig).where(SavingsConfig.user_id == owner_user["id"])
    )
    assert persisted is not None
    assert persisted.roundup_enabled is True


@pytest.mark.asyncio
async def test_upsert_config_updates_when_present(db_session, owner_user):
    """Second call updates existing fields."""
    from app.db.session import set_tenant_scope
    from app.services.savings import upsert_config

    await set_tenant_scope(db_session, owner_user["id"])
    await upsert_config(
        db_session,
        user_id=owner_user["id"],
        roundup_enabled=False,
        roundup_base=10,
    )
    cfg2 = await upsert_config(
        db_session,
        user_id=owner_user["id"],
        roundup_enabled=True,
        roundup_base=100,
    )
    assert cfg2.roundup_enabled is True
    assert cfg2.roundup_base == 100


@pytest.mark.asyncio
async def test_upsert_config_partial_update_keeps_unspecified(
    db_session, owner_user
):
    """PATCH semantics: only-roundup_enabled call leaves base unchanged."""
    from app.db.session import set_tenant_scope
    from app.services.savings import upsert_config

    await set_tenant_scope(db_session, owner_user["id"])
    await upsert_config(
        db_session,
        user_id=owner_user["id"],
        roundup_enabled=False,
        roundup_base=50,
    )
    cfg = await upsert_config(
        db_session, user_id=owner_user["id"], roundup_enabled=True
    )
    assert cfg.roundup_enabled is True
    assert cfg.roundup_base == 50  # unchanged


@pytest.mark.asyncio
async def test_upsert_config_invalid_base_raises(db_session, owner_user):
    """base=33 not in {10, 50, 100} → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.savings import upsert_config

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await upsert_config(
            db_session,
            user_id=owner_user["id"],
            roundup_enabled=True,
            roundup_base=33,
        )


# =============================================================================
# Section 3: create_deposit (BE-10)
# =============================================================================


@pytest.mark.asyncio
async def test_create_deposit_inserts_kind_deposit_txn(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """create_deposit inserts ActualTransaction with kind=deposit linked to savings cat."""
    from app.db.models import ActualKind
    from app.db.session import set_tenant_scope
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    txn = await create_deposit(
        db_session,
        user_id=owner_user["id"],
        amount_cents=10000,  # positive input
        account_id=primary_account.id,
    )
    assert txn.kind == ActualKind.deposit
    assert txn.amount_cents == -10000  # convention: deposit stored negative
    assert txn.category_id == seeded_savings_category.id
    assert txn.account_id == primary_account.id


@pytest.mark.asyncio
async def test_create_deposit_applies_balance_delta(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """Account balance reduced by deposit amount."""
    from sqlalchemy import text

    from app.db.session import set_tenant_scope
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    starting = primary_account.balance_cents

    await create_deposit(
        db_session,
        user_id=owner_user["id"],
        amount_cents=20000,
        account_id=primary_account.id,
    )

    # Bypass ORM identity-map cache: read balance_cents via raw SQL since
    # apply_balance_delta uses text() UPDATE that the ORM doesn't observe.
    new_balance = await db_session.scalar(
        text("SELECT balance_cents FROM account WHERE id = :id"),
        {"id": primary_account.id},
    )
    assert new_balance == starting - 20000


@pytest.mark.asyncio
async def test_create_deposit_with_goal_id_bumps_goal_current_cents(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """When goal_id supplied, Goal.current_cents += amount atomically."""
    from sqlalchemy import text

    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.savings import create_deposit

    goal = Goal(
        user_id=owner_user["id"],
        name="Велосипед",
        target_cents=5_000_000,
        current_cents=100_000,
    )
    db_session.add(goal)
    await db_session.flush()

    await set_tenant_scope(db_session, owner_user["id"])
    await create_deposit(
        db_session,
        user_id=owner_user["id"],
        amount_cents=50000,
        account_id=primary_account.id,
        goal_id=goal.id,
    )

    # Bypass ORM identity-map cache: the bump is via raw text() UPDATE.
    new_current = await db_session.scalar(
        text("SELECT current_cents FROM goal WHERE id = :id"),
        {"id": goal.id},
    )
    assert new_current == 100_000 + 50_000


@pytest.mark.asyncio
async def test_create_deposit_with_invalid_goal_id_raises(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """goal_id pointing to non-existent / cross-tenant goal → GoalNotFoundError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import GoalNotFoundError
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(GoalNotFoundError):
        await create_deposit(
            db_session,
            user_id=owner_user["id"],
            amount_cents=10000,
            account_id=primary_account.id,
            goal_id=999_999,
        )


@pytest.mark.asyncio
async def test_create_deposit_amount_zero_rejected(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """amount_cents=0 → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await create_deposit(
            db_session,
            user_id=owner_user["id"],
            amount_cents=0,
            account_id=primary_account.id,
        )


@pytest.mark.asyncio
async def test_create_deposit_finds_savings_category(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """Resolved category_id matches user's system 'savings' Category."""
    from app.db.session import set_tenant_scope
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    txn = await create_deposit(
        db_session,
        user_id=owner_user["id"],
        amount_cents=5000,
        account_id=primary_account.id,
    )
    assert txn.category_id == seeded_savings_category.id


@pytest.mark.asyncio
async def test_create_deposit_no_savings_category_raises(
    db_session, owner_user, primary_account
):
    """User without seeded savings category → SavingsCategoryMissingError."""
    from app.db.session import set_tenant_scope
    from app.services.roundup import SavingsCategoryMissingError
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(SavingsCategoryMissingError):
        await create_deposit(
            db_session,
            user_id=owner_user["id"],
            amount_cents=10000,
            account_id=primary_account.id,
        )


@pytest.mark.asyncio
async def test_create_deposit_with_negative_input_treated_as_abs(
    db_session, owner_user, seeded_savings_category, primary_account
):
    """Caller can pass negative or positive — internally normalised to negative storage."""
    from app.db.session import set_tenant_scope
    from app.services.savings import create_deposit

    await set_tenant_scope(db_session, owner_user["id"])
    txn = await create_deposit(
        db_session,
        user_id=owner_user["id"],
        amount_cents=-7000,  # already negative
        account_id=primary_account.id,
    )
    assert txn.amount_cents == -7000
