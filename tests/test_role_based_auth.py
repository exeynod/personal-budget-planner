"""RED tests for Phase 12 ROLE-02 / ROLE-03 — get_current_user role-based auth.

Tests fail under current Phase-11 code:
- Plan 12-02 refactors get_current_user to return AppUser ORM (not dict),
  check role IN ('owner', 'member'), reject 'revoked' + unknown.

All DB-backed tests skip if DATABASE_URL not set (CI-safe).
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


@pytest.fixture(autouse=True)
def _disable_dev_mode(monkeypatch):
    # docker-compose.dev.yml sets DEV_MODE=true on the api container, which
    # makes get_current_user inject a mock OWNER and skip role-based checks.
    # These tests exercise the real role-based path, so patch the cached
    # settings.DEV_MODE flag for the duration of each test.
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)


@pytest_asyncio.fixture
async def db_client(async_client):
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE category, planned_transaction, "
                "actual_transaction, plan_template_item, subscription, "
                "budget_period, ai_message, ai_conversation, "
                "category_embedding, app_user RESTART IDENTITY CASCADE"
            )
        )

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db
    yield async_client, SessionLocal
    await engine.dispose()


async def _seed_user(SessionLocal, *, tg_user_id, role):
    """Insert AppUser with explicit role; commit."""
    from app.db.models import AppUser, UserRole
    async with SessionLocal() as session:
        user = AppUser(tg_user_id=tg_user_id, role=role, cycle_start_day=5)
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user.id


@pytest.mark.asyncio
async def test_revoked_user_gets_403(db_client, bot_token):
    """ROLE-03: role=revoked → 403 на любом public endpoint."""
    from tests.conftest import make_init_data
    client, SessionLocal = db_client
    from app.db.models import UserRole
    await _seed_user(SessionLocal, tg_user_id=9_111_111_001, role=UserRole.revoked)
    init_data = make_init_data(9_111_111_001, bot_token)
    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 403, (
        f"revoked must get 403, got {resp.status_code} body={resp.text}"
    )


@pytest.mark.asyncio
async def test_member_user_gets_200(db_client, bot_token):
    """ROLE-03: role=member → 200 (member проходит в get_current_user)."""
    from tests.conftest import make_init_data
    client, SessionLocal = db_client
    from app.db.models import UserRole
    await _seed_user(SessionLocal, tg_user_id=9_111_111_002, role=UserRole.member)
    init_data = make_init_data(9_111_111_002, bot_token)
    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, (
        f"member must get 200, got {resp.status_code} body={resp.text}"
    )


@pytest.mark.asyncio
async def test_owner_user_gets_200(db_client, bot_token, owner_tg_id):
    """ROLE-02: OWNER_TG_ID юзер с role=owner проходит."""
    from tests.conftest import make_init_data
    client, SessionLocal = db_client
    from app.db.models import UserRole
    await _seed_user(SessionLocal, tg_user_id=owner_tg_id, role=UserRole.owner)
    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, (
        f"owner must get 200, got {resp.status_code} body={resp.text}"
    )


@pytest.mark.asyncio
async def test_unknown_tg_user_id_gets_403(db_client, bot_token):
    """ROLE-03: неизвестный tg_user_id (нет AppUser строки) → 403."""
    from tests.conftest import make_init_data
    client, _ = db_client  # NO seeding
    init_data = make_init_data(9_999_999_999, bot_token)
    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 403, (
        f"unknown tg_user_id must get 403, got {resp.status_code} body={resp.text}"
    )


@pytest.mark.asyncio
async def test_get_current_user_returns_app_user_orm(db_client, bot_token, owner_tg_id):
    """ROLE-02 design: get_current_user должна возвращать AppUser ORM (не dict).

    RED until Plan 12-02. Тест проверяет через FastAPI dep override:
    регистрирует stub endpoint, который читает Depends(get_current_user)
    и asserts isinstance(...).
    """
    from fastapi import Depends
    from tests.conftest import make_init_data
    from app.api.dependencies import get_current_user
    from app.db.models import AppUser, UserRole
    from app.main_api import app

    client, SessionLocal = db_client
    await _seed_user(SessionLocal, tg_user_id=owner_tg_id, role=UserRole.owner)

    # Регистрируем stub endpoint только для теста.
    @app.get("/_test/current_user_type")
    async def _stub(user=Depends(get_current_user)):
        return {
            "type": type(user).__name__,
            "is_app_user": isinstance(user, AppUser),
            "has_role": hasattr(user, "role"),
        }

    try:
        init_data = make_init_data(owner_tg_id, bot_token)
        resp = await client.get(
            "/_test/current_user_type",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["is_app_user"], (
            f"get_current_user must return AppUser ORM, got {body['type']}"
        )
        assert body["has_role"], "AppUser ORM must have .role attribute"
    finally:
        # Cleanup: remove stub route to keep app pristine.
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/_test/current_user_type"
        ]


def test_owner_tg_id_eq_no_longer_in_get_current_user():
    """ROLE-02: get_current_user body не содержит OWNER_TG_ID equality check.

    Plan 12-02 рефакторит get_current_user так, что OWNER_TG_ID не используется
    для request-time auth check. DEV_MODE branch вынесен в helper-функцию
    _dev_mode_resolve_owner, поэтому тело get_current_user не содержит
    OWNER_TG_ID вообще (ни ==, ни != сравнений).

    Uses ast.parse + ast.walk for precision: проверяет только тело
    AsyncFunctionDef 'get_current_user', игнорирует docstrings/comments.
    Допускает вызов _dev_mode_resolve_owner (helper), но запрещает
    прямые equality checks с OWNER_TG_ID в самой функции.
    """
    import ast

    path = Path("app/api/dependencies.py")
    assert path.exists(), f"missing {path}"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "get_current_user":
            src = ast.unparse(node)
            # Disallow OWNER_TG_ID-equality style in the function.
            # DEV_MODE upsert lives in _dev_mode_resolve_owner — not here.
            assert "!= settings.OWNER_TG_ID" not in src and "== settings.OWNER_TG_ID" not in src, (
                "get_current_user must not contain OWNER_TG_ID equality check "
                "(ROLE-02). Equality checks belong in _dev_mode_resolve_owner helper."
            )
            return
    pytest.fail("get_current_user not found in app/api/dependencies.py")
