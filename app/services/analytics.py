"""Analytics service — aggregate SQL queries for Phase 8 (ANL-07, ANL-08).

All functions are read-only (no db.commit). Period resolution is done internally.
"""
from __future__ import annotations

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
    n: int,
) -> list[BudgetPeriod]:
    """Return up to N most recent budget_periods (active + closed), ordered DESC."""
    q = (
        select(BudgetPeriod)
        .where(BudgetPeriod.status.in_([PeriodStatus.active, PeriodStatus.closed]))
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
    range_: str,
) -> dict:
    """SUM expense and income by period for N periods, ordered by period_start ASC."""
    n = _range_to_n(range_)
    periods = await get_recent_periods(db, n=n)
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


async def get_top_overspend(
    db: AsyncSession,
    *,
    range_: str,
) -> dict:
    """Top-5 expense categories by overspend_pct = actual/planned*100, DESC."""
    n = _range_to_n(range_)
    periods = await get_recent_periods(db, n=n)
    if not periods:
        return {"items": []}

    period_ids = [p.id for p in periods]

    planned_q = (
        select(
            PlannedTransaction.category_id,
            func.sum(PlannedTransaction.amount_cents).label("planned_cents"),
        )
        .where(
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
            ActualTransaction.period_id.in_(period_ids),
            ActualTransaction.kind == CategoryKind.expense,
        )
        .group_by(ActualTransaction.category_id)
    )
    planned_rows = {r.category_id: r.planned_cents for r in (await db.execute(planned_q)).all()}
    actual_rows = {r.category_id: r.actual_cents for r in (await db.execute(actual_q)).all()}

    # Only categories that have both plan and actual
    category_ids = set(planned_rows.keys()) & set(actual_rows.keys())
    if not category_ids:
        return {"items": []}

    # Load category names
    cat_q = select(Category).where(Category.id.in_(category_ids))
    cats = {c.id: c for c in (await db.execute(cat_q)).scalars().all()}

    items = []
    for cat_id in category_ids:
        planned = planned_rows[cat_id]
        actual = actual_rows[cat_id]
        if planned <= 0:
            continue
        overspend_pct = (actual / planned) * 100.0
        items.append({
            "category_id": cat_id,
            "name": cats[cat_id].name if cat_id in cats else str(cat_id),
            "planned_cents": planned,
            "actual_cents": actual,
            "overspend_pct": round(overspend_pct, 2),
        })

    items.sort(key=lambda x: x["overspend_pct"], reverse=True)
    return {"items": items[:5]}


async def get_top_categories(
    db: AsyncSession,
    *,
    range_: str,
) -> dict:
    """Top-5 expense categories by total actual_cents DESC."""
    n = _range_to_n(range_)
    periods = await get_recent_periods(db, n=n)
    if not periods:
        return {"items": []}

    period_ids = [p.id for p in periods]

    actual_q = (
        select(
            ActualTransaction.category_id,
            func.sum(ActualTransaction.amount_cents).label("actual_cents"),
        )
        .where(
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
    cat_q = select(Category).where(Category.id.in_(top_cat_ids))
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
) -> dict:
    """Forecast end-of-period balance using daily burn rate.

    Algorithm:
      daily_rate = actual_expense_cents / max(days_elapsed, 1)
      will_burn_cents = remaining_days * daily_rate
      projected_end_balance_cents = current_balance_cents - will_burn_cents

    Edge case days_elapsed=0: return insufficient_data=True.
    """
    from app.services.periods import _today_in_app_tz

    today = _today_in_app_tz()

    # Find active period
    active_q = select(BudgetPeriod).where(BudgetPeriod.status == PeriodStatus.active)
    active_period = (await db.execute(active_q)).scalar_one_or_none()
    if active_period is None:
        return {
            "insufficient_data": True,
            "current_balance_cents": 0,
            "projected_end_balance_cents": None,
            "will_burn_cents": None,
            "period_end": None,
        }

    days_elapsed = (today - active_period.period_start).days
    remaining_days = (active_period.period_end - today).days

    # Total actual expense and income this period
    expense_q = (
        select(func.sum(ActualTransaction.amount_cents))
        .where(
            ActualTransaction.period_id == active_period.id,
            ActualTransaction.kind == CategoryKind.expense,
        )
    )
    income_q = (
        select(func.sum(ActualTransaction.amount_cents))
        .where(
            ActualTransaction.period_id == active_period.id,
            ActualTransaction.kind == CategoryKind.income,
        )
    )
    total_expense = (await db.execute(expense_q)).scalar_one_or_none() or 0
    total_income = (await db.execute(income_q)).scalar_one_or_none() or 0
    current_balance_cents = total_income - total_expense

    if days_elapsed == 0:
        return {
            "insufficient_data": True,
            "current_balance_cents": current_balance_cents,
            "projected_end_balance_cents": None,
            "will_burn_cents": None,
            "period_end": active_period.period_end.isoformat(),
        }

    daily_rate = total_expense / days_elapsed
    will_burn_cents = int(remaining_days * daily_rate)
    projected_end_balance_cents = current_balance_cents - will_burn_cents

    return {
        "insufficient_data": False,
        "current_balance_cents": current_balance_cents,
        "projected_end_balance_cents": projected_end_balance_cents,
        "will_burn_cents": will_burn_cents,
        "period_end": active_period.period_end.isoformat(),
    }
