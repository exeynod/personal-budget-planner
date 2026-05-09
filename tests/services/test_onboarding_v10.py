"""Service tests for app/services/onboarding_v10.py (Phase 22, Plan 22.11).

Covers BE-15 (atomic v1.0 onboarding) + BE-05 (default cat seeding logic).

Service contract (per PLAN.md + CONTEXT §Area 2/3/4):

- complete_v10(db, *, user_id, income_cents, accounts, category_plans,
               goal=None, savings_config=None) -> dict
    Атомарно: insert User.income_cents+onboarded_at, insert N Account-rows
    (один is_primary=true), seed system Category «savings» + 8 default
    Categories с plan_cents, optional Goal, SavingsConfig (default
    roundup_enabled=false, base=10).

- reset_v10(db, *, user_id) -> dict
    Wipes Account/Goal/SavingsConfig + sets income_cents=NULL +
    Category.plan_cents=0 (admin via X-Internal-Token, plan 22.14).

CONTEXT D-07: 409 Conflict если хотя бы один Account уже есть для user.

DATA-MODEL §1.3 default 8 categories — codes food/cafe/home/transit/fun/
gifts/health/subs с UPPERCASE-russian именами. CONTEXT §Area 2 — system
savings cat: code='savings', name='КОПИЛКА', kind=expense, ord='99',
plan_cents=0, rollover='savings', paused=true.

DATA-MODEL §6 validators:
  income > 0, ≤ 100M ₽; plan ≥ 0, ≤ income*4; Σ plan ≤ income;
  goal.target > 0, goal.due > today; account.bank length 1..40.

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


# ---------- Fixtures ----------


async def _truncate_v1_tables(session):
    """Truncate v1.0 domain tables in FK-safe order. Bypasses RLS."""
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
    """Seed AppUser with income=NULL, onboarded_at=NULL (pre-onboarding state)."""
    from app.db.models import AppUser, UserRole

    user = AppUser(
        tg_user_id=tg_user_id,
        role=UserRole.owner,
        cycle_start_day=5,
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user


@pytest_asyncio.fixture
async def fresh_user(db_session):
    _require_db()
    await _truncate_v1_tables(db_session)
    user = await _seed_user(db_session, tg_user_id=9_000_011_001)
    yield {"id": user.id, "tg_user_id": user.tg_user_id}


def _today_msk() -> date:
    return datetime.now(ZoneInfo("Europe/Moscow")).date()


def _valid_body() -> dict:
    """Minimal valid onboarding body — used as a base for variations."""
    return {
        "income_cents": 100_000_00,  # 100 000 ₽
        "accounts": [
            {"bank": "Т-Банк", "kind": "card", "balance_cents": 50_000_00},
        ],
        "category_plans": {
            "food": 20_000_00,
            "cafe": 5_000_00,
            "home": 30_000_00,
            "transit": 6_000_00,
            "fun": 5_000_00,
            "gifts": 4_000_00,
            "health": 5_000_00,
            "subs": 3_000_00,
        },
    }


# =============================================================================
# Section 0: import smoke
# =============================================================================


@pytest.mark.asyncio
async def test_module_importable_with_required_symbols():
    """Sanity: module imports cleanly with all required symbols."""
    from app.services import onboarding_v10 as svc

    for name in (
        "complete_v10",
        "reset_v10",
        "OnboardingConflictError",
        "PlanExceedsIncomeError",
        "DEFAULT_CATEGORIES",
        "SYSTEM_SAVINGS_CATEGORY",
        "INCOME_MAX_CENTS",
    ):
        assert hasattr(svc, name), f"missing symbol: {name}"


# =============================================================================
# Section 1: complete_v10 — happy path
# =============================================================================


@pytest.mark.asyncio
async def test_complete_v10_creates_full_state(db_session, fresh_user):
    """Happy path: income+1 account+8 cats+savings sys cat+goal+savings_config in one txn."""
    from sqlalchemy import select, func

    from app.db.models import Account, AppUser, Category, Goal, SavingsConfig
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["accounts"] = [
        {"bank": "Т-Банк", "kind": "card", "balance_cents": 50_000_00},
        {"bank": "Альфа", "kind": "card", "balance_cents": 25_000_00},
    ]
    body["goal"] = {
        "name": "iPhone",
        "target_cents": 150_000_00,
        "due": (_today_msk() + timedelta(days=180)).isoformat(),
    }
    body["savings_config"] = {"roundup_enabled": True, "base": 50}

    await set_tenant_scope(db_session, fresh_user["id"])
    summary = await complete_v10(
        db_session, user_id=fresh_user["id"], **body
    )
    await db_session.commit()

    # Summary shape
    assert summary["user_id"] == fresh_user["id"]
    assert summary["income_cents"] == 100_000_00
    assert len(summary["account_ids"]) == 2
    assert len(summary["category_ids_by_code"]) == 8
    assert summary["savings_category_id"] is not None
    assert summary["goal_id"] is not None
    assert summary["savings_config"]["roundup_enabled"] is True
    assert summary["savings_config"]["roundup_base"] == 50
    assert summary["onboarded_at"] is not None

    # DB state — User
    user = await db_session.scalar(
        select(AppUser).where(AppUser.id == fresh_user["id"])
    )
    assert user.income_cents == 100_000_00
    assert user.onboarded_at is not None

    # Accounts: 2 rows, exactly one primary
    acc_count = await db_session.scalar(
        select(func.count()).select_from(Account).where(
            Account.user_id == fresh_user["id"]
        )
    )
    assert acc_count == 2
    primary_count = await db_session.scalar(
        select(func.count()).select_from(Account).where(
            Account.user_id == fresh_user["id"],
            Account.is_primary.is_(True),
        )
    )
    assert primary_count == 1

    # Categories: 8 default + 1 savings = 9 rows
    cat_count = await db_session.scalar(
        select(func.count()).select_from(Category).where(
            Category.user_id == fresh_user["id"]
        )
    )
    assert cat_count == 9

    # Goal — one row
    goal_count = await db_session.scalar(
        select(func.count()).select_from(Goal).where(
            Goal.user_id == fresh_user["id"]
        )
    )
    assert goal_count == 1

    # SavingsConfig — one row
    cfg_count = await db_session.scalar(
        select(func.count()).select_from(SavingsConfig).where(
            SavingsConfig.user_id == fresh_user["id"]
        )
    )
    assert cfg_count == 1


@pytest.mark.asyncio
async def test_complete_v10_creates_8_default_categories(db_session, fresh_user):
    """All 8 default codes seeded with correct UPPERCASE russian names + ord."""
    from sqlalchemy import select

    from app.db.models import Category
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(
        db_session, user_id=fresh_user["id"], **_valid_body()
    )
    await db_session.commit()

    cats = (
        await db_session.execute(
            select(Category)
            .where(Category.user_id == fresh_user["id"])
            .order_by(Category.ord)
        )
    ).scalars().all()

    expected_codes = [
        "food", "cafe", "home", "transit", "fun", "gifts", "health", "subs", "savings"
    ]
    assert [c.code for c in cats] == expected_codes

    # Spot-check uppercase names — DATA-MODEL §1.3.
    by_code = {c.code: c for c in cats}
    assert by_code["food"].name == "ПРОДУКТЫ"
    assert by_code["cafe"].name == "КАФЕ"
    assert by_code["home"].name == "ДОМ"
    assert by_code["transit"].name == "ТРАНСПОРТ"
    assert by_code["fun"].name == "РАЗВЛЕЧ."
    assert by_code["gifts"].name == "ПОДАРКИ"
    assert by_code["health"].name == "ЗДОРОВЬЕ"
    assert by_code["subs"].name == "ПОДПИСКИ"

    # Plan_cents wired through.
    assert by_code["food"].plan_cents == 20_000_00
    assert by_code["transit"].plan_cents == 6_000_00


@pytest.mark.asyncio
async def test_complete_v10_creates_savings_system_category(db_session, fresh_user):
    """System savings cat: code='savings', name='КОПИЛКА', kind=expense, ord='99',
    plan_cents=0, rollover='savings', paused=True."""
    from sqlalchemy import select

    from app.db.models import Category, CategoryKind, RolloverPolicy
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(
        db_session, user_id=fresh_user["id"], **_valid_body()
    )
    await db_session.commit()

    sav = await db_session.scalar(
        select(Category).where(
            Category.user_id == fresh_user["id"],
            Category.code == "savings",
        )
    )
    assert sav is not None
    assert sav.name == "КОПИЛКА"
    assert sav.kind == CategoryKind.expense
    assert sav.ord == "99"
    assert sav.plan_cents == 0
    assert sav.rollover == RolloverPolicy.savings
    assert sav.paused is True


@pytest.mark.asyncio
async def test_complete_v10_first_account_is_primary(db_session, fresh_user):
    """accounts[0] auto-primary when no explicit primary flag set."""
    from sqlalchemy import select

    from app.db.models import Account
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["accounts"] = [
        {"bank": "Альфа", "kind": "card", "balance_cents": 0},
        {"bank": "Сбер", "kind": "card", "balance_cents": 0},
    ]
    await set_tenant_scope(db_session, fresh_user["id"])
    summary = await complete_v10(
        db_session, user_id=fresh_user["id"], **body
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(Account)
            .where(Account.user_id == fresh_user["id"])
            .order_by(Account.id)
        )
    ).scalars().all()
    assert rows[0].bank == "Альфа"
    assert rows[0].is_primary is True
    assert rows[1].is_primary is False


@pytest.mark.asyncio
async def test_complete_v10_explicit_primary_overrides(db_session, fresh_user):
    """When accounts[i].primary=True is explicitly set, that account becomes primary."""
    from sqlalchemy import select

    from app.db.models import Account
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["accounts"] = [
        {"bank": "Альфа", "kind": "card", "balance_cents": 0},
        {"bank": "Сбер", "kind": "card", "balance_cents": 0, "primary": True},
        {"bank": "ВТБ", "kind": "card", "balance_cents": 0},
    ]
    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(
        db_session, user_id=fresh_user["id"], **body
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(Account)
            .where(Account.user_id == fresh_user["id"])
            .order_by(Account.id)
        )
    ).scalars().all()
    primaries = [r for r in rows if r.is_primary]
    assert len(primaries) == 1
    assert primaries[0].bank == "Сбер"


@pytest.mark.asyncio
async def test_complete_v10_optional_goal_skipped(db_session, fresh_user):
    """No goal in body → no Goal row inserted."""
    from sqlalchemy import select, func

    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    assert "goal" not in body

    await set_tenant_scope(db_session, fresh_user["id"])
    summary = await complete_v10(
        db_session, user_id=fresh_user["id"], **body
    )
    await db_session.commit()

    assert summary["goal_id"] is None
    count = await db_session.scalar(
        select(func.count()).select_from(Goal).where(
            Goal.user_id == fresh_user["id"]
        )
    )
    assert count == 0


@pytest.mark.asyncio
async def test_complete_v10_optional_savings_config_default(db_session, fresh_user):
    """No savings_config in body → SavingsConfig row with defaults (False, 10)."""
    from sqlalchemy import select

    from app.db.models import SavingsConfig
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    await set_tenant_scope(db_session, fresh_user["id"])
    summary = await complete_v10(
        db_session, user_id=fresh_user["id"], **body
    )
    await db_session.commit()

    assert summary["savings_config"]["roundup_enabled"] is False
    assert summary["savings_config"]["roundup_base"] == 10

    cfg = await db_session.scalar(
        select(SavingsConfig).where(SavingsConfig.user_id == fresh_user["id"])
    )
    assert cfg is not None
    assert cfg.roundup_enabled is False
    assert cfg.roundup_base == 10


@pytest.mark.asyncio
async def test_complete_v10_sets_onboarded_at(db_session, fresh_user):
    """AppUser.onboarded_at set to non-NULL after success."""
    from sqlalchemy import select

    from app.db.models import AppUser
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(
        db_session, user_id=fresh_user["id"], **_valid_body()
    )
    await db_session.commit()

    user = await db_session.scalar(
        select(AppUser).where(AppUser.id == fresh_user["id"])
    )
    assert user.onboarded_at is not None


# =============================================================================
# Section 2: complete_v10 — conflict + atomicity
# =============================================================================


@pytest.mark.asyncio
async def test_complete_v10_returns_409_when_account_exists(db_session, fresh_user):
    """Pre-create one Account → complete_v10 raises OnboardingConflictError."""
    from app.db.models import Account, AccountKind
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import (
        OnboardingConflictError,
        complete_v10,
    )

    await set_tenant_scope(db_session, fresh_user["id"])
    pre = Account(
        user_id=fresh_user["id"],
        bank="Pre-existing",
        kind=AccountKind.card,
        balance_cents=0,
        is_primary=True,
    )
    db_session.add(pre)
    await db_session.flush()
    await db_session.commit()

    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(OnboardingConflictError):
        await complete_v10(
            db_session, user_id=fresh_user["id"], **_valid_body()
        )


@pytest.mark.asyncio
async def test_complete_v10_rollback_on_invalid_input(db_session, fresh_user):
    """Sum-plan > income raises PlanExceedsIncomeError; no rows persisted."""
    from sqlalchemy import select, func

    from app.db.models import Account, Category, Goal, SavingsConfig
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import (
        PlanExceedsIncomeError,
        complete_v10,
    )

    body = _valid_body()
    # Σ plan > income (sum is 1.5x income).
    body["category_plans"] = {
        "food": 50_000_00,
        "cafe": 50_000_00,
        "home": 50_000_00,
        "transit": 0,
        "fun": 0,
        "gifts": 0,
        "health": 0,
        "subs": 0,
    }

    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(PlanExceedsIncomeError):
        await complete_v10(
            db_session, user_id=fresh_user["id"], **body
        )
    # Validator runs BEFORE any insert → nothing to rollback, but verify state
    # is still empty for safety.
    await db_session.rollback()

    for model in (Account, Category, Goal, SavingsConfig):
        count = await db_session.scalar(
            select(func.count()).select_from(model).where(
                model.user_id == fresh_user["id"]
            )
        )
        assert count == 0, f"unexpected rows in {model.__name__} after failed onboarding"


# =============================================================================
# Section 3: complete_v10 — validators (DATA-MODEL §6)
# =============================================================================


@pytest.mark.asyncio
async def test_complete_v10_rejects_income_zero(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["income_cents"] = 0
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_income_negative(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["income_cents"] = -100
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_income_too_high(db_session, fresh_user):
    """income_cents > 100M ₽ (== 10_000_000_000 коп) rejected."""
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import (
        INCOME_MAX_CENTS,
        complete_v10,
    )

    body = _valid_body()
    body["income_cents"] = INCOME_MAX_CENTS + 1
    # bump plans to fit ratio (or leave them — they'll be cents-relative)
    body["category_plans"] = {k: 0 for k in body["category_plans"]}
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_sum_plan_exceeds_income(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import (
        PlanExceedsIncomeError,
        complete_v10,
    )

    body = _valid_body()
    body["category_plans"]["food"] = body["income_cents"]  # alone exceeds rest
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(PlanExceedsIncomeError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_unknown_category_code_rejected(db_session, fresh_user):
    """category_plans contains 'invalid_code' → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["category_plans"]["invalid_code"] = 100_00
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_negative_plan(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["category_plans"]["food"] = -1
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_empty_accounts(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["accounts"] = []
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_bank_too_long(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["accounts"][0]["bank"] = "X" * 41  # > 40
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


@pytest.mark.asyncio
async def test_complete_v10_rejects_multiple_explicit_primary(db_session, fresh_user):
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10

    body = _valid_body()
    body["accounts"] = [
        {"bank": "A", "kind": "card", "balance_cents": 0, "primary": True},
        {"bank": "B", "kind": "card", "balance_cents": 0, "primary": True},
    ]
    await set_tenant_scope(db_session, fresh_user["id"])
    with pytest.raises(ValueError):
        await complete_v10(db_session, user_id=fresh_user["id"], **body)


# =============================================================================
# Section 4: reset_v10
# =============================================================================


@pytest.mark.asyncio
async def test_reset_v10_wipes_account_goal_savings_config(db_session, fresh_user):
    from sqlalchemy import select, func

    from app.db.models import Account, Goal, SavingsConfig
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10, reset_v10

    body = _valid_body()
    body["goal"] = {
        "name": "iPhone",
        "target_cents": 100_000_00,
        "due": (_today_msk() + timedelta(days=180)).isoformat(),
    }
    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(db_session, user_id=fresh_user["id"], **body)
    await db_session.commit()

    # Before reset
    acc_before = await db_session.scalar(
        select(func.count()).select_from(Account).where(
            Account.user_id == fresh_user["id"]
        )
    )
    assert acc_before == 1

    # Reset
    await set_tenant_scope(db_session, fresh_user["id"])
    summary = await reset_v10(db_session, user_id=fresh_user["id"])
    await db_session.commit()

    assert "deleted_account_ids" in summary

    # After reset: no Account / Goal / SavingsConfig.
    for model in (Account, Goal, SavingsConfig):
        count = await db_session.scalar(
            select(func.count()).select_from(model).where(
                model.user_id == fresh_user["id"]
            )
        )
        assert count == 0, f"{model.__name__} not wiped"


@pytest.mark.asyncio
async def test_reset_v10_resets_income_to_null(db_session, fresh_user):
    from sqlalchemy import select

    from app.db.models import AppUser
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10, reset_v10

    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(db_session, user_id=fresh_user["id"], **_valid_body())
    await db_session.commit()

    await set_tenant_scope(db_session, fresh_user["id"])
    await reset_v10(db_session, user_id=fresh_user["id"])
    await db_session.commit()

    user = await db_session.scalar(
        select(AppUser).where(AppUser.id == fresh_user["id"])
    )
    assert user.income_cents is None
    assert user.onboarded_at is None


@pytest.mark.asyncio
async def test_reset_v10_resets_plan_cents_to_zero(db_session, fresh_user):
    from sqlalchemy import select, func

    from app.db.models import Category
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10, reset_v10

    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(db_session, user_id=fresh_user["id"], **_valid_body())
    await db_session.commit()

    await set_tenant_scope(db_session, fresh_user["id"])
    await reset_v10(db_session, user_id=fresh_user["id"])
    await db_session.commit()

    # Sum of plan_cents over all user's categories must be 0.
    s = await db_session.scalar(
        select(func.coalesce(func.sum(Category.plan_cents), 0))
        .where(Category.user_id == fresh_user["id"])
    )
    assert int(s) == 0


@pytest.mark.asyncio
async def test_reset_v10_does_not_delete_categories(db_session, fresh_user):
    """Categories preserved after reset (only plan_cents zeroed)."""
    from sqlalchemy import select, func

    from app.db.models import Category
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10, reset_v10

    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(db_session, user_id=fresh_user["id"], **_valid_body())
    await db_session.commit()

    cat_count_before = await db_session.scalar(
        select(func.count()).select_from(Category).where(
            Category.user_id == fresh_user["id"]
        )
    )
    assert cat_count_before == 9

    await set_tenant_scope(db_session, fresh_user["id"])
    await reset_v10(db_session, user_id=fresh_user["id"])
    await db_session.commit()

    cat_count_after = await db_session.scalar(
        select(func.count()).select_from(Category).where(
            Category.user_id == fresh_user["id"]
        )
    )
    assert cat_count_after == 9


@pytest.mark.asyncio
async def test_reset_v10_allows_re_onboarding(db_session, fresh_user):
    """After reset, complete_v10 can be called again successfully."""
    from app.db.session import set_tenant_scope
    from app.services.onboarding_v10 import complete_v10, reset_v10

    body = _valid_body()
    await set_tenant_scope(db_session, fresh_user["id"])
    await complete_v10(db_session, user_id=fresh_user["id"], **body)
    await db_session.commit()

    await set_tenant_scope(db_session, fresh_user["id"])
    await reset_v10(db_session, user_id=fresh_user["id"])
    await db_session.commit()

    # Second onboarding should succeed (no 409).
    body2 = _valid_body()
    body2["accounts"] = [{"bank": "Сбер", "kind": "card", "balance_cents": 1000}]
    await set_tenant_scope(db_session, fresh_user["id"])
    summary2 = await complete_v10(
        db_session, user_id=fresh_user["id"], **body2
    )
    await db_session.commit()

    assert summary2["income_cents"] == body2["income_cents"]
    assert len(summary2["account_ids"]) == 1
