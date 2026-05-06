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

        # Факт-расходы. NB: SUM(BIGINT) в Postgres возвращает NUMERIC,
        # asyncpg маршалит в Decimal — приводим к int здесь, чтобы tool
        # result был JSON-сериализуем без Decimal handler.
        q_exp = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.expense,
        )
        actual_expense_cents = int((await db.execute(q_exp)).scalar() or 0)

        # Факт-доходы
        q_inc = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.income,
        )
        actual_income_cents = int((await db.execute(q_inc)).scalar() or 0)

        # Плановые расходы
        q_plan = select(func.sum(PlannedTransaction.amount_cents)).where(
            PlannedTransaction.period_id == period.id,
            PlannedTransaction.kind == CategoryKind.expense,
        )
        planned_expense_cents = int((await db.execute(q_plan)).scalar() or 0)

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
            r.category_id: int(r.total or 0)
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
            r.category_id: int(r.total or 0)
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

        # Факт-расходы за период (см. примечание в get_period_balance —
        # SUM(BIGINT) → Decimal → приводим к int).
        q_exp = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.expense,
        )
        actual_expense_cents = int((await db.execute(q_exp)).scalar() or 0)

        # Факт-доходы за период
        q_inc = select(func.sum(ActualTransaction.amount_cents)).where(
            ActualTransaction.period_id == period.id,
            ActualTransaction.kind == CategoryKind.income,
        )
        actual_income_cents = int((await db.execute(q_inc)).scalar() or 0)

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


# ---------- Proposal tools (write intent, no DB writes) ----------
#
# These tools never touch the DB. They translate a natural-language
# user intent ("занеси трату 500₽ в пятёрочке") into a structured
# proposal payload that the route layer surfaces to the frontend
# via a dedicated SSE 'propose' event. The user then reviews/edits
# the prefilled form and confirms via the standard REST endpoints
# (POST /actual or /planned). The AI never silently commits data —
# user approval is the contract.


async def _resolve_category(
    db: AsyncSession,
    description: str,
) -> tuple[int | None, str | None, float]:
    """Best-effort fuzzy category resolution via embeddings.

    Resolves the category from the user-provided description ONLY —
    not from any hint the LLM might invent. gpt-4.1-nano frequently
    hallucinates a wrong category name (e.g. 'Здоровье' for 'Кофе на
    работе') because category names appear in the system prompt and
    bleed through attention. Letting the model influence the embedding
    query poisoned the resolver. The form falls back to an empty
    select if confidence is below threshold — user picks manually.
    """
    from app.ai.embedding_service import get_embedding_service

    query = (description or "").strip()
    if not query:
        return None, None, 0.0
    try:
        svc = get_embedding_service()
        res = await svc.suggest_category(db, query)
    except Exception:
        return None, None, 0.0
    if not res:
        return None, None, 0.0
    return res["category_id"], res["name"], float(res["confidence"])


async def propose_actual_transaction(
    db: AsyncSession,
    *,
    amount_rub: float,
    kind: str = "expense",
    description: str = "",
    tx_date: str | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    """Tool: подготовить факт-транзакцию для подтверждения пользователем.

    Не пишет в БД. Возвращает proposal-объект; роут эмитит SSE
    'propose'-событие, фронт открывает bottom-sheet с pre-filled полями.
    Дополнительные kwargs (например устаревший category_hint от старого
    schema) игнорируются.
    """
    from datetime import date as date_type

    try:
        amount_cents = int(round(float(amount_rub) * 100))
    except (TypeError, ValueError):
        return {"error": "Не удалось распознать сумму"}

    if kind not in ("expense", "income"):
        kind = "expense"

    cat_id, cat_name, cat_conf = await _resolve_category(db, description)

    today = date_type.today()
    if not tx_date:
        parsed_date = today
    else:
        # Modèle gpt-4.1-nano нередко передаёт человеческие "сегодня" / "вчера"
        # вместо ISO. Берём fallback — иначе backend POST /actual упадёт
        # на parsing'е даты, и пользователь увидит сломанную форму.
        lowered = tx_date.strip().lower()
        if lowered in ("сегодня", "today"):
            parsed_date = today
        elif lowered in ("вчера", "yesterday"):
            parsed_date = today - __import__("datetime").timedelta(days=1)
        else:
            try:
                parsed_date = date_type.fromisoformat(tx_date)
            except ValueError:
                parsed_date = today
    tx_date = parsed_date.isoformat()

    return {
        "_proposal": True,
        "kind_of": "actual",
        "txn": {
            "amount_cents": amount_cents,
            "kind": kind,
            "description": description or category_hint or "",
            "category_id": cat_id,
            "category_name": cat_name,
            "category_confidence": round(cat_conf, 3),
            "tx_date": tx_date,
        },
    }


async def propose_planned_transaction(
    db: AsyncSession,
    *,
    amount_rub: float,
    kind: str = "expense",
    description: str = "",
    day_of_period: int | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    """Tool: подготовить плановую транзакцию для подтверждения пользователем."""
    try:
        amount_cents = int(round(float(amount_rub) * 100))
    except (TypeError, ValueError):
        return {"error": "Не удалось распознать сумму"}

    if kind not in ("expense", "income"):
        kind = "expense"

    cat_id, cat_name, cat_conf = await _resolve_category(db, description)

    if day_of_period is not None:
        try:
            day_of_period = int(day_of_period)
            if day_of_period < 1 or day_of_period > 31:
                day_of_period = None
        except (TypeError, ValueError):
            day_of_period = None

    return {
        "_proposal": True,
        "kind_of": "planned",
        "txn": {
            "amount_cents": amount_cents,
            "kind": kind,
            "description": description or category_hint or "",
            "category_id": cat_id,
            "category_name": cat_name,
            "category_confidence": round(cat_conf, 3),
            "day_of_period": day_of_period,
        },
    }


# OpenAI function-calling schema for the 4 budget tools (AI-05).
# Descriptions kept in English: Cyrillic tokenizes ~2.3× more tokens
# in gpt-4.1-nano. Phase 10.1 cost optimization. The model still
# answers the user in Russian per the system prompt instruction.
TOOLS_SCHEMA: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_period_balance",
            "description": "Active period balance: plan, actual, delta.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_summary",
            "description": "Per-category budget summary (plan/actual/remaining).",
            "parameters": {
                "type": "object",
                "properties": {
                    "category_id": {
                        "type": "integer",
                        "description": "Single category id; omit for all.",
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
            "description": "List actual transactions with optional kind/category filter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max rows (cap 50).",
                        "default": 10,
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["expense", "income"],
                        "description": "Filter by kind.",
                    },
                    "category_id": {
                        "type": "integer",
                        "description": "Filter by category id.",
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
            "description": "End-of-period balance forecast (linear extrapolation).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_actual_transaction",
            "description": (
                "Prepare an actual transaction for user confirmation when the user "
                "asks to log/add/record an expense or income (занеси/добавь/запиши "
                "трату или доход). Does NOT save — opens a prefilled form for the "
                "user to review and approve."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount_rub": {
                        "type": "number",
                        "description": "Amount in rubles (e.g. 500 for 500 ₽).",
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["expense", "income"],
                        "description": "expense (default) or income.",
                    },
                    "description": {
                        "type": "string",
                        "description": (
                            "Free-form description from the user "
                            "(e.g. 'Пятёрочка', 'обед в кафе'). The server "
                            "resolves the category from this string — "
                            "do NOT pass a category name yourself."
                        ),
                    },
                    "tx_date": {
                        "type": "string",
                        "description": (
                            "ISO date YYYY-MM-DD. Omit for today. "
                            "Use 'сегодня' = today, 'вчера' = today minus 1."
                        ),
                    },
                },
                "required": ["amount_rub"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_planned_transaction",
            "description": (
                "Prepare a PLANNED transaction (budget line item) for user "
                "confirmation when the user asks to add to the monthly plan "
                "(добавь в план / запланируй). Does NOT save — opens a prefilled "
                "form for review."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount_rub": {
                        "type": "number",
                        "description": "Amount in rubles.",
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["expense", "income"],
                        "description": "expense (default) or income.",
                    },
                    "description": {
                        "type": "string",
                        "description": (
                            "Free-form description (e.g. 'абонемент в зал'). "
                            "Server resolves the category from this string — "
                            "do NOT pass a category name yourself."
                        ),
                    },
                    "day_of_period": {
                        "type": "integer",
                        "description": "Day-of-month 1..31 the line falls on. Omit if unspecified.",
                    },
                },
                "required": ["amount_rub"],
            },
        },
    },
]

# Маппинг имя tool -> функция для вызова в route handler
TOOL_FUNCTIONS = {
    "get_period_balance": get_period_balance,
    "get_category_summary": get_category_summary,
    "query_transactions": query_transactions,
    "get_forecast": get_forecast,
    "propose_actual_transaction": propose_actual_transaction,
    "propose_planned_transaction": propose_planned_transaction,
}
