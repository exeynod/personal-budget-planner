"""RED tests for Phase 12 ROLE-04 — require_owner FastAPI dependency.

Tests fail under Phase-11 code: require_owner does not exist in
app/api/dependencies.py. Plan 12-02 will export it.

Pattern: register a stub admin endpoint inside the test using
Depends(require_owner) and a stub admin handler that returns 200.
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


@pytest.fixture(autouse=True)
def _disable_dev_mode(monkeypatch):
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


async def _seed(SessionLocal, *, tg_user_id, role):
    from app.db.models import AppUser
    async with SessionLocal() as session:
        user = AppUser(tg_user_id=tg_user_id, role=role, cycle_start_day=5)
        session.add(user)
        await session.commit()


def _register_stub_admin_route():
    """Register a /api/v1/_test/admin endpoint with Depends(require_owner)."""
    from fastapi import Depends
    from app.api.dependencies import require_owner  # RED: ImportError until 12-02
    from app.main_api import app

    @app.get("/api/v1/_test/admin")
    async def stub(_=Depends(require_owner)):
        return {"ok": True}

    return app


@pytest.mark.asyncio
async def test_require_owner_allows_owner(db_client, bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    await _seed(SessionLocal, tg_user_id=owner_tg_id, role=UserRole.owner)
    app = _register_stub_admin_route()

    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/admin",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 200, resp.text
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/admin"
        ]


@pytest.mark.asyncio
async def test_require_owner_blocks_member(db_client, bot_token):
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    tg = 9_222_222_001
    await _seed(SessionLocal, tg_user_id=tg, role=UserRole.member)
    app = _register_stub_admin_route()

    init_data = make_init_data(tg, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/admin",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 403, (
            f"member must be blocked by require_owner, got {resp.status_code}"
        )
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/admin"
        ]


@pytest.mark.asyncio
async def test_require_owner_blocks_revoked(db_client, bot_token):
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    tg = 9_222_222_002
    await _seed(SessionLocal, tg_user_id=tg, role=UserRole.revoked)
    app = _register_stub_admin_route()

    init_data = make_init_data(tg, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/admin",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 403
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/admin"
        ]
