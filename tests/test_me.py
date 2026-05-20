"""Phase 67 Plan 08 (P2-6, R8) — /me symmetry + single get_db source.

P2-6 (BE-F7): GET /me previously omitted ``income_cents`` while PATCH /me
returned it. Both must now carry it via a single shared ``build_me_response``
helper (also satisfies the R8 builder-dedup item).

R8: ``get_db`` was duplicated in ``app.api.dependencies`` and ``app.db.session``.
There must be a single canonical definition (the dependencies copy re-exports
the session one, same object identity).
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


# ---------- R8: single get_db source ----------


def test_get_db_single_source():
    """dependencies.get_db must BE the session.get_db (same object)."""
    from app.api.dependencies import get_db as dep_get_db
    from app.db.session import get_db as session_get_db

    assert dep_get_db is session_get_db, (
        "get_db must have a single canonical definition shared between "
        "app.db.session and app.api.dependencies (R8 dedup)"
    )


# ---------- P2-6 / R8: shared MeResponse builder ----------


def test_build_me_response_helper_exists():
    """A shared builder must exist and be importable."""
    from app.api.routes.me import build_me_response

    assert callable(build_me_response)


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

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    from tests.helpers.seed import truncate_db
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
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def _seed(SessionLocal, *, tg_user_id, income_cents):
    from datetime import datetime, timezone
    from app.db.models import AppUser, UserRole
    async with SessionLocal() as session:
        session.add(
            AppUser(
                tg_user_id=tg_user_id,
                role=UserRole.owner,
                cycle_start_day=5,
                income_cents=income_cents,
                onboarded_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_get_me_includes_income_cents(db_client, bot_token, owner_tg_id):
    """GET /me must surface income_cents (symmetry with PATCH /me)."""
    from tests.conftest import make_init_data

    client, SessionLocal = db_client
    await _seed(SessionLocal, tg_user_id=owner_tg_id, income_cents=12_345_600)
    init_data = make_init_data(owner_tg_id, bot_token)

    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "income_cents" in body, (
        f"GET /me must include income_cents (P2-6), got keys={list(body.keys())}"
    )
    assert body["income_cents"] == 12_345_600


@pytest.mark.asyncio
async def test_get_and_patch_me_symmetric_on_income(
    db_client, bot_token, owner_tg_id
):
    """PATCH /me echo and the subsequent GET /me must agree on income_cents."""
    from tests.conftest import make_init_data

    client, SessionLocal = db_client
    await _seed(SessionLocal, tg_user_id=owner_tg_id, income_cents=10_000_00)
    init_data = make_init_data(owner_tg_id, bot_token)
    headers = {"X-Telegram-Init-Data": init_data}

    patch_resp = await client.patch(
        "/api/v1/me", json={"income_cents": 20_000_00}, headers=headers
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()["income_cents"]
    assert patched == 20_000_00

    get_resp = await client.get("/api/v1/me", headers=headers)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["income_cents"] == patched
