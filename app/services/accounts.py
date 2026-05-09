"""Account service — CRUD + balance delta-accounting (Phase 22, BE-02, BE-03).

Service layer is HTTP-framework-agnostic: raises domain exceptions
(``AccountNotFoundError``, ``AccountHasTxnsError``) which the route layer
(plan 22.13) maps to HTTPException(404 / 409). No FastAPI imports here per
the same convention used in ``categories.py`` / ``actual.py``.

Phase 11 multi-tenancy contract (Plan 11-05): every public function takes
``user_id: int`` keyword-only and scopes its queries / inserts by
``Account.user_id``. RLS (``SET LOCAL app.current_user_id``) acts as
defense-in-depth backstop, but app-side filtering is the primary defense.

Key invariants:
- Exactly one ``is_primary=True`` account per user. Enforced by:
  - DB-level partial unique index ``ix_account_user_primary_one``
    (``WHERE "primary" = true``) — defense-in-depth.
  - Service-layer demote-prior-primary inside the same transaction as
    the INSERT/UPDATE that promotes a new primary.
- ``account.balance_cents`` updated atomically via ``apply_balance_delta``.
  CONTEXT §Area 2 D-04: trust delta-accounting; no reconciliation cron.
- Delete protection: refuse if any ``subscription.account_id`` references
  this account (BE-02 contract). Delete also refuses to orphan the user's
  primary account when other accounts exist (would leave user without
  a primary, violating onboarding invariant).

NOTE on ``actual_transaction.account_id``: migration 0014 does NOT add an
``account_id`` column to ``actual_transaction`` (the schema gap was
recorded in plan 22.05 SUMMARY). Per spawner Option B for plan 22.06,
balance delta-accounting from txn create/update/delete is deferred to
plan 22.07 (roundup) or 22.13 (routers). Delete-protection in this plan
only guards against ``subscription.account_id`` references; once
``actual_transaction.account_id`` lands (in a future fix-up migration),
the ``hasattr`` branch in :func:`delete_account` will pick up the
additional FK reference automatically.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Account, AccountKind, Subscription


# ---------- Domain exceptions ----------


class AccountNotFoundError(Exception):
    """Raised when an account lookup by id returns no row.

    Route layer maps to HTTPException(404). Cross-tenant id (account exists
    but ``Account.user_id != user_id``) also returns 404 (not 403) per
    REST convention — don't leak existence of resources outside scope.
    """

    def __init__(self, account_id: int) -> None:
        self.account_id = account_id
        super().__init__(f"Account {account_id} not found")


class AccountHasTxnsError(Exception):
    """Raised when trying to delete an account with referencing rows (BE-02 → 409).

    Currently checks ``subscription.account_id`` (and, when the schema
    catches up, ``actual_transaction.account_id``). The route layer maps
    this to HTTPException(409) so the UI can show "delete or migrate
    subscriptions / transactions first".
    """

    def __init__(self, account_id: int, txn_count: int, sub_count: int) -> None:
        self.account_id = account_id
        self.txn_count = txn_count
        self.sub_count = sub_count
        super().__init__(
            f"Account {account_id} has {txn_count} transactions and "
            f"{sub_count} subscriptions; delete or migrate them first"
        )


# ---------- Internal helpers ----------


async def _demote_existing_primary(db: AsyncSession, *, user_id: int) -> None:
    """Atomically demote any current primary for the user to is_primary=False.

    Single statement — no read-modify-write race. Quoting the column name
    ``"primary"`` is required because ``primary`` is a reserved word in
    PostgreSQL (T-22-05-03).
    """
    await db.execute(
        text(
            'UPDATE account SET "primary" = false '
            'WHERE user_id = :uid AND "primary" = true'
        ),
        {"uid": user_id},
    )


async def _count_user_accounts(db: AsyncSession, *, user_id: int) -> int:
    """Count accounts for a user (used to decide auto-primary on create)."""
    result = await db.scalar(
        select(func.count())
        .select_from(Account)
        .where(Account.user_id == user_id)
    )
    return int(result or 0)


# ---------- CRUD ----------


async def list_accounts(db: AsyncSession, *, user_id: int) -> list[Account]:
    """Return all accounts for the user, primary first, then by created_at ascending.

    Tenant-scoped via explicit ``Account.user_id == user_id`` filter (RLS
    backstop, app-side filter primary).
    """
    stmt = (
        select(Account)
        .where(Account.user_id == user_id)
        .order_by(Account.is_primary.desc(), Account.created_at.asc(), Account.id.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_account(
    db: AsyncSession, *, user_id: int, account_id: int
) -> Optional[Account]:
    """Non-raising fetch — returns None if not found or cross-tenant.

    Use ``get_or_404`` when callers want exception semantics for HTTP 404
    mapping; use ``get_account`` when None-on-miss is the intended contract
    (e.g., probing existence in services that can react to absence).
    """
    stmt = select(Account).where(
        Account.id == account_id,
        Account.user_id == user_id,
    )
    return await db.scalar(stmt)


async def get_or_404(
    db: AsyncSession, *, user_id: int, account_id: int
) -> Account:
    """Raise ``AccountNotFoundError`` if the account is missing or out-of-scope."""
    row = await get_account(db, user_id=user_id, account_id=account_id)
    if row is None:
        raise AccountNotFoundError(account_id)
    return row


async def create_account(
    db: AsyncSession,
    *,
    user_id: int,
    bank: str,
    kind: AccountKind | str,
    balance_cents: int = 0,
    mask: Optional[str] = None,
    primary: bool = False,
) -> Account:
    """Create a new account for ``user_id``.

    Auto-primary rule:
        - If the user has no existing accounts, the new account becomes primary
          regardless of the ``primary`` argument.
        - Otherwise, ``primary=True`` demotes the prior primary atomically
          (single transaction). ``primary=False`` keeps the prior primary.

    Args:
        bank: bank/account label (≤ 40 chars per DB CHECK).
        kind: ``AccountKind`` enum value (or string convertible to one).
        balance_cents: initial balance in копейки. Default 0.
        mask: optional last-4 mask for cards (e.g. "·· 4408"). Stored as-is.
        primary: caller's hint; auto-promotion may override to True for the
            first account.

    Returns:
        The newly created and refreshed ``Account`` row.

    Raises:
        sqlalchemy.exc.IntegrityError: on DB constraint violations
            (bank length, balance overflow, etc.) — propagates so the route
            layer can map to 422.
    """
    if not isinstance(kind, AccountKind):
        kind = AccountKind(kind)

    existing = await _count_user_accounts(db, user_id=user_id)
    auto_primary = existing == 0
    should_be_primary = bool(primary) or auto_primary

    if should_be_primary:
        # Demote any current primary BEFORE inserting to avoid
        # ix_account_user_primary_one partial-unique-index conflict.
        await _demote_existing_primary(db, user_id=user_id)

    row = Account(
        user_id=user_id,
        bank=bank,
        mask=mask,
        kind=kind,
        balance_cents=balance_cents,
        is_primary=should_be_primary,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_account(
    db: AsyncSession,
    *,
    user_id: int,
    account_id: int,
    **fields,
) -> Account:
    """Partial update of an account.

    Recognised keyword fields: ``bank``, ``mask``, ``kind``, ``balance_cents``,
    ``primary`` (alias of ``is_primary``).

    Setting ``primary=True`` demotes the prior primary atomically. Setting
    ``primary=False`` on the only primary raises ``ValueError`` (would leave
    the user without a primary account — onboarding invariant).

    Unknown fields are silently ignored to keep the surface forgiving for
    routers that pass-through Pydantic patches with extra keys.

    Note: for safe in-place balance maintenance during txn create/delete,
    use :func:`apply_balance_delta` (atomic single-statement UPDATE) instead
    of update_account(balance_cents=...).
    """
    row = await get_or_404(db, user_id=user_id, account_id=account_id)

    # Normalise the "primary" alias.
    new_primary: Optional[bool] = None
    if "primary" in fields:
        new_primary = bool(fields.pop("primary"))
    if "is_primary" in fields:
        new_primary = bool(fields.pop("is_primary"))

    if new_primary is True and not row.is_primary:
        await _demote_existing_primary(db, user_id=user_id)
        row.is_primary = True
    elif new_primary is False and row.is_primary:
        # Refuse to demote the sole primary if other accounts exist.
        total = await _count_user_accounts(db, user_id=user_id)
        if total > 1:
            raise ValueError(
                f"Cannot demote sole primary account {account_id} — "
                "promote another account first via set_primary"
            )
        # Single-account user demoting their only account is a no-op
        # (auto-primary rule will re-promote on next create); accept silently.
        row.is_primary = False

    if "kind" in fields:
        kind_val = fields["kind"]
        if not isinstance(kind_val, AccountKind):
            fields["kind"] = AccountKind(kind_val)

    allowed = {"bank", "mask", "kind", "balance_cents"}
    for field, value in fields.items():
        if field in allowed:
            setattr(row, field, value)

    await db.flush()
    await db.refresh(row)
    return row


async def set_primary(
    db: AsyncSession, *, user_id: int, account_id: int
) -> Account:
    """Atomic primary-flip: clear primary on others, set on this account.

    Convenience wrapper around update_account(primary=True). Returns the
    refreshed account row with ``is_primary=True``.
    """
    return await update_account(
        db, user_id=user_id, account_id=account_id, primary=True
    )


async def delete_account(
    db: AsyncSession, *, user_id: int, account_id: int
) -> None:
    """Hard-delete an account (CLAUDE.md: soft-delete only for category).

    Refuses with ``AccountHasTxnsError`` if any ``subscription.account_id``
    (or, once the schema lands, ``actual_transaction.account_id``)
    references this account. Refuses with ``ValueError`` when the account
    is the sole primary and other accounts exist (orphan-primary guard).

    Returns None on success. The account row is gone from the DB after
    the next flush/commit.
    """
    row = await get_or_404(db, user_id=user_id, account_id=account_id)

    # Count subscription references (account_id is nullable; only count rows that point here).
    sub_count = await db.scalar(
        select(func.count())
        .select_from(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.account_id == account_id,
        )
    )
    sub_count = int(sub_count or 0)

    # actual_transaction.account_id is forward-compat: not yet in 0014, but a
    # later migration may add it. The hasattr probe avoids a hard import-time
    # dependency on the column existing.
    txn_count = 0
    try:
        from app.db.models import ActualTransaction  # local import — avoid heavy ORM at module import

        if hasattr(ActualTransaction, "account_id"):
            txn_count_raw = await db.scalar(
                select(func.count())
                .select_from(ActualTransaction)
                .where(
                    ActualTransaction.user_id == user_id,
                    ActualTransaction.account_id == account_id,  # type: ignore[attr-defined]
                )
            )
            txn_count = int(txn_count_raw or 0)
    except Exception:
        # Defensive: never block delete due to introspection error — schema
        # gap is documented and tracked.
        txn_count = 0

    if sub_count + txn_count > 0:
        raise AccountHasTxnsError(account_id, txn_count, sub_count)

    # Orphan-primary guard: if this is the only primary and other accounts exist,
    # refuse — caller must promote another account first via set_primary().
    if row.is_primary:
        other_count = await db.scalar(
            select(func.count())
            .select_from(Account)
            .where(
                Account.user_id == user_id,
                Account.id != account_id,
            )
        )
        if int(other_count or 0) > 0:
            raise ValueError(
                f"Cannot delete primary account {account_id} while other "
                "accounts exist — promote another account first via set_primary"
            )

    await db.delete(row)
    await db.flush()
    return None


# ---------- Balance delta-accounting (BE-03) ----------


async def apply_balance_delta(
    db: AsyncSession,
    *,
    user_id: int,
    account_id: int,
    delta_cents: int,
) -> int:
    """Atomically apply a balance delta and return the new balance.

    Uses a single ``UPDATE … RETURNING`` so the read-modify-write sequence
    can never race (T-22-06-04 mitigation). The CHECK constraint
    ``ck_account_balance_range`` (±100B копеек) is the underflow safety net
    (T-22-06-03).

    This function is the single source of truth for balance updates per
    CONTEXT §Area 2 D-04 — txn services (plan 22.07/22.13) MUST call it
    on every actual_transaction insert/delete that affects an account.

    Args:
        user_id: tenant scope.
        account_id: target account.
        delta_cents: signed delta. Negative for spend, positive for income/refund.

    Returns:
        New ``balance_cents`` value after the update.

    Raises:
        AccountNotFoundError: if no row matches (account_id, user_id).
    """
    result = await db.execute(
        text(
            "UPDATE account SET balance_cents = balance_cents + :delta "
            "WHERE id = :id AND user_id = :uid "
            "RETURNING balance_cents"
        ),
        {"delta": int(delta_cents), "id": account_id, "uid": user_id},
    )
    row = result.first()
    if row is None:
        raise AccountNotFoundError(account_id)
    # row is a Row tuple — first element is balance_cents.
    return int(row[0])


# ---------- Read-side helpers ----------


async def get_primary_account(
    db: AsyncSession, *, user_id: int
) -> Optional[Account]:
    """Return the user's primary account or None.

    Used by onboarding-completion checks and by future bot ``/balance``
    handlers (Phase 25/27).
    """
    stmt = (
        select(Account)
        .where(Account.user_id == user_id, Account.is_primary.is_(True))
        .limit(1)
    )
    return await db.scalar(stmt)
