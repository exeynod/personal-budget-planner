"""Roundup service (Phase 22, BE-07).

Service-layer Python hook called from ``app/services/actual.create_actual_v10``
after the parent expense transaction is inserted. Creates a child
``kind='roundup'`` transaction in the same DB transaction; updates
``account.balance_cents`` atomically via the accounts-service single source
of truth.

Formula (DATA-MODEL §4):

    delta = ((|amount| + base − 1) // base) * base − |amount|

Skip cases (CONTEXT §Area 3):

    * delta == 0   (amount already a multiple of base)
    * delta == base (defensive — amount was exactly at boundary)
    * parent.kind != 'expense' (income / refund / manual deposit /
      prior roundup are all excluded — no recursion)
    * SavingsConfig absent or roundup_enabled=False

Roundup is opt-in: ``SavingsConfig`` is created at first onboarding-complete
(plan 22.11) with default ``roundup_enabled=False``. Toggle via
``PATCH /api/v1/savings/config`` (BE-08).

Threat dispositions (T-22-07-01..06): see plan 22.07 PLAN.md threat_model.
Key invariants enforced here:
  * No recursion: first gate refuses parent.kind != 'expense'.
  * No float: pure integer ceiling, no rounding error.
  * No cross-tenant write: savings cat lookup scoped by user_id; child.user_id
    = parent.user_id; RLS backstop.
  * Atomicity: caller (create_actual_v10) wraps the whole insert + child +
    balance update in one transaction.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActualKind,
    ActualTransaction,
    Category,
    SavingsConfig,
)


# ---------- Domain exceptions ----------


class SavingsCategoryMissingError(Exception):
    """Raised when no Category with code='savings' exists for user (BE-07).

    Onboarding-complete (plan 22.11) is responsible for seeding this row.
    Surfaces as 500 to caller — config drift, not user error.
    """

    def __init__(self, user_id: int) -> None:
        self.user_id = user_id
        super().__init__(
            f"No savings system Category (code='savings') exists for "
            f"user_id={user_id}; onboarding may not have completed correctly"
        )


# ---------- Pure formula (no DB, no I/O) ----------


def compute_roundup_delta(amount_cents: int, base: int) -> int:
    """Compute the roundup delta in копейки for a given amount and base.

    Args:
        amount_cents: Parent transaction amount in копейки. Sign-agnostic
            (we operate on ``abs(amount_cents)``) because roundup applies to
            spend magnitude, not direction. Expenses are stored as negative
            amounts in this codebase (CLAUDE.md / D-02), so callers may pass
            ``-101`` and get a delta of ``9``.
        base: Roundup base in копейки (10 / 50 / 100, per
            ``SavingsConfig.roundup_base`` enum).

    Returns:
        Non-negative integer delta. ``0`` means no roundup needed (amount
        already a multiple of base, or amount is zero, or base is non-positive).
        Otherwise in the half-open interval ``(0, base)``.

    Implementation:
        DATA-MODEL §4 verbatim. Pure integer math:
            ``rounded_up = ((|amount| + base − 1) // base) * base``
            ``delta = rounded_up − |amount|``
        No float, no rounding error.
    """
    abs_amt = abs(int(amount_cents))
    if abs_amt == 0:
        return 0
    if base <= 0:
        # Defensive against bad config: a non-positive base would produce
        # garbage. Caller should never pass this; treat as "no roundup".
        return 0
    rounded_up = ((abs_amt + base - 1) // base) * base
    return rounded_up - abs_amt


def should_skip(delta: int, base: int) -> bool:
    """CONTEXT §Area 3 skip rules: delta == 0 OR delta == base."""
    return delta == 0 or delta == base


# ---------- DB-touching helpers ----------


async def get_savings_config(
    db: AsyncSession, *, user_id: int
) -> Optional[SavingsConfig]:
    """Return the user's SavingsConfig row, or None if not yet created."""
    return await db.scalar(
        select(SavingsConfig).where(SavingsConfig.user_id == user_id)
    )


async def get_savings_category(
    db: AsyncSession, *, user_id: int
) -> Optional[Category]:
    """Resolve the user's system 'savings' Category (code='savings').

    Seeded at first onboarding-complete (plan 22.11). For deposit /
    roundup / rollover txns this is the destination category.
    """
    return await db.scalar(
        select(Category).where(
            Category.user_id == user_id,
            Category.code == "savings",
        )
    )


async def maybe_create_roundup_child(
    db: AsyncSession,
    *,
    user_id: int,
    parent_txn: ActualTransaction,
) -> Optional[ActualTransaction]:
    """Create a roundup child txn if all gating conditions pass.

    Gates (in order — early-exit on first failure, return None):
      1. ``parent_txn.kind != ActualKind.expense`` → no roundup
         (no recursion: prior roundup/deposit/income are all excluded).
      2. SavingsConfig absent OR ``roundup_enabled=False`` → no roundup.
      3. Computed delta hits a skip case (``delta == 0`` or
         ``delta == base``) → no roundup.

    Side effects (when all gates pass):
      * INSERT ``ActualTransaction(kind=roundup, amount=-delta,
        parent_txn_id=parent.id, account_id=parent.account_id,
        category_id=savings_cat.id, occurred_at=parent.tx_date)``.
      * UPDATE ``account.balance_cents -= delta`` (via
        ``accounts.apply_balance_delta`` — single source of truth for
        balance updates per CONTEXT §Area 2 D-04).

    Does NOT call ``commit()`` — the parent service is expected to wrap
    parent insert + child insert + both balance updates in a single
    transaction so a partial commit is impossible.

    Args:
        db: Active AsyncSession (already inside a transaction).
        user_id: Tenant scope; child.user_id = parent.user_id (we trust
            this equals the function arg per call-site contract).
        parent_txn: The parent ActualTransaction row, already flushed and
            refreshed (must have a valid ``id``).

    Returns:
        The newly created child ``ActualTransaction``, or ``None`` if any
        gate refused to create it.

    Raises:
        SavingsCategoryMissingError: SavingsConfig is enabled but no
            Category with code='savings' exists for the user (config drift —
            onboarding-complete is the only path that should seed this).
    """
    # Gate 1: kind must be expense (T-22-07-01 mitigation — no recursion).
    if parent_txn.kind != ActualKind.expense:
        return None

    # Gate 2: SavingsConfig must exist and be enabled.
    cfg = await get_savings_config(db, user_id=user_id)
    if cfg is None or not cfg.roundup_enabled:
        return None

    base = int(cfg.roundup_base)

    # Gate 3: compute delta and apply skip rules (CONTEXT §Area 3).
    delta = compute_roundup_delta(parent_txn.amount_cents, base)
    if should_skip(delta, base):
        return None

    # All gates passed — find the savings category (T-22-07-05).
    savings_cat = await get_savings_category(db, user_id=user_id)
    if savings_cat is None:
        raise SavingsCategoryMissingError(user_id)

    # Build child txn. Negative amount mirrors expense convention (D-02).
    child = ActualTransaction(
        user_id=user_id,
        period_id=parent_txn.period_id,
        kind=ActualKind.roundup,
        amount_cents=-delta,
        description="Округление",
        category_id=savings_cat.id,
        tx_date=parent_txn.tx_date,
        source=parent_txn.source,
        parent_txn_id=parent_txn.id,
        account_id=parent_txn.account_id,
    )
    db.add(child)
    await db.flush()
    await db.refresh(child)

    # Apply balance delta on the same account that the parent debited.
    # Local import — prevents circular dependency at module import time
    # (accounts.py and roundup.py both live in app/services/).
    if parent_txn.account_id is not None:
        from app.services.accounts import apply_balance_delta

        await apply_balance_delta(
            db,
            account_id=parent_txn.account_id,
            user_id=user_id,
            delta_cents=-delta,
        )

    return child


__all__ = [
    "SavingsCategoryMissingError",
    "compute_roundup_delta",
    "should_skip",
    "get_savings_config",
    "get_savings_category",
    "maybe_create_roundup_child",
]
