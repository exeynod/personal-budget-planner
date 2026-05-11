"""Phase 32 REQ-32-06: idempotent owner-role backfill migration.

Scenarios:
  • test_idempotent_already_owner — повторный UPDATE на уже-owner = no-op.
  • test_promotes_member_to_owner — member с tg_user_id=OWNER → owner после UPDATE.
  • test_no_owner_user_safe — отсутствие row с OWNER_TG_ID = silent no-op.

Использует raw SQL imitating migration body — независимо от alembic CLI
(тест должен бегать в одном transaction без full migration cycle).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


def _idempotent_backfill_sql(tg_user_id: int) -> str:
    """Mirror migration 0019 upgrade body."""
    return (
        "UPDATE app_user SET role = 'owner'::user_role "
        f"WHERE tg_user_id = {tg_user_id} AND role <> 'owner'"
    )


async def test_promotes_member_to_owner(db_session):
    tg = 8_881_111 + (uuid.uuid4().int & 0xFFF)  # collision-resistant
    try:
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("INSERT INTO app_user (tg_user_id, role) VALUES (:tg, 'member')"),
            {"tg": tg},
        )
        result = await db_session.execute(text(_idempotent_backfill_sql(tg)))
        # SQLAlchemy: rowcount available after DML
        assert result.rowcount == 1

        # Verify role flipped
        result = await db_session.execute(
            text("SELECT role FROM app_user WHERE tg_user_id=:tg"), {"tg": tg}
        )
        role = result.scalar_one()
        assert role == "owner"
    finally:
        # Cleanup
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("DELETE FROM app_user WHERE tg_user_id=:tg"), {"tg": tg}
        )
        await db_session.commit()


async def test_idempotent_already_owner(db_session):
    tg = 8_882_222 + (uuid.uuid4().int & 0xFFF)
    try:
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("INSERT INTO app_user (tg_user_id, role) VALUES (:tg, 'owner')"),
            {"tg": tg},
        )
        # Second-run UPDATE — should match 0 rows (idempotency).
        result = await db_session.execute(text(_idempotent_backfill_sql(tg)))
        assert result.rowcount == 0
    finally:
        # Cleanup
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("DELETE FROM app_user WHERE tg_user_id=:tg"), {"tg": tg}
        )
        await db_session.commit()


async def test_no_owner_user_safe(db_session):
    # tg_user_id, который точно не существует.
    tg = 9_999_999_999
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    result = await db_session.execute(text(_idempotent_backfill_sql(tg)))
    assert result.rowcount == 0  # silent no-op
