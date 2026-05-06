"""4 инструмента AI для доступа к данным бюджета (AI-05).

Каждая tool-функция:
- принимает db: AsyncSession (+ опциональные параметры)
- возвращает dict с данными или {"error": "сообщение"} при ошибке
- никогда не бросает исключение (AI объясняет пользователю через error dict)

Деньги: всегда BIGINT kopecks — никаких float/Decimal.
"""
from __future__ import annotations

from typing import Any

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


async def get_period_balance(db: AsyncSession) -> dict[str, Any]:
    """Tool: баланс (план/факт/дельта) активного периода (AI-05)."""
    try:
        q = select(BudgetPeriod).where(BudgetPeriod.status == PeriodStatus.active).limit(1)
        period = (await db.execute(q)).scalar_one_or_none()
        if period is None:
            return {"error": "Активный период не найден"}

        # Факт-расходы
        q_exp = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.expense,
        )
        actual_expense_cents = (await db.execute(q_exp)).scalar() or 0

        # Факт-доходы
        q_inc = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.income,
        )
        actual_income_cents = (await db.execute(q_inc)).scalar() or 0

        # Плановые расходы
        q_plan = select(func.sum(PlannedTransaction.amount_cents)).where(
            PlannedTransaction.period_id == period.id,
            PlannedTransaction.kind == CategoryKind.expense,
        )
        planned_expense_cents = (await db.execute(q_plan)).scalar() or 0

        balance_cents = period.starting_balance_cents + actual_income_cents - actual_expense_cents
        delta_cents = planned_expense_cents - actual_expense_cents  # положит. = хорошо

        return {
            "period_start": period.period_start.isoformat(),
            "period_end": period.period_end.isoformat(),
            "starting_balance_cents": period.starting_balance_cents,
            "actual_expense_cents": actual_expense_cents,
            "actual_income_cents": actual_income_cents,
            "planned_expense_cents": planned_expense_cents,
            "balance_cents": balance_cents,
            "expense_delta_cents": delta_cents,
        }
    except Exception as exc:
        return {"error": f"Ошибка получения баланса: {exc}"}


async def get_category_summary(
    db: AsyncSession, category_id: int | None = None
) -> dict[str, Any]:
    """Tool: сводка по категориям (план/факт/остаток) (AI-05)."""
    try:
        q = select(BudgetPeriod).where(BudgetPeriod.status == PeriodStatus.active).limit(1)
        period = (await db.execute(q)).scalar_one_or_none()
        if period is None:
            return {"error": "Активный период не найден"}

        # Получить категории
        cat_q = select(Category).where(Category.is_archived.is_(False))
        if category_id is not None:
            cat_q = cat_q.where(Category.id == category_id)
        categories = (await db.execute(cat_q)).scalars().all()

        if not categories:
            return {"categories": [], "period_start": period.period_start.isoformat()}

        cat_ids = [c.id for c in categories]

        # Агрегат факт по категории
        q_actual = (
            select(
                ActualTransaction.category_id,
                func.sum(ActualTransaction.amount_cents).label("total"),
            )
            .where(
                ActualTransaction.period_id == period.id,
                ActualTransaction.category_id.in_(cat_ids),
            )
            .group_by(ActualTransaction.category_id)
        )
        actual_by_cat = {
            r.category_id: r.total
            for r in (await db.execute(q_actual)).all()
        }

        # Агрегат план по категории
        q_plan = (
            select(
                PlannedTransaction.category_id,
                func.sum(PlannedTransaction.amount_cents).label("total"),
            )
            .where(
                PlannedTransaction.period_id == period.id,
                PlannedTransaction.category_id.in_(cat_ids),
            )
            .group_by(PlannedTransaction.category_id)
        )
        plan_by_cat = {
            r.category_id: r.total
            for r in (await db.execute(q_plan)).all()
        }

        result = []
        for cat in categories:
            actual = actual_by_cat.get(cat.id, 0) or 0
            plan = plan_by_cat.get(cat.id, 0) or 0
            # Дельта: расходы Plan-Fact, доходы Fact-Plan (положит. = хорошо)
            delta = (plan - actual) if cat.kind == CategoryKind.expense else (actual - plan)
            result.append({
                "id": cat.id,
                "name": cat.name,
                "kind": cat.kind.value,
                "planned_cents": plan,
                "actual_cents": actual,
                "delta_cents": delta,
            })

        return {
            "categories": result,
            "period_start": period.period_start.isoformat(),
            "period_end": period.period_end.isoformat(),
        }
    except Exception as exc:
        return {"error": f"Ошибка получения категорий: {exc}"}


async def query_transactions(
    db: AsyncSession,
    limit: int = 10,
    kind: str | None = None,
    category_id: int | None = None,
) -> dict[str, Any]:
    """Tool: список факт-транзакций с фильтрацией (AI-05)."""
    try:
        q = (
            select(
                ActualTransaction.id,
                ActualTransaction.amount_cents,
                ActualTransaction.kind,
                ActualTransaction.tx_date,
                ActualTransaction.description,
                Category.name.label("category_name"),
            )
            .join(Category, ActualTransaction.category_id == Category.id, isouter=True)
            .order_by(ActualTransaction.tx_date.desc())
            .limit(min(limit, 50))
        )
        if kind == "expense":
            q = q.where(ActualTransaction.kind == CategoryKind.expense)
        elif kind == "income":
            q = q.where(ActualTransaction.kind == CategoryKind.income)
        if category_id is not None:
            q = q.where(ActualTransaction.category_id == category_id)

        rows = (await db.execute(q)).all()
        transactions = [
            {
                "id": r.id,
                "amount_cents": r.amount_cents,
                "kind": r.kind.value,
                "date": r.tx_date.isoformat(),
                "description": r.description or "",
                "category": r.category_name or "—",
            }
            for r in rows
        ]
        return {"transactions": transactions, "count": len(transactions)}
    except Exception as exc:
        return {"error": f"Ошибка получения транзакций: {exc}"}


async def get_forecast(db: AsyncSession) -> dict[str, Any]:
    """Tool: прогноз остатка к концу периода (linear extrapolation) (AI-05)."""
    try:
        from datetime import date as date_type

        q = select(BudgetPeriod).where(BudgetPeriod.status == PeriodStatus.active).limit(1)
        period = (await db.execute(q)).scalar_one_or_none()
        if period is None:
            return {"error": "Активный период не найден"}

        today = date_type.today()
        period_start = period.period_start
        period_end = period.period_end
        total_days = (period_end - period_start).days + 1
        elapsed_days = max((today - period_start).days + 1, 1)
        remaining_days = max((period_end - today).days, 0)

        if elapsed_days < 3:
            return {
                "insufficient_data": True,
                "reason": "Период только начался — прогноз недоступен",
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
            }

        # Факт-расходы за период
        q_exp = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.expense,
        )
        actual_expense_cents = (await db.execute(q_exp)).scalar() or 0

        # Факт-доходы за период
        q_inc = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.income,
        )
        actual_income_cents = (await db.execute(q_inc)).scalar() or 0

        current_balance_cents = (
            period.starting_balance_cents + actual_income_cents - actual_expense_cents
        )

        daily_expense_rate = actual_expense_cents / elapsed_days
        forecasted_remaining_expense = int(daily_expense_rate * remaining_days)
        forecast_balance_cents = current_balance_cents - forecasted_remaining_expense

        return {
            "insufficient_data": False,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "current_balance_cents": current_balance_cents,
            "elapsed_days": elapsed_days,
            "remaining_days": remaining_days,
            "total_days": total_days,
            "daily_expense_rate_cents": int(daily_expense_rate),
            "forecast_balance_cents": forecast_balance_cents,
        }
    except Exception as exc:
        return {"error": f"Ошибка прогноза: {exc}"}


# OpenAI function calling schema для 4 инструментов (AI-05)
TOOLS_SCHEMA: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_period_balance",
            "description": "Получить баланс (план/факт/дельта) активного бюджетного периода",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_summary",
            "description": "Получить сводку по категориям бюджета (план/факт/остаток по каждой)",
            "parameters": {
                "type": "object",
                "properties": {
                    "category_id": {
                        "type": "integer",
                        "description": "ID конкретной категории. Без него — все категории.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_transactions",
            "description": "Получить список факт-транзакций с фильтрацией по типу и категории",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Максимальное количество транзакций (не более 50)",
                        "default": 10,
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["expense", "income"],
                        "description": "Тип транзакции: expense (расход) или income (доход)",
                    },
                    "category_id": {
                        "type": "integer",
                        "description": "Фильтр по ID категории",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecast",
            "description": "Получить прогноз остатка бюджета к концу текущего периода",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# Маппинг имя tool -> функция для вызова в route handler
TOOL_FUNCTIONS = {
    "get_period_balance": get_period_balance,
    "get_category_summary": get_category_summary,
    "query_transactions": query_transactions,
    "get_forecast": get_forecast,
}
