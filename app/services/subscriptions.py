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

from datetime import date, timedelta
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
    BudgetPeriod,
    Category,
    PlannedTransaction,
    PlanSource,
    SubCycle,
    Subscription,
)
from app.services.periods import get_current_active_period


class AlreadyChargedError(Exception):
    """Raised when (subscription_id, original_charge_date) unique constraint fires.

    SUB-05 idempotency: charge_subscription and the charge_subscriptions worker job
    rely on this to detect duplicate charges and skip gracefully.
    """

    def __init__(self, sub_id: int, charge_date: date) -> None:
        self.sub_id = sub_id
        self.charge_date = charge_date
        super().__init__(f"Subscription {sub_id} already charged on {charge_date}")


class CategoryNotFoundOrArchived(Exception):
    """Raised when category_id does not exist, is archived, or belongs to other tenant (T-06-02)."""


def _advance_date(
    anchor: date, *, interval_months: int, day_of_month: Optional[int]
) -> date:
    """Advance ``anchor`` by ``interval_months`` months (ADR-0007).

    Uses dateutil.relativedelta so leap-year / month-length edge cases are
    handled correctly. When ``day_of_month`` is set it is clamped to 1..28 and
    used to normalise the resulting day (so a payment anchored to "the 2nd"
    stays on the 2nd regardless of the starting day); otherwise the original
    day is preserved by relativedelta.
    """
    nxt = anchor + relativedelta(months=interval_months)
    if day_of_month is not None:
        dom = min(max(day_of_month, 1), 28)
        nxt = nxt.replace(day=dom)
    return nxt


def _advance_charge_date(sub: Subscription) -> date:
    """Compute the next charge date after advancing by ``interval_months`` (ADR-0007).

    The legacy ``cycle`` column is no longer consulted — ``interval_months`` is
    the source of truth (monthly=1, yearly=12). The day is normalised to
    ``day_of_month`` when set.
    """
    return _advance_date(
        sub.next_charge_date,
        interval_months=sub.interval_months,
        day_of_month=sub.day_of_month,
    )


async def list_subscriptions(db: AsyncSession, *, user_id: int) -> list[Subscription]:
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
    next_charge_date: date,
    category_id: int,
    interval_months: Optional[int] = None,
    cycle: Optional[SubCycle] = None,
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

    # ADR-0007: ``interval_months`` is the source of truth, ``cycle`` is
    # deprecated (but still NOT NULL). Resolve both directions for backward
    # compatibility:
    #   - interval given, cycle absent  → derive a legacy cycle (12→yearly).
    #   - cycle given, interval absent   → derive interval (yearly→12).
    #   - neither given                  → monthly / interval 1.
    if interval_months is None:
        interval_months = 12 if cycle == SubCycle.yearly else 1
    if cycle is None:
        cycle = SubCycle.yearly if interval_months == 12 else SubCycle.monthly

    sub = Subscription(
        user_id=user_id,
        name=name,
        amount_cents=amount_cents,
        cycle=cycle,
        interval_months=interval_months,
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


async def delete_subscription(db: AsyncSession, sub_id: int, *, user_id: int) -> None:
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
    advance: bool = True,
) -> PlannedTransaction | None:
    """Materialise a forecast planned row for ``sub`` into ``period_id``.

    ADR-0007: materialisation is the moment the running cursor advances — when
    ``advance`` is True (the default), ``sub.next_charge_date`` is moved forward
    by ``interval_months`` after a successful insert, so the next occurrence
    lands in a later period (the deprecated daily charge job is gone).

    Phase 11: PlannedTransaction INSERT задаёт user_id явно. Caller отвечает за
    то, чтобы sub.user_id == user_id и period с period_id принадлежит user_id
    (worker и routes это гарантируют до вызова).

    Called when a new period is created or when a recurring payment is added
    mid-period. Idempotent via SAVEPOINT: returns None (and does NOT advance)
    if (subscription_id, original_charge_date) already exists.
    """
    planned = PlannedTransaction(
        user_id=user_id,
        period_id=period_id,
        category_id=sub.category_id,
        kind=sub.category.kind,
        amount_cents=sub.amount_cents,
        description=sub.name,
        source=PlanSource.subscription_auto,
        subscription_id=sub.id,
        planned_date=sub.next_charge_date,
        original_charge_date=sub.next_charge_date,
    )
    try:
        async with db.begin_nested():
            db.add(planned)
            await db.flush()
    except IntegrityError:
        return None
    if advance:
        sub.next_charge_date = _advance_charge_date(sub)
        await db.flush()
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
        description=sub.name,
        source=PlanSource.subscription_auto,
        subscription_id=sub.id,
        planned_date=original_date,
        original_charge_date=original_date,
    )
    try:
        async with db.begin_nested():  # SAVEPOINT — откат только до точки сохранения
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
        super().__init__(f"Subscription {sub_id} already posted (txn {posted_txn_id})")


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

    Unified posting path (recurring-payments fix, ADR-0007): occurrence-level
    ``planned.posted_txn_id`` is the source of truth.

    1. If the current active period has a materialised UNPOSTED occurrence
       (``planned_transaction(source=subscription_auto)``) for this
       subscription — that occurrence is posted via the same code path as
       POST /subscriptions/recurring/{planned_id}/pay
       (``pay_recurring_occurrence``: FOR UPDATE, ``create_actual_v10``,
       occurrence ``posted_txn_id``, IntegrityError belt-and-braces). The
       earliest unposted occurrence is taken when several exist
       (interval < period length).
    2. If occurrences exist but are ALL posted →
       ``SubscriptionAlreadyPostedError`` (409) — same charge cannot be posted
       twice from any UI path.
    3. If NO occurrence is materialised — legacy fallback: direct expense
       ActualTransaction guarded by ``sub.posted_txn_id`` (which close_period
       resets on rollover, so a new period can be posted again).

    ``sub.posted_txn_id`` stays in the read schema as an informational mirror
    (updated by both paths); for materialised occurrences it is NOT a guard.

    Phase 11 / Phase 22 invariants:
    - Subscription lookup scoped by user_id (cross-tenant → LookupError → 404).
    - sub.is_active must be True (T-22-09-05).
    - Fallback path: sub.account_id must not be NULL (T-22-09-06 → ValueError
      surfaced as 422). The occurrence path resolves the account like /pay
      (subscription account, else primary).

    Args:
        sub_id: Subscription PK.
        user_id: tenant scope (app_user.id).

    Returns:
        The freshly-created ``ActualTransaction`` row (parent — roundup child,
        if any, is silently created via ``create_actual_v10`` and ignored
        here; balance for both is applied atomically).

    Raises:
        LookupError: subscription not found OR cross-tenant.
        SubscriptionAlreadyPostedError: occurrence(s) already posted, or (in
            the fallback path) posted_txn_id already set (409).
        SubscriptionInactiveError: sub.is_active is False (409).
        ValueError: fallback path with sub.account_id NULL (422).
    """
    # Local imports to avoid cyclic dependencies (actual imports models, which
    # imports SQLAlchemy enums; periods is a leaf module).
    from app.services.actual import create_actual_v10  # noqa: PLC0415
    from app.services.periods import _today_in_app_tz  # noqa: PLC0415

    # P1-2 (BE-F4): SELECT ... FOR UPDATE serialises concurrent posts on the
    # subscription row. The second concurrent transaction blocks here until the
    # first commits, then reads the now-set posted state and short-circuits to
    # SubscriptionAlreadyPostedError → 409. Without the row lock the in-memory
    # posted check is a check-then-act race → two ActualTransactions + double
    # balance delta + orphan txn. Lock ordering everywhere: subscription row
    # first, then occurrence rows (pay_recurring_occurrence matches).
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

    if not sub.is_active:
        raise SubscriptionInactiveError(sub_id)

    # ── Unified path: post the materialised occurrence of the active period ──
    period = await get_current_active_period(db, user_id=user_id)
    if period is not None:
        occurrences = (
            (
                await db.execute(
                    select(PlannedTransaction)
                    .where(
                        PlannedTransaction.user_id == user_id,
                        PlannedTransaction.period_id == period.id,
                        PlannedTransaction.subscription_id == sub_id,
                        PlannedTransaction.source == PlanSource.subscription_auto,
                    )
                    .order_by(PlannedTransaction.planned_date, PlannedTransaction.id)
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        unposted = [o for o in occurrences if o.posted_txn_id is None]
        if unposted:
            # Single source of truth: same code path as /recurring/{id}/pay.
            # pay_recurring_occurrence also mirrors txn.id into
            # sub.posted_txn_id (informational).
            return await pay_recurring_occurrence(
                db,
                unposted[0].id,
                user_id=user_id,
                tx_date=_today_in_app_tz(),
            )
        if occurrences:
            # Everything materialised for this period is already posted.
            raise SubscriptionAlreadyPostedError(sub_id, occurrences[-1].posted_txn_id)

    # ── Legacy fallback: no materialised occurrence — direct post ──
    if sub.posted_txn_id is not None:
        raise SubscriptionAlreadyPostedError(sub_id, sub.posted_txn_id)

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

    # SAVEPOINT (begin_nested), NOT db.rollback(): a session-level rollback on
    # the request-scoped session would discard SET LOCAL app.current_user_id
    # (RLS tenant scope) and all prior request work. P1-2 belt-and-braces: the
    # partial unique index uq_subscription_posted_txn_id (migration 0025)
    # rejects a second posted_txn_id pointing at an already-linked transaction
    # even if the FOR UPDATE lock were somehow bypassed. Surface as the
    # idempotency error → HTTP 409.
    try:
        async with db.begin_nested():
            sub.posted_txn_id = parent.id
            await db.flush()
    except IntegrityError as exc:
        raise SubscriptionAlreadyPostedError(sub_id, parent.id) from exc
    return parent


async def unpost_subscription(db: AsyncSession, sub_id: int, *, user_id: int) -> None:
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


# ---------- ADR-0007 — home-prompt occurrence operations ----------
#
# These operate on the *materialised* planned_transaction(subscription_auto)
# rows of the current active period (the "occurrences"), not on the
# subscription cursor. They back the home prompt «Оплачено / Пропустить /
# Перенести» and the cashflow projection screen.


class RecurringOccurrenceNotFoundError(Exception):
    """Raised when a recurring occurrence (materialised planned row) is missing.

    Route layer maps to HTTP 404. Covers: id not found, cross-tenant, not a
    ``subscription_auto`` row, or not in the requested period.
    """

    def __init__(self, planned_id: int) -> None:
        self.planned_id = planned_id
        super().__init__(f"Recurring occurrence {planned_id} not found")


class RecurringOccurrenceAlreadyPaidError(Exception):
    """Raised when paying an occurrence that already has ``posted_txn_id`` (→ 409)."""

    def __init__(self, planned_id: int, posted_txn_id: int) -> None:
        self.planned_id = planned_id
        self.posted_txn_id = posted_txn_id
        super().__init__(
            f"Recurring occurrence {planned_id} already paid (txn {posted_txn_id})"
        )


async def _get_occurrence(
    db: AsyncSession, planned_id: int, *, user_id: int, for_update: bool = False
) -> PlannedTransaction:
    """Fetch a materialised recurring planned row scoped by user_id."""
    stmt = select(PlannedTransaction).where(
        PlannedTransaction.id == planned_id,
        PlannedTransaction.user_id == user_id,
        PlannedTransaction.source == PlanSource.subscription_auto,
    )
    if for_update:
        # populate_existing: refresh identity-map state from the row we just
        # locked, so the posted_txn_id re-check under the lock is not a stale
        # in-memory read.
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    row = await db.scalar(stmt)
    if row is None:
        raise RecurringOccurrenceNotFoundError(planned_id)
    return row


async def list_due_recurring(
    db: AsyncSession, *, user_id: int, today: date
) -> list[PlannedTransaction]:
    """List due-today/overdue recurring occurrences for the current active period.

    ADR-0007 home prompt: ``source=subscription_auto``, ``posted_txn_id IS NULL``,
    ``planned_date <= today``, within the active period. Sorted by planned_date.
    Returns ``[]`` when there is no active period.
    """
    period = await get_current_active_period(db, user_id=user_id)
    if period is None:
        return []
    stmt = (
        select(PlannedTransaction)
        .where(
            PlannedTransaction.user_id == user_id,
            PlannedTransaction.period_id == period.id,
            PlannedTransaction.source == PlanSource.subscription_auto,
            PlannedTransaction.posted_txn_id.is_(None),
            PlannedTransaction.planned_date.isnot(None),
            PlannedTransaction.planned_date <= today,
        )
        .order_by(PlannedTransaction.planned_date, PlannedTransaction.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def pay_recurring_occurrence(
    db: AsyncSession,
    planned_id: int,
    *,
    user_id: int,
    tx_date: date,
    amount_cents: Optional[int] = None,
) -> ActualTransaction:
    """Pay a recurring occurrence — post it into a real ActualTransaction.

    ADR-0007 «Оплачено». THE single posting path for a recurring payment:
    occurrence-level ``planned.posted_txn_id`` is the source of truth, and
    ``post_subscription`` delegates here when a materialised occurrence
    exists, so /post and /pay cannot double-post the same charge. Optional
    ``amount_cents`` overrides the planned amount (positive value; sign applied
    by kind). Account resolved from the parent subscription, else the primary.

    ``sub.posted_txn_id`` is updated as an informational mirror (kept in the
    read schema for clients); it is reset on rollover by close_period and is
    no longer a posting guard for materialised occurrences.

    Lock ordering: subscription row FIRST, then the occurrence row — the same
    order ``post_subscription`` uses, so the two paths cannot deadlock.

    Raises:
        RecurringOccurrenceNotFoundError: row missing / cross-tenant / not auto.
        RecurringOccurrenceAlreadyPaidError: already has posted_txn_id (409).
    """
    from app.services.accounts import get_primary_account  # noqa: PLC0415
    from app.services.actual import create_actual_v10  # noqa: PLC0415

    # Unlocked read first — only to resolve the (immutable) subscription_id,
    # so we can take the subscription lock BEFORE the occurrence lock.
    row = await _get_occurrence(db, planned_id, user_id=user_id)

    sub: Optional[Subscription] = None
    if row.subscription_id is not None:
        sub = await db.scalar(
            select(Subscription)
            .where(
                Subscription.id == row.subscription_id,
                Subscription.user_id == user_id,
            )
            .with_for_update()
        )

    # Now lock the occurrence and re-check posted state under the lock.
    row = await _get_occurrence(db, planned_id, user_id=user_id, for_update=True)
    if row.posted_txn_id is not None:
        raise RecurringOccurrenceAlreadyPaidError(planned_id, row.posted_txn_id)

    account_id: Optional[int] = None
    if sub is not None and sub.account_id is not None:
        account_id = sub.account_id
    if account_id is None:
        primary = await get_primary_account(db, user_id=user_id)
        account_id = primary.id if primary is not None else None

    base = abs(amount_cents) if amount_cents is not None else abs(row.amount_cents)
    kind_value = row.kind.value if hasattr(row.kind, "value") else row.kind
    signed = base if kind_value == "income" else -base

    parent, _child = await create_actual_v10(
        db,
        user_id=user_id,
        kind=kind_value,
        amount_cents=signed,
        description=row.description or "Регулярный платёж",
        category_id=row.category_id,
        tx_date=tx_date,
        source=ActualSource.mini_app,
        account_id=account_id,
    )
    # SAVEPOINT (begin_nested), NOT db.rollback(): a session-level rollback on
    # the request-scoped session would discard SET LOCAL app.current_user_id
    # (RLS tenant scope) and all prior work of the request. Same pattern as
    # add_subscription_to_period above.
    try:
        async with db.begin_nested():
            row.posted_txn_id = parent.id
            if sub is not None:
                # Informational mirror only (see docstring).
                sub.posted_txn_id = parent.id
            await db.flush()
    except IntegrityError as exc:
        raise RecurringOccurrenceAlreadyPaidError(planned_id, parent.id) from exc
    return parent


async def skip_recurring_occurrence(
    db: AsyncSession, planned_id: int, *, user_id: int
) -> None:
    """Skip a recurring occurrence — delete the unposted planned row (ADR-0007).

    «Пропустить»: removes the materialised row for the current period without
    posting to actual. Does NOT touch the subscription cursor (already advanced
    at materialisation).

    Raises:
        RecurringOccurrenceNotFoundError: row missing / cross-tenant / not auto.
        RecurringOccurrenceAlreadyPaidError: row already posted (cannot skip a
            paid occurrence — unpay first).
    """
    row = await _get_occurrence(db, planned_id, user_id=user_id, for_update=True)
    if row.posted_txn_id is not None:
        raise RecurringOccurrenceAlreadyPaidError(planned_id, row.posted_txn_id)
    await db.delete(row)
    await db.flush()


class RecurringPostponeOutOfPeriodError(Exception):
    """Raised when a postpone target date falls outside the occurrence's period (→ 400)."""

    def __init__(self, planned_id: int, target: date) -> None:
        self.planned_id = planned_id
        self.target = target
        super().__init__(
            f"Recurring occurrence {planned_id}: {target} is outside its period"
        )


async def postpone_recurring_occurrence(
    db: AsyncSession, planned_id: int, *, user_id: int, new_date: date
) -> PlannedTransaction:
    """Postpone a recurring occurrence — shift ``planned_date`` within its period.

    ADR-0007 «Перенести». The new date is constrained to the occurrence's own
    period bounds (cross-period overdue is not supported).

    Raises:
        RecurringOccurrenceNotFoundError: row missing / cross-tenant / not auto.
        RecurringOccurrenceAlreadyPaidError: row already posted (cannot move a
            paid occurrence).
        RecurringPostponeOutOfPeriodError: new_date outside the period (400).
    """
    row = await _get_occurrence(db, planned_id, user_id=user_id, for_update=True)
    if row.posted_txn_id is not None:
        raise RecurringOccurrenceAlreadyPaidError(planned_id, row.posted_txn_id)
    period = await db.scalar(
        select(BudgetPeriod).where(
            BudgetPeriod.id == row.period_id,
            BudgetPeriod.user_id == user_id,
        )
    )
    if period is None or not (period.period_start <= new_date <= period.period_end):
        raise RecurringPostponeOutOfPeriodError(planned_id, new_date)
    row.planned_date = new_date
    await db.flush()
    await db.refresh(row)
    return row


async def cashflow_projection(
    db: AsyncSession,
    *,
    user_id: int,
    horizon_days: int = 90,
    today: Optional[date] = None,
) -> dict:
    """Project upcoming recurring charges + running balance over a horizon (ADR-0007).

    Builds the cashflow-projection screen payload:
      - ``timeline``: each projected charge (date, name, amount_cents, category_id)
        for active recurring payments, projecting each forward by
        ``interval_months`` from ``next_charge_date`` until past the horizon.
      - ``balance_after_cents`` per timeline entry: starting balance minus the
        running sum of expense charges (income adds), so the UI can highlight
        when the account goes negative.
      - ``monthly_burden_cents``: Σ of one interval's worth of charges normalised
        to a month (amount_cents * 30 / (interval_months * ~30)) → amount / interval.
      - ``starting_balance_cents``: current primary-account balance.

    Charges are forecast from the subscription cursor; this is a read-only
    projection and does not materialise anything.
    """
    from app.services.accounts import get_primary_account  # noqa: PLC0415
    from app.services.periods import _today_in_app_tz  # noqa: PLC0415

    if today is None:
        today = _today_in_app_tz()
    horizon_end = today + timedelta(days=horizon_days)

    primary = await get_primary_account(db, user_id=user_id)
    starting_balance = int(primary.balance_cents) if primary is not None else 0

    subs = (
        (
            await db.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == user_id,
                    Subscription.is_active.is_(True),
                )
                .options(selectinload(Subscription.category))
            )
        )
        .scalars()
        .all()
    )

    events: list[dict] = []
    monthly_burden = 0
    for sub in subs:
        kind_value = (
            sub.category.kind.value
            if sub.category is not None and hasattr(sub.category.kind, "value")
            else "expense"
        )
        # Monthly burden: one interval's amount normalised to a month.
        interval = max(sub.interval_months, 1)
        if kind_value == "expense":
            monthly_burden += round(sub.amount_cents / interval)
        cursor = sub.next_charge_date
        # Guard against runaway loops on degenerate data.
        for _ in range(1000):
            if cursor > horizon_end:
                break
            if cursor >= today:
                events.append(
                    {
                        "date": cursor,
                        "name": sub.name,
                        "amount_cents": sub.amount_cents,
                        "kind": kind_value,
                        "category_id": sub.category_id,
                        "subscription_id": sub.id,
                    }
                )
            cursor = _advance_date(
                cursor,
                interval_months=interval,
                day_of_month=sub.day_of_month,
            )

    events.sort(key=lambda e: (e["date"], e["subscription_id"]))

    running = starting_balance
    timeline: list[dict] = []
    for e in events:
        if e["kind"] == "income":
            running += e["amount_cents"]
        else:
            running -= e["amount_cents"]
        timeline.append(
            {
                "date": e["date"],
                "name": e["name"],
                "amount_cents": e["amount_cents"],
                "kind": e["kind"],
                "category_id": e["category_id"],
                "subscription_id": e["subscription_id"],
                "balance_after_cents": running,
            }
        )

    return {
        "starting_balance_cents": starting_balance,
        "horizon_days": horizon_days,
        "monthly_burden_cents": monthly_burden,
        "timeline": timeline,
    }
