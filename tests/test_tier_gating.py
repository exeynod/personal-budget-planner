"""Phase 35 REQ-35-02: Pro-tier gating + /me/tier endpoint tests.

Three seeded users exercise the tier matrix:
  - FREE_TG    — no trial, no paid subscription           → tier=free
  - TRIAL_TG   — trial_ends_at > now (reverse-trial)      → tier=pro
  - PRO_TG     — pro_active_until > now (paid)            → tier=pro

Tests cover:
  - GET /api/v1/me/tier resolution for all three users (free/trial/pro).
  - POST /api/v1/ai/chat 402-blocks the free user (require_pro dependency).
  - POST /api/v1/ai/chat does NOT 402-block the trial user (Pro-gate allows
    trial-active users; downstream 4xx/5xx from the LLM stack is acceptable
    — the only invariant we assert is "no 402").

Onboarding side-effect: each seeded user is marked ``onboarded_at = now``
so the router-level ``require_onboarded`` dependency on ``/ai/chat`` does
not 409 ahead of the Pro-gate (this test is *not* covering the
onboarding gate — it is covering the tier gate).

DEV_MODE-only: integration tests run inside the api container where
DEV_MODE=true, allowing the ``X-Test-User`` header bypass. The header
is silently ignored in production.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

pytestmark = pytest.mark.asyncio

FREE_TG = 9_000_800_001
TRIAL_TG = 9_000_800_002
PRO_TG = 9_000_800_003


@pytest_asyncio.fixture
async def api_client():
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def seeded_three_users():
    """Seed three users: free (no trial), trial-active, pro-active.

    Yields a dict mapping label → app_user.id. Cleans up on teardown to
    keep DB pristine between runs.

    onboarded_at = now() so router-level ``require_onboarded`` on
    ``/ai/chat`` does not 409 before the Pro-gate fires (this fixture is
    purpose-built for tier-gating coverage; onboarding coverage lives
    elsewhere).
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    ids: dict[str, int] = {}

    async def _cleanup():
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            # The trial-user /ai/chat test creates ai_conversation + ai_message
            # rows for the trial user; delete those (and ai_usage_log) first to
            # avoid FK violations on the app_user DELETE.
            tgs = [FREE_TG, TRIAL_TG, PRO_TG]
            res = await conn.execute(
                text("SELECT id FROM app_user WHERE tg_user_id = ANY(:tgs)"),
                {"tgs": tgs},
            )
            uids = [row[0] for row in res.fetchall()]
            if uids:
                await conn.execute(
                    text(
                        "DELETE FROM ai_message WHERE conversation_id IN ("
                        "  SELECT id FROM ai_conversation WHERE user_id = ANY(:uids)"
                        ")"
                    ),
                    {"uids": uids},
                )
                await conn.execute(
                    text("DELETE FROM ai_conversation WHERE user_id = ANY(:uids)"),
                    {"uids": uids},
                )
                await conn.execute(
                    text("DELETE FROM ai_usage_log WHERE user_id = ANY(:uids)"),
                    {"uids": uids},
                )
            await conn.execute(
                text("DELETE FROM app_user WHERE tg_user_id = ANY(:tgs)"),
                {"tgs": tgs},
            )

    await _cleanup()

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL row_security = off"))
        now = datetime.now(timezone.utc)
        for tg, label, trial, pro in [
            (FREE_TG, "free", None, None),
            (TRIAL_TG, "trial", now + timedelta(days=5), None),
            (PRO_TG, "pro", now - timedelta(days=30), now + timedelta(days=10)),
        ]:
            res = await conn.execute(
                text(
                    "INSERT INTO app_user "
                    "(tg_user_id, role, trial_ends_at, pro_active_until, onboarded_at) "
                    "VALUES (:tg, 'owner', :t, :p, :ob) RETURNING id"
                ),
                {"tg": tg, "t": trial, "p": pro, "ob": now},
            )
            ids[label] = res.scalar_one()

    yield ids
    await _cleanup()
    await engine.dispose()


# --- /me/tier endpoint --------------------------------------------------------


async def test_me_tier_free(api_client, seeded_three_users):
    r = await api_client.get(
        "/api/v1/me/tier", headers={"X-Test-User": str(FREE_TG)}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["tier"] == "free"
    assert data["is_trial_active"] is False
    assert data["trial_ends_at"] is None
    assert data["pro_active_until"] is None


async def test_me_tier_trial(api_client, seeded_three_users):
    r = await api_client.get(
        "/api/v1/me/tier", headers={"X-Test-User": str(TRIAL_TG)}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["tier"] == "pro"
    assert data["is_trial_active"] is True
    assert data["trial_ends_at"] is not None
    assert data["pro_active_until"] is None


async def test_me_tier_pro(api_client, seeded_three_users):
    r = await api_client.get(
        "/api/v1/me/tier", headers={"X-Test-User": str(PRO_TG)}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["tier"] == "pro"
    # trial expired → is_trial_active must be False even though
    # trial_ends_at is non-null. Paid window drives the tier.
    assert data["is_trial_active"] is False
    assert data["pro_active_until"] is not None


# --- /ai/chat Pro-gate --------------------------------------------------------


async def test_ai_chat_blocks_free_user(api_client, seeded_three_users):
    r = await api_client.post(
        "/api/v1/ai/chat",
        json={"message": "hi"},
        headers={"X-Test-User": str(FREE_TG)},
    )
    assert r.status_code == 402, r.text
    body = r.json()
    assert body["detail"]["error"] == "PRO_TIER_REQUIRED"
    assert body["detail"]["current_tier"] == "free"


async def test_ai_chat_allows_trial_user(api_client, seeded_three_users):
    r = await api_client.post(
        "/api/v1/ai/chat",
        json={"message": "hi"},
        headers={"X-Test-User": str(TRIAL_TG)},
    )
    # Trial user must NOT see the Pro-gate 402. We deliberately do not
    # assert 200 here — downstream LLM stack may fail in CI without an
    # OPENAI_API_KEY, and that failure mode is orthogonal to this test.
    assert r.status_code != 402, f"Trial user got 402: {r.text}"
