"""Integration tests for /api/v1/accounts (Phase 22, BE-02, plan 22.13).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- Auth: 403 without X-Telegram-Init-Data (skipped in DEV_MODE).
- list_accounts: empty list / multiple rows / primary first.
- create_account: auto-primary on first / explicit primary demotes others.
- update_account: partial patch, kind enum, balance bounds, orphan-primary guard.
- delete_account: 204 happy / 404 missing / 409 on subscription FK.
- set_primary: atomic flip / 404 on cross-tenant id.
"""
import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_setup(async_client, owner_tg_id):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.db.models import AppUser, UserRole
    from app.main_api import app
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    await truncate_db()

    async with SessionLocal() as session:
        session.add(AppUser(
            tg_user_id=owner_tg_id, role=UserRole.owner, cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
        ))
        await session.commit()

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


# ---------------------------------------------------------------------------
# Auth gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accounts_requires_auth_403(async_client):
    """GET /accounts без X-Telegram-Init-Data → 403."""
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    response = await async_client.get("/api/v1/accounts")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# list / create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_accounts_empty(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.get("/api/v1/accounts", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


# v1.1 (AGREED §G2): account-management routes removed — only GET /accounts
# remains (read-only single-balance surface). The mutating verbs now 404/405.


@pytest.mark.asyncio
async def test_create_account_route_removed(db_setup, auth_headers):
    """POST /accounts removed in v1.1 → 405 Method Not Allowed."""
    client, _ = db_setup
    r = await client.post(
        "/api/v1/accounts",
        json={"bank": "X", "kind": "card", "balance_cents": 0},
        headers=auth_headers,
    )
    assert r.status_code in (404, 405), r.text


@pytest.mark.asyncio
async def test_update_account_route_removed(db_setup, auth_headers):
    """PATCH /accounts/{id} removed in v1.1 → 404/405."""
    client, _ = db_setup
    r = await client.patch(
        "/api/v1/accounts/1", json={"bank": "Y"}, headers=auth_headers
    )
    assert r.status_code in (404, 405), r.text


@pytest.mark.asyncio
async def test_delete_account_route_removed(db_setup, auth_headers):
    """DELETE /accounts/{id} removed in v1.1 → 404/405."""
    client, _ = db_setup
    r = await client.delete("/api/v1/accounts/1", headers=auth_headers)
    assert r.status_code in (404, 405), r.text


@pytest.mark.asyncio
async def test_set_primary_route_removed(db_setup, auth_headers):
    """POST /accounts/{id}/set-primary removed in v1.1 → 404/405."""
    client, _ = db_setup
    r = await client.post(
        "/api/v1/accounts/1/set-primary", headers=auth_headers
    )
    assert r.status_code in (404, 405), r.text
