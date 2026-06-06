"""Subscription service layer — SUB-01, SUB-04, SUB-05 (D-73, D-74).

Service functions are HTTP-framework-agnostic; route layer maps domain
exceptions to HTTP status codes.

Domain exceptions:
- AlreadyChargedError: raised on IntegrityError (uq_planned_sub_charge_date) → HTTP 409
- CategoryNotFoundOrArchived: raised when category_id is invalid/archived → HTTP 400

Threat mitigations (CLAUDE.md + threat_model):
- T-06-02: create_subscription validates category_id exists and is not archived
- T-11-06-08: все мутации Subscription / PlannedTransaction явно задают user_id
  (insert path) и фильтруют запросы по user_id (read/update/delete path).

Phase 11 (Plan 11-06, MUL-03): все public функции принимают ``user_id: int``
keyword-only и фильтруют ``Subscription.user_id`` / ``PlannedTransaction.user_id``.
RLS — defense-in-depth backstop.
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
    ActualSource,
    ActualTransaction,
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
    """Raised when category_id does not exist, is archived, or belongs to other tenant (T-06-02)."""


def _advance_charge_date(sub: Subscription) -> date:
    """Compute the next charge date after advancing by one billing cycle (D-74).

    Uses dateutil.relativedelta so leap-year and month-end edge cases are
    handled correctly (e.g. Jan 31 + 1 month = Feb 28/29).
    """
    if sub.cycle == SubCycle.monthly:
        return sub.next_charge_date + relativedelta(months=1)
    # yearly
    return sub.next_charge_date + relativedelta(years=1)


async def list_subscriptions(
    db: AsyncSession, *, user_id: int
) -> list[Subscription]:
    """Return user's subscriptions (active + inactive), joined with category, sorted by next_charge_date ASC."""
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .options(selectinload(Subscription.category))
        .order_by(Subscription.next_charge_date.asc())
    )
    return list(result.scalars().all())


async def create_subscription(
    db: AsyncSession,
    *,
    user_id: int,
    name: str,
    amount_cents: int,
    cycle: SubCycle,
    next_charge_date: date,
    category_id: int,
    notify_days_before: Optional[int] = None,
    is_active: bool = True,
    day_of_month: Optional[int] = None,
    account_id: Optional[int] = None,
) -> Subscription:
    """Create and persist a new subscription owned by user_id.

    Phase 11: category_id validated в scope user_id (cross-tenant attempts ловятся
    как CategoryNotFoundOrArchived). notify_days_before defaults to
    AppUser.notify_days_before если не передан (D-73).

    BUG-2 (phase 71): optional ``day_of_month`` (1..28) and ``account_id`` are
    persisted at create. ``account_id`` MUST be tenant-validated by the caller
    (route layer raises AccountNotFoundError → 404). The DB composite FK
    ``fk_subscription_account`` enforces tenancy as defense-in-depth.

    Raises CategoryNotFoundOrArchived if category_id is invalid, archived, or
    belongs to a different tenant (T-06-02 + T-11-06-08).
    """
    cat = await db.scalar(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == user_id,
        )
    )
    if cat is None or cat.is_archived:
        raise CategoryNotFoundOrArchived(
            f"Category {category_id} not found or archived"
        )
    if notify_days_before is None:
        user = await db.scalar(select(AppUser).where(AppUser.id == user_id))
        notify_days_before = user.notify_days_before if user else 2

    sub = Subscription(
        user_id=user_id,
        name=name,
        amount_cents=amount_cents,
        cycle=cycle,
        next_charge_date=next_charge_date,
        category_id=category_id,
        notify_days_before=notify_days_before,
        is_active=is_active,
        day_of_month=day_of_month,
        account_id=account_id,
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub, ["category"])
    return sub


async def update_subscription(
    db: AsyncSession,
    sub_id: int,
    patch: dict,
    *,
    user_id: int,
) -> Subscription:
    """Partial-update a subscription by id.

    Phase 11: scoped по user_id — cross-tenant id обращения дают LookupError (→ 404).

    Raises LookupError if sub_id not found (or принадлежит другому tenant).
    patch already contains only explicitly-set fields (model_dump(exclude_unset=True)
    in the route layer), so every field in patch is applied unconditionally.
    """
    sub = await db.scalar(
        select(Subscription)
        .where(
            Subscription.id == sub_id,
            Subscription.user_id == user_id,
        )
        .options(selectinload(Subscription.category))
    )
    if sub is None:
        raise LookupError(f"Subscription {sub_id} not found")
    for k, v in patch.items():
        setattr(sub, k, v)
    await db.flush()
    return sub


async def delete_subscription(
    db: AsyncSession, sub_id: int, *, user_id: int
) -> None:
    """Hard-delete a subscription by id (CLAUDE.md convention: subscriptions hard delete).

    Phase 11: scoped по user_id — cross-tenant id обращения дают LookupError (→ 404).

    Also removes subscription_auto planned rows referencing this subscription
    (within the same tenant) to satisfy the FK constraint.

    Raises LookupError if sub_id not found.
    """
    await db.execute(
        delete(PlannedTransaction).where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.subscription_id == sub_id,
        )
    )
    result = await db.execute(
        delete(Subscription).where(
            Subscription.id == sub_id,
            Subscription.user_id == user_id,
        )
    )
    if result.rowcount == 0:
        raise LookupError(f"Subscription {sub_id} not found")


async def add_subscription_to_period(
    db: AsyncSession,
    sub: Subscription,
    period_id: int,
    *,
    user_id: int,
) -> PlannedTransaction | None:
    """Create a PlannedTransaction for sub in period without advancing next_charge_date.

    Phase 11: PlannedTransaction INSERT задаёт user_id явно. Caller отвечает за
    то, чтобы sub.user_id == user_id и period с period_id принадлежит user_id
    (worker и routes это гарантируют до вызова).

    Called when a new period is created or when a subscription is added mid-period.
    Idempotent via SAVEPOINT: returns None if (subscription_id, original_charge_date)
    already exists.
    """
    planned = PlannedTransaction(
        user_id=user_id,
        period_id=period_id,
        category_id=sub.category_id,
        kind=sub.category.kind,
        amount_cents=sub.amount_cents,
        source=PlanSource.subscription_auto,
        subscription_id=sub.id,
        original_charge_date=sub.next_charge_date,
    )
    try:
        async with db.begin_nested():
            db.add(planned)
            await db.flush()
    except IntegrityError:
        return None
    return planned


async def charge_subscription(
    db: AsyncSession,
    sub_id: int,
    *,
    user_id: int,
    cycle_start_day: int,
) -> tuple[PlannedTransaction, date]:
    """Create a PlannedTransaction for the subscription's next_charge_date and advance the date.

    Phase 11: subscription lookup + period resolve + PlannedTransaction INSERT
    все scoped по user_id.

    This is the shared logic for both POST /subscriptions/{id}/charge-now (D-71)
    and the charge_subscriptions worker job (D-80).

    Raises:
        LookupError: subscription not found (или принадлежит другому tenant)
        AlreadyChargedError: IntegrityError on uq_planned_sub_charge_date (SUB-05 idempotency)

    Returns:
        (PlannedTransaction, new_next_charge_date)
    """
    # Lazy import to avoid cyclic dependency (actual imports models too)
    from app.services.actual import _resolve_period_for_date  # noqa: PLC0415

    sub = await db.scalar(
        select(Subscription)
        .where(
            Subscription.id == sub_id,
            Subscription.user_id == user_id,
        )
        .options(selectinload(Subscription.category))
    )
    if sub is None:
        raise LookupError(f"Subscription {sub_id} not found")

    original_date = sub.next_charge_date
    period_id = await _resolve_period_for_date(
        db, original_date, cycle_start_day=cycle_start_day, user_id=user_id
    )

    planned = PlannedTransaction(
        user_id=user_id,
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


# ---------- Phase 22 (BE-13) — manual post / unpost into actual ----------
#
# These v1.0 functions live below the legacy charge / planned-transaction code
# to keep the existing v0.x flow untouched (CONTEXT §Area 3 + plan 22.09).
#
# Post:   создаёт ActualTransaction(kind=expense, amount=-|sub.amount_cents|),
#         привязывает к sub.category_id + sub.account_id, проставляет
#         sub.posted_txn_id, применяет balance-delta через create_actual_v10
#         (BE-03 hook).
#
# Unpost: удаляет связанный actual_transaction (FK ON DELETE SET NULL очистит
#         sub.posted_txn_id; здесь делаем это явно для consistency и чтобы
#         избежать FK churn между UPDATE sub и DELETE actual_transaction),
#         баланс восстанавливается через delete_actual_v10.
#
# Идемпотентность post (T-22-09-01):  posted_txn_id IS NOT NULL → 409.
# Идемпотентность unpost (T-22-09-03): posted_txn_id IS NULL    → 404.


class SubscriptionAlreadyPostedError(Exception):
    """BE-13 idempotency gate: subscription already has a linked posted_txn_id.

    Route layer maps to HTTP 409 Conflict. T-22-09-01.
    """

    def __init__(self, sub_id: int, posted_txn_id: int) -> None:
        self.sub_id = sub_id
        self.posted_txn_id = posted_txn_id
        super().__init__(
            f"Subscription {sub_id} already posted (txn {posted_txn_id})"
        )


class SubscriptionNotPostedError(Exception):
    """BE-13 unpost guard: subscription has no posted_txn_id to unpost.

    Route layer maps to HTTP 404 (or 409 — caller's choice). T-22-09-03.
    """

    def __init__(self, sub_id: int) -> None:
        self.sub_id = sub_id
        super().__init__(f"Subscription {sub_id} is not posted")


class SubscriptionInactiveError(Exception):
    """BE-13 active-only gate: post a paused / archived subscription is denied.

    Route layer maps to HTTP 409 (semantic error). T-22-09-05.
    """

    def __init__(self, sub_id: int) -> None:
        self.sub_id = sub_id
        super().__init__(f"Subscription {sub_id} is inactive")


async def post_subscription(
    db: AsyncSession, sub_id: int, *, user_id: int
) -> ActualTransaction:
    """BE-13 POST /api/v1/subscriptions/:id/post — manual «провести в факт».

    Creates an expense ActualTransaction tied to the subscription's category
    + account, applies balance delta on the account (delegated to
    ``create_actual_v10``), and stores ``sub.posted_txn_id = txn.id``.

    Idempotency: if ``sub.posted_txn_id`` is already set, raises
    ``SubscriptionAlreadyPostedError`` (T-22-09-01 → HTTP 409).

    Phase 11 / Phase 22 invariants:
    - Subscription lookup scoped by user_id (cross-tenant → LookupError → 404).
    - sub.is_active must be True (T-22-09-05).
    - sub.account_id must not be NULL (T-22-09-06 → ValueError surfaced as 422).

    Args:
        sub_id: Subscription PK.
        user_id: tenant scope (app_user.id).

    Returns:
        The freshly-created ``ActualTransaction`` row (parent — roundup child,
        if any, is silently created via ``create_actual_v10`` and ignored
        here; balance for both is applied atomically).

    Raises:
        LookupError: subscription not found OR cross-tenant.
        SubscriptionAlreadyPostedError: posted_txn_id already set (409).
        SubscriptionInactiveError: sub.is_active is False (409).
        ValueError: sub.account_id is NULL (422).
    """
    # Local imports to avoid cyclic dependencies (actual imports models, which
    # imports SQLAlchemy enums; periods is a leaf module).
    from app.services.actual import create_actual_v10  # noqa: PLC0415
    from app.services.periods import _today_in_app_tz  # noqa: PLC0415

    # P1-2 (BE-F4): SELECT ... FOR UPDATE serialises concurrent posts on the
    # subscription row. The second concurrent transaction blocks here until the
    # first commits, then reads the now-set posted_txn_id and short-circuits to
    # SubscriptionAlreadyPostedError → 409. Without the row lock the in-memory
    # `posted_txn_id is None` check is a check-then-act race → two
    # ActualTransactions + double balance delta + orphan txn.
    sub = await db.scalar(
        select(Subscription)
        .where(
            Subscription.id == sub_id,
            Subscription.user_id == user_id,
        )
        .with_for_update()
    )
    if sub is None:
        # Match existing module convention (delete_subscription / update_subscription):
        # LookupError → route layer maps to 404. T-22-09-02.
        raise LookupError(f"Subscription {sub_id} not found")

    if sub.posted_txn_id is not None:
        raise SubscriptionAlreadyPostedError(sub_id, sub.posted_txn_id)

    if not sub.is_active:
        raise SubscriptionInactiveError(sub_id)

    if sub.account_id is None:
        # T-22-09-06: post requires an account to apply balance delta against.
        raise ValueError(
            f"Subscription {sub_id} has no account_id — cannot post without account"
        )

    # Subscription.amount_cents хранится как ПОЛОЖИТЕЛЬНОЕ (по DATA-MODEL §1.5);
    # actual_transaction для expense — отрицательное (sign convention BE-06).
    txn_amount = -abs(sub.amount_cents)

    parent, _child = await create_actual_v10(
        db,
        user_id=user_id,
        kind="expense",
        amount_cents=txn_amount,
        description=f"Подписка: {sub.name}",
        category_id=sub.category_id,
        tx_date=_today_in_app_tz(),
        source=ActualSource.mini_app,
        account_id=sub.account_id,
    )

    sub.posted_txn_id = parent.id
    try:
        await db.flush()
    except IntegrityError as exc:
        # P1-2 belt-and-braces: the partial unique index
        # uq_subscription_posted_txn_id (migration 0025) rejects a second
        # posted_txn_id pointing at an already-linked transaction even if the
        # FOR UPDATE lock were somehow bypassed (e.g. different connection
        # ordering). Surface as the idempotency error → HTTP 409.
        await db.rollback()
        raise SubscriptionAlreadyPostedError(sub_id, parent.id) from exc
    return parent


async def unpost_subscription(
    db: AsyncSession, sub_id: int, *, user_id: int
) -> None:
    """BE-13 POST /api/v1/subscriptions/:id/unpost — отменить ручную проводку.

    Deletes the linked ``actual_transaction`` (FK ON DELETE CASCADE removes any
    roundup children) and clears ``sub.posted_txn_id``. Account balance is
    restored by ``delete_actual_v10`` for the parent + each cascaded child.

    Returns ``None`` on success — route layer responds with HTTP 204.

    Args:
        sub_id: Subscription PK.
        user_id: tenant scope.

    Raises:
        LookupError: subscription not found OR cross-tenant (→ 404).
        SubscriptionNotPostedError: sub.posted_txn_id is NULL (→ 404).
    """
    from app.services.actual import delete_actual_v10  # noqa: PLC0415

    sub = await db.scalar(
        select(Subscription).where(
            Subscription.id == sub_id,
            Subscription.user_id == user_id,
        )
    )
    if sub is None:
        raise LookupError(f"Subscription {sub_id} not found")

    if sub.posted_txn_id is None:
        raise SubscriptionNotPostedError(sub_id)

    txn_id = sub.posted_txn_id
    # Clear FK reference BEFORE deleting the txn to avoid SQLAlchemy trying to
    # NULLify it via ON DELETE SET NULL after our explicit delete (DB does the
    # right thing either way; doing it explicitly keeps ORM in sync).
    sub.posted_txn_id = None
    await db.flush()

    await delete_actual_v10(db, txn_id, user_id=user_id)
