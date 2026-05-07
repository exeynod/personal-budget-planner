"""RED tests for AICAP-05 — GET /api/v1/me returns ai_spend_cents field.

All tests RED until Plan 15-05 extends MeResponse with ai_spend_cents: int
in app/api/router.py and wires get_user_spend_cents in the /me handler.

Contract (CONTEXT D-15-04):
  GET /api/v1/me
  Response includes ai_spend_cents: int (current MSK month; 0 if no logs).
  All existing /me fields remain present (tg_user_id, tg_chat_id, etc.).

Pattern mirrors tests/test_me_returns_role.py: db_client fixture + make_init_data.
"""
from __future__ import annotations

import math
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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
    from sqlalchemy import text
    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.helpers.seed import _PHASE13_TRUNCATE_TABLES, _DEFAULT_TRUNCATE_TABLES

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    admin_engine = create_async_engine(admin_url, echo=False)
    async with admin_engine.begin() as conn:
        try:
            await conn.execute(
                text(f"TRUNCATE TABLE {_PHASE13_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
        except Exception:
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


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_returns_ai_spend_cents_zero_for_new_user(
    db_client, bot_token, owner_tg_id
):
    """Onboarded owner with no ai_usage_log rows → ai_spend_cents == 0.

    Also verifies that all core /me fields remain present (sanity-check).
    """
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get("/api/v1/me", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Sanity-check: core fields must still be present
    for field in ("tg_user_id", "tg_chat_id", "cycle_start_day",
                  "onboarded_at", "chat_id_known", "role"):
        assert field in body, f"core field {field!r} missing from /me response"

    # New field assertion (RED: KeyError until Plan 15-05)
    assert "ai_spend_cents" in body, (
        f"MeResponse must include ai_spend_cents, got keys={list(body.keys())}"
    )
    assert body["ai_spend_cents"] == 0, (
        f"new user with no logs must have ai_spend_cents=0, got {body['ai_spend_cents']}"
    )


@pytest.mark.asyncio
async def test_me_returns_ai_spend_cents_for_owner_with_logs(
    db_client, bot_token, owner_tg_id
):
    """Owner + 3 current-month logs → ai_spend_cents = ceil(sum * 100)."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.commit()
        user_id = user.id

    # 3 логов: 0.005 + 0.012 + 0.001 = 0.018 USD → ceil(0.018 * 100) = ceil(1.8) = 2 cents
    costs = [0.005, 0.012, 0.001]
    for cost in costs:
        async with SessionLocal() as s:
            await seed_ai_usage_log(s, user_id=user_id, est_cost_usd=cost)

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get("/api/v1/me", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    expected = math.ceil(sum(costs) * 100)  # 2
    assert "ai_spend_cents" in body, (
        f"MeResponse must include ai_spend_cents, got keys={list(body.keys())}"
    )
    assert body["ai_spend_cents"] == expected, (
        f"ai_spend_cents expected {expected}, got {body['ai_spend_cents']}"
    )


@pytest.mark.asyncio
async def test_me_excludes_previous_month_logs(db_client, bot_token, owner_tg_id):
    """Log from before current MSK month-start is NOT counted in ai_spend_cents."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.commit()
        user_id = user.id

    # Дата ДО первого числа текущего MSK-месяца
    now_msk = datetime.now(ZoneInfo("Europe/Moscow"))
    month_start_msk = now_msk.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_ts = (month_start_msk - timedelta(days=5)).astimezone(timezone.utc)

    async with SessionLocal() as s:
        await seed_ai_usage_log(
            s, user_id=user_id, est_cost_usd=9.99, ts=prev_month_ts
        )

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get("/api/v1/me", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "ai_spend_cents" in body, (
        f"MeResponse must include ai_spend_cents, got keys={list(body.keys())}"
    )
    assert body["ai_spend_cents"] == 0, (
        f"previous-month logs must not count: ai_spend_cents expected 0, "
        f"got {body['ai_spend_cents']}"
    )


@pytest.mark.asyncio
async def test_me_isolated_per_user(db_client, bot_token, owner_tg_id):
    """Owner and member see their own ai_spend_cents, not each other's."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    client, SessionLocal = db_client
    member_tg = 9_870_000_001
    async with SessionLocal() as s:
        owner = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        member = await seed_user(
            s, tg_user_id=member_tg, role=UserRole.member,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.commit()
        owner_id, member_id = owner.id, member.id

    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=owner_id, est_cost_usd=0.010)
    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=member_id, est_cost_usd=0.500)

    # Check owner /me
    owner_init = make_init_data(owner_tg_id, bot_token)
    owner_resp = await client.get("/api/v1/me", headers={"X-Telegram-Init-Data": owner_init})
    assert owner_resp.status_code == 200, owner_resp.text
    owner_body = owner_resp.json()
    assert "ai_spend_cents" in owner_body, (
        f"owner /me must include ai_spend_cents, got keys={list(owner_body.keys())}"
    )
    assert owner_body["ai_spend_cents"] == math.ceil(0.010 * 100), (
        f"owner ai_spend_cents expected {math.ceil(0.010 * 100)}, "
        f"got {owner_body['ai_spend_cents']}"
    )

    # Check member /me
    member_init = make_init_data(member_tg, bot_token)
    member_resp = await client.get("/api/v1/me", headers={"X-Telegram-Init-Data": member_init})
    assert member_resp.status_code == 200, member_resp.text
    member_body = member_resp.json()
    assert "ai_spend_cents" in member_body, (
        f"member /me must include ai_spend_cents, got keys={list(member_body.keys())}"
    )
    assert member_body["ai_spend_cents"] == math.ceil(0.500 * 100), (
        f"member ai_spend_cents expected {math.ceil(0.500 * 100)}, "
        f"got {member_body['ai_spend_cents']}"
    )

    # Verify isolation: different values
    assert owner_body["ai_spend_cents"] != member_body["ai_spend_cents"], (
        "owner and member must have different ai_spend_cents (isolation)"
    )
