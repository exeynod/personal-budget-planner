"""Phase 32 REQ-32-03: default spending_cap_cents = 500 ($5/mo).

Three tests:
  • test_orm_default — Python-side ORM default = 500.
  • test_server_default — DB column default = 500 (introspection).
  • test_insert_without_cap_uses_500 — fresh INSERT picks up default.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.db.models import AppUser, UserRole

pytestmark = pytest.mark.asyncio


async def test_orm_default_is_500():
    """ORM column-level default = 500 (sqlalchemy Default object)."""
    # Use `arg` attribute which holds the literal default value.
    assert AppUser.__table__.c.spending_cap_cents.default.arg == 500


async def test_server_default_is_500(db_session):
    """DB-level column default = 500 (information_schema introspection)."""
    result = await db_session.execute(
        text(
            "SELECT column_default FROM information_schema.columns "
            "WHERE table_name='app_user' AND column_name='spending_cap_cents'"
        )
    )
    default = result.scalar_one()
    # Postgres returns string like "500" or "'500'::bigint".
    assert "500" in str(default), f"server_default = {default!r}"


async def test_insert_without_cap_uses_500(db_session):
    """Fresh INSERT без явного spending_cap_cents → 500."""
    # Use unique tg_user_id (test-bounded).
    tg = 9_300_000 + (uuid.uuid4().int & 0xFFFF)
    try:
        # Reset role + bypass RLS for setup.
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text(
                "INSERT INTO app_user (tg_user_id, role) "
                "VALUES (:tg, 'member')"
            ),
            {"tg": tg},
        )
        result = await db_session.execute(
            text(
                "SELECT spending_cap_cents FROM app_user "
                "WHERE tg_user_id = :tg"
            ),
            {"tg": tg},
        )
        cap = result.scalar_one()
        assert cap == 500, f"new user has cap = {cap}, expected 500"
    finally:
        # Cleanup
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("DELETE FROM app_user WHERE tg_user_id = :tg"),
            {"tg": tg},
        )
        await db_session.commit()
