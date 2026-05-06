"""Actual transactions CRUD + balance aggregation + period resolution + bot helpers.

Service layer is pure (no FastAPI imports per D-56). Route layer (Plan 04-03)
maps domain exceptions to HTTP status codes.

Contents:
- ActualNotFoundError, FutureDateError — new domain exceptions.
- list_actual_for_period, get_or_404, create_actual, update_actual, delete_actual — CRUD.
- compute_balance — per-category aggregation + totals (D-46 / D-60).
- actuals_for_today — today's transactions in Europe/Moscow TZ.
- find_categories_by_query — ILIKE substring match (D-51).
- _resolve_period_for_date — lookup-or-create BudgetPeriod (D-52).
- _check_future_date — tx_date <= today + 7 days guard (D-58).
- _ensure_category_active — category exists + not archived (re-uses cat_svc).

Source semantics (D-53):
- ActualSource.mini_app: route POST /api/v1/actual sets this.
- ActualSource.bot: route POST /api/v1/internal/bot/actual sets this.
- Route determines source; service accepts it as explicit kwarg.

D-52: if no BudgetPeriod covers tx_date, one is auto-created (status=closed for
historical, status=active if today falls within). This keeps user from being
blocked when entering retroactive transactions.

D-58: tx_date > today + 7 days raises FutureDateError (400). Past dates OK.

D-02 sign rule in compute_balance:
- expense delta = plan - act  (positive = under-budget = good)
- income  delta = act - plan  (positive = above-target = good)

Cross-import: reuses PeriodNotFoundError, InvalidCategoryError, KindMismatchError
from app.services.planned.

Phase 11 (Plan 11-06, MUL-03): every public function takes ``user_id: int``
keyword-only and scopes its queries / inserts по ``ActualTransaction.user_id``,
``BudgetPeriod.user_id``, ``Category.user_id``. RLS (``SET LOCAL
app.current_user_id``) — defense-in-depth; app-side filtering — primary defense.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.actual import ActualUpdate
from app.core.period import period_for
from app.db.models import (
    ActualSource,
    ActualTransaction,
    AppUser,
    BudgetPeriod,
    Category,
    CategoryKind,
    PeriodStatus,
    PlannedTransaction,
)
from app.services import categories as cat_svc
from app.services.planned import (
    InvalidCategoryError,
    KindMismatchError,
    PeriodNotFoundError,
)
from app.services.periods import _today_in_app_tz


# ---------- Domain exceptions ----------


class ActualNotFoundError(Exception):
    """Raised when an actual transaction lookup by id returns no row (ACT-01/ACT-05 → 404)."""

    def __init__(self, actual_id: int) -> None:
        self.actual_id = actual_id
        super().__init__(f"Actual transaction {actual_id} not found")


class FutureDateError(Exception):
    """Raised when tx_date exceeds today + 7 days (D-58 future-date guard → 400)."""

    def __init__(self, tx_date: date, max_date: date) -> None:
        self.tx_date = tx_date
        self.max_date = max_date
        super().__init__(
            f"tx_date {tx_date} is in the future (max allowed: {max_date})"
        )


# ---------- Private helpers ----------


def _check_future_date(tx_date: date) -> None:
    """Guard against far-future dates (D-58).

    Allows up to 7 days ahead of today (Europe/Moscow) to accommodate slight
    timezone offsets and deliberate near-future scheduling.
    """
    today = _today_in_app_tz()
    max_date = today + timedelta(days=7)
    if tx_date > max_date:
        raise FutureDateError(tx_date, max_date)


async def _get_cycle_start_day(db: AsyncSession, *, user_id: int) -> int:
    """Resolve cycle_start_day for the given app_user.id with fallback to model default (5).

    Phase 11: reads AppUser.cycle_start_day напрямую через PK (user_id).
    Не используем app.services.settings.get_cycle_start_day, который ожидает
    tg_user_id (Plan 11-05 решил оставить settings.py untouched, так как он
    оперирует только AppUser-таблицей; см. 11-05 SUMMARY).

    Fallback to 5 if AppUser not yet created (edge case на fresh deploy —
    при normal flow get_current_user_id уже отбросит запрос с 403).
    """
    cycle = await db.scalar(
        select(AppUser.cycle_start_day).where(AppUser.id == user_id)
    )
    if cycle is None:
        return 5  # model default (AppUser.cycle_start_day = 5)
    return cycle


async def _ensure_category_active(
    db: AsyncSession, category_id: int, *, user_id: int
) -> Category:
    """Validate category exists, is_archived=False, and belongs to user_id (D-36 / D-58).

    Raises:
        CategoryNotFoundError: category does not exist OR belongs to other tenant (→ 404).
        InvalidCategoryError: category is archived (→ 400).
    """
    cat = await cat_svc.get_or_404(db, category_id, user_id=user_id)
    if cat.is_archived:
        raise InvalidCategoryError(category_id, "Cannot use archived category")
    return cat


async def _resolve_period_for_date(
    db: AsyncSession,
    tx_date: date,
    *,
    cycle_start_day: int,
    user_id: int,
) -> int:
    """Lookup or create BudgetPeriod containing tx_date scoped by user_id (D-52).

    Algorithm:
        1. SELECT id FROM budget_period WHERE user_id = :uid AND
           period_start <= tx_date <= period_end ORDER BY period_start DESC LIMIT 1.
        2. If found — return id.
        3. Else: compute (period_start, period_end) = period_for(tx_date, cycle_start_day).
           Insert BudgetPeriod(user_id=user_id, ...) with status=active if today
           within bounds, else closed (closed_at=NULL because this period was never user-closed).
           Return new id.

    Note: auto-creation may produce "shadow" periods for historical dates without
    planned transactions. Phase 5 worker normalizes these (D-52 trade-off).
    """
    stmt = (
        select(BudgetPeriod.id)
        .where(
            BudgetPeriod.user_id == user_id,
            BudgetPeriod.period_start <= tx_date,
            BudgetPeriod.period_end >= tx_date,
        )
        .order_by(BudgetPeriod.period_start.desc())
        .limit(1)
    )
    existing = await db.scalar(stmt)
    if existing is not None:
        return existing

    p_start, p_end = period_for(tx_date, cycle_start_day)
    today = _today_in_app_tz()
    status = (
        PeriodStatus.active if p_start <= today <= p_end else PeriodStatus.closed
    )
    period = BudgetPeriod(
        user_id=user_id,
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=0,  # unknown for retroactive periods
        ending_balance_cents=None,
        status=status,
    )
    try:
        db.add(period)
        await db.flush()
        return period.id
    except IntegrityError:
        # Concurrent request won the race — re-fetch the existing period.
        await db.rollback()
        existing = await db.scalar(
            select(BudgetPeriod.id).where(
                BudgetPeriod.user_id == user_id,
                BudgetPeriod.period_start <= tx_date,
                BudgetPeriod.period_end >= tx_date,
            )
        )
        return existing  # type: ignore[return-value]


# ---------- CRUD ----------


async def list_actual_for_period(
    db: AsyncSession,
    period_id: int,
    *,
    user_id: int,
    kind: Optional[str] = None,
    category_id: Optional[int] = None,
) -> list[ActualTransaction]:
    """List actual transactions for a period, optionally filtered by kind/category.

    Phase 11: scoped by ``ActualTransaction.user_id == user_id``. Returns empty
    list if period has no actuals OR period belongs to a different tenant
    (does not validate period existence — RLS + filter make cross-tenant
    period_id безопасным: 0 rows, no leak).

    Order: tx_date DESC, id DESC — freshest entries first.
    """
    stmt = select(ActualTransaction).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.period_id == period_id,
    )
    if kind is not None:
        stmt = stmt.where(ActualTransaction.kind == CategoryKind(kind))
    if category_id is not None:
        stmt = stmt.where(ActualTransaction.category_id == category_id)
    stmt = stmt.order_by(ActualTransaction.tx_date.desc(), ActualTransaction.id.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_or_404(
    db: AsyncSession, actual_id: int, *, user_id: int
) -> ActualTransaction:
    """Fetch an actual transaction or raise ActualNotFoundError (→ 404).

    Phase 11: scoped by user_id — cross-tenant id обращения дают 404, не 200
    с чужими данными.
    """
    stmt = select(ActualTransaction).where(
        ActualTransaction.id == actual_id,
        ActualTransaction.user_id == user_id,
    )
    row = await db.scalar(stmt)
    if row is None:
        raise ActualNotFoundError(actual_id)
    return row


async def create_actual(
    db: AsyncSession,
    *,
    user_id: int,
    kind: str,
    amount_cents: int,
    description: Optional[str],
    category_id: int,
    tx_date: date,
    source: ActualSource,
) -> ActualTransaction:
    """Create an actual transaction with automatic period resolution.

    Validation order:
        1. category active (scoped by user_id) → CategoryNotFoundError / InvalidCategoryError.
        2. kind matches category.kind → KindMismatchError.
        3. tx_date <= today + 7 days → FutureDateError.
        4. period_id resolved via _resolve_period_for_date (D-52, scoped by user_id).
        5. INSERT (with user_id) + flush + refresh.

    Args:
        user_id: app_user.id (PK) — owner of the new ActualTransaction row.
        source: must be ActualSource.mini_app or ActualSource.bot.
                Route layer is responsible for setting the correct source (D-53).
    """
    cat = await _ensure_category_active(db, category_id, user_id=user_id)
    if cat.kind.value != kind:
        raise KindMismatchError(kind, cat.kind.value)
    _check_future_date(tx_date)
    cycle_start_day = await _get_cycle_start_day(db, user_id=user_id)
    period_id = await _resolve_period_for_date(
        db, tx_date, cycle_start_day=cycle_start_day, user_id=user_id
    )

    row = ActualTransaction(
        user_id=user_id,
        period_id=period_id,
        kind=CategoryKind(kind),
        amount_cents=amount_cents,
        description=description,
        category_id=category_id,
        tx_date=tx_date,
        source=source,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_actual(
    db: AsyncSession,
    actual_id: int,
    patch: ActualUpdate,
    *,
    user_id: int,
) -> ActualTransaction:
    """Partial update of an actual transaction.

    Phase 11: row + новый category lookup + period re-resolve все scoped по user_id.

    Category/kind consistency is validated if either field changes.
    period_id is recomputed ONLY when tx_date is in the patch AND differs
    from the current value (ACT-05, D-52).
    """
    row = await get_or_404(db, actual_id, user_id=user_id)
    data = patch.model_dump(exclude_unset=True)

    # Category change validation: ensure new category active + kind compatibility
    # + same tenant (cat_svc.get_or_404 scoped by user_id).
    new_cat: Optional[Category] = None
    if "category_id" in data and data["category_id"] != row.category_id:
        new_cat = await _ensure_category_active(db, data["category_id"], user_id=user_id)

    effective_kind = data.get(
        "kind", row.kind.value if isinstance(row.kind, CategoryKind) else row.kind
    )
    effective_cat_id = data.get("category_id", row.category_id)

    if "kind" in data or "category_id" in data:
        if new_cat is None:
            new_cat = await cat_svc.get_or_404(db, effective_cat_id, user_id=user_id)
        if new_cat.kind.value != effective_kind:
            raise KindMismatchError(effective_kind, new_cat.kind.value)

    # period_id recompute when tx_date changes (ACT-05, D-52).
    if "tx_date" in data and data["tx_date"] != row.tx_date:
        _check_future_date(data["tx_date"])
        cycle_start_day = await _get_cycle_start_day(db, user_id=user_id)
        new_period_id = await _resolve_period_for_date(
            db, data["tx_date"], cycle_start_day=cycle_start_day, user_id=user_id
        )
        row.period_id = new_period_id

    for field, value in data.items():
        if field == "kind":
            setattr(row, field, CategoryKind(value))
        else:
            setattr(row, field, value)

    await db.flush()
    await db.refresh(row)
    return row


async def delete_actual(
    db: AsyncSession, actual_id: int, *, user_id: int
) -> ActualTransaction:
    """Hard delete an actual transaction (CLAUDE.md: soft delete only for Category).

    Phase 11: scoped by user_id — cross-tenant id обращения дают 404.

    Returns the deleted row for response serialization.
    """
    row = await get_or_404(db, actual_id, user_id=user_id)
    await db.delete(row)
    await db.flush()
    return row


# ---------- Balance aggregation ----------


async def compute_balance(
    db: AsyncSession, period_id: int, *, user_id: int
) -> dict:
    """Aggregate planned/actual per category + totals for a budget period.

    Phase 11: BudgetPeriod / PlannedTransaction / ActualTransaction / Category
    queries scoped по user_id. period_id from cross-tenant вернёт PeriodNotFoundError.

    D-02 sign rule:
        expense delta = plan - act  (positive = under-budget = good)
        income  delta = act - plan  (positive = above-target = good)

    balance_now_cents = starting_balance_cents + actual_income - actual_expense.
    delta_total_cents = (plan_exp - act_exp) + (act_inc - plan_inc).

    Archived categories:
        - Excluded from by_category list (filter is_archived=False).
        - Their transactions ARE included in totals (accounting honesty, D-CONTEXT).

    Returns:
        dict with keys: period_id, period_start, period_end, starting_balance_cents,
        planned_total_expense_cents, actual_total_expense_cents,
        planned_total_income_cents, actual_total_income_cents,
        balance_now_cents, delta_total_cents,
        by_category: [{category_id, name, kind, planned_cents, actual_cents, delta_cents}]

    Raises:
        PeriodNotFoundError: if BudgetPeriod with given id does not exist
            (or belongs to different tenant — same effect).
    """
    period = await db.scalar(
        select(BudgetPeriod).where(
            BudgetPeriod.id == period_id,
            BudgetPeriod.user_id == user_id,
        )
    )
    if period is None:
        raise PeriodNotFoundError(period_id)

    # Aggregate planned by (category_id, kind), scoped by user_id.
    planned_q = (
        select(
            PlannedTransaction.category_id,
            PlannedTransaction.kind,
            func.sum(PlannedTransaction.amount_cents).label("planned_cents"),
        )
        .where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id == period_id,
        )
        .group_by(PlannedTransaction.category_id, PlannedTransaction.kind)
    )
    # Aggregate actual by (category_id, kind), scoped by user_id.
    actual_q = (
        select(
            ActualTransaction.category_id,
            ActualTransaction.kind,
            func.sum(ActualTransaction.amount_cents).label("actual_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id == period_id,
        )
        .group_by(ActualTransaction.category_id, ActualTransaction.kind)
    )
    # Active categories only for by_category display (scoped by user_id).
    cats_q = select(Category).where(
        Category.user_id == user_id,
        Category.is_archived.is_(False),
    )

    planned_rows = (await db.execute(planned_q)).all()
    actual_rows = (await db.execute(actual_q)).all()
    cats = {c.id: c for c in (await db.execute(cats_q)).scalars().all()}

    planned_map: dict[tuple, int] = {
        (r.category_id, r.kind): r.planned_cents for r in planned_rows
    }
    actual_map: dict[tuple, int] = {
        (r.category_id, r.kind): r.actual_cents for r in actual_rows
    }

    by_category: list[dict] = []
    seen_keys = set(planned_map) | set(actual_map)
    for (cat_id, kind) in seen_keys:
        cat = cats.get(cat_id)
        if cat is None:
            continue  # archived — exclude from per-category list
        plan = planned_map.get((cat_id, kind), 0) or 0
        act = actual_map.get((cat_id, kind), 0) or 0
        # D-02 sign rule
        if kind == CategoryKind.expense:
            delta = plan - act
        else:
            delta = act - plan
        by_category.append(
            {
                "category_id": cat_id,
                "name": cat.name,
                "kind": kind.value,
                "planned_cents": plan,
                "actual_cents": act,
                "delta_cents": delta,
            }
        )

    # Totals include all transactions (including archived categories) for honesty.
    plan_exp = sum(
        p for (_, k), p in planned_map.items() if k == CategoryKind.expense
    )
    act_exp = sum(
        a for (_, k), a in actual_map.items() if k == CategoryKind.expense
    )
    plan_inc = sum(
        p for (_, k), p in planned_map.items() if k == CategoryKind.income
    )
    act_inc = sum(
        a for (_, k), a in actual_map.items() if k == CategoryKind.income
    )

    balance_now = period.starting_balance_cents + act_inc - act_exp
    delta_total = (plan_exp - act_exp) + (act_inc - plan_inc)

    return {
        "period_id": period.id,
        "period_start": period.period_start,
        "period_end": period.period_end,
        "starting_balance_cents": period.starting_balance_cents,
        "planned_total_expense_cents": plan_exp,
        "actual_total_expense_cents": act_exp,
        "planned_total_income_cents": plan_inc,
        "actual_total_income_cents": act_inc,
        "balance_now_cents": balance_now,
        "delta_total_cents": delta_total,
        "by_category": by_category,
    }


# ---------- Bot helpers ----------


async def actuals_for_today(
    db: AsyncSession, *, user_id: int
) -> list[ActualTransaction]:
    """Return today's actual transactions (Europe/Moscow TZ), freshest first.

    Phase 11: scoped по user_id. Used by format_today_for_bot and GET /today helpers.
    """
    today = _today_in_app_tz()
    stmt = (
        select(ActualTransaction)
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.tx_date == today,
        )
        .order_by(ActualTransaction.id.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_categories_by_query(
    db: AsyncSession, query: str, *, user_id: int, limit: int = 10
) -> list[Category]:
    """ILIKE substring search among active categories (D-51), scoped by user_id.

    Args:
        query: search string; empty string returns [].
        user_id: tenant scope; only this user's categories считаются.
        limit: max results (default 10; Telegram inline keyboard fits ~8 rows).

    Returns:
        Categories matching '%query%', is_archived=False, ordered alphabetically,
        принадлежащие user_id.
    """
    if not query.strip():
        return []
    stmt = (
        select(Category)
        .where(
            Category.user_id == user_id,
            Category.is_archived.is_(False),
            Category.name.ilike(f"%{query.strip()}%"),
        )
        .order_by(Category.name)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
