"""RLS policy integration tests — Phase 11 (MUL-02).

RED phase (Plan 11-01): тесты raise NotImplementedError. Заполнение в Plan 11-07.

Идея тестов:
  1. Без SET LOCAL app.current_user_id — query на любую доменную таблицу
     возвращает 0 rows (RLS coalesce(setting, -1) даёт filter user_id = -1
     который не матчит ни одну строку).
  2. С SET LOCAL app.current_user_id = user_a_id — query возвращает только
     строки user_a (никаких user_b).
  3. SET LOCAL — transaction-scoped: после COMMIT/ROLLBACK setting сбрасывается.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text


pytestmark = pytest.mark.asyncio


async def test_rls_blocks_query_without_setting(two_tenants, db_session):
    """MUL-02: SELECT без app.current_user_id должен вернуть 0 rows."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: открыть transaction без SET LOCAL app.current_user_id, "
        "выполнить SELECT count(*) FROM category — ожидать 0 (RLS coalesce "
        "к -1 не матчит). Verify сразу что SET LOCAL = user_a_id даёт "
        "только категории user_a."
    )


async def test_rls_filters_by_app_current_user_id(two_tenants, db_session):
    """MUL-02: SELECT с SET LOCAL app.current_user_id = user_a_id → видим только user_a данные."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: SET LOCAL app.current_user_id = :user_a_id, потом "
        "SELECT user_id FROM category — все возвращённые user_id == user_a_id. "
        "Аналогично для actual_transaction, planned_transaction, subscription."
    )


async def test_rls_setting_resets_after_commit(two_tenants, db_session):
    """MUL-02: после COMMIT app.current_user_id сбрасывается (SET LOCAL = transaction scope)."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: в одной transaction SET LOCAL = user_a_id, COMMIT, "
        "затем в новой transaction (без SET LOCAL) SELECT — должен снова "
        "вернуть 0 rows (setting сброшен)."
    )


async def test_rls_enabled_on_all_nine_tables(db_session):
    """MUL-02: pg_class.relrowsecurity = true на всех 9 доменных таблицах."""
    raise NotImplementedError(
        "Plan 11-07: SELECT relname, relrowsecurity, relforcerowsecurity "
        "FROM pg_class WHERE relname IN ('category', 'budget_period', "
        "'plan_template_item', 'planned_transaction', 'actual_transaction', "
        "'subscription', 'category_embedding', 'ai_conversation', 'ai_message') — "
        "все 9 строк должны иметь relrowsecurity = True."
    )
