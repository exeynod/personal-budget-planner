"""Phase 33 CMP-33-01: ПДн audit write helper.

Single-purpose service: writes one row to `pdn_audit_log` per
consent / export / deletion event. Hashes user_id + ip via sha256
so the audit table contains no raw identifiers (152-ФЗ principle:
audit trail must outlive the subject's right-to-erasure).

Usage:
    await record_audit(
        db,
        user_id=current_user.id,
        event=PdnAuditEvent.granted,
        ip=request.client.host if request else None,
        metadata={"policy_version": "v0.1"},
    )

The caller is responsible for flushing/committing the session — this
service only adds to it (so transactional boundaries stay with caller).
"""
from __future__ import annotations

import hashlib
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PdnAuditEvent, PdnAuditLog

logger = structlog.get_logger(__name__)


def _sha256_hex(s: str) -> str:
    """Return hex-encoded sha256 of input string."""
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


async def record_audit(
    db: AsyncSession,
    *,
    user_id: int,
    event: PdnAuditEvent,
    ip: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> PdnAuditLog:
    """Insert one row into pdn_audit_log.

    Args:
        db: AsyncSession.
        user_id: raw user_id, hashed before persisting.
        event: PdnAuditEvent enum member.
        ip: optional raw IP-address, hashed before persisting.
        metadata: optional JSONB metadata payload.

    Returns:
        The persisted PdnAuditLog instance (flushed; not committed).
    """
    row = PdnAuditLog(
        user_id_hash=_sha256_hex(str(user_id)),
        event_type=event,
        ip_hash=_sha256_hex(ip) if ip else None,
        event_metadata=metadata,
    )
    db.add(row)
    await db.flush()
    # NOTE: structlog reserves `event` as the message-name kwarg — use
    # `audit_event` to avoid "multiple values for argument 'event'".
    logger.info(
        "pdn.audit.recorded",
        audit_event=event.value,
        user_id_hash_prefix=row.user_id_hash[:8],
    )
    return row
