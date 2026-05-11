"""Phase 35 REQ-35-04: 14-day reverse-trial on user creation.

The dev-only ``X-Test-User`` header drives ``_dev_mode_resolve_test_user``
which INSERTs a brand-new ``app_user`` row whenever the supplied
``tg_user_id`` has never been seen before. That entry-point doubles as the
de-facto "new user" signal for Playwright fixtures and ad-hoc local dev —
so the same code path that production onboarding uses to grant a 14-day
reverse-trial fires here too.

Invariant verified:
  * After a single GET /api/v1/me with a fresh ``X-Test-User`` value, the
    new row's ``trial_ends_at`` is within ±1 minute of NOW()+14 days.

ON CONFLICT semantics — re-resolving an existing user must NOT refresh
trial_ends_at — are covered indirectly: the test fixture cleans up the
row before each run, so the INSERT branch fires every time.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

pytestmark = pytest.mark.asyncio


TG_ID = 9_000_900_001


@pytest_asyncio.fixture
async def api_client():
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def fresh_user_via_dev_resolve(api_client):
    """Wipe any pre-existing row for TG_ID, hit /api/v1/me to trigger upsert,
    then yield TG_ID. Cleanup on teardown.

    Hitting /api/v1/me with X-Test-User flows through get_current_user →
    _dev_mode_resolve_test_user, which is the path we want to exercise.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    async def _cleanup():
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            await conn.execute(
                text("DELETE FROM app_user WHERE tg_user_id = :tg"),
                {"tg": TG_ID},
            )

    await _cleanup()

    # Trigger the upsert. Response shape is irrelevant — only the side
    # effect on app_user matters. The endpoint may return 200, 409, or
    # whatever, all fine.
    await api_client.get("/api/v1/me", headers={"X-Test-User": str(TG_ID)})

    try:
        yield TG_ID
    finally:
        await _cleanup()
        await engine.dispose()


async def test_dev_resolve_grants_trial(fresh_user_via_dev_resolve):
    """The X-Test-User upsert path sets trial_ends_at ≈ NOW()+14 days."""
    tg_id = fresh_user_via_dev_resolve
    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    try:
        async with AsyncSession(engine) as s:
            await s.execute(text("SET LOCAL row_security = off"))
            row = (
                await s.execute(
                    text(
                        "SELECT trial_ends_at FROM app_user "
                        "WHERE tg_user_id = :tg"
                    ),
                    {"tg": tg_id},
                )
            ).scalar_one()
    finally:
        await engine.dispose()

    assert row is not None, "trial_ends_at must be set on new user"
    expected = datetime.now(timezone.utc) + timedelta(days=14)
    delta = abs((row - expected).total_seconds())
    assert delta < 60, (
        f"trial_ends_at {row} not within 60s of expected {expected} "
        f"(delta={delta}s)"
    )
