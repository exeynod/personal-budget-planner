"""RLS policy integration tests — Phase 11 (MUL-02).

GREEN phase (Plan 11-07): real assertions against the live PostgreSQL DB
where alembic 0006 has applied:
  - ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY on 9 domain tables
  - CREATE POLICY user_isolation USING (user_id =
        coalesce(current_setting('app.current_user_id', true)::bigint, -1))

⚠ Phase-11 caveat: dev/test docker stack uses the ``budget`` postgres role
which is a SUPERUSER (POSTGRES_USER). Postgres bypasses RLS for superusers
unconditionally — even FORCE ROW LEVEL SECURITY does not apply. To verify
the policies *actually enforce*, RLS-enforcement tests temporarily switch
to a non-superuser role via ``SET LOCAL ROLE budget_rls_test`` (provisioned
by the ``_rls_test_role`` fixture in conftest). This is **test-only** —
the production runtime continues to use the superuser ``budget`` role
until Phase 12 introduces a dedicated app role (tracked in
deferred-items.md as a Phase-12 prerequisite).

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


async def test_rls_blocks_query_without_setting(two_tenants, db_session, _rls_test_role):
    """MUL-02: SELECT без app.current_user_id → 0 rows (coalesce -1 не матчит).

    Под non-superuser ролью budget_rls_test, чтобы FORCE ROW LEVEL SECURITY
    реально применялась.
    """
    # Закрываем seed transaction и стартуем чистую с не-superuser ролью.
    await db_session.commit()
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))

    # Без SET LOCAL app.current_user_id — RLS coalesce → -1 → blocks all rows.
    result = await db_session.execute(text("SELECT count(*) FROM category"))
    count = result.scalar_one()
    assert count == 0, (
        f"Expected 0 rows without SET LOCAL (RLS coalesce → -1) but got {count}"
    )


async def test_rls_filters_by_app_current_user_id(
    two_tenants, db_session, _rls_test_role
):
    """MUL-02: SET LOCAL → видим только данные конкретного юзера."""
    user_a = two_tenants["user_a"]
    user_b = two_tenants["user_b"]

    # Свежая trx + не-superuser роль.
    await db_session.commit()
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
    await set_tenant_scope(db_session, user_a["id"])

    result = await db_session.execute(text("SELECT user_id FROM category"))
    user_ids = {row[0] for row in result.all()}
    assert user_ids == {user_a["id"]}, (
        f"Expected only user_a categories ({user_a['id']}), got {user_ids}"
    )
    # Sanity: user_b id отсутствует
    assert user_b["id"] not in user_ids


async def test_rls_setting_resets_after_commit(
    two_tenants, db_session, _rls_test_role
):
    """MUL-02: SET LOCAL — transaction scope, на COMMIT сбрасывается."""
    user_a = two_tenants["user_a"]

    # Trx 1: с не-superuser ролью + tenant scope.
    await db_session.commit()
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
    await set_tenant_scope(db_session, user_a["id"])
    await db_session.commit()  # SET LOCAL должен сброситься (включая ROLE)

    # Trx 2: новая, без setting'а — но нужна та же не-superuser роль чтобы
    # RLS применялась (без неё superuser bypassит политику).
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
    result = await db_session.execute(text("SELECT count(*) FROM category"))
    count = result.scalar_one()
    assert count == 0, (
        f"Expected 0 rows after COMMIT (setting reset) but got {count}"
    )


async def test_rls_enabled_on_all_nine_tables(db_session):
    """MUL-02: pg_class.relrowsecurity = true на всех 9 доменных таблицах.

    Schema-level check — superuser/role context не влияет.
    """
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
