"""Phase 33 CMP-33-02: purge_deleted_users_job worker tests.

These tests directly invoke the job entrypoint against the live DB.
Each test creates an isolated AppUser via direct SQL (bypassing RLS for
setup with `SET LOCAL row_security = off`) and verifies hard-delete +
audit-event behaviour.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.db.models import AppUser, PdnAuditEvent, PdnAuditLog
from app.services.account_deletion import COOLING_DAYS
from app.worker.jobs.purge_deleted_users import (
    ADVISORY_LOCK_KEY,
    purge_deleted_users_job,
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def purge_test_user():
    """Create a single AppUser row with `deleted_at` settable by test.

    tg_user_id 9_000_530_001 — disjoint from other compliance fixtures.
    Returns ``{tg_user_id, id, set_deleted_at}``; ``set_deleted_at``
    is a callable that updates deleted_at via direct SQL.

    Cleanup: removes the user_row + audit-log entries after each test
    (job may have already hard-deleted the row, in which case cleanup
    is a no-op on app_user but still purges audit entries).
    """
    import os
    from sqlalchemy.ext.asyncio import create_async_engine

    tg_id = 9_000_530_001
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    # Pre-cleanup.
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL row_security = off"))
        await conn.execute(
            text("DELETE FROM app_user WHERE tg_user_id = :tg"),
            {"tg": tg_id},
        )

    # Create the user via raw SQL (bypass RLS not needed for app_user).
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "INSERT INTO app_user (tg_user_id, cycle_start_day, role, "
                "spending_cap_cents) VALUES (:tg, 5, 'member', 500) "
                "RETURNING id"
            ),
            {"tg": tg_id},
        )
        uid = result.scalar_one()

    async def _set_deleted_at(value: datetime | None) -> None:
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE app_user SET deleted_at = :v WHERE id = :id"),
                {"v": value, "id": uid},
            )

    yield {
        "tg_user_id": tg_id,
        "id": uid,
        "set_deleted_at": _set_deleted_at,
    }

    # Post-cleanup.
    uid_hash = hashlib.sha256(str(uid).encode("utf-8")).hexdigest()
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL row_security = off"))
        await conn.execute(
            text("DELETE FROM pdn_audit_log WHERE user_id_hash = :h"),
            {"h": uid_hash},
        )
        await conn.execute(
            text("DELETE FROM app_user WHERE id = :id"),
            {"id": uid},
        )
    await engine.dispose()


@pytest_asyncio.fixture
async def db_check_session():
    import os
    from sqlalchemy.ext.asyncio import (
        async_sessionmaker,
        create_async_engine,
    )

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


def test_advisory_lock_key_disjoint_from_other_jobs():
    """20260101 is unique vs close_period (20250501), notify (20250502),
    charge (20250503) — defence-in-depth, HLD §6."""
    assert ADVISORY_LOCK_KEY == 20260101
    assert ADVISORY_LOCK_KEY not in (20250501, 20250502, 20250503)


async def test_job_purges_user_past_cooling(purge_test_user, db_check_session):
    """deleted_at = now() - 31d → row is hard-deleted + audit event."""
    old_ts = datetime.now(timezone.utc) - timedelta(days=COOLING_DAYS + 1)
    await purge_test_user["set_deleted_at"](old_ts)

    await purge_deleted_users_job()

    # User row must be gone.
    result = await db_check_session.execute(
        select(AppUser).where(AppUser.id == purge_test_user["id"])
    )
    assert result.scalar_one_or_none() is None

    # deletion_completed audit event written (user_id_hash matches).
    uid_hash = hashlib.sha256(
        str(purge_test_user["id"]).encode("utf-8")
    ).hexdigest()
    ev = await db_check_session.execute(
        select(PdnAuditLog).where(
            PdnAuditLog.event_type == PdnAuditEvent.deletion_completed,
            PdnAuditLog.user_id_hash == uid_hash,
        )
    )
    assert ev.scalar_one_or_none() is not None


async def test_job_skips_recently_deleted(purge_test_user, db_check_session):
    """deleted_at = now() - 5d → user NOT purged."""
    recent_ts = datetime.now(timezone.utc) - timedelta(days=5)
    await purge_test_user["set_deleted_at"](recent_ts)

    await purge_deleted_users_job()

    # User row still present.
    result = await db_check_session.execute(
        select(AppUser).where(AppUser.id == purge_test_user["id"])
    )
    assert result.scalar_one_or_none() is not None


async def test_job_skips_never_deleted_users(db_check_session):
    """User with deleted_at IS NULL → job is no-op (idempotent)."""
    # Just run the job — it must not raise even when no candidates exist.
    await purge_deleted_users_job()
