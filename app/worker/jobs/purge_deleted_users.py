"""Phase 33 CMP-33-02: purge_deleted_users_job — daily @ 02:00 MSK.

Finds users with ``deleted_at < now() - 30 days`` and performs cascade
hard-delete via ``purge_user_data``. Each user is purged in an isolated
session — a single failure doesn't block the remaining candidates.

Coordinated via ``pg_try_advisory_lock`` to prevent concurrent runs
across worker replicas (defence-in-depth; current production is single
worker container).

Disjoint advisory lock keys (HLD §6):
  - 20250501 close_period
  - 20250502 notify_subscriptions
  - 20250503 charge_subscriptions
  - 20260101 purge_deleted_users   <-- this job

Audit trail (CMP-33-01):
  After each successful purge we write a ``deletion_completed`` event
  to ``pdn_audit_log`` (keyed by sha256(user_id), so the row survives
  the hard-delete of ``app_user``).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select, text

from app.db.models import AppUser, PdnAuditEvent
from app.db.session import AsyncSessionLocal
from app.services.account_deletion import (
    COOLING_DAYS,
    purge_user_data,
)
from app.services.pdn_audit import record_audit

logger = structlog.get_logger(__name__)

# Disjoint from close_period (20250501), notify (20250502), charge (20250503).
ADVISORY_LOCK_KEY = 20260101


async def purge_deleted_users_job() -> None:
    """Daily entry point — find candidates + cascade-delete + audit.

    1. Acquire advisory lock; bail if another replica holds it.
    2. SELECT app_user WHERE deleted_at < now() - 30 days → list of ids.
    3. Release lock + commit outer session.
    4. For each user_id: open isolated session, purge_user_data,
       record_audit(deletion_completed), commit. Failures rollback +
       log.exception and continue (single bad user doesn't break run).
    """
    threshold = datetime.now(timezone.utc) - timedelta(days=COOLING_DAYS)
    user_ids: list[int] = []

    async with AsyncSessionLocal() as outer:
        got_lock = (
            await outer.execute(
                text("SELECT pg_try_advisory_lock(:k)"),
                {"k": ADVISORY_LOCK_KEY},
            )
        ).scalar_one()
        if not got_lock:
            logger.info("purge_deleted_users.skip", reason="lock_busy")
            return

        try:
            result = await outer.execute(
                select(AppUser.id).where(
                    AppUser.deleted_at.is_not(None),
                    AppUser.deleted_at < threshold,
                )
            )
            user_ids = [row[0] for row in result.fetchall()]
            logger.info(
                "purge_deleted_users.candidates", count=len(user_ids)
            )
        finally:
            await outer.execute(
                text("SELECT pg_advisory_unlock(:k)"),
                {"k": ADVISORY_LOCK_KEY},
            )
            await outer.commit()

    for uid in user_ids:
        async with AsyncSessionLocal() as session:
            try:
                counts = await purge_user_data(session, user_id=uid)
                # Audit AFTER hard-delete (uses sha256(uid); the raw user
                # row no longer exists by this point).
                await record_audit(
                    session,
                    user_id=uid,
                    event=PdnAuditEvent.deletion_completed,
                    ip=None,
                    metadata={"counts": counts},
                )
                await session.commit()
                logger.info(
                    "purge_deleted_users.purged",
                    user_id=uid,
                    counts=counts,
                )
            except Exception:
                await session.rollback()
                logger.exception(
                    "purge_deleted_users.failed", user_id=uid
                )


__all__ = ["purge_deleted_users_job", "ADVISORY_LOCK_KEY"]
