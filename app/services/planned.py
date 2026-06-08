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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.planned import PlannedCreate, PlannedUpdate
from app.db.models import (
    ActualKind,
    ActualSource,
    BudgetPeriod,
    Category,
    CategoryKind,
    PeriodCategoryPlan,
    PlannedTransaction,
    PlanSource,
    PlanTemplateItem,
    PlanTemplateLine,
)

# v1.1 (AGREED §B): apply_template_to_period materialises the plan template
# (plan_template_item → period_category_plan, plan_template_line → planned
# rows). The v1.0 no-op stub note below is historical context.
#
# Plan 22.13 cleanup: ``PlanTemplateItem`` was dropped in alembic 0013
# (CONTEXT D-02). The legacy ``apply_template_to_period`` is now a no-op that
# returns the existing template-sourced rows for idempotency, but never
# inserts new rows from a non-existent template table. The v1.0 plan source
# of truth is ``Category.plan_cents`` — Phase 23 will introduce a v1.0
# replacement endpoint if a "materialise plan into PlannedTransaction rows"
# operation is still needed.
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


class PlannedAlreadyPostedError(Exception):
    """Raised when ``post_planned`` runs on a row already posted (→ 409)."""

    def __init__(self, planned_id: int, posted_txn_id: int) -> None:
        self.planned_id = planned_id
        self.posted_txn_id = posted_txn_id
        super().__init__(
            f"Planned transaction {planned_id} is already posted (txn={posted_txn_id})"
        )


class PlannedNotPostedError(Exception):
    """Raised when ``unpost_planned`` runs on a not-yet-posted row (→ 404)."""

    def __init__(self, planned_id: int) -> None:
        self.planned_id = planned_id
        super().__init__(f"Planned transaction {planned_id} is not posted")


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
            new_cat = await cat_svc.get_or_404(db, effective_cat_id, user_id=user_id)
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
    """v1.1 apply-template: copy the plan template into a period (idempotent).

    Copies, scoped by ``user_id``:
      1. ``plan_template_item`` → ``period_category_plan`` (per-period limit).
      2. ``plan_template_line`` → ``planned_transaction(source=manual)`` with
         ``planned_date`` clamped from ``day_of_period``.

    Subscriptions are NOT touched here — close_period materialises them
    separately (different source; avoids double-counting, RESEARCH §4 G5).

    Idempotency: if a ``period_category_plan`` row already exists for the
    period, this is a no-op (``created=0``, existing planned rows returned).

    Returns ``{period_id, created, planned}``.

    Raises:
        PeriodNotFoundError: period missing or cross-tenant (same 404).
    """
    period = await _get_period_or_404(db, period_id, user_id=user_id)

    # Idempotency: any period_category_plan row for this period?
    pcp_exists = await db.scalar(
        select(func.count())
        .select_from(PeriodCategoryPlan)
        .where(
            PeriodCategoryPlan.user_id == user_id,
            PeriodCategoryPlan.period_id == period_id,
        )
    )
    if int(pcp_exists or 0) > 0:
        existing = (
            (
                await db.execute(
                    select(PlannedTransaction)
                    .where(
                        PlannedTransaction.user_id == user_id,
                        PlannedTransaction.period_id == period_id,
                        PlannedTransaction.source == PlanSource.manual,
                    )
                    .order_by(PlannedTransaction.id)
                )
            )
            .scalars()
            .all()
        )
        return {"period_id": period_id, "created": 0, "planned": list(existing)}

    # 1. Limits: plan_template_item → period_category_plan.
    items = (
        (
            await db.execute(
                select(PlanTemplateItem).where(PlanTemplateItem.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    template_item_ids = [item.category_id for item in items]
    for item in items:
        db.add(
            PeriodCategoryPlan(
                user_id=user_id,
                period_id=period_id,
                category_id=item.category_id,
                limit_cents=item.limit_cents,
            )
        )

    # Keep the global display/edit source (Category.plan_cents) in sync with
    # the applied template limit, so the Plan overview (which reads/writes
    # Category.plan_cents) reflects what was materialised into
    # period_category_plan after a rollover. Income categories are untouched.
    if template_item_ids:
        cats = (
            (
                await db.execute(
                    select(Category).where(
                        Category.user_id == user_id,
                        Category.id.in_(template_item_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
        limit_by_cat = {item.category_id: item.limit_cents for item in items}
        for cat in cats:
            if cat.kind == CategoryKind.income:
                continue
            cat.plan_cents = limit_by_cat[cat.id]

    # 2. Lines: plan_template_line → planned_transaction(source=manual).
    lines = (
        (
            await db.execute(
                select(PlanTemplateLine)
                .where(PlanTemplateLine.user_id == user_id)
                .order_by(PlanTemplateLine.id)
            )
        )
        .scalars()
        .all()
    )
    created_rows: list[PlannedTransaction] = []
    for line in lines:
        row = PlannedTransaction(
            user_id=user_id,
            period_id=period_id,
            kind=line.kind,
            amount_cents=line.amount_cents,
            description=line.title,
            category_id=line.category_id,
            planned_date=_clamp_planned_date(period, line.day_of_period),
            source=PlanSource.manual,
            subscription_id=None,
        )
        db.add(row)
        created_rows.append(row)

    await db.flush()
    for r in created_rows:
        await db.refresh(r)
    return {
        "period_id": period_id,
        "created": len(created_rows),
        "planned": created_rows,
    }


# ---------- Post / unpost planned → actual (v1.1, mirror post_subscription) ----------


async def post_planned(
    db: AsyncSession, planned_id: int, *, user_id: int, tx_date: date
) -> "PlannedTransaction":
    """Post a planned row into a real ``actual_transaction`` (AGREED §B.3).

    Mirrors ``post_subscription``: SELECT … FOR UPDATE serialises the
    post-race; idempotent (already-posted → 409). Sign by kind (expense
    negative, income positive). Account auto-resolved to the user's primary.

    Returns the created ``ActualTransaction``.

    Raises:
        PlannedNotFoundError: row missing / cross-tenant (→ 404).
        SubscriptionPlannedReadOnlyError: subscription_auto row (→ 400) — those
            are posted via the subscription /post endpoint.
        PlannedAlreadyPostedError: posted_txn_id already set (→ 409).
    """
    from app.services.accounts import get_primary_account
    from app.services.actual import create_actual_v10

    row = await db.scalar(
        select(PlannedTransaction)
        .where(
            PlannedTransaction.id == planned_id,
            PlannedTransaction.user_id == user_id,
        )
        .with_for_update()
    )
    if row is None:
        raise PlannedNotFoundError(planned_id)
    if row.source == PlanSource.subscription_auto:
        raise SubscriptionPlannedReadOnlyError(planned_id)
    if row.posted_txn_id is not None:
        raise PlannedAlreadyPostedError(planned_id, row.posted_txn_id)

    primary = await get_primary_account(db, user_id=user_id)
    account_id = primary.id if primary is not None else None

    kind_value = (
        row.kind.value if isinstance(row.kind, (ActualKind, CategoryKind)) else row.kind
    )
    if kind_value == "income":
        amount = abs(row.amount_cents)
    else:
        amount = -abs(row.amount_cents)

    parent, _child = await create_actual_v10(
        db,
        user_id=user_id,
        kind=kind_value,
        amount_cents=amount,
        description=row.description or "План",
        category_id=row.category_id,
        tx_date=tx_date,
        source=ActualSource.mini_app,
        account_id=account_id,
    )
    row.posted_txn_id = parent.id
    try:
        await db.flush()
    except IntegrityError as exc:
        # Belt-and-braces: partial unique uq_planned_posted_txn_id.
        await db.rollback()
        raise PlannedAlreadyPostedError(planned_id, parent.id) from exc
    return parent


async def unpost_planned(db: AsyncSession, planned_id: int, *, user_id: int) -> None:
    """Reverse ``post_planned``: delete the linked actual + restore balance.

    Raises:
        PlannedNotFoundError: row missing / cross-tenant (→ 404).
        PlannedNotPostedError: posted_txn_id is NULL (→ 404).
    """
    from app.services.actual import delete_actual_v10

    row = await get_or_404(db, planned_id, user_id=user_id)
    if row.posted_txn_id is None:
        raise PlannedNotPostedError(planned_id)
    txn_id = row.posted_txn_id
    row.posted_txn_id = None
    await db.flush()
    await delete_actual_v10(db, txn_id, user_id=user_id)


async def post_planned_batch(
    db: AsyncSession,
    planned_ids: list[int],
    *,
    user_id: int,
    tx_date: Optional[date] = None,
) -> dict:
    """Bulk-post planned rows (AGREED §B.9 / §F: one fact per line).

    Date semantics (decision A.3 / B.F):
      - ``tx_date`` given → all lines posted on that single date.
      - ``tx_date`` None → each line on its own ``planned_date`` (fallback
        today if NULL).

    Already-posted / subscription_auto / missing rows are collected in
    ``skipped`` rather than aborting the batch.

    Returns ``{"posted": [txn_id...], "skipped": [planned_id...]}``.
    """
    from app.services.periods import _today_in_app_tz

    posted: list[int] = []
    skipped: list[int] = []
    for pid in planned_ids:
        if tx_date is not None:
            d = tx_date
        else:
            row = await db.scalar(
                select(PlannedTransaction).where(
                    PlannedTransaction.id == pid,
                    PlannedTransaction.user_id == user_id,
                )
            )
            d = (row.planned_date if row is not None else None) or _today_in_app_tz()
        try:
            txn = await post_planned(db, pid, user_id=user_id, tx_date=d)
            posted.append(txn.id)
        except (
            PlannedAlreadyPostedError,
            PlannedNotFoundError,
            SubscriptionPlannedReadOnlyError,
        ):
            skipped.append(pid)
    return {"posted": posted, "skipped": skipped}


# ---------- Plan template items / lines (AGREED §B/§C) ----------


async def list_template_items(
    db: AsyncSession, *, user_id: int
) -> list[PlanTemplateItem]:
    rows = await db.execute(
        select(PlanTemplateItem)
        .where(PlanTemplateItem.user_id == user_id)
        .order_by(PlanTemplateItem.category_id)
    )
    return list(rows.scalars().all())


async def upsert_template_item(
    db: AsyncSession, *, user_id: int, category_id: int, limit_cents: int
) -> PlanTemplateItem:
    """UPSERT a template limit for a category (one limit per category)."""
    await _ensure_category_active(db, category_id, user_id=user_id)
    row = await db.scalar(
        select(PlanTemplateItem).where(
            PlanTemplateItem.user_id == user_id,
            PlanTemplateItem.category_id == category_id,
        )
    )
    if row is None:
        row = PlanTemplateItem(
            user_id=user_id, category_id=category_id, limit_cents=limit_cents
        )
        db.add(row)
    else:
        row.limit_cents = limit_cents
    await db.flush()
    await db.refresh(row)
    return row


async def list_template_lines(
    db: AsyncSession, *, user_id: int, category_id: Optional[int] = None
) -> list[PlanTemplateLine]:
    stmt = select(PlanTemplateLine).where(PlanTemplateLine.user_id == user_id)
    if category_id is not None:
        stmt = stmt.where(PlanTemplateLine.category_id == category_id)
    stmt = stmt.order_by(PlanTemplateLine.category_id, PlanTemplateLine.id)
    rows = await db.execute(stmt)
    return list(rows.scalars().all())


async def create_template_line(
    db: AsyncSession,
    *,
    user_id: int,
    category_id: int,
    title: str,
    amount_cents: int,
    kind: str,
    day_of_period: Optional[int] = None,
) -> PlanTemplateLine:
    cat = await _ensure_category_active(db, category_id, user_id=user_id)
    if cat.kind.value != kind:
        raise KindMismatchError(kind, cat.kind.value)
    row = PlanTemplateLine(
        user_id=user_id,
        category_id=category_id,
        title=title,
        amount_cents=amount_cents,
        day_of_period=day_of_period,
        kind=ActualKind(kind),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_template_line(
    db: AsyncSession, line_id: int, patch: dict, *, user_id: int
) -> PlanTemplateLine:
    row = await db.scalar(
        select(PlanTemplateLine).where(
            PlanTemplateLine.id == line_id,
            PlanTemplateLine.user_id == user_id,
        )
    )
    if row is None:
        raise PlannedNotFoundError(line_id)
    if "category_id" in patch and patch["category_id"] != row.category_id:
        await _ensure_category_active(db, patch["category_id"], user_id=user_id)
    for field, value in patch.items():
        if field == "kind":
            setattr(row, field, ActualKind(value))
        else:
            setattr(row, field, value)
    await db.flush()
    await db.refresh(row)
    return row


async def delete_template_line(db: AsyncSession, line_id: int, *, user_id: int) -> None:
    row = await db.scalar(
        select(PlanTemplateLine).where(
            PlanTemplateLine.id == line_id,
            PlanTemplateLine.user_id == user_id,
        )
    )
    if row is None:
        raise PlannedNotFoundError(line_id)
    await db.delete(row)
    await db.flush()


# ---------- Per-period plan limits (AGREED §C — план месяца) ----------


async def list_period_plan(
    db: AsyncSession, period_id: int, *, user_id: int
) -> list[dict]:
    """Return per-category limits for a period (period_category_plan rows).

    Fallback: categories without a period_category_plan row fall back to
    ``Category.plan_cents`` (periods created before apply-template).
    """
    await _get_period_or_404(db, period_id, user_id=user_id)
    pcp = {
        r.category_id: r.limit_cents
        for r in (
            await db.execute(
                select(PeriodCategoryPlan).where(
                    PeriodCategoryPlan.user_id == user_id,
                    PeriodCategoryPlan.period_id == period_id,
                )
            )
        )
        .scalars()
        .all()
    }
    cats = (
        await db.execute(
            select(Category.id, Category.plan_cents).where(
                Category.user_id == user_id,
                Category.is_archived.is_(False),
            )
        )
    ).all()
    out: list[dict] = []
    for cid, plan_cents in cats:
        out.append(
            {
                "category_id": cid,
                "limit_cents": pcp.get(cid, plan_cents or 0),
            }
        )
    return out


async def update_period_plan_atomic(
    db: AsyncSession,
    *,
    user_id: int,
    period_id: int,
    plans: list[tuple[int, int]],
) -> list[dict]:
    """UPSERT per-period category limits into ``period_category_plan``.

    Validates the period and every category belongs to ``user_id`` before any
    mutation (cross-tenant → PeriodNotFoundError / CategoryNotFoundError).
    """
    await _get_period_or_404(db, period_id, user_id=user_id)
    cat_ids = [c for c, _ in plans]
    if cat_ids:
        found = {
            r
            for (r,) in (
                await db.execute(
                    select(Category.id).where(
                        Category.id.in_(cat_ids),
                        Category.user_id == user_id,
                    )
                )
            ).all()
        }
        for cid in cat_ids:
            if cid not in found:
                from app.services.categories import CategoryNotFoundError

                raise CategoryNotFoundError(cid)

    existing = {
        r.category_id: r
        for r in (
            await db.execute(
                select(PeriodCategoryPlan).where(
                    PeriodCategoryPlan.user_id == user_id,
                    PeriodCategoryPlan.period_id == period_id,
                )
            )
        )
        .scalars()
        .all()
    }
    for cid, limit_cents in plans:
        row = existing.get(cid)
        if row is None:
            db.add(
                PeriodCategoryPlan(
                    user_id=user_id,
                    period_id=period_id,
                    category_id=cid,
                    limit_cents=limit_cents,
                )
            )
        else:
            row.limit_cents = limit_cents
    await db.flush()
    return [{"category_id": cid, "limit_cents": lc} for cid, lc in plans]
