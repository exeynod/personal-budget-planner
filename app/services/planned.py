"""Planned transactions CRUD + apply-template (PLN-01, PLN-02, PLN-03, TPL-04).

Service layer raises domain exceptions; route layer (Plan 03-03) maps them
to HTTP status codes. No FastAPI imports here per Phase 2 success criterion
"Service layer is pure: no FastAPI imports".

Source semantics:
- ``manual``: created via POST /periods/{id}/planned (this service).
- ``template``: created by ``apply_template_to_period`` (D-31 idempotent).
- ``subscription_auto``: created by Phase 6 worker; THIS SERVICE refuses
  to mutate or delete such rows (D-37 / SubscriptionPlannedReadOnlyError).

Idempotency contract for apply_template_to_period (D-31):
- If ANY planned row with ``source=template`` already exists for the period,
  return existing rows without creating new ones (``created=0``). This means
  Phase 5 worker can safely call this endpoint on every period creation.

Phase 11 (Plan 11-05, MUL-03): every public function takes ``user_id: int``
keyword-only and scopes its queries / inserts by ``user_id``. Cross-tenant
ID access yields ``PlannedNotFoundError``/``PeriodNotFoundError`` → 404
(T-11-05-05). Apply-template propagates ``user_id`` into every new
PlannedTransaction row (T-11-05-04).
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas.planned import PlannedCreate, PlannedUpdate
from app.db.models import (
    BudgetPeriod,
    Category,
    CategoryKind,
    PlannedTransaction,
    PlanSource,
    PlanTemplateItem,
)
from app.services import categories as cat_svc


# ---------- Domain exceptions ----------


class PlannedNotFoundError(Exception):
    """Raised when a planned-transaction lookup by id returns no row.

    Phase 11: also raised when row exists but ``user_id`` does not match the
    caller — same 404 (T-11-05-05).
    """

    def __init__(self, planned_id: int) -> None:
        self.planned_id = planned_id
        super().__init__(f"Planned transaction {planned_id} not found")


class PeriodNotFoundError(Exception):
    """Raised when a budget period lookup by id returns no row.

    Defined here (not in periods.py) because Phase 3 services
    (templates.py, planned.py) need a shared exception for period-by-id
    validation in apply-template / snapshot-from-period flows. Phase 2
    periods service uses a different pattern (`get_current_active_period`
    returns Optional, no by-id lookup).

    Phase 11: also raised when period exists but belongs to another tenant.
    """

    def __init__(self, period_id: int) -> None:
        self.period_id = period_id
        super().__init__(f"Budget period {period_id} not found")


class InvalidCategoryError(Exception):
    """Raised when a category exists but cannot be used (e.g. archived).

    Distinct from CategoryNotFoundError: that means "no such id" (404),
    while this means "id valid but state forbids usage" (400).
    """

    def __init__(self, category_id: int, reason: str) -> None:
        self.category_id = category_id
        self.reason = reason
        super().__init__(f"Category {category_id}: {reason}")


class KindMismatchError(Exception):
    """Raised when plan kind disagrees with category kind (D-36)."""

    def __init__(self, plan_kind: str, category_kind: str) -> None:
        self.plan_kind = plan_kind
        self.category_kind = category_kind
        super().__init__(
            f"Plan kind '{plan_kind}' does not match category kind '{category_kind}'"
        )


class SubscriptionPlannedReadOnlyError(Exception):
    """Raised when a write attempted on a planned row managed by a subscription (D-37)."""

    def __init__(self, planned_id: int) -> None:
        self.planned_id = planned_id
        super().__init__(
            f"Planned transaction {planned_id} is managed by a subscription "
            "and cannot be modified directly"
        )


# ---------- Helpers ----------


def _clamp_planned_date(
    period: BudgetPeriod, day_of_period: Optional[int]
) -> Optional[date]:
    """Map a template day_of_period to an actual date inside the period bounds.

    Algorithm:
        candidate = period.period_start + (day_of_period - 1)
        if candidate > period.period_end: clamp to period.period_end
        if day_of_period is None: return None
    """
    if day_of_period is None:
        return None
    candidate = period.period_start + timedelta(days=day_of_period - 1)
    if candidate > period.period_end:
        return period.period_end
    return candidate


async def _ensure_category_active(
    db: AsyncSession, category_id: int, *, user_id: int
) -> Category:
    """Validate category exists, belongs to ``user_id`` and is_archived=False (D-36).

    Raises:
        CategoryNotFoundError (from cat_svc): category does not exist OR belongs
            to another tenant (→ 404).
        InvalidCategoryError: category exists but is_archived=True (→ 400).
    """
    cat = await cat_svc.get_or_404(db, category_id, user_id=user_id)
    if cat.is_archived:
        raise InvalidCategoryError(category_id, "Cannot use archived category")
    return cat


async def _get_period_or_404(
    db: AsyncSession, period_id: int, *, user_id: int
) -> BudgetPeriod:
    """Fetch period scoped by ``user_id`` or raise PeriodNotFoundError."""
    result = await db.execute(
        select(BudgetPeriod).where(
            BudgetPeriod.id == period_id,
            BudgetPeriod.user_id == user_id,
        )
    )
    period = result.scalar_one_or_none()
    if period is None:
        raise PeriodNotFoundError(period_id)
    return period


async def get_or_404(
    db: AsyncSession, planned_id: int, *, user_id: int
) -> PlannedTransaction:
    """Fetch a planned row scoped by ``user_id`` or raise ``PlannedNotFoundError``."""
    result = await db.execute(
        select(PlannedTransaction).where(
            PlannedTransaction.id == planned_id,
            PlannedTransaction.user_id == user_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise PlannedNotFoundError(planned_id)
    return row


# ---------- CRUD ----------


async def list_planned_for_period(
    db: AsyncSession,
    period_id: int,
    *,
    user_id: int,
    kind: Optional[str] = None,
    category_id: Optional[int] = None,
) -> list[PlannedTransaction]:
    """List planned rows for a period, optionally filtered by kind/category.

    Note: does NOT raise PeriodNotFoundError if period is missing — returns
    an empty list. Caller (route) validates period existence separately if
    needed (typical pattern: GET /periods/current → if 404 then no list).

    Order: (category_id, planned_date NULLS LAST, id) for stable UI grouping.

    Phase 11: scoped by ``user_id``; cross-tenant period_id yields empty list.
    """
    stmt = select(PlannedTransaction).where(
        PlannedTransaction.user_id == user_id,
        PlannedTransaction.period_id == period_id,
    )
    if kind is not None:
        stmt = stmt.where(PlannedTransaction.kind == CategoryKind(kind))
    if category_id is not None:
        stmt = stmt.where(PlannedTransaction.category_id == category_id)
    stmt = stmt.order_by(
        PlannedTransaction.category_id,
        PlannedTransaction.planned_date.is_(None),
        PlannedTransaction.planned_date,
        PlannedTransaction.id,
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_manual_planned(
    db: AsyncSession,
    period_id: int,
    body: PlannedCreate,
    *,
    user_id: int,
) -> PlannedTransaction:
    """Create a planned row with source=manual.

    Validation order:
        1. period exists and belongs to user → PeriodNotFoundError (404).
        2. category exists, belongs to user, and active → CategoryNotFoundError
           / InvalidCategoryError.
        3. body.kind matches category.kind → KindMismatchError (400).

    Phase 11: row inserted with ``user_id=user_id``.
    """
    await _get_period_or_404(db, period_id, user_id=user_id)
    cat = await _ensure_category_active(db, body.category_id, user_id=user_id)
    if cat.kind.value != body.kind:
        raise KindMismatchError(body.kind, cat.kind.value)

    row = PlannedTransaction(
        user_id=user_id,
        period_id=period_id,
        kind=CategoryKind(body.kind),
        amount_cents=body.amount_cents,
        description=body.description,
        category_id=body.category_id,
        planned_date=body.planned_date,
        source=PlanSource.manual,
        subscription_id=None,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_planned(
    db: AsyncSession,
    planned_id: int,
    patch: PlannedUpdate,
    *,
    user_id: int,
) -> PlannedTransaction:
    """Update a planned row. Rejects subscription_auto rows (D-37).

    If the patch changes ``category_id``, the new category is re-validated
    (must exist, belong to user, and not be archived). If the patch changes
    ``kind`` or ``category_id``, kind/category consistency is enforced
    against the effective (post-patch) state.
    """
    row = await get_or_404(db, planned_id, user_id=user_id)
    if row.source == PlanSource.subscription_auto:
        raise SubscriptionPlannedReadOnlyError(planned_id)

    data = patch.model_dump(exclude_unset=True)

    # If category changes, ensure new category is active.
    new_cat: Optional[Category] = None
    if "category_id" in data and data["category_id"] != row.category_id:
        new_cat = await _ensure_category_active(
            db, data["category_id"], user_id=user_id
        )

    # Determine effective kind / effective category for the consistency check.
    effective_kind = data.get(
        "kind", row.kind.value if isinstance(row.kind, CategoryKind) else row.kind
    )
    effective_cat_id = data.get("category_id", row.category_id)

    # If kind or category is being touched, we must ensure they agree.
    if "kind" in data or "category_id" in data:
        if new_cat is None:
            # category_id unchanged (or kind-only patch) — load current category.
            new_cat = await cat_svc.get_or_404(
                db, effective_cat_id, user_id=user_id
            )
        if new_cat.kind.value != effective_kind:
            raise KindMismatchError(effective_kind, new_cat.kind.value)

    for field, value in data.items():
        if field == "kind":
            setattr(row, field, CategoryKind(value))
        else:
            setattr(row, field, value)
    await db.flush()
    await db.refresh(row)
    return row


async def delete_planned(
    db: AsyncSession, planned_id: int, *, user_id: int
) -> PlannedTransaction:
    """Hard delete (CLAUDE.md: soft delete только для category). Rejects subscription_auto (D-37)."""
    row = await get_or_404(db, planned_id, user_id=user_id)
    if row.source == PlanSource.subscription_auto:
        raise SubscriptionPlannedReadOnlyError(planned_id)
    await db.delete(row)
    await db.flush()
    return row


# ---------- Apply template (TPL-04, PER-05) ----------


async def apply_template_to_period(
    db: AsyncSession, *, user_id: int, period_id: int
) -> dict:
    """D-31: idempotent apply-template — skip if any source='template' already exists.

    Returns ``{period_id, created, planned}``. ``created=0`` means no-op
    (existing template rows returned). Empty template returns
    ``created=0, planned=[]``.

    Phase 11 (T-11-05-04): period must belong to ``user_id``; template items
    are loaded scoped by ``user_id``; new PlannedTransaction rows are inserted
    with ``user_id=user_id`` so they cannot leak across tenants.

    Raises:
        PeriodNotFoundError: if period does not exist (or belongs to a
            different user — same 404, no existence leak).
    """
    period = await _get_period_or_404(db, period_id, user_id=user_id)

    # Idempotency check: any source='template' for this period (scoped to user)?
    existing_count = await db.scalar(
        select(func.count())
        .select_from(PlannedTransaction)
        .where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id == period_id,
            PlannedTransaction.source == PlanSource.template,
        )
    )
    existing_count = int(existing_count or 0)

    if existing_count > 0:
        result = await db.execute(
            select(PlannedTransaction)
            .where(
                PlannedTransaction.user_id == user_id,
                PlannedTransaction.period_id == period_id,
                PlannedTransaction.source == PlanSource.template,
            )
            .order_by(PlannedTransaction.id)
        )
        existing = list(result.scalars().all())
        return {"period_id": period_id, "created": 0, "planned": existing}

    # Load template items + their categories (eager-load for kind access).
    items_result = await db.execute(
        select(PlanTemplateItem)
        .where(PlanTemplateItem.user_id == user_id)
        .options(selectinload(PlanTemplateItem.category))
        .order_by(PlanTemplateItem.sort_order, PlanTemplateItem.id)
    )
    items = list(items_result.scalars().all())

    if not items:
        return {"period_id": period_id, "created": 0, "planned": []}

    new_rows = [
        PlannedTransaction(
            user_id=user_id,
            period_id=period_id,
            kind=item.category.kind,
            amount_cents=item.amount_cents,
            description=item.description,
            category_id=item.category_id,
            planned_date=_clamp_planned_date(period, item.day_of_period),
            source=PlanSource.template,
            subscription_id=None,
        )
        for item in items
    ]
    db.add_all(new_rows)
    await db.flush()
    for row in new_rows:
        await db.refresh(row)

    return {"period_id": period_id, "created": len(new_rows), "planned": new_rows}
