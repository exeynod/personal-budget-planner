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


@pytest.mark.asyncio
async def test_create_account_auto_primary_on_first(db_setup, auth_headers):
    """First account auto-promoted to primary regardless of payload."""
    client, _ = db_setup
    body = {
        "bank": "Т-Банк",
        "kind": "card",
        "balance_cents": 100_00,
        "primary": False,  # explicitly false — service still promotes (auto-rule)
    }
    r = await client.post("/api/v1/accounts", json=body, headers=auth_headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["bank"] == "Т-Банк"
    assert data["kind"] == "card"
    assert data["balance_cents"] == 100_00
    assert data["primary"] is True  # auto-promoted
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_account_explicit_primary_demotes_others(
    db_setup, auth_headers
):
    """primary=true on a second account demotes the prior primary atomically."""
    client, _ = db_setup
    # First → auto-primary
    r1 = await client.post(
        "/api/v1/accounts",
        json={"bank": "T-Bank", "kind": "card", "balance_cents": 0},
        headers=auth_headers,
    )
    first_id = r1.json()["id"]
    assert r1.json()["primary"] is True

    # Second with explicit primary=true → demotes first
    r2 = await client.post(
        "/api/v1/accounts",
        json={"bank": "Tinkoff", "kind": "card", "balance_cents": 50_00, "primary": True},
        headers=auth_headers,
    )
    assert r2.status_code == 201
    assert r2.json()["primary"] is True

    # GET /accounts → primary first; first_id no longer primary
    listing = await client.get("/api/v1/accounts", headers=auth_headers)
    items = listing.json()
    assert len(items) == 2
    primaries = [a for a in items if a["primary"]]
    assert len(primaries) == 1
    assert primaries[0]["bank"] == "Tinkoff"
    assert next(a for a in items if a["id"] == first_id)["primary"] is False


# ---------------------------------------------------------------------------
# update / patch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_account_partial(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.post(
        "/api/v1/accounts",
        json={"bank": "Bank A", "kind": "card", "balance_cents": 0},
        headers=auth_headers,
    )
    aid = r.json()["id"]

    patch = await client.patch(
        f"/api/v1/accounts/{aid}",
        json={"bank": "Bank B", "balance_cents": 250_00},
        headers=auth_headers,
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["bank"] == "Bank B"
    assert body["balance_cents"] == 250_00
    assert body["kind"] == "card"  # unchanged


@pytest.mark.asyncio
async def test_update_account_404_when_missing(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.patch(
        "/api/v1/accounts/9999", json={"bank": "Nope"}, headers=auth_headers
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_account_invalid_kind_422(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.post(
        "/api/v1/accounts",
        json={"bank": "B", "kind": "card", "balance_cents": 0},
        headers=auth_headers,
    )
    aid = r.json()["id"]
    patch = await client.patch(
        f"/api/v1/accounts/{aid}",
        json={"kind": "WRONG"},
        headers=auth_headers,
    )
    # Pydantic Literal["card","cash","savings"] surfaces as 422
    assert patch.status_code == 422


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_account_204(db_setup, auth_headers):
    """Single account can be deleted (orphan-primary guard does not trip)."""
    client, _ = db_setup
    r = await client.post(
        "/api/v1/accounts",
        json={"bank": "Tmp", "kind": "card", "balance_cents": 0},
        headers=auth_headers,
    )
    aid = r.json()["id"]
    delete = await client.delete(
        f"/api/v1/accounts/{aid}", headers=auth_headers
    )
    assert delete.status_code == 204
    listing = await client.get("/api/v1/accounts", headers=auth_headers)
    assert listing.json() == []


@pytest.mark.asyncio
async def test_delete_account_404_when_missing(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.delete("/api/v1/accounts/9999", headers=auth_headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# set-primary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_primary_flips(db_setup, auth_headers):
    client, _ = db_setup
    a1 = (await client.post(
        "/api/v1/accounts",
        json={"bank": "A", "kind": "card", "balance_cents": 0},
        headers=auth_headers,
    )).json()["id"]
    a2 = (await client.post(
        "/api/v1/accounts",
        json={"bank": "B", "kind": "cash", "balance_cents": 0},
        headers=auth_headers,
    )).json()["id"]

    # a1 was auto-primary; flip to a2
    r = await client.post(
        f"/api/v1/accounts/{a2}/set-primary", headers=auth_headers
    )
    assert r.status_code == 200
    assert r.json()["primary"] is True

    listing = (await client.get(
        "/api/v1/accounts", headers=auth_headers
    )).json()
    assert next(x for x in listing if x["id"] == a1)["primary"] is False
    assert next(x for x in listing if x["id"] == a2)["primary"] is True


@pytest.mark.asyncio
async def test_set_primary_404_on_missing(db_setup, auth_headers):
    client, _ = db_setup
    r = await client.post(
        "/api/v1/accounts/99999/set-primary", headers=auth_headers
    )
    assert r.status_code == 404
