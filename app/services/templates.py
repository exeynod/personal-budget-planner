"""Plan template CRUD + snapshot-from-period (TPL-01, TPL-03).

Service layer is HTTP-framework-agnostic: raises domain exceptions
(``TemplateItemNotFoundError``, ``InvalidCategoryError``,
``PeriodNotFoundError``) which the route layer (Plan 03-03) maps to
HTTPException(404 / 400 / 404) respectively. No FastAPI imports here.

D-32: ``snapshot_from_period`` is a destructive overwrite that includes
``source IN ('template', 'manual')`` and **excludes** ``subscription_auto``,
so subscription rows do not pollute the user's template (they're already
added per-period by the Phase 6 worker job).

Cross-import note: ``InvalidCategoryError`` and ``PeriodNotFoundError``
live in ``app.services.planned`` (single source of truth). This module
imports them; ``planned.py`` MUST NOT import anything from this module
to avoid a circular dependency.

Phase 11 (Plan 11-05, MUL-03): every public function takes ``user_id: int``
keyword-only and filters PlanTemplateItem / PlannedTransaction queries by
``user_id``. New rows are inserted with ``user_id=user_id``.
"""
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.templates import TemplateItemCreate, TemplateItemUpdate
from app.db.models import (
    BudgetPeriod,
    Category,
    PlannedTransaction,
    PlanSource,
    PlanTemplateItem,
)
from app.services import categories as cat_svc
from app.services.planned import InvalidCategoryError, PeriodNotFoundError


class TemplateItemNotFoundError(Exception):
    """Raised when a template-item lookup by id returns no row.

    Phase 11: also raised when the row exists but belongs to another tenant
    (``PlanTemplateItem.user_id != user_id``), per T-11-05-05.
    """

    def __init__(self, item_id: int) -> None:
        self.item_id = item_id
        super().__init__(f"Template item {item_id} not found")


async def _ensure_category_active(
    db: AsyncSession, category_id: int, *, user_id: int
) -> Category:
    """Validate category exists, belongs to ``user_id`` and is_archived=False (D-36)."""
    cat = await cat_svc.get_or_404(db, category_id, user_id=user_id)
    if cat.is_archived:
        raise InvalidCategoryError(category_id, "Cannot use archived category")
    return cat


async def list_template_items(
    db: AsyncSession, *, user_id: int
) -> list[PlanTemplateItem]:
    """Return template items for ``user_id`` ordered by (category_id, sort_order, id)."""
    result = await db.execute(
        select(PlanTemplateItem)
        .where(PlanTemplateItem.user_id == user_id)
        .order_by(
            PlanTemplateItem.category_id,
            PlanTemplateItem.sort_order,
            PlanTemplateItem.id,
        )
    )
    return list(result.scalars().all())


async def get_or_404(
    db: AsyncSession, item_id: int, *, user_id: int
) -> PlanTemplateItem:
    """Fetch a template item or raise ``TemplateItemNotFoundError``.

    Phase 11: scoped — wrong-tenant ID also raises 404 (T-11-05-05).
    """
    result = await db.execute(
        select(PlanTemplateItem).where(
            PlanTemplateItem.id == item_id,
            PlanTemplateItem.user_id == user_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise TemplateItemNotFoundError(item_id)
    return item


async def create_template_item(
    db: AsyncSession, *, user_id: int, body: TemplateItemCreate
) -> PlanTemplateItem:
    """Create a new template item (TPL-01). Validates category active first."""
    await _ensure_category_active(db, body.category_id, user_id=user_id)
    item = PlanTemplateItem(
        user_id=user_id,
        category_id=body.category_id,
        amount_cents=body.amount_cents,
        description=body.description,
        day_of_period=body.day_of_period,
        sort_order=body.sort_order,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_template_item(
    db: AsyncSession,
    item_id: int,
    patch: TemplateItemUpdate,
    *,
    user_id: int,
) -> PlanTemplateItem:
    """Apply non-None fields. Re-validates category if category_id changes."""
    item = await get_or_404(db, item_id, user_id=user_id)
    data = patch.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"] != item.category_id:
        await _ensure_category_active(db, data["category_id"], user_id=user_id)
    for field, value in data.items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


async def delete_template_item(
    db: AsyncSession, item_id: int, *, user_id: int
) -> PlanTemplateItem:
    """Hard delete (CLAUDE.md: soft delete только для category)."""
    item = await get_or_404(db, item_id, user_id=user_id)
    await db.delete(item)
    await db.flush()
    return item  # detached instance — caller can serialize before commit


async def snapshot_from_period(
    db: AsyncSession, *, user_id: int, period_id: int
) -> dict:
    """D-32: destructive overwrite of PlanTemplate from a period's planned rows.

    Includes ``source IN ('template', 'manual')``; excludes
    ``subscription_auto`` so subscription rows do not pollute the template.

    Returns ``{template_items: [...], replaced: int}``.

    Phase 11: scoped — period must belong to ``user_id`` (else
    PeriodNotFoundError). Both prev_count and DELETE are scoped by user_id;
    only this user's template is replaced. New rows carry ``user_id``.

    Raises:
        PeriodNotFoundError: if period does not exist (or belongs to another
            user — same 404, no existence leak).
    """
    period_result = await db.execute(
        select(BudgetPeriod).where(
            BudgetPeriod.id == period_id,
            BudgetPeriod.user_id == user_id,
        )
    )
    period = period_result.scalar_one_or_none()
    if period is None:
        raise PeriodNotFoundError(period_id)

    # Count existing template rows for response metadata (replaced=N).
    prev_count = await db.scalar(
        select(func.count())
        .select_from(PlanTemplateItem)
        .where(PlanTemplateItem.user_id == user_id)
    )
    prev_count = int(prev_count or 0)

    # Select planned rows to copy (template + manual, NOT subscription_auto).
    result = await db.execute(
        select(PlannedTransaction)
        .where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id == period_id,
            PlannedTransaction.source.in_(
                [PlanSource.template, PlanSource.manual]
            ),
        )
        .order_by(
            PlannedTransaction.category_id,
            PlannedTransaction.planned_date.is_(None),
            PlannedTransaction.planned_date,
            PlannedTransaction.id,
        )
    )
    rows = list(result.scalars().all())

    # Destructive overwrite: DELETE this user's template items, then INSERT new.
    await db.execute(
        delete(PlanTemplateItem).where(PlanTemplateItem.user_id == user_id)
    )
    await db.flush()  # ensure DELETE happens before INSERT (avoid PK collisions)

    new_items: list[PlanTemplateItem] = []
    if rows:
        new_items = [
            PlanTemplateItem(
                user_id=user_id,
                category_id=row.category_id,
                amount_cents=row.amount_cents,
                description=row.description,
                day_of_period=row.planned_date.day if row.planned_date else None,
                sort_order=idx * 10,
            )
            for idx, row in enumerate(rows)
        ]
        db.add_all(new_items)
        await db.flush()
        for it in new_items:
            await db.refresh(it)

    return {"template_items": new_items, "replaced": prev_count}
