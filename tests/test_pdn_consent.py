"""Phase 33 CMP-33-01 smoke tests — schema + audit helper.

Full consent flow (gate on /onboarding/complete + endpoints) is tested
в `tests/test_pdn_consent_flow.py` (Plan 33-03). This file covers только
schema additions + audit-helper happy path.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.models import PdnAuditEvent, PdnAuditLog
from app.services.pdn_audit import record_audit

pytestmark = pytest.mark.asyncio


async def test_app_user_has_pdn_consent_columns(db_session):
    """Schema-level check that migration 0020 added the columns."""
    result = await db_session.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'app_user' "
            "AND column_name IN ('pdn_consent_at', 'deleted_at')"
        )
    )
    cols = {r[0] for r in result.fetchall()}
    assert cols == {"pdn_consent_at", "deleted_at"}, (
        f"Expected pdn_consent_at + deleted_at columns, got {cols}"
    )


async def test_pdn_audit_log_table_exists(db_session):
    result = await db_session.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'pdn_audit_log' ORDER BY ordinal_position"
        )
    )
    cols = [r[0] for r in result.fetchall()]
    for required in (
        "id",
        "user_id_hash",
        "event_type",
        "occurred_at",
        "ip_hash",
        "metadata",
    ):
        assert required in cols, f"Missing column {required}; got {cols}"


async def test_pdn_audit_event_enum_has_all_values(db_session):
    result = await db_session.execute(
        text(
            "SELECT unnest(enum_range(NULL::pdn_audit_event))::text AS v "
            "ORDER BY v"
        )
    )
    values = {r[0] for r in result.fetchall()}
    assert values == {
        "granted",
        "revoked",
        "data_export",
        "deletion_requested",
        "deletion_completed",
    }, f"Unexpected enum values: {values}"


async def test_record_audit_inserts_row(db_session):
    # Pick high-numbered fake user_id — record_audit hashes, no FK exists.
    before_result = await db_session.execute(
        text("SELECT count(*) FROM pdn_audit_log")
    )
    before = before_result.scalar_one()

    log = await record_audit(
        db_session,
        user_id=99999,
        event=PdnAuditEvent.granted,
        ip="127.0.0.1",
        metadata={"policy_version": "v0.1", "test": True},
    )
    await db_session.commit()

    assert log.id is not None
    # SHA256 hex is 64 chars.
    assert len(log.user_id_hash) == 64
    assert len(log.ip_hash) == 64
    assert log.event_type == PdnAuditEvent.granted

    after_result = await db_session.execute(
        text("SELECT count(*) FROM pdn_audit_log")
    )
    assert after_result.scalar_one() == before + 1

    # Cleanup.
    await db_session.execute(
        text("DELETE FROM pdn_audit_log WHERE id = :id"), {"id": log.id}
    )
    await db_session.commit()


async def test_record_audit_without_ip_leaves_ip_hash_null(db_session):
    log = await record_audit(
        db_session,
        user_id=99998,
        event=PdnAuditEvent.data_export,
        ip=None,
        metadata=None,
    )
    await db_session.commit()
    assert log.ip_hash is None
    assert log.event_metadata is None

    await db_session.execute(
        text("DELETE FROM pdn_audit_log WHERE id = :id"), {"id": log.id}
    )
    await db_session.commit()
