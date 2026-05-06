"""RED tests for D-11-07-02 fix (Plan 12-05) — runtime Postgres role split.

After Plan 12-05:
  - DATABASE_URL connects as `budget_app` (NOSUPERUSER NOBYPASSRLS)
  - ADMIN_DATABASE_URL env var connects as privileged role for migrations
  - RLS enforces at runtime WITHOUT the _rls_test_role workaround.

Currently RED:
  - DATABASE_URL connects as `budget` (SUPERUSER → bypasses RLS)
  - ADMIN_DATABASE_URL is not set
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


@pytest.mark.asyncio
async def test_runtime_database_url_uses_nosuperuser_role():
    """DATABASE_URL должен подключать как budget_app NOSUPERUSER NOBYPASSRLS."""
    _require_db()
    # conftest.py promotes ADMIN_DATABASE_URL → DATABASE_URL for general tests;
    # this test must verify the actual production runtime URL, so prefer
    # RUNTIME_DATABASE_URL when present.
    runtime_url = os.environ.get("RUNTIME_DATABASE_URL") or os.environ["DATABASE_URL"]
    engine = create_async_engine(runtime_url, echo=False)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT current_user, rolsuper, rolbypassrls "
                    "FROM pg_roles WHERE rolname = current_user"
                )
            )
            row = result.one()
        assert row[0] == "budget_app", (
            f"DATABASE_URL must connect as 'budget_app', got {row[0]!r}"
        )
        assert row[1] is False, f"runtime role must be NOSUPERUSER, rolsuper={row[1]}"
        assert row[2] is False, f"runtime role must be NOBYPASSRLS, rolbypassrls={row[2]}"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_database_url_present_and_privileged():
    """ADMIN_DATABASE_URL должен существовать и подключать админ-роль."""
    admin_url = os.environ.get("ADMIN_DATABASE_URL")
    assert admin_url, (
        "ADMIN_DATABASE_URL env var must be set after Plan 12-05 "
        "(used by alembic migrations + admin tasks)"
    )
    engine = create_async_engine(admin_url, echo=False)
    try:
        async with engine.connect() as conn:
            # Privilege check: admin может создавать объекты в public schema.
            await conn.execute(text("CREATE TEMP TABLE _phase12_t (x int)"))
            await conn.execute(text("DROP TABLE _phase12_t"))
            # Admin role либо superuser либо имеет CREATE ON SCHEMA public.
            result = await conn.execute(
                text(
                    "SELECT current_user, rolsuper FROM pg_roles "
                    "WHERE rolname = current_user"
                )
            )
            row = result.one()
        assert row[0] != "budget_app", (
            "ADMIN_DATABASE_URL must NOT use the runtime app role"
        )
        # Можно либо superuser ('budget'), либо отдельный 'budget_admin'.
        assert row[0] in ("budget", "budget_admin", "postgres"), (
            f"unexpected admin role: {row[0]!r}"
        )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_rls_enforces_at_runtime_without_test_role(two_tenants):
    """RLS должна enforce'иться при использовании DATABASE_URL — без SET LOCAL ROLE.

    Phase 11 caveat: тесты использовали fixture _rls_test_role чтобы
    переключиться на NOSUPERUSER NOBYPASSRLS role и обойти superuser bypass.
    После Plan 12-05 рантайм уже не super → workaround не нужен.

    Тест: открываем session БЕЗ SET LOCAL app.current_user_id
    и БЕЗ SET LOCAL ROLE через RUNTIME_DATABASE_URL (budget_app, NOSUPERUSER NOBYPASSRLS)
    → SELECT FROM category должен вернуть 0 rows.
    Если runtime role всё ещё superuser, RLS bypass'нется → тест RED.

    NOTE: conftest.py promotes ADMIN_DATABASE_URL → DATABASE_URL globally for
    test infra convenience. Этот тест specifically проверяет prod runtime, так
    что использует RUNTIME_DATABASE_URL.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    runtime_url = os.environ.get("RUNTIME_DATABASE_URL") or os.environ["DATABASE_URL"]
    engine = create_async_engine(runtime_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as sess:
            # Чистая trx, без app.current_user_id, без ROLE switch.
            result = await sess.execute(text("SELECT count(*) FROM category"))
            count = result.scalar_one()
        assert count == 0, (
            f"RLS must enforce at runtime (after Plan 12-05 D-11-07-02 fix); "
            f"expected 0 visible rows but got {count} — runtime role likely "
            f"still bypasses RLS"
        )
    finally:
        await engine.dispose()
