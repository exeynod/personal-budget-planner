"""RED tests for Phase 13 AIUSE-01/02/03 — admin AI usage breakdown.

Endpoint under test (created in Plan 13-05):
  GET /api/v1/admin/ai-usage → AdminAiUsageResponse (per-user usage)

Time windows:
  - current_month: from 1st of current month at 00:00 Europe/Moscow
  - last_30d: from now() - 30 days at any TZ (UTC ok)

Sort: descending by est_cost_cents_current_month.
Spending cap: app_user.spending_cap_cents (BIGINT, default 46500 in
Plan 13-02 alembic 0008). pct_of_cap = est_cost_cents_current_month / cap_cents.

All tests RED until Plans 13-02 (alembic 0008 spending_cap_cents +
ai_usage_log table), 13-03 (ai_usage_log model), 13-05 (admin route).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


@pytest_asyncio.fixture
async def db_client(async_client):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
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


@pytest.mark.asyncio
async def test_admin_ai_usage_returns_per_user_breakdown(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import (
        seed_two_role_tenants, seed_user, seed_ai_usage_log,
    )
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        ids = await seed_two_role_tenants(
            s, owner_tg_user_id=owner_tg_id, member_tg_user_id=9_666_666_001
        )
        m2 = await seed_user(s, tg_user_id=9_666_666_002, role=UserRole.member)
        await s.commit()
        owner_id, member_id, m2_id = ids["owner_id"], ids["member_id"], m2.id

    async with SessionLocal() as s:
        await seed_ai_usage_log(
            s, user_id=owner_id, total_tokens=1000, est_cost_usd=0.005
        )
        await seed_ai_usage_log(
            s, user_id=member_id, total_tokens=500, est_cost_usd=0.002
        )
        await seed_ai_usage_log(
            s, user_id=m2_id, total_tokens=10, est_cost_usd=0.0001
        )

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/admin/ai-usage", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "users" in body
    assert "generated_at" in body
    assert len(body["users"]) == 3, f"expected 3 users in breakdown, got {len(body['users'])}"
    for row in body["users"]:
        for fld in ("user_id", "tg_user_id", "role", "spending_cap_cents",
                    "current_month", "last_30d",
                    "est_cost_cents_current_month", "pct_of_cap"):
            assert fld in row, f"missing field {fld!r} in {row}"
        for bucket_key in ("current_month", "last_30d"):
            bucket = row[bucket_key]
            for bf in ("requests", "prompt_tokens", "completion_tokens",
                       "cached_tokens", "total_tokens", "est_cost_usd"):
                assert bf in bucket, f"missing {bf!r} in {bucket_key} bucket"


@pytest.mark.asyncio
async def test_admin_ai_usage_403_for_member(db_client, bot_token):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=9_666_666_010, role=UserRole.member)
        await s.commit()

    init_data = make_init_data(9_666_666_010, bot_token)
    resp = await client.get(
        "/api/v1/admin/ai-usage", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_ai_usage_current_month_excludes_old_data(
    db_client, bot_token, owner_tg_id
):
    """current_month bucket — только записи с начала текущего месяца Europe/Moscow."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()
        owner_id = owner.id

    now = datetime.now(timezone.utc)
    recent = now - timedelta(hours=1)
    sixty_days_ago = now - timedelta(days=60)
    async with SessionLocal() as s:
        await seed_ai_usage_log(
            s, user_id=owner_id, total_tokens=100,
            est_cost_usd=0.001, ts=recent,
        )
        await seed_ai_usage_log(
            s, user_id=owner_id, total_tokens=999_999,
            est_cost_usd=9.99, ts=sixty_days_ago,
        )

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/admin/ai-usage", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    owner_row = next(r for r in body["users"] if r["user_id"] == owner_id)
    # current_month: ТОЛЬКО recent (1 запрос).
    cm = owner_row["current_month"]
    assert cm["requests"] == 1, f"current_month requests={cm['requests']}, expected 1"
    assert cm["total_tokens"] == 100, (
        f"current_month total_tokens={cm['total_tokens']}, expected 100 (60-day-old not included)"
    )
    # last_30d: только recent (1 запрос — 60-day-old outside window).
    l30 = owner_row["last_30d"]
    assert l30["requests"] == 1
    assert l30["total_tokens"] == 100


@pytest.mark.asyncio
async def test_admin_ai_usage_pct_of_cap_warns_at_80_pct(
    db_client, bot_token, owner_tg_id
):
    """spending_cap_cents — Phase 13 stub default 46500 копеек USD ($5).

    Тест фиксирует cap≈10000 копеек и проверяет что 80% триггерится.
    Cap settings change: после Plan 13-02 alembic 0008 column NOT NULL DEFAULT 46500.
    Тест меняет cap явно через UPDATE для конкретной строки.
    """
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()
        owner_id = owner.id
        # Override cap to 10000 (USD копейки = $1.00).
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = :cap WHERE id = :uid"),
            {"cap": 10_000, "uid": owner_id},
        )
        await s.commit()

    async with SessionLocal() as s:
        # est_cost_usd = 0.083 → 8300 копеек USD ≈ 83% от cap 10000.
        await seed_ai_usage_log(
            s, user_id=owner_id, total_tokens=1, est_cost_usd=0.083,
        )

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/admin/ai-usage", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    row = next(r for r in body["users"] if r["user_id"] == owner_id)
    assert row["spending_cap_cents"] == 10_000
    assert row["pct_of_cap"] >= 0.80, (
        f"83% of cap → pct_of_cap should be ≥0.80, got {row['pct_of_cap']}"
    )
    assert row["pct_of_cap"] < 1.0


@pytest.mark.asyncio
async def test_admin_ai_usage_sort_by_est_cost_desc(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_two_role_tenants, seed_ai_usage_log

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        ids = await seed_two_role_tenants(
            s, owner_tg_user_id=owner_tg_id, member_tg_user_id=9_666_666_020
        )
        owner_id, member_id = ids["owner_id"], ids["member_id"]

    async with SessionLocal() as s:
        # Member spends MORE this month than owner.
        await seed_ai_usage_log(
            s, user_id=member_id, total_tokens=10_000, est_cost_usd=0.500
        )
        await seed_ai_usage_log(
            s, user_id=owner_id, total_tokens=100, est_cost_usd=0.005
        )

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/admin/ai-usage", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    users = body["users"]
    # Top spender first.
    assert users[0]["user_id"] == member_id, (
        f"member should sort first (higher est_cost), got user_id={users[0]['user_id']}"
    )
    assert users[1]["user_id"] == owner_id
