"""INF-02 — ``alembic upgrade head`` materialises every required table.

Integration test: requires a running PostgreSQL instance and the
``DATABASE_URL`` env var (the same one ``app.core.settings`` will read).
Run as part of the Wave-2 migration check, e.g.::

    uv run pytest tests/test_migrations.py -x

Wave-0 RED state: ``DATABASE_URL`` is not yet set anywhere, so this test
self-skips. Once Plan 03 adds the migration and Plan 02 wires settings, the
test will execute and confirm all v1.0 domain tables and
``alembic_version`` exist (``alembic_version`` is created by Alembic
itself).

Phase 22 (plan 22.13/22.16): ``plan_template_item`` was dropped in alembic
0013 — ``Category.plan_cents`` is now the source of truth. Three v1.0
tables (``account``, ``goal``, ``savings_config``) were added in 0012/0014.
The ``EXPECTED_TABLES`` set below reflects the v1.0 schema state;
detailed v1.0 schema-shape assertions live in
``tests/test_migrations_v1_0.py``.
"""

import os

import pytest

EXPECTED_TABLES = {
    "app_user",
    "category",
    "budget_period",
    # plan_template_item dropped in alembic 0013 (Phase 22, plan 22.02).
    "planned_transaction",
    "actual_transaction",
    "subscription",
    "app_health",
    # Phase 22 v1.0 tables (plans 22.01, 22.03):
    "account",
    # v1.1 (planning rework): goal/savings_config dropped (0031);
    # plan-template + per-period plan added (0028).
    "plan_template_item",
    "plan_template_line",
    "period_category_plan",
}


@pytest.mark.asyncio
async def test_all_tables_exist():
    """After ``alembic upgrade head`` all expected tables must exist."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set — skipping migration test")

    engine = create_async_engine(db_url, echo=False)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            )
            existing = {row[0] for row in result}
    finally:
        await engine.dispose()

    missing = EXPECTED_TABLES - existing
    assert not missing, f"Missing tables after migration: {missing}"
