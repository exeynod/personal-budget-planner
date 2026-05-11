"""RLS audit — Phase 32 REQ-32-01.

Проверяет, что все доменные таблицы multi-tenant production-ready:
  • RLS enabled (`pg_class.relrowsecurity = true`)
  • RLS forced for table owner (`pg_class.relforcerowsecurity = true`)
  • Policy с `current_setting('app.current_user_id', true)::bigint` exists
    (по имени фильтрует через `pg_policy`).

Это audit-test — не вносит изменения, только подтверждает state of v0.4 + v1.0.

Note: `plan_template_item` table был dropped в v1.0 Phase 22 (plan 22.13).
Currently 12 tenant tables: 8 v0.4 + ai_usage_log (Phase 13) + 3 v1.0 (Phase 22).
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio

# v0.4 (Phase 11 + Phase 13) + v1.0 (Phase 22) tenant tables.
# plan_template_item dropped в v1.0 plan 22.13.
TENANT_TABLES = [
    # Phase 11 (v0.4)
    "category",
    "budget_period",
    "planned_transaction",
    "actual_transaction",
    "subscription",
    "category_embedding",
    "ai_conversation",
    "ai_message",
    # Phase 13 (v0.4)
    "ai_usage_log",
    # v1.0 (Phase 22)
    "account",
    "goal",
    "savings_config",
]


@pytest.mark.parametrize("table", TENANT_TABLES)
async def test_rls_enabled_and_forced(db_session, table):
    """Every tenant table должен иметь ENABLE + FORCE ROW LEVEL SECURITY."""
    result = await db_session.execute(
        text(
            "SELECT relrowsecurity, relforcerowsecurity "
            "FROM pg_class WHERE relname = :t AND relkind = 'r'"
        ),
        {"t": table},
    )
    row = result.first()
    assert row is not None, f"Table {table} not found in pg_class"
    relrowsecurity, relforcerowsecurity = row
    assert relrowsecurity is True, f"RLS not enabled on {table}"
    assert relforcerowsecurity is True, f"RLS not forced on {table}"


@pytest.mark.parametrize("table", TENANT_TABLES)
async def test_rls_policy_uses_current_user_id_setting(db_session, table):
    """Each tenant table must have at least one policy that filters by
    `current_setting('app.current_user_id', ...)::bigint`."""
    result = await db_session.execute(
        text(
            "SELECT polname, pg_get_expr(polqual, polrelid) AS qual "
            "FROM pg_policy "
            "WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = :t)"
        ),
        {"t": table},
    )
    rows = result.fetchall()
    assert rows, f"No RLS policies for {table}"
    has_user_id_filter = any(
        "current_setting" in (r[1] or "") and "app.current_user_id" in (r[1] or "")
        for r in rows
    )
    assert has_user_id_filter, (
        f"No policy with current_setting('app.current_user_id') filter on {table}; "
        f"policies found: {[(r[0], r[1]) for r in rows]}"
    )
