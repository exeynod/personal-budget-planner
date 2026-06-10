"""v1.2 balance-fix: account delta-accounting tests (signed_delta convention).

Covers the «хранение положительное, знак из kind» contract:
  - signed_delta unit table: income +, expense/roundup/deposit −, abs() for
    legacy negative-stored rows, enum + str inputs.
  - create_actual_v10: expense DECREASES the account, income INCREASES it
    (pre-v1.2 bug: raw amount_cents was applied → a 500 ₽ expense ADDED 500).
  - delete_actual_v10: symmetric restore — create + delete returns the
    balance to its initial value.
  - update_actual (PATCH): amount change adjusts the account by
    signed_delta(new) − signed_delta(old); kind flip expense→income too.
  - process_bot_actual: bot transactions land on the user's PRIMARY account
    and move its balance; user without a primary account → account_id=None
    (legacy behaviour preserved).

Style mirrors tests/services/test_planning_rework.py (db_session + truncate +
local seeds). DB-backed tests skip when DATABASE_URL is unset.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------------------------------------------------------------------------
# Unit: signed_delta — единственная точка истины знака дельты счёта
# ---------------------------------------------------------------------------


class TestSignedDelta:
    @pytest.mark.parametrize(
        ("kind", "amount", "expected"),
        [
            ("expense", 500_00, -500_00),
            ("income", 500_00, 500_00),
            # Historical savings kinds — money left the account.
            ("roundup", 47, -47),
            ("deposit", 1_000_00, -1_000_00),
            # Legacy negative-stored rows (pre-v1.2 reconcile adjustments):
            # abs() makes the helper deterministic regardless of stored sign.
            ("expense", -500_00, -500_00),
            ("income", -500_00, 500_00),
            # Zero is a no-op either way.
            ("expense", 0, 0),
            ("income", 0, 0),
        ],
    )
    def test_signed_delta_table(self, kind, amount, expected):
        from app.services.actual import signed_delta

        assert signed_delta(kind, amount) == expected

    def test_signed_delta_accepts_enums(self):
        from app.db.models import ActualKind, CategoryKind
        from app.services.actual import signed_delta

        assert signed_delta(ActualKind.expense, 100) == -100
        assert signed_delta(ActualKind.income, 100) == 100
        assert signed_delta(ActualKind.deposit, 100) == -100
        assert signed_delta(CategoryKind.expense, 100) == -100
        assert signed_delta(CategoryKind.income, 100) == 100


# ---------------------------------------------------------------------------
# Integration fixtures (mirror tests/services/test_planning_rework.py)
# ---------------------------------------------------------------------------


async def _truncate(session):
    from sqlalchemy import text

    await session.execute(text("RESET ROLE"))
    await session.execute(text("SET LOCAL row_security = off"))
    for tbl in (
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        "period_category_plan",
        "plan_template_line",
        "plan_template_item",
        "subscription",
        "account",
        "budget_period",
        "category",
        "app_user",
    ):
        await session.execute(text(f"DELETE FROM {tbl}"))
    await session.commit()


INITIAL_BALANCE = 100_000_00


@pytest_asyncio.fixture
async def ctx(db_session):
    """Owner + active period covering today + primary account + categories."""
    _require_db()
    await _truncate(db_session)

    from app.db.models import (
        Account,
        AccountKind,
        AppUser,
        BudgetPeriod,
        CategoryKind,
        PeriodStatus,
        UserRole,
    )
    from tests.helpers.seed import seed_category

    user = AppUser(
        tg_user_id=9_000_077_001,
        role=UserRole.owner,
        cycle_start_day=5,
        onboarded_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    await db_session.flush()

    today = date.today()
    period = BudgetPeriod(
        user_id=user.id,
        period_start=today - timedelta(days=15),
        period_end=today + timedelta(days=15),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    db_session.add(period)

    acc = Account(
        user_id=user.id,
        bank="Т-Банк",
        kind=AccountKind.card,
        balance_cents=INITIAL_BALANCE,
        is_primary=True,
    )
    db_session.add(acc)
    await db_session.flush()

    exp_cat = await seed_category(
        db_session,
        user_id=user.id,
        name="Продукты",
        kind=CategoryKind.expense,
        sort_order=1,
    )
    inc_cat = await seed_category(
        db_session,
        user_id=user.id,
        name="Зарплата",
        kind=CategoryKind.income,
        sort_order=2,
    )
    await db_session.commit()

    return {
        "user_id": user.id,
        "tg_user_id": user.tg_user_id,
        "period_id": period.id,
        "account_id": acc.id,
        "exp_cat_id": exp_cat.id,
        "inc_cat_id": inc_cat.id,
    }


async def _balance(db, account_id: int) -> int:
    from sqlalchemy import select

    from app.db.models import Account

    return await db.scalar(
        select(Account.balance_cents).where(Account.id == account_id)
    )


async def _create(db, ctx, *, kind: str, amount_cents: int, category_id=None):
    from app.db.models import ActualSource
    from app.services.actual import create_actual_v10

    parent, _child = await create_actual_v10(
        db,
        user_id=ctx["user_id"],
        kind=kind,
        amount_cents=amount_cents,
        description="тест",
        category_id=category_id
        or (ctx["exp_cat_id"] if kind == "expense" else ctx["inc_cat_id"]),
        tx_date=date.today(),
        source=ActualSource.mini_app,
        account_id=ctx["account_id"],
    )
    return parent


# ---------------------------------------------------------------------------
# create: знак дельты из kind
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expense_decreases_account_balance(db_session, ctx):
    await _create(db_session, ctx, kind="expense", amount_cents=500_00)
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE - 500_00


@pytest.mark.asyncio
async def test_income_increases_account_balance(db_session, ctx):
    await _create(db_session, ctx, kind="income", amount_cents=300_00)
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE + 300_00


# ---------------------------------------------------------------------------
# delete: симметричное восстановление
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_restores_account_balance(db_session, ctx):
    from app.services.actual import delete_actual_v10

    row = await _create(db_session, ctx, kind="expense", amount_cents=750_00)
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE - 750_00

    await delete_actual_v10(db_session, row.id, user_id=ctx["user_id"])
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE


@pytest.mark.asyncio
async def test_delete_income_restores_account_balance(db_session, ctx):
    from app.services.actual import delete_actual_v10

    row = await _create(db_session, ctx, kind="income", amount_cents=200_00)
    await delete_actual_v10(db_session, row.id, user_id=ctx["user_id"])
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE


# ---------------------------------------------------------------------------
# update (PATCH): коррекция = signed_delta(new) − signed_delta(old)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_amount_adjusts_account_balance(db_session, ctx):
    from app.api.schemas.actual import ActualUpdate
    from app.services.actual import update_actual

    row = await _create(db_session, ctx, kind="expense", amount_cents=500_00)
    await update_actual(
        db_session,
        row.id,
        ActualUpdate(amount_cents=700_00),
        user_id=ctx["user_id"],
    )
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE - 700_00


@pytest.mark.asyncio
async def test_patch_kind_flip_adjusts_account_balance(db_session, ctx):
    """expense→income flip: счёт корректируется на +2×amount."""
    from app.api.schemas.actual import ActualUpdate
    from app.services.actual import update_actual

    row = await _create(db_session, ctx, kind="expense", amount_cents=500_00)
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE - 500_00

    await update_actual(
        db_session,
        row.id,
        ActualUpdate(kind="income", category_id=ctx["inc_cat_id"]),
        user_id=ctx["user_id"],
    )
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE + 500_00


@pytest.mark.asyncio
async def test_patch_description_only_keeps_balance(db_session, ctx):
    """No-op для баланса: патч без amount/kind не трогает счёт."""
    from app.api.schemas.actual import ActualUpdate
    from app.services.actual import update_actual

    row = await _create(db_session, ctx, kind="expense", amount_cents=500_00)
    await update_actual(
        db_session,
        row.id,
        ActualUpdate(description="новое описание"),
        user_id=ctx["user_id"],
    )
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE - 500_00


# ---------------------------------------------------------------------------
# bot: транзакция садится на primary-счёт
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bot_actual_lands_on_primary_account(db_session, ctx):
    from app.services.internal_bot import process_bot_actual

    result = await process_bot_actual(
        db_session,
        tg_user_id=ctx["tg_user_id"],
        kind="expense",
        amount_cents=150_00,
        category_id=ctx["exp_cat_id"],
        description="кофе из бота",
    )
    assert result["status"] == "created"
    assert result["actual"]["account_id"] == ctx["account_id"]
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE - 150_00


@pytest.mark.asyncio
async def test_bot_actual_without_primary_account_keeps_legacy_behavior(
    db_session, ctx
):
    """Нет primary-счёта → account_id=None, балансы не трогаются (fallback D)."""
    from datetime import datetime, timezone

    from app.db.models import AppUser, CategoryKind, UserRole
    from app.services.internal_bot import process_bot_actual
    from tests.helpers.seed import seed_category

    user_b = AppUser(
        tg_user_id=9_000_077_002,
        role=UserRole.member,
        cycle_start_day=5,
        onboarded_at=datetime.now(timezone.utc),
    )
    db_session.add(user_b)
    await db_session.flush()
    cat_b = await seed_category(
        db_session,
        user_id=user_b.id,
        name="Прочее",
        kind=CategoryKind.expense,
        sort_order=1,
    )
    await db_session.commit()

    result = await process_bot_actual(
        db_session,
        tg_user_id=user_b.tg_user_id,
        kind="expense",
        amount_cents=100_00,
        category_id=cat_b.id,
    )
    assert result["status"] == "created"
    assert result["actual"]["account_id"] is None
    # Чужой (единственный существующий) счёт не задет.
    assert await _balance(db_session, ctx["account_id"]) == INITIAL_BALANCE
