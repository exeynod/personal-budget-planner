"""Phase 33 CMP-33-02: account deletion (soft-delete + purge).

Soft-delete (``soft_delete_account``) sets ``app_user.deleted_at = now()``.
The user has 30 days to re-grant consent and resume usage; before then,
their data is untouched (cooling window).

After 30 days, ``purge_user_data`` physically removes all domain rows in
reverse-dependency order to avoid orphan FK violations. The worker job
``app/worker/jobs/purge_deleted_users.py`` invokes this helper per
candidate user.

RLS note: tenant-scoped tables under FORCE ROW LEVEL SECURITY require
the ``app.current_user_id`` GUC to match the row's ``user_id``. The
``set_tenant_scope`` GUC is set ONCE per session (within the
transaction) before DELETE-loop — all DELETEs become visible to RLS.
Single-tenant scope keeps the policy simple and avoids needing a
BYPASSRLS admin role.

For ``app_user`` table (no RLS), DELETE runs in admin session without
GUC. For ``ai_usage_log`` (CASCADE on user_id FK), the row drops
automatically when ``app_user`` is removed; no explicit DELETE needed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser
from app.db.session import set_tenant_scope

logger = structlog.get_logger(__name__)

# Cooling-period in days before hard-delete (CMP-33-02).
COOLING_DAYS = 30

# Reverse-dependency order: leaf tables first, app_user removed last.
# All tenant-scoped tables list ``user_id`` FK; we delete by user_id.
#
# Notes:
#   - ai_message → ai_conversation: ai_message references conversation_id.
#   - category_embedding: cascades on category, but we kill embeddings first
#     to avoid relying on cascade.
#   - planned_transaction / actual_transaction / subscription: reference
#     category. We delete txns before categories to avoid FK errors when
#     RESTRICT-mode (some FKs are ON DELETE RESTRICT, not CASCADE).
#   - account: subscription.account_id FK is ON DELETE SET NULL (PHASE 22),
#     so we null subs first then delete accounts.
#   - app_user: removed in a dedicated final statement (NOT in PURGE_ORDER).
#   - ai_usage_log + auth_token: ON DELETE CASCADE on user_id — auto-purge
#     when app_user row drops. Not listed here.
#   - pdn_audit_log: keyed by user_id_hash (no FK). We keep audit rows
#     after purge per CMP-33-01 (audit outlives the subject).
PURGE_ORDER: list[str] = [
    "ai_message",
    "ai_conversation",
    "category_embedding",
    "actual_transaction",
    "planned_transaction",
    # v1.1: goal/savings_config dropped; plan-template + per-period-plan added.
    "period_category_plan",
    "plan_template_line",
    "plan_template_item",
    "subscription",
    "budget_period",
    "account",
    "category",
]


async def soft_delete_account(db: AsyncSession, *, user_id: int) -> AppUser | None:
    """Set ``app_user.deleted_at = now()`` (idempotent on already-deleted).

    Returns:
        The AppUser row (with refreshed ``deleted_at``); or ``None`` if no
        such user existed.

    The caller is responsible for ``commit`` — this helper only flushes.
    """
    user = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    if user is None:
        return None
    if user.deleted_at is not None:
        return user  # idempotent
    user.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return user


async def purge_user_data(db: AsyncSession, *, user_id: int) -> dict[str, int]:
    """Cascade hard-delete of all rows tied to ``user_id``.

    Returns:
        ``{table_name: rows_deleted}`` map (useful for audit metadata).

    Strategy:
        1. Set tenant GUC so RLS policies admit our DELETE statements on
           the 11 tenant-scoped tables.
        2. DELETE FROM <table> WHERE user_id = :uid for each table in
           reverse-dependency order.
        3. DELETE FROM app_user WHERE id = :uid (no RLS).

    The caller owns the transaction; commit/rollback happens at the
    worker-job layer per CMP-33-02. On exception, rollback leaves the
    user partly purged → the next job run picks them up again (idempotent
    on rows already gone — DELETE matches zero rows is OK).
    """
    # Step 1: tenant GUC (so RLS doesn't filter out our targets).
    await set_tenant_scope(db, user_id)

    counts: dict[str, int] = {}

    for table in PURGE_ORDER:
        result = await db.execute(
            text(f"DELETE FROM {table} WHERE user_id = :uid"),
            {"uid": user_id},
        )
        counts[table] = result.rowcount or 0

    # Step 2: app_user removed last (no RLS — direct DELETE).
    result = await db.execute(
        text("DELETE FROM app_user WHERE id = :uid"),
        {"uid": user_id},
    )
    counts["app_user"] = result.rowcount or 0

    logger.info("account_deletion.purged", user_id=user_id, counts=counts)
    return counts


def is_due_for_purge(
    deleted_at: datetime | None, *, now: datetime | None = None
) -> bool:
    """Return True when ``deleted_at`` is older than ``COOLING_DAYS``.

    Used by worker job to filter candidates. ``None`` (never deleted) → False.
    """
    if deleted_at is None:
        return False
    if now is None:
        now = datetime.now(timezone.utc)
    return deleted_at < (now - timedelta(days=COOLING_DAYS))


__all__ = [
    "COOLING_DAYS",
    "PURGE_ORDER",
    "soft_delete_account",
    "purge_user_data",
    "is_due_for_purge",
]
