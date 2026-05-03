"""Subscription service layer — SUB-01, SUB-04, SUB-05 (D-73, D-74).

Service functions are HTTP-framework-agnostic; route layer maps domain
exceptions to HTTP status codes.

Domain exceptions:
- AlreadyChargedError: raised on IntegrityError (uq_planned_sub_charge_date) → HTTP 409
- CategoryNotFoundOrArchived: raised when category_id is invalid/archived → HTTP 400

Threat mitigations (CLAUDE.md + threat_model):
- T-06-02: create_subscription validates category_id exists and is not archived
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    AppUser,
    Category,
    PlannedTransaction,
    PlanSource,
    SubCycle,
    Subscription,
)


class AlreadyChargedError(Exception):
    """Raised when (subscription_id, original_charge_date) unique constraint fires.

    SUB-05 idempotency: charge_subscription and the charge_subscriptions worker job
    rely on this to detect duplicate charges and skip gracefully.
    """

    def __init__(self, sub_id: int, charge_date: date) -> None:
        self.sub_id = sub_id
        self.charge_date = charge_date
        super().__init__(
            f"Subscription {sub_id} already charged on {charge_date}"
        )


class CategoryNotFoundOrArchived(Exception):
    """Raised when category_id does not exist or is archived (T-06-02)."""


def _advance_charge_date(sub: Subscription) -> date:
    """Compute the next charge date after advancing by one billing cycle (D-74).

    Uses dateutil.relativedelta so leap-year and month-end edge cases are
    handled correctly (e.g. Jan 31 + 1 month = Feb 28/29).
    """
    if sub.cycle == SubCycle.monthly:
        return sub.next_charge_date + relativedelta(months=1)
    # yearly
    return sub.next_charge_date + relativedelta(years=1)


async def list_subscriptions(db: AsyncSession) -> list[Subscription]:
    """Return all subscriptions (active + inactive), joined with category, sorted by next_charge_date ASC."""
    result = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.category))
        .order_by(Subscription.next_charge_date.asc())
    )
    return list(result.scalars().all())


async def create_subscription(
    db: AsyncSession,
    *,
    tg_user_id: int,
    name: str,
    amount_cents: int,
    cycle: SubCycle,
    next_charge_date: date,
    category_id: int,
    notify_days_before: Optional[int] = None,
    is_active: bool = True,
) -> Subscription:
    """Create and persist a new subscription.

    notify_days_before defaults to AppUser.notify_days_before if not supplied (D-73).
    Raises CategoryNotFoundOrArchived if category_id is invalid or archived (T-06-02).
    """
    cat = await db.scalar(select(Category).where(Category.id == category_id))
    if cat is None or cat.is_archived:
        raise CategoryNotFoundOrArchived(
            f"Category {category_id} not found or archived"
        )
    if notify_days_before is None:
        user = await db.scalar(
            select(AppUser).where(AppUser.tg_user_id == tg_user_id)
        )
        notify_days_before = user.notify_days_before if user else 2

    sub = Subscription(
        name=name,
        amount_cents=amount_cents,
        cycle=cycle,
        next_charge_date=next_charge_date,
        category_id=category_id,
        notify_days_before=notify_days_before,
        is_active=is_active,
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub, ["category"])
    return sub


async def update_subscription(
    db: AsyncSession,
    sub_id: int,
    patch: dict,
) -> Subscription:
    """Partial-update a subscription by id.

    Raises LookupError if sub_id not found.
    patch already contains only explicitly-set fields (model_dump(exclude_unset=True)
    in the route layer), so every field in patch is applied unconditionally.
    """
    sub = await db.scalar(
        select(Subscription)
        .where(Subscription.id == sub_id)
        .options(selectinload(Subscription.category))
    )
    if sub is None:
        raise LookupError(f"Subscription {sub_id} not found")
    for k, v in patch.items():
        setattr(sub, k, v)
    await db.flush()
    return sub


async def delete_subscription(db: AsyncSession, sub_id: int) -> None:
    """Hard-delete a subscription by id (CLAUDE.md convention: subscriptions hard delete).

    Raises LookupError if sub_id not found (rowcount == 0).
    """
    result = await db.execute(delete(Subscription).where(Subscription.id == sub_id))
    if result.rowcount == 0:
        raise LookupError(f"Subscription {sub_id} not found")


async def charge_subscription(
    db: AsyncSession,
    sub_id: int,
    *,
    cycle_start_day: int,
) -> tuple[PlannedTransaction, date]:
    """Create a PlannedTransaction for the subscription's next_charge_date and advance the date.

    This is the shared logic for both POST /subscriptions/{id}/charge-now (D-71)
    and the charge_subscriptions worker job (D-80).

    Raises:
        LookupError: subscription not found
        AlreadyChargedError: IntegrityError on uq_planned_sub_charge_date (SUB-05 idempotency)

    Returns:
        (PlannedTransaction, new_next_charge_date)
    """
    # Lazy import to avoid cyclic dependency (actual imports models too)
    from app.services.actual import _resolve_period_for_date  # noqa: PLC0415

    sub = await db.scalar(
        select(Subscription)
        .where(Subscription.id == sub_id)
        .options(selectinload(Subscription.category))
    )
    if sub is None:
        raise LookupError(f"Subscription {sub_id} not found")

    original_date = sub.next_charge_date
    period_id = await _resolve_period_for_date(
        db, original_date, cycle_start_day=cycle_start_day
    )

    planned = PlannedTransaction(
        period_id=period_id,
        category_id=sub.category_id,
        kind=sub.category.kind,
        amount_cents=sub.amount_cents,
        source=PlanSource.subscription_auto,
        subscription_id=sub.id,
        original_charge_date=original_date,
    )
    try:
        async with db.begin_nested():   # SAVEPOINT — откат только до точки сохранения
            db.add(planned)
            await db.flush()
    except IntegrityError:
        raise AlreadyChargedError(sub_id, original_date)

    sub.next_charge_date = _advance_charge_date(sub)
    await db.flush()

    return planned, sub.next_charge_date
