"""Orchestration service for /api/v1/internal/bot/* endpoints (D-46, D-57).

Pure service layer (no FastAPI imports). Route layer (Plan 04-03) maps
domain exceptions to HTTP status codes.

Three public functions:
- process_bot_actual: dispatches category_query/category_id → created/ambiguous/not_found.
- format_balance_for_bot: wraps compute_balance for the active period (bot /balance).
- format_today_for_bot: wraps actuals_for_today with nested category names (bot /today).

Cross-imports:
- actual.create_actual, actual.compute_balance, actual.actuals_for_today,
  actual.find_categories_by_query.
- categories.get_or_404 (explicit category_id path).
- periods.get_current_active_period (for format_balance_for_bot).

D-46 disambiguation flow:
    category_id provided  → get_or_404 + archived check → candidates = [cat]
    category_query        → find_categories_by_query → candidates
    0 candidates  → {status: not_found}
    >1 candidates → {status: ambiguous, candidates: [...]}
    1 candidate   → create_actual → compute category balance → {status: created}

Phase 11 (Plan 11-06): bot endpoints используют X-Internal-Token, не Telegram
initData. ``get_db_with_tenant_scope`` (route-level) недоступен — service сам
резолвит ``user_id`` из ``tg_user_id`` через AppUser lookup и ставит
``set_tenant_scope`` на текущей session ПЕРЕД доменными запросами.

UserNotFoundForBot raises if AppUser row не найдена для данного tg_user_id —
route → 404 (для bot client это маркер "юзер не зарегистрирован, нужен /start").
"""
from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.actual import ActualRead
from app.db.models import (
    ActualSource,
    ActualTransaction,
    AppUser,
    Category,
    CategoryKind,
    PlannedTransaction,
)
from app.db.session import set_tenant_scope
from app.services import actual as actual_svc
from app.services import categories as cat_svc
from app.services import periods as periods_svc
from app.services.planned import InvalidCategoryError, PeriodNotFoundError
from app.services.periods import _today_in_app_tz


class UserNotFoundForBot(Exception):
    """Raised when bot endpoint receives tg_user_id с которым нет AppUser строки.

    Phase 11: bot не может resolve tenant scope — route mapper → 404 (или 403).
    Сценарий: user открыл бота до Mini App, app_user ещё не создан. До Phase 12
    решается «через /start», в Phase 12 — onboarding flow.
    """

    def __init__(self, tg_user_id: int) -> None:
        self.tg_user_id = tg_user_id
        super().__init__(f"AppUser not found for tg_user_id={tg_user_id}")


async def _resolve_user_id_and_set_scope(
    db: AsyncSession, tg_user_id: int
) -> int:
    """Резолвит user_id (PK) из tg_user_id и устанавливает tenant scope.

    Bot-pathway equivalent of FastAPI ``get_db_with_tenant_scope`` dep:
    bot endpoints получают X-Internal-Token, не initData, поэтому
    SET LOCAL делается ВНУТРИ service (Plan 11-06 contract).

    Raises:
        UserNotFoundForBot: если в app_user нет строки с заданным tg_user_id.
    """
    user_id = await db.scalar(
        select(AppUser.id).where(AppUser.tg_user_id == tg_user_id)
    )
    if user_id is None:
        raise UserNotFoundForBot(tg_user_id)
    await set_tenant_scope(db, user_id)
    return user_id


async def _category_balance(
    db: AsyncSession,
    period_id: int,
    category_id: int,
    kind: str,
    *,
    user_id: int,
) -> int:
    """Compute remaining balance for a specific category in a period.

    Phase 11: scoped по user_id.

    D-02 sign rule:
        expense: plan - act  (positive = under-budget)
        income:  act - plan  (positive = above-target)
    """
    planned_q = select(
        func.coalesce(func.sum(PlannedTransaction.amount_cents), 0)
    ).where(
        PlannedTransaction.user_id == user_id,
        PlannedTransaction.period_id == period_id,
        PlannedTransaction.category_id == category_id,
        PlannedTransaction.kind == CategoryKind(kind),
    )
    actual_q = select(
        func.coalesce(func.sum(ActualTransaction.amount_cents), 0)
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.period_id == period_id,
        ActualTransaction.category_id == category_id,
        ActualTransaction.kind == CategoryKind(kind),
    )

    plan_cents: int = (await db.scalar(planned_q)) or 0
    act_cents: int = (await db.scalar(actual_q)) or 0

    if kind == "expense":
        return plan_cents - act_cents
    else:
        return act_cents - plan_cents


async def process_bot_actual(
    db: AsyncSession,
    *,
    tg_user_id: int,
    kind: str,
    amount_cents: int,
    category_query: Optional[str] = None,
    category_id: Optional[int] = None,
    description: Optional[str] = None,
    tx_date: Optional[date] = None,
) -> dict:
    """Dispatch a bot /add or /income command into actual transaction creation.

    Phase 11: резолвит user_id из tg_user_id и ставит tenant scope; все
    downstream queries фильтруются по user_id.

    Returns a dict matching BotActualResponse shape. Route layer constructs
    the Pydantic model from this dict.

    Args:
        tg_user_id: telegram user id; service резолвит app_user.id.
        kind: 'expense' | 'income'.
        amount_cents: positive integer (kopecks), validated upstream by Pydantic.
        category_query: fuzzy search string (mutually exclusive with category_id).
        category_id: explicit id (bypasses disambiguation, D-46).
        description: optional freeform text.
        tx_date: defaults to today in Europe/Moscow if None.

    Returns:
        {"status": "created", "actual": dict, "category": dict,
         "category_balance_cents": int, "candidates": None}
        or
        {"status": "ambiguous", "candidates": [{id, name, kind}, ...]}
        or
        {"status": "not_found", "candidates": []}

    Raises:
        UserNotFoundForBot: AppUser не найден для tg_user_id (route → 404).
        CategoryNotFoundError: explicit category_id not found (route → 404).
        InvalidCategoryError: explicit category_id is archived (route → 400).
        KindMismatchError: kind != category.kind for the 1-candidate branch (route → 400).
        FutureDateError: tx_date > today + 7 days (route → 400).
        PeriodNotFoundError: period auto-create failed (route → 404, very rare).
    """
    user_id = await _resolve_user_id_and_set_scope(db, tg_user_id)

    # Step 1: resolve candidates (scoped по user_id).
    if category_id is not None:
        # Explicit ID — bypass disambiguation; still validate active.
        cat = await cat_svc.get_or_404(db, category_id, user_id=user_id)
        if cat.is_archived:
            raise InvalidCategoryError(category_id, "Cannot use archived category")
        candidates = [cat]
    else:
        # Fuzzy search.
        candidates = await actual_svc.find_categories_by_query(
            db, category_query or "", user_id=user_id
        )

    # Step 2: branch by candidate count.
    if len(candidates) == 0:
        return {"status": "not_found", "candidates": []}

    if len(candidates) > 1:
        return {
            "status": "ambiguous",
            "candidates": [
                {"id": c.id, "name": c.name, "kind": c.kind.value}
                for c in candidates
            ],
        }

    # Step 3: single candidate — create actual.
    cat = candidates[0]
    resolved_tx_date = tx_date or _today_in_app_tz()

    actual_row = await actual_svc.create_actual(
        db,
        user_id=user_id,
        kind=kind,
        amount_cents=amount_cents,
        description=description,
        category_id=cat.id,
        tx_date=resolved_tx_date,
        source=ActualSource.bot,
    )

    # Step 4: compute category-specific balance for the reply message.
    balance_after = await _category_balance(
        db, actual_row.period_id, cat.id, kind, user_id=user_id
    )

    # Step 5: return created response.
    return {
        "status": "created",
        "actual": ActualRead.model_validate(actual_row).model_dump(),
        "category": {"id": cat.id, "name": cat.name, "kind": cat.kind.value},
        "category_balance_cents": balance_after,
        "candidates": None,
    }


async def format_balance_for_bot(db: AsyncSession, *, tg_user_id: int) -> dict:
    """Compute balance for the active budget period in bot-friendly format.

    Phase 11: резолвит user_id из tg_user_id, ставит tenant scope, и compute_balance
    отрабатывает на per-user данных.

    Returns dict matching BotBalanceResponse (omits starting_balance_cents).

    Raises:
        UserNotFoundForBot: AppUser не найден (route → 404).
        PeriodNotFoundError: no active period exists (route → 404).
    """
    user_id = await _resolve_user_id_and_set_scope(db, tg_user_id)

    period = await periods_svc.get_current_active_period(db, user_id=user_id)
    if period is None:
        raise PeriodNotFoundError(0)  # sentinel: "no active period"

    bal = await actual_svc.compute_balance(db, period.id, user_id=user_id)

    return {
        "period_id": bal["period_id"],
        "period_start": bal["period_start"],
        "period_end": bal["period_end"],
        "balance_now_cents": bal["balance_now_cents"],
        "delta_total_cents": bal["delta_total_cents"],
        "planned_total_expense_cents": bal["planned_total_expense_cents"],
        "actual_total_expense_cents": bal["actual_total_expense_cents"],
        "planned_total_income_cents": bal["planned_total_income_cents"],
        "actual_total_income_cents": bal["actual_total_income_cents"],
        "by_category": bal["by_category"],
    }


async def format_today_for_bot(db: AsyncSession, *, tg_user_id: int) -> dict:
    """Return today's actual transactions with nested category names.

    Phase 11: резолвит user_id из tg_user_id и scope'ит запросы.

    Returns dict matching BotTodayResponse:
        {
            "actuals": [{id, kind, amount_cents, description, category_id, category_name}],
            "total_expense_cents": int,
            "total_income_cents": int,
        }

    Raises:
        UserNotFoundForBot: AppUser не найден (route → 404).
    """
    user_id = await _resolve_user_id_and_set_scope(db, tg_user_id)

    rows = await actual_svc.actuals_for_today(db, user_id=user_id)

    # Bulk-fetch category names via IN query to avoid N+1, scoped по user_id.
    cat_ids = list({r.category_id for r in rows})
    cats: dict[int, Category] = {}
    if cat_ids:
        cats_result = await db.execute(
            select(Category).where(
                Category.user_id == user_id,
                Category.id.in_(cat_ids),
            )
        )
        cats = {c.id: c for c in cats_result.scalars().all()}

    actuals_out = []
    for r in rows:
        cat = cats.get(r.category_id)
        actuals_out.append(
            {
                "id": r.id,
                "kind": r.kind.value,
                "amount_cents": r.amount_cents,
                "description": r.description,
                "category_id": r.category_id,
                "category_name": cat.name if cat else "(archived)",
            }
        )

    total_expense = sum(
        r.amount_cents for r in rows if r.kind == CategoryKind.expense
    )
    total_income = sum(
        r.amount_cents for r in rows if r.kind == CategoryKind.income
    )

    return {
        "actuals": actuals_out,
        "total_expense_cents": total_expense,
        "total_income_cents": total_income,
    }
