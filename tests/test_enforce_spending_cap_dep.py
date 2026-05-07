"""RED tests for AICAP-01/02 — enforce_spending_cap FastAPI dependency.

All tests RED until Plan 15-03 adds enforce_spending_cap to app/api/dependencies.py.

Contract (CONTEXT D-15-01):
  - enforce_spending_cap depends on current_user + db.
  - spend < cap  → returns None (passthrough, 200).
  - spend >= cap → HTTPException(429, detail={...}, headers={"Retry-After": "..."}).
  - cap=0        → always 429 (any spend >= 0 triggers).

Pattern mirrors tests/test_require_onboarded.py: register a stub route inside
the test body, drive requests via db_client, then remove the route.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


@pytest.fixture(autouse=True)
def _disable_dev_mode(monkeypatch):
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)


@pytest_asyncio.fixture
async def db_client(async_client):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from tests.helpers.seed import _PHASE13_TRUNCATE_TABLES, _DEFAULT_TRUNCATE_TABLES
    from app.api.dependencies import get_db
    from app.main_api import app
    from sqlalchemy import text

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    admin_engine = create_async_engine(admin_url, echo=False)
    async with admin_engine.begin() as conn:
        try:
            await conn.execute(
                text(f"TRUNCATE TABLE {_PHASE13_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
        except Exception:
            from tests.helpers.seed import _DEFAULT_TRUNCATE_TABLES
            await conn.execute(
                text(f"TRUNCATE TABLE {_DEFAULT_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
    await admin_engine.dispose()

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

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


_CAP_ROUTE = "/api/v1/_test/enforce_spending_cap"


def _install_cap_test_route():
    """Register GET _CAP_ROUTE with Depends(enforce_spending_cap).

    RED: ImportError until Plan 15-03 exports enforce_spending_cap from
    app.api.dependencies.
    """
    from fastapi import Depends
    from app.api.dependencies import enforce_spending_cap  # RED: ImportError until 15-03
    from app.main_api import app

    existing = {getattr(r, "path", None) for r in app.router.routes}
    if _CAP_ROUTE not in existing:
        @app.get(_CAP_ROUTE, dependencies=[Depends(enforce_spending_cap)])
        async def _stub_cap_handler():
            return {"ok": True}

    return app


def _remove_cap_test_route(app):
    app.router.routes = [
        r for r in app.router.routes
        if getattr(r, "path", None) != _CAP_ROUTE
    ]


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_under_cap_passes_through(db_client, bot_token, owner_tg_id):
    """Owner with cap=46500 cents and spend=1 cent → dependency passes (200)."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        # cap=46500 по умолчанию (default из модели); spend=1 cent (0.01 USD)
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 46500 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()

    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=user.id, est_cost_usd=0.01)  # 1 cent

    app = _install_cap_test_route()
    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(_CAP_ROUTE, headers={"X-Telegram-Init-Data": init_data})
        assert resp.status_code == 200, (
            f"spend=1 cent < cap=46500 cents must pass (200), got {resp.status_code}: {resp.text}"
        )
    finally:
        _remove_cap_test_route(app)


@pytest.mark.asyncio
async def test_at_cap_returns_429(db_client, bot_token, owner_tg_id):
    """Owner with cap=100 cents, spend exactly 100 cents (1.00 USD) → 429."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 100 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()

    async with SessionLocal() as s:
        # 1.00 USD → 100 cents = exactly at cap
        await seed_ai_usage_log(s, user_id=user.id, est_cost_usd=1.0)

    app = _install_cap_test_route()
    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(_CAP_ROUTE, headers={"X-Telegram-Init-Data": init_data})
        assert resp.status_code == 429, (
            f"spend=cap=100 cents must be blocked (429), got {resp.status_code}: {resp.text}"
        )
    finally:
        _remove_cap_test_route(app)


@pytest.mark.asyncio
async def test_over_cap_returns_429_with_retry_after(db_client, bot_token, owner_tg_id):
    """spend > cap → 429 with Retry-After header and spending_cap_exceeded detail."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 100 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()

    async with SessionLocal() as s:
        # 2.50 USD → 250 cents >> cap of 100
        await seed_ai_usage_log(s, user_id=user.id, est_cost_usd=2.5)

    app = _install_cap_test_route()
    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(_CAP_ROUTE, headers={"X-Telegram-Init-Data": init_data})
        assert resp.status_code == 429, (
            f"spend=250 cents > cap=100 must be blocked (429), got {resp.status_code}"
        )
        # Retry-After header must be a positive integer string
        retry_after = resp.headers.get("Retry-After", "")
        assert retry_after.isdigit(), f"Retry-After must be digit string, got {retry_after!r}"
        assert int(retry_after) > 0, f"Retry-After must be positive, got {retry_after}"
        # Detail shape: {"error": "spending_cap_exceeded", "spent_cents": int, "cap_cents": int}
        detail = resp.json().get("detail", {})
        assert detail.get("error") == "spending_cap_exceeded", (
            f"detail.error must be 'spending_cap_exceeded', got {detail}"
        )
        assert detail.get("spent_cents") == 250, f"spent_cents expected 250, got {detail}"
        assert detail.get("cap_cents") == 100, f"cap_cents expected 100, got {detail}"
    finally:
        _remove_cap_test_route(app)


@pytest.mark.asyncio
async def test_cap_zero_blocks_immediately(db_client, bot_token, owner_tg_id):
    """cap=0 with no logs → 429 (spend=0 >= cap=0 triggers immediately)."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 0 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()

    app = _install_cap_test_route()
    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(_CAP_ROUTE, headers={"X-Telegram-Init-Data": init_data})
        assert resp.status_code == 429, (
            f"cap=0, no logs: spend=0 >= cap=0 must block (429), got {resp.status_code}"
        )
    finally:
        _remove_cap_test_route(app)


@pytest.mark.asyncio
async def test_cap_zero_blocks_with_logs(db_client, bot_token, owner_tg_id):
    """cap=0 with existing logs → 429."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 0 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()

    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=user.id, est_cost_usd=0.001)

    app = _install_cap_test_route()
    init_data = make_init_data(owner_tg_id, bot_token)
    try:
        resp = await client.get(_CAP_ROUTE, headers={"X-Telegram-Init-Data": init_data})
        assert resp.status_code == 429, (
            f"cap=0 with logs must block (429), got {resp.status_code}"
        )
    finally:
        _remove_cap_test_route(app)


@pytest.mark.asyncio
async def test_member_with_own_cap_under_limit(db_client, bot_token):
    """Member with cap=46500 cents and small spend → 200 (cap is per-user, not owner-only)."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    member_tg = 9_850_000_001
    async with SessionLocal() as s:
        member = await seed_user(
            s, tg_user_id=member_tg, role=UserRole.member,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 46500 WHERE id = :uid"),
            {"uid": member.id},
        )
        await s.commit()

    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=member.id, est_cost_usd=0.005)  # ~1 cent

    app = _install_cap_test_route()
    init_data = make_init_data(member_tg, bot_token)
    try:
        resp = await client.get(_CAP_ROUTE, headers={"X-Telegram-Init-Data": init_data})
        assert resp.status_code == 200, (
            f"member under cap should pass (200), got {resp.status_code}: {resp.text}"
        )
    finally:
        _remove_cap_test_route(app)
