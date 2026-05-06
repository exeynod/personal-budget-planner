"""RLS policy integration tests — Phase 11 (MUL-02).

GREEN phase (Plan 11-07): real assertions against the live PostgreSQL DB
where alembic 0006 has applied:
  - ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY on 9 domain tables
  - CREATE POLICY user_isolation USING (user_id =
        coalesce(current_setting('app.current_user_id', true)::bigint, -1))

Tests:
  1. test_rls_blocks_query_without_setting — без SET LOCAL → coalesce -1 → 0 rows
  2. test_rls_filters_by_app_current_user_id — SET LOCAL → видим только user_a
  3. test_rls_setting_resets_after_commit — SET LOCAL = transaction scope
  4. test_rls_enabled_on_all_nine_tables — pg_class.relrowsecurity == true
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.session import set_tenant_scope


pytestmark = pytest.mark.asyncio


async def test_rls_blocks_query_without_setting(two_tenants, db_session):
    """MUL-02: SELECT без app.current_user_id → 0 rows (coalesce -1 не матчит)."""
    # Закрываем текущую trx (после fixture seed); SET LOCAL of fixture сброшен.
    await db_session.commit()

    # Without SET LOCAL — RLS coalesce → -1 → blocks all rows.
    result = await db_session.execute(text("SELECT count(*) FROM category"))
    count = result.scalar_one()
    assert count == 0, (
        f"Expected 0 rows without SET LOCAL (RLS coalesce → -1) but got {count}"
    )


async def test_rls_filters_by_app_current_user_id(two_tenants, db_session):
    """MUL-02: SET LOCAL → видим только данные конкретного юзера."""
    user_a = two_tenants["user_a"]
    user_b = two_tenants["user_b"]

    await set_tenant_scope(db_session, user_a["id"])

    result = await db_session.execute(text("SELECT user_id FROM category"))
    user_ids = {row[0] for row in result.all()}
    assert user_ids == {user_a["id"]}, (
        f"Expected only user_a categories ({user_a['id']}), got {user_ids}"
    )
    # Sanity: user_b id отсутствует
    assert user_b["id"] not in user_ids


async def test_rls_setting_resets_after_commit(two_tenants, db_session):
    """MUL-02: SET LOCAL — transaction scope, на COMMIT сбрасывается."""
    user_a = two_tenants["user_a"]
    await set_tenant_scope(db_session, user_a["id"])
    await db_session.commit()  # SET LOCAL должен сброситься

    # Новая transaction (implicit при следующем execute) — без setting'а.
    result = await db_session.execute(text("SELECT count(*) FROM category"))
    count = result.scalar_one()
    assert count == 0, (
        f"Expected 0 rows after COMMIT (setting reset) but got {count}"
    )


async def test_rls_enabled_on_all_nine_tables(db_session):
    """MUL-02: pg_class.relrowsecurity = true на всех 9 доменных таблицах."""
    domain_tables = (
        "category",
        "budget_period",
        "plan_template_item",
        "planned_transaction",
        "actual_transaction",
        "subscription",
        "category_embedding",
        "ai_conversation",
        "ai_message",
    )

    result = await db_session.execute(
        text(
            "SELECT relname, relrowsecurity, relforcerowsecurity "
            "FROM pg_class "
            "WHERE relname = ANY(:tables) AND relkind = 'r'"
        ),
        {"tables": list(domain_tables)},
    )
    rows = {row[0]: (row[1], row[2]) for row in result.all()}
    assert set(rows.keys()) == set(domain_tables), (
        f"Missing tables in pg_class: {set(domain_tables) - set(rows.keys())}"
    )
    for table, (relrowsecurity, relforcerowsecurity) in rows.items():
        assert relrowsecurity, f"{table}: ROW LEVEL SECURITY not enabled"
        assert relforcerowsecurity, f"{table}: FORCE ROW LEVEL SECURITY not set"
