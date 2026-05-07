"""Phase 14 — existing-user-safety regression (MTONB success criterion #5).

The migration adds no new columns; existing owner already has
onboarded_at != null from v0.2. We must prove the gate does not
accidentally lock them out.

Also covers an interaction edge: an already-onboarded user calling
/onboarding/complete must still get the legacy AlreadyOnboardedError
409 (different body shape from the new MTONB-04 onboarding_required).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture(autouse=True)
def _disable_dev_mode(monkeypatch):
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)


# Reuse the db_client pattern from test_onboarding_gate.py — keep this file
# self-contained: no cross-file fixture dependency.
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
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def owner_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest.fixture
def member_tg_user_id() -> int:
    return 555111222


@pytest.fixture
def member_headers(bot_token, member_tg_user_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(member_tg_user_id, bot_token)}


async def _seed_owner(SessionLocal, *, tg_user_id: int, onboarded_at):
    from app.db.models import UserRole
    from tests.helpers.seed import seed_user

    async with SessionLocal() as session:
        user = await seed_user(
            session,
            tg_user_id=tg_user_id,
            role=UserRole.owner,
            onboarded_at=onboarded_at,
        )
        await session.commit()
        return user.id


async def _seed_member(SessionLocal, *, tg_user_id: int, onboarded_at):
    from app.db.models import UserRole
    from tests.helpers.seed import seed_user

    async with SessionLocal() as session:
        user = await seed_user(
            session,
            tg_user_id=tg_user_id,
            role=UserRole.member,
            onboarded_at=onboarded_at,
        )
        await session.commit()
        return user.id


@pytest.mark.asyncio
async def test_existing_onboarded_owner_passes_gate(
    db_client, owner_headers, owner_tg_id,
):
    """MTONB success criterion #5: existing owner with onboarded_at set passes gate."""
    async_client, SessionLocal = db_client
    await _seed_owner(
        SessionLocal,
        tg_user_id=owner_tg_id,
        onboarded_at=datetime.now(timezone.utc),
    )
    # /me reachable
    resp = await async_client.get("/api/v1/me", headers=owner_headers)
    assert resp.status_code == 200

    # /categories reachable (gate passes for onboarded owner)
    resp = await async_client.get("/api/v1/categories", headers=owner_headers)
    assert resp.status_code == 200, (
        f"owner expected 200 but got {resp.status_code}: {resp.text}"
    )

    # /settings reachable
    resp = await async_client.get("/api/v1/settings", headers=owner_headers)
    assert resp.status_code == 200, (
        f"owner /settings expected 200 but got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_owner_with_null_onboarded_at_also_blocked(
    db_client, owner_headers, owner_tg_id,
):
    """Symmetric defence: gate is role-agnostic; even owner gets 409 if onboarded_at is NULL."""
    async_client, SessionLocal = db_client
    await _seed_owner(SessionLocal, tg_user_id=owner_tg_id, onboarded_at=None)

    resp = await async_client.get("/api/v1/categories", headers=owner_headers)
    assert resp.status_code == 409, (
        f"owner with null onboarded_at expected 409, got {resp.status_code}: {resp.text}"
    )
    assert resp.json() == {"detail": {"error": "onboarding_required"}}, (
        f"body shape mismatch: {resp.text}"
    )


@pytest.mark.asyncio
async def test_already_onboarded_member_repeating_onboarding_complete_returns_409(
    db_client, member_headers, member_tg_user_id,
):
    """Repeating /onboarding/complete returns AlreadyOnboardedError 409 (NOT onboarding_required).

    This test pins the body-shape contract that makes Plan 14-05 Task 1 Test 2
    ('throws plain ApiError on 409 with different body shape') accurate at runtime.
    The frontend's OnboardingRequiredError detection (Plan 14-05) parses
    body.detail.error — for a string detail, that path returns undefined,
    so this 409 stays a plain ApiError per OnboardingScreen.handleSubmit's
    existing happy-path treatment. The two 409s must NOT collide.
    """
    async_client, SessionLocal = db_client
    await _seed_member(
        SessionLocal,
        tg_user_id=member_tg_user_id,
        onboarded_at=datetime.now(timezone.utc),
    )
    resp = await async_client.post(
        "/api/v1/onboarding/complete",
        headers=member_headers,
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": 5,
            "seed_default_categories": False,
        },
    )
    assert resp.status_code == 409, (
        f"already-onboarded member expected 409 AlreadyOnboardedError, "
        f"got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    # Crucial: body shape is "detail": "<string>", NOT "detail": {"error": "..."}.
    # Frontend's OnboardingRequiredError detection (Plan 14-05) parses
    # body.detail.error — for a string detail, that path returns undefined,
    # so this 409 stays a plain ApiError per OnboardingScreen.handleSubmit's
    # existing happy-path treatment.
    assert isinstance(body.get("detail"), str), (
        f"AlreadyOnboarded must use string detail to avoid frontend collision: {body}"
    )
    assert "already onboarded" in body["detail"].lower(), (
        f"AlreadyOnboarded detail must mention 'already onboarded': {body['detail']}"
    )
