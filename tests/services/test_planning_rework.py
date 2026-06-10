"""v1.1 planning-rework service tests (AGREED-PLAN §B/§C/§H).

Covers:
  - apply_template_to_period: items→period_category_plan, lines→planned(manual),
    idempotency, planned_date clamp, no subscription duplication.
  - post_planned / unpost_planned: sign by kind, posted_txn_id bridge, balance
    move + restore, idempotency 409, cross-tenant 404, subscription_auto 400.
  - post_planned_batch: per-line date vs shared date, skip already-posted,
    SAVEPOINT recovery (failed line keeps prior posts + RLS scope).
  - update_plan_month_atomic: sync of the active period's period_category_plan
    limits (update-only; no pcp row created where none existed).
  - compute_balance: per-period limit (+ plan_cents fallback), planned_unposted
    aggregate (excl subscription_auto + posted), adjustment-category exclusion.
  - reconcile_balance: balance_now == target, delta=0 no-op, reversible.

Self-contained (no tests/helpers dependency beyond seed). DB-backed: skips when
DATABASE_URL is unset.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


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


async def _seed_period(session, *, user_id: int, start: date, end: date):
    from app.db.models import BudgetPeriod, PeriodStatus

    p = BudgetPeriod(
        user_id=user_id,
        period_start=start,
        period_end=end,
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    session.add(p)
    await session.flush()
    await session.commit()
    return p


async def _seed_primary_account(session, *, user_id: int, balance_cents: int = 0):
    from app.db.models import Account, AccountKind

    acc = Account(
        user_id=user_id,
        bank="Т-Банк",
        kind=AccountKind.card,
        balance_cents=balance_cents,
        is_primary=True,
    )
    session.add(acc)
    await session.flush()
    await session.commit()
    return acc


@pytest_asyncio.fixture
async def ctx(db_session):
    """Single owner + current period + primary account + one expense category."""
    _require_db()
    await _truncate(db_session)
    from tests.helpers.seed import seed_category
    from app.db.models import CategoryKind

    user = await _seed_user(db_session, tg_user_id=9_000_055_001)
    today = date.today()
    period = await _seed_period(
        db_session,
        user_id=user.id,
        start=today.replace(day=1),
        end=today.replace(day=1) + timedelta(days=27),
    )
    acc = await _seed_primary_account(db_session, user_id=user.id, balance_cents=0)
    cat = await seed_category(
        db_session,
        user_id=user.id,
        name="Продукты",
        kind=CategoryKind.expense,
        code="food",
        ord="01",
        plan_cents=0,
        sort_order=1,
    )
    inc_cat = await seed_category(
        db_session,
        user_id=user.id,
        name="Зарплата",
        kind=CategoryKind.income,
        code="salary",
        ord="02",
        plan_cents=0,
        sort_order=2,
    )
    adj_cat = await seed_category(
        db_session,
        user_id=user.id,
        name="Корректировка",
        kind=CategoryKind.expense,
        code="adjustment",
        ord="98",
        plan_cents=0,
        sort_order=98,
    )
    await db_session.commit()
    yield {
        "user_id": user.id,
        "period_id": period.id,
        "period_start": period.period_start,
        "account_id": acc.id,
        "cat_id": cat.id,
        "inc_cat_id": inc_cat.id,
        "adj_cat_id": adj_cat.id,
    }


# ---------------------------------------------------------------------------
# apply_template_to_period
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_apply_template_copies_items_and_lines(db_session, ctx):
    from sqlalchemy import select
    from app.db.models import (
        ActualKind,
        PeriodCategoryPlan,
        PlannedTransaction,
        PlanSource,
        PlanTemplateItem,
        PlanTemplateLine,
    )
    from app.db.session import set_tenant_scope
    from app.services.planned import apply_template_to_period

    await set_tenant_scope(db_session, ctx["user_id"])
    db_session.add(
        PlanTemplateItem(
            user_id=ctx["user_id"], category_id=ctx["cat_id"], limit_cents=50_000_00
        )
    )
    db_session.add(
        PlanTemplateLine(
            user_id=ctx["user_id"],
            category_id=ctx["cat_id"],
            title="Аренда",
            amount_cents=20_000_00,
            day_of_period=5,
            kind=ActualKind.expense,
        )
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    res = await apply_template_to_period(
        db_session, user_id=ctx["user_id"], period_id=ctx["period_id"]
    )
    await db_session.commit()
    assert res["created"] == 1

    # period_category_plan row created with the template limit.
    pcp = (
        (
            await db_session.execute(
                select(PeriodCategoryPlan).where(
                    PeriodCategoryPlan.period_id == ctx["period_id"]
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(pcp) == 1
    assert pcp[0].limit_cents == 50_000_00

    # planned_transaction(manual) row materialised with clamped date.
    planned = (
        (
            await db_session.execute(
                select(PlannedTransaction).where(
                    PlannedTransaction.period_id == ctx["period_id"]
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(planned) == 1
    assert planned[0].source == PlanSource.manual
    assert planned[0].amount_cents == 20_000_00
    assert planned[0].description == "Аренда"
    # day_of_period=5 → period_start + 4 days.
    assert planned[0].planned_date == ctx["period_start"] + timedelta(days=4)


@pytest.mark.asyncio
async def test_apply_template_idempotent(db_session, ctx):
    from sqlalchemy import func, select
    from app.db.models import PeriodCategoryPlan, PlanTemplateItem
    from app.db.session import set_tenant_scope
    from app.services.planned import apply_template_to_period

    await set_tenant_scope(db_session, ctx["user_id"])
    db_session.add(
        PlanTemplateItem(
            user_id=ctx["user_id"], category_id=ctx["cat_id"], limit_cents=1000
        )
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    await apply_template_to_period(
        db_session, user_id=ctx["user_id"], period_id=ctx["period_id"]
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    res2 = await apply_template_to_period(
        db_session, user_id=ctx["user_id"], period_id=ctx["period_id"]
    )
    await db_session.commit()
    assert res2["created"] == 0

    count = await db_session.scalar(
        select(func.count())
        .select_from(PeriodCategoryPlan)
        .where(PeriodCategoryPlan.period_id == ctx["period_id"])
    )
    assert count == 1  # not duplicated


# ---------------------------------------------------------------------------
# post_planned / unpost_planned
# ---------------------------------------------------------------------------


async def _make_planned(db_session, ctx, *, kind, amount, cat_id=None, description="x"):
    from app.api.schemas.planned import PlannedCreate
    from app.db.session import set_tenant_scope
    from app.services.planned import create_manual_planned

    await set_tenant_scope(db_session, ctx["user_id"])
    row = await create_manual_planned(
        db_session,
        ctx["period_id"],
        PlannedCreate(
            kind=kind,
            amount_cents=amount,
            description=description,
            category_id=cat_id or ctx["cat_id"],
            planned_date=None,
        ),
        user_id=ctx["user_id"],
    )
    await db_session.commit()
    return row.id


@pytest.mark.asyncio
async def test_post_planned_expense_sign_and_bridge(db_session, ctx):
    from sqlalchemy import select
    from app.db.models import ActualTransaction, PlannedTransaction
    from app.db.session import set_tenant_scope
    from app.services.planned import post_planned

    pid = await _make_planned(db_session, ctx, kind="expense", amount=5000)

    await set_tenant_scope(db_session, ctx["user_id"])
    txn = await post_planned(
        db_session, pid, user_id=ctx["user_id"], tx_date=date.today()
    )
    await db_session.commit()

    # Expense actual stored NEGATIVE; posted on the primary account.
    assert txn.amount_cents == -5000
    assert txn.account_id == ctx["account_id"]
    # Bridge set.
    row = await db_session.scalar(
        select(PlannedTransaction).where(PlannedTransaction.id == pid)
    )
    assert row.posted_txn_id == txn.id
    # Account balance moved by -5000.
    from app.db.models import Account

    db_session.expire_all()
    acc = await db_session.scalar(
        select(Account).where(Account.id == ctx["account_id"])
    )
    assert acc.balance_cents == -5000
    _ = ActualTransaction  # imported for clarity


@pytest.mark.asyncio
async def test_post_planned_income_sign_positive(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.planned import post_planned

    pid = await _make_planned(
        db_session, ctx, kind="income", amount=7000, cat_id=ctx["inc_cat_id"]
    )
    await set_tenant_scope(db_session, ctx["user_id"])
    txn = await post_planned(
        db_session, pid, user_id=ctx["user_id"], tx_date=date.today()
    )
    await db_session.commit()
    assert txn.amount_cents == 7000  # income positive


@pytest.mark.asyncio
async def test_post_planned_idempotent_409(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.planned import PlannedAlreadyPostedError, post_planned

    pid = await _make_planned(db_session, ctx, kind="expense", amount=100)
    await set_tenant_scope(db_session, ctx["user_id"])
    await post_planned(db_session, pid, user_id=ctx["user_id"], tx_date=date.today())
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    with pytest.raises(PlannedAlreadyPostedError):
        await post_planned(
            db_session, pid, user_id=ctx["user_id"], tx_date=date.today()
        )
    await db_session.rollback()


@pytest.mark.asyncio
async def test_post_planned_cross_tenant_404(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.planned import PlannedNotFoundError, post_planned

    pid = await _make_planned(db_session, ctx, kind="expense", amount=100)
    other = await _seed_user(db_session, tg_user_id=9_000_055_999)

    await set_tenant_scope(db_session, other.id)
    with pytest.raises(PlannedNotFoundError):
        await post_planned(db_session, pid, user_id=other.id, tx_date=date.today())
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unpost_planned_restores_balance(db_session, ctx):
    from sqlalchemy import select
    from app.db.models import Account, PlannedTransaction
    from app.db.session import set_tenant_scope
    from app.services.planned import post_planned, unpost_planned

    pid = await _make_planned(db_session, ctx, kind="expense", amount=3000)
    await set_tenant_scope(db_session, ctx["user_id"])
    await post_planned(db_session, pid, user_id=ctx["user_id"], tx_date=date.today())
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    await unpost_planned(db_session, pid, user_id=ctx["user_id"])
    await db_session.commit()

    row = await db_session.scalar(
        select(PlannedTransaction).where(PlannedTransaction.id == pid)
    )
    assert row.posted_txn_id is None
    db_session.expire_all()
    acc = await db_session.scalar(
        select(Account).where(Account.id == ctx["account_id"])
    )
    assert acc.balance_cents == 0  # restored


@pytest.mark.asyncio
async def test_post_subscription_auto_read_only(db_session, ctx):
    from sqlalchemy import select
    from app.db.models import PlanSource, PlannedTransaction
    from app.db.session import set_tenant_scope
    from app.services.planned import (
        SubscriptionPlannedReadOnlyError,
        post_planned,
    )

    pid = await _make_planned(db_session, ctx, kind="expense", amount=100)
    # Flip its source to subscription_auto to simulate a sub-materialised row.
    await set_tenant_scope(db_session, ctx["user_id"])
    row = await db_session.scalar(
        select(PlannedTransaction).where(PlannedTransaction.id == pid)
    )
    row.source = PlanSource.subscription_auto
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    with pytest.raises(SubscriptionPlannedReadOnlyError):
        await post_planned(
            db_session, pid, user_id=ctx["user_id"], tx_date=date.today()
        )
    await db_session.rollback()


# ---------------------------------------------------------------------------
# post_planned_batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_planned_batch_skips_already_posted(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.planned import post_planned, post_planned_batch

    p1 = await _make_planned(db_session, ctx, kind="expense", amount=100)
    p2 = await _make_planned(db_session, ctx, kind="expense", amount=200)

    await set_tenant_scope(db_session, ctx["user_id"])
    await post_planned(db_session, p1, user_id=ctx["user_id"], tx_date=date.today())
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    res = await post_planned_batch(
        db_session, [p1, p2], user_id=ctx["user_id"], tx_date=date.today()
    )
    await db_session.commit()
    assert p1 in res["skipped"]
    assert len(res["posted"]) == 1


@pytest.mark.asyncio
async def test_post_planned_batch_per_line_date(db_session, ctx):
    from sqlalchemy import select
    from app.api.schemas.planned import PlannedCreate
    from app.db.models import ActualTransaction, PlannedTransaction
    from app.db.session import set_tenant_scope
    from app.services.planned import create_manual_planned, post_planned_batch

    d = ctx["period_start"] + timedelta(days=3)
    await set_tenant_scope(db_session, ctx["user_id"])
    row = await create_manual_planned(
        db_session,
        ctx["period_id"],
        PlannedCreate(
            kind="expense",
            amount_cents=500,
            description="x",
            category_id=ctx["cat_id"],
            planned_date=d,
        ),
        user_id=ctx["user_id"],
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    res = await post_planned_batch(
        db_session, [row.id], user_id=ctx["user_id"], tx_date=None
    )
    await db_session.commit()
    txn_id = res["posted"][0]
    txn = await db_session.scalar(
        select(ActualTransaction).where(ActualTransaction.id == txn_id)
    )
    assert txn.tx_date == d  # used the line's own planned_date
    _ = PlannedTransaction


@pytest.mark.asyncio
async def test_post_planned_batch_failed_line_keeps_others(
    db_session, ctx, monkeypatch
):
    """SAVEPOINT recovery: an IntegrityError on one line must not roll back
    rows already posted in the batch, must not drop the RLS scope for the
    following lines, and the posted/skipped response must match the DB."""
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    import app.services.actual as actual_svc
    from app.db.models import ActualTransaction, PlannedTransaction
    from app.db.session import set_tenant_scope
    from app.services.planned import post_planned_batch

    p1 = await _make_planned(db_session, ctx, kind="expense", amount=100)
    p2 = await _make_planned(
        db_session, ctx, kind="expense", amount=200, description="boom"
    )
    p3 = await _make_planned(db_session, ctx, kind="expense", amount=300)

    real_create = actual_svc.create_actual_v10

    async def failing_create(db, **kw):
        if kw.get("description") == "boom":
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return await real_create(db, **kw)

    monkeypatch.setattr(actual_svc, "create_actual_v10", failing_create)

    await set_tenant_scope(db_session, ctx["user_id"])
    res = await post_planned_batch(
        db_session, [p1, p2, p3], user_id=ctx["user_id"], tx_date=date.today()
    )
    await db_session.commit()

    assert res["skipped"] == [p2]
    assert len(res["posted"]) == 2

    # DB matches the response: p1/p3 bridged to the returned txn ids, p2 clean.
    db_session.expire_all()
    rows = {
        r.id: r
        for r in (
            await db_session.execute(
                select(PlannedTransaction).where(
                    PlannedTransaction.id.in_([p1, p2, p3])
                )
            )
        ).scalars()
    }
    assert rows[p1].posted_txn_id in res["posted"]
    assert rows[p3].posted_txn_id in res["posted"]
    assert rows[p2].posted_txn_id is None
    txn_count = len(
        (
            await db_session.execute(
                select(ActualTransaction.id).where(
                    ActualTransaction.id.in_(res["posted"])
                )
            )
        ).all()
    )
    assert txn_count == 2  # every returned txn id really exists


# ---------------------------------------------------------------------------
# compute_balance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_balance_per_period_limit_overrides_plan_cents(db_session, ctx):
    from sqlalchemy import select, update
    from app.db.models import Category, PeriodCategoryPlan
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance

    # Category.plan_cents = 100; period_category_plan limit = 999 (override).
    await set_tenant_scope(db_session, ctx["user_id"])
    await db_session.execute(
        update(Category).where(Category.id == ctx["cat_id"]).values(plan_cents=100)
    )
    db_session.add(
        PeriodCategoryPlan(
            user_id=ctx["user_id"],
            period_id=ctx["period_id"],
            category_id=ctx["cat_id"],
            limit_cents=999,
        )
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    row = next(r for r in bal["by_category"] if r["category_id"] == ctx["cat_id"])
    assert row["planned_cents"] == 999  # per-period overrides plan_cents
    _ = select, Category


@pytest.mark.asyncio
async def test_compute_balance_plan_cents_fallback(db_session, ctx):
    from sqlalchemy import update
    from app.db.models import Category
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance

    await set_tenant_scope(db_session, ctx["user_id"])
    await db_session.execute(
        update(Category).where(Category.id == ctx["cat_id"]).values(plan_cents=777)
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    row = next(r for r in bal["by_category"] if r["category_id"] == ctx["cat_id"])
    assert row["planned_cents"] == 777  # no pcp → fallback to plan_cents


# ---------------------------------------------------------------------------
# update_plan_month_atomic → period_category_plan sync (limits single-source)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plan_month_patch_updates_active_period_limit(db_session, ctx):
    """PATCH /plan-month after a rollover (pcp rows materialised) must update
    the active period's pcp row so compute_balance sees the NEW limit."""
    from sqlalchemy import select

    from app.db.models import PeriodCategoryPlan
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance
    from app.services.plan_month import update_plan_month_atomic

    # Simulate apply_template_to_period: pcp row with the old limit.
    await set_tenant_scope(db_session, ctx["user_id"])
    db_session.add(
        PeriodCategoryPlan(
            user_id=ctx["user_id"],
            period_id=ctx["period_id"],
            category_id=ctx["cat_id"],
            limit_cents=999,
        )
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    await update_plan_month_atomic(
        db_session, user_id=ctx["user_id"], plans=[(ctx["cat_id"], 555)]
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    row = next(r for r in bal["by_category"] if r["category_id"] == ctx["cat_id"])
    assert row["planned_cents"] == 555  # pcp updated, not the stale 999

    pcp = await db_session.scalar(
        select(PeriodCategoryPlan).where(
            PeriodCategoryPlan.period_id == ctx["period_id"],
            PeriodCategoryPlan.category_id == ctx["cat_id"],
        )
    )
    assert pcp.limit_cents == 555


@pytest.mark.asyncio
async def test_plan_month_patch_without_pcp_keeps_fallback(db_session, ctx):
    """No pcp rows for the period → PATCH must NOT create one (preserves
    apply_template idempotency); compute_balance falls back to plan_cents."""
    from sqlalchemy import func, select

    from app.db.models import PeriodCategoryPlan
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance
    from app.services.plan_month import update_plan_month_atomic

    await set_tenant_scope(db_session, ctx["user_id"])
    await update_plan_month_atomic(
        db_session, user_id=ctx["user_id"], plans=[(ctx["cat_id"], 444)]
    )
    await db_session.commit()

    pcp_count = await db_session.scalar(
        select(func.count())
        .select_from(PeriodCategoryPlan)
        .where(PeriodCategoryPlan.period_id == ctx["period_id"])
    )
    assert int(pcp_count or 0) == 0  # update-only: no row materialised

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    row = next(r for r in bal["by_category"] if r["category_id"] == ctx["cat_id"])
    assert row["planned_cents"] == 444  # per-category fallback serves the new value


@pytest.mark.asyncio
async def test_compute_balance_planned_unposted_excludes_subscription_and_posted(
    db_session, ctx
):
    from sqlalchemy import select
    from app.db.models import PlanSource, PlannedTransaction
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance
    from app.services.planned import post_planned

    # manual unposted = 1000, subscription_auto = 2000 (excluded), posted = 3000.
    m = await _make_planned(db_session, ctx, kind="expense", amount=1000)
    s = await _make_planned(db_session, ctx, kind="expense", amount=2000)
    p = await _make_planned(db_session, ctx, kind="expense", amount=3000)

    await set_tenant_scope(db_session, ctx["user_id"])
    srow = await db_session.scalar(
        select(PlannedTransaction).where(PlannedTransaction.id == s)
    )
    srow.source = PlanSource.subscription_auto
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    await post_planned(db_session, p, user_id=ctx["user_id"], tx_date=date.today())
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    row = next(r for r in bal["by_category"] if r["category_id"] == ctx["cat_id"])
    # Only the manual unposted line counts.
    assert row["planned_unposted_cents"] == 1000
    _ = m


@pytest.mark.asyncio
async def test_compute_balance_excludes_adjustment_from_ladder(db_session, ctx):
    from app.db.models import ActualSource
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance, create_actual_v10

    # Write an adjustment actual on the adjustment category.
    await set_tenant_scope(db_session, ctx["user_id"])
    await create_actual_v10(
        db_session,
        user_id=ctx["user_id"],
        kind="income",
        amount_cents=12345,
        description="Корректировка остатка",
        category_id=ctx["adj_cat_id"],
        tx_date=date.today(),
        source=ActualSource.mini_app,
        account_id=ctx["account_id"],
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    # adjustment category NOT in the ladder.
    assert all(r["category_id"] != ctx["adj_cat_id"] for r in bal["by_category"])
    # but balance_now reflects the adjustment.
    assert bal["balance_now_cents"] == 12345
    # ladder income total excludes the adjustment.
    assert bal["actual_total_income_cents"] == 0


# ---------------------------------------------------------------------------
# reconcile_balance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconcile_balance_sets_target(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.actual import compute_balance, reconcile_balance

    await set_tenant_scope(db_session, ctx["user_id"])
    txn = await reconcile_balance(
        db_session, user_id=ctx["user_id"], target_balance_cents=99_999
    )
    await db_session.commit()
    assert txn is not None

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    assert bal["balance_now_cents"] == 99_999


@pytest.mark.asyncio
async def test_reconcile_balance_noop_when_already_matching(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.actual import reconcile_balance

    await set_tenant_scope(db_session, ctx["user_id"])
    txn = await reconcile_balance(
        db_session, user_id=ctx["user_id"], target_balance_cents=0
    )
    await db_session.commit()
    assert txn is None  # balance already 0 → no adjustment


@pytest.mark.asyncio
async def test_reconcile_balance_reversible(db_session, ctx):
    from app.db.session import set_tenant_scope
    from app.services.actual import (
        compute_balance,
        delete_actual_v10,
        reconcile_balance,
    )

    await set_tenant_scope(db_session, ctx["user_id"])
    txn = await reconcile_balance(
        db_session, user_id=ctx["user_id"], target_balance_cents=5000
    )
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    await delete_actual_v10(db_session, txn.id, user_id=ctx["user_id"])
    await db_session.commit()

    await set_tenant_scope(db_session, ctx["user_id"])
    bal = await compute_balance(db_session, ctx["period_id"], user_id=ctx["user_id"])
    assert bal["balance_now_cents"] == 0  # back to original
