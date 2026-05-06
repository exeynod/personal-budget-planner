"""Analytics service — aggregate SQL queries for Phase 8 (ANL-07, ANL-08).

All functions are read-only (no db.commit). Period resolution is done internally.

Phase 11 (Plan 11-06, MUL-03): each public function takes ``user_id: int``
keyword-only and scopes BudgetPeriod / PlannedTransaction / ActualTransaction /
Category queries по user_id. RLS — defense-in-depth.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActualTransaction,
    BudgetPeriod,
    Category,
    CategoryKind,
    PeriodStatus,
    PlannedTransaction,
)


async def get_recent_periods(
    db: AsyncSession,
    *,
    user_id: int,
    n: int,
) -> list[BudgetPeriod]:
    """Return up to N most recent budget_periods (active + closed) for user_id, ordered DESC."""
    q = (
        select(BudgetPeriod)
        .where(
            BudgetPeriod.user_id == user_id,
            BudgetPeriod.status.in_([PeriodStatus.active, PeriodStatus.closed]),
        )
        .order_by(BudgetPeriod.period_start.desc())
        .limit(n)
    )
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


def _range_to_n(range_: str) -> int:
    """Map range string to number of periods."""
    mapping = {"1M": 1, "3M": 3, "6M": 6, "12M": 12}
    return mapping.get(range_, 1)


def _period_label(bp: BudgetPeriod) -> str:
    """Return short Russian month abbreviation for a budget period."""
    MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн",
              "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
    return MONTHS[bp.period_start.month - 1]


async def get_trend(
    db: AsyncSession,
    *,
    user_id: int,
    range_: str,
) -> dict:
    """SUM expense and income by period for N periods, ordered by period_start ASC.

    Phase 11: scoped по user_id (BudgetPeriod + ActualTransaction).

    Special case: range='1M' aggregates by tx_date within the active period
    so the chart still shows a meaningful daily trend (one period = one point
    is useless visually).
    """
    if range_ == "1M":
        return await _get_trend_daily(db, user_id=user_id)

    n = _range_to_n(range_)
    periods = await get_recent_periods(db, user_id=user_id, n=n)
    if not periods:
        return {"points": []}

    period_ids = [p.id for p in periods]
    period_map = {p.id: p for p in periods}

    expense_q = (
        select(
            ActualTransaction.period_id,
            func.sum(ActualTransaction.amount_cents).label("total_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id.in_(period_ids),
            ActualTransaction.kind == CategoryKind.expense,
        )
        .group_by(ActualTransaction.period_id)
    )
    income_q = (
        select(
            ActualTransaction.period_id,
            func.sum(ActualTransaction.amount_cents).label("total_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id.in_(period_ids),
            ActualTransaction.kind == CategoryKind.income,
        )
        .group_by(ActualTransaction.period_id)
    )
    expense_rows = {r.period_id: r.total_cents for r in (await db.execute(expense_q)).all()}
    income_rows = {r.period_id: r.total_cents for r in (await db.execute(income_q)).all()}

    # Order ASC (oldest first) for chart left-to-right
    sorted_periods = sorted(periods, key=lambda p: p.period_start)
    points = [
        {
            "period_label": _period_label(period_map[p.id]),
            "expense_cents": expense_rows.get(p.id, 0),
            "income_cents": income_rows.get(p.id, 0),
        }
        for p in sorted_periods
    ]
    return {"points": points}


async def _get_trend_daily(db: AsyncSession, *, user_id: int) -> dict:
    """Daily aggregation across the active period (range='1M').

    Phase 11: scoped по user_id.

    Returns one point per day from period_start to period_end with cumulative
    or per-day totals — here per-day, since the chart visualises trend.
    Empty days are omitted (chart smoothly connects existing points).
    """
    periods = await get_recent_periods(db, user_id=user_id, n=1)
    if not periods:
        return {"points": []}
    period = periods[0]

    expense_q = (
        select(
            ActualTransaction.tx_date,
            func.sum(ActualTransaction.amount_cents).label("total_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.expense,
        )
        .group_by(ActualTransaction.tx_date)
    )
    income_q = (
        select(
            ActualTransaction.tx_date,
            func.sum(ActualTransaction.amount_cents).label("total_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.income,
        )
        .group_by(ActualTransaction.tx_date)
    )
    exp = {r.tx_date: r.total_cents for r in (await db.execute(expense_q)).all()}
    inc = {r.tx_date: r.total_cents for r in (await db.execute(income_q)).all()}

    # Fill every day from period_start to min(period_end, today) so the chart
    # always renders a continuous trend (single-tx periods would otherwise
    # collapse to one point and look broken).
    today = date.today()
    end = min(period.period_end, today) if period.period_end >= period.period_start else period.period_start
    days = (end - period.period_start).days + 1
    all_dates = [period.period_start + timedelta(days=i) for i in range(max(days, 1))]
    points = [
        {
            "period_label": str(d.day),
            "expense_cents": exp.get(d, 0),
            "income_cents": inc.get(d, 0),
        }
        for d in all_dates
    ]
    return {"points": points}


async def get_top_overspend(
    db: AsyncSession,
    *,
    user_id: int,
    range_: str,
) -> dict:
    """Top-5 expense categories by overspend_pct = actual/planned*100, DESC.

    Phase 11: все запросы scoped по user_id.
    """
    n = _range_to_n(range_)
    periods = await get_recent_periods(db, user_id=user_id, n=n)
    if not periods:
        return {"items": []}

    period_ids = [p.id for p in periods]

    planned_q = (
        select(
            PlannedTransaction.category_id,
            func.sum(PlannedTransaction.amount_cents).label("planned_cents"),
        )
        .where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id.in_(period_ids),
            PlannedTransaction.kind == CategoryKind.expense,
        )
        .group_by(PlannedTransaction.category_id)
    )
    actual_q = (
        select(
            ActualTransaction.category_id,
            func.sum(ActualTransaction.amount_cents).label("actual_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id.in_(period_ids),
            ActualTransaction.kind == CategoryKind.expense,
        )
        .group_by(ActualTransaction.category_id)
    )
    planned_rows = {r.category_id: r.planned_cents for r in (await db.execute(planned_q)).all()}
    actual_rows = {r.category_id: r.actual_cents for r in (await db.execute(actual_q)).all()}

    # Все категории с фактом-расходом > 0 — включая unplanned (план = 0).
    # Категории, у которых only plan but no actual, не интересны как «перерасход».
    category_ids = set(actual_rows.keys())
    if not category_ids:
        return {"items": []}

    # Load category names — scoped по user_id для consistency (cross-tenant id из
    # actual_rows не должен сюда попадать, но defense-in-depth).
    cat_q = select(Category).where(
        Category.user_id == user_id,
        Category.id.in_(category_ids),
    )
    cats = {c.id: c for c in (await db.execute(cat_q)).scalars().all()}

    items = []
    for cat_id in category_ids:
        actual = int(actual_rows[cat_id] or 0)
        planned = int(planned_rows.get(cat_id, 0) or 0)
        if actual <= 0:
            continue
        if planned > 0:
            overspend_pct = round(float(actual) / float(planned) * 100.0, 2)
            sort_key = overspend_pct
        else:
            # Unplanned: фронт показывает «Без плана» вместо процента.
            overspend_pct = None
            sort_key = float('inf')  # выводить unplanned первыми
        items.append({
            "category_id": cat_id,
            "name": cats[cat_id].name if cat_id in cats else str(cat_id),
            "planned_cents": planned,
            "actual_cents": actual,
            "overspend_pct": overspend_pct,
            "_sort": sort_key,
        })

    # Сортировка по фиктивному ключу _sort (inf для unplanned), убывание
    items.sort(key=lambda x: x["_sort"], reverse=True)
    # Оставляем только overspend (>=100%) и unplanned, до 5 штук
    items = [it for it in items if it["overspend_pct"] is None or it["overspend_pct"] > 100.0]
    for it in items:
        it.pop("_sort", None)
    return {"items": items[:5]}


async def get_top_categories(
    db: AsyncSession,
    *,
    user_id: int,
    range_: str,
) -> dict:
    """Top-5 expense categories by total actual_cents DESC.

    Phase 11: все запросы scoped по user_id.
    """
    n = _range_to_n(range_)
    periods = await get_recent_periods(db, user_id=user_id, n=n)
    if not periods:
        return {"items": []}

    period_ids = [p.id for p in periods]

    actual_q = (
        select(
            ActualTransaction.category_id,
            func.sum(ActualTransaction.amount_cents).label("actual_cents"),
        )
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.period_id.in_(period_ids),
            ActualTransaction.kind == CategoryKind.expense,
        )
        .group_by(ActualTransaction.category_id)
        .order_by(func.sum(ActualTransaction.amount_cents).desc())
        .limit(5)
    )
    planned_q = (
        select(
            PlannedTransaction.category_id,
            func.sum(PlannedTransaction.amount_cents).label("planned_cents"),
        )
        .where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id.in_(period_ids),
            PlannedTransaction.kind == CategoryKind.expense,
        )
        .group_by(PlannedTransaction.category_id)
    )
    actual_rows = (await db.execute(actual_q)).all()
    planned_rows = {r.category_id: r.planned_cents for r in (await db.execute(planned_q)).all()}

    if not actual_rows:
        return {"items": []}

    top_cat_ids = [r.category_id for r in actual_rows]
    cat_q = select(Category).where(
        Category.user_id == user_id,
        Category.id.in_(top_cat_ids),
    )
    cats = {c.id: c for c in (await db.execute(cat_q)).scalars().all()}

    items = [
        {
            "category_id": r.category_id,
            "name": cats[r.category_id].name if r.category_id in cats else str(r.category_id),
            "actual_cents": r.actual_cents,
            "planned_cents": planned_rows.get(r.category_id, 0),
        }
        for r in actual_rows
    ]
    return {"items": items}


async def get_forecast(
    db: AsyncSession,
    *,
    user_id: int,
    range_: str = "1M",
) -> dict:
    """Polymorphic analytics top-card.

    Phase 11: все запросы scoped по user_id.

    range='1M'  → forecast active period via plan:
                  projected = starting_balance + planned_income − planned_expense
    range>=3M   → cashflow over N CLOSED periods (active period excluded).
    """
    if range_ == "1M":
        return await _get_forecast_active(db, user_id=user_id)
    return await _get_cashflow(db, user_id=user_id, n=_range_to_n(range_))


async def _get_forecast_active(db: AsyncSession, *, user_id: int) -> dict:
    active_q = select(BudgetPeriod).where(
        BudgetPeriod.user_id == user_id,
        BudgetPeriod.status == PeriodStatus.active,
    )
    active = (await db.execute(active_q)).scalar_one_or_none()
    if active is None:
        return {"mode": "empty"}

    income_q = select(func.coalesce(func.sum(PlannedTransaction.amount_cents), 0)).where(
        PlannedTransaction.user_id == user_id,
        PlannedTransaction.period_id == active.id,
        PlannedTransaction.kind == CategoryKind.income,
    )
    expense_q = select(func.coalesce(func.sum(PlannedTransaction.amount_cents), 0)).where(
        PlannedTransaction.user_id == user_id,
        PlannedTransaction.period_id == active.id,
        PlannedTransaction.kind == CategoryKind.expense,
    )
    planned_income = int((await db.execute(income_q)).scalar_one() or 0)
    planned_expense = int((await db.execute(expense_q)).scalar_one() or 0)

    projected = active.starting_balance_cents + planned_income - planned_expense

    return {
        "mode": "forecast",
        "starting_balance_cents": active.starting_balance_cents,
        "planned_income_cents": planned_income,
        "planned_expense_cents": planned_expense,
        "projected_end_balance_cents": projected,
        "period_end": active.period_end.isoformat(),
    }


async def _get_cashflow(db: AsyncSession, *, user_id: int, n: int) -> dict:
    """Sum of (income − expense) per closed period over the latest N closed periods."""
    closed_q = (
        select(BudgetPeriod)
        .where(
            BudgetPeriod.user_id == user_id,
            BudgetPeriod.status == PeriodStatus.closed,
        )
        .order_by(BudgetPeriod.period_start.desc())
        .limit(n)
    )
    closed = list((await db.execute(closed_q)).scalars().all())
    if not closed:
        return {"mode": "empty", "requested_periods": n, "periods_count": 0}

    period_ids = [p.id for p in closed]
    income_q = select(
        ActualTransaction.period_id,
        func.coalesce(func.sum(ActualTransaction.amount_cents), 0).label("total"),
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.period_id.in_(period_ids),
        ActualTransaction.kind == CategoryKind.income,
    ).group_by(ActualTransaction.period_id)
    expense_q = select(
        ActualTransaction.period_id,
        func.coalesce(func.sum(ActualTransaction.amount_cents), 0).label("total"),
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.period_id.in_(period_ids),
        ActualTransaction.kind == CategoryKind.expense,
    ).group_by(ActualTransaction.period_id)

    inc = {r.period_id: int(r.total) for r in (await db.execute(income_q)).all()}
    exp = {r.period_id: int(r.total) for r in (await db.execute(expense_q)).all()}

    total_net = sum(inc.get(pid, 0) - exp.get(pid, 0) for pid in period_ids)
    count = len(closed)
    avg = total_net // count if count else 0

    return {
        "mode": "cashflow",
        "total_net_cents": total_net,
        "monthly_avg_cents": avg,
        "periods_count": count,
        "requested_periods": n,
    }
