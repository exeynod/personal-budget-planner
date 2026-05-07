"""RED tests for Phase 14 MTONB-01 — require_onboarded FastAPI dependency.

Tests fail with ImportError until Plan 14-02 exports require_onboarded
from app/api/dependencies.py.

Pattern mirrors tests/test_require_owner.py (Phase 12):
- Register a stub endpoint inside the test using Depends(require_onboarded).
- Drive requests through async_client (real HMAC path).
- Seed AppUser rows via tests/helpers/seed.py helpers.

D-14-01 contract:
  - owner or member with onboarded_at set → 200.
  - owner or member with onboarded_at IS NULL → 409 {"detail": {"error": "onboarding_required"}}.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

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
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.helpers.seed import truncate_db

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    await truncate_db()

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


async def _seed_user(SessionLocal, *, tg_user_id: int, role, onboarded_at):
    """Seed an AppUser with the given role and onboarded_at value."""
    from app.db.models import AppUser

    async with SessionLocal() as session:
        user = AppUser(
            tg_user_id=tg_user_id,
            role=role,
            cycle_start_day=5,
            onboarded_at=onboarded_at,
        )
        session.add(user)
        await session.commit()


def _register_stub_route():
    """Register GET /api/v1/_test/require_onboarded with Depends(require_onboarded).

    This import will fail with ImportError until Plan 14-02 exports
    require_onboarded from app.api.dependencies (RED gate).
    """
    from fastapi import Depends
    from app.api.dependencies import require_onboarded  # RED: ImportError until 14-02
    from app.main_api import app

    path = "/api/v1/_test/require_onboarded"
    # Guard: don't register twice across tests in the same process.
    existing_paths = {getattr(r, "path", None) for r in app.router.routes}
    if path not in existing_paths:
        @app.get(path)
        async def stub(user=Depends(require_onboarded)):
            return {"ok": True, "user_id": user.id}

    return app


async def test_require_onboarded_passes_owner_with_onboarded_at_set(
    db_client, bot_token, owner_tg_id
):
    """Owner with onboarded_at set → 200 OK."""
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    await _seed_user(
        SessionLocal,
        tg_user_id=owner_tg_id,
        role=UserRole.owner,
        onboarded_at=datetime.now(timezone.utc),
    )
    app = _register_stub_route()

    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/require_onboarded",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 200, resp.text
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/require_onboarded"
        ]


async def test_require_onboarded_passes_member_with_onboarded_at_set(
    db_client, bot_token
):
    """Member with onboarded_at set → 200 OK."""
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    tg = 9_300_000_001
    await _seed_user(
        SessionLocal,
        tg_user_id=tg,
        role=UserRole.member,
        onboarded_at=datetime.now(timezone.utc),
    )
    app = _register_stub_route()

    init_data = make_init_data(tg, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/require_onboarded",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 200, resp.text
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/require_onboarded"
        ]


async def test_require_onboarded_blocks_member_with_onboarded_at_null(
    db_client, bot_token
):
    """Member with onboarded_at=None → 409 with onboarding_required error body."""
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    tg = 9_300_000_002
    await _seed_user(
        SessionLocal,
        tg_user_id=tg,
        role=UserRole.member,
        onboarded_at=None,
    )
    app = _register_stub_route()

    init_data = make_init_data(tg, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/require_onboarded",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 409, (
            f"member with onboarded_at=None must be blocked (409), got {resp.status_code}"
        )
        body = resp.json()
        assert body == {"detail": {"error": "onboarding_required"}}, (
            f"unexpected body: {body}"
        )
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/require_onboarded"
        ]


async def test_require_onboarded_blocks_owner_with_onboarded_at_null(
    db_client, bot_token, owner_tg_id
):
    """Owner with onboarded_at=None → 409 (symmetry per D-14-01 defensive check)."""
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    await _seed_user(
        SessionLocal,
        tg_user_id=owner_tg_id,
        role=UserRole.owner,
        onboarded_at=None,
    )
    app = _register_stub_route()

    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(
            "/api/v1/_test/require_onboarded",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert resp.status_code == 409, (
            f"owner with onboarded_at=None must be blocked (409), got {resp.status_code}"
        )
        body = resp.json()
        assert body == {"detail": {"error": "onboarding_required"}}, (
            f"unexpected body: {body}"
        )
    finally:
        app.router.routes = [
            r for r in app.router.routes
            if getattr(r, "path", None) != "/api/v1/_test/require_onboarded"
        ]
