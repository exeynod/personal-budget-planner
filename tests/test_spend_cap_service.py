"""RED tests for AICAP-03 — get_user_spend_cents service.

All tests RED until Plan 15-02 creates app/services/spend_cap.py with:
  - get_user_spend_cents(db, *, user_id) -> int
  - invalidate_user_spend_cache(user_id) -> None
  - seconds_until_next_msk_month(now=None) -> int

After Plan 15-02 lands, all 7 tests must pass.
"""
from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


# ── DB fixtures ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_client():
    """Fixture: truncate all tables + yield SessionLocal for service tests."""
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy import text
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
    yield SessionLocal
    await engine.dispose()


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_spend_cents_zero_when_no_logs(db_client):
    """User with no ai_usage_log rows → get_user_spend_cents == 0."""
    from app.services.spend_cap import get_user_spend_cents  # RED: ModuleNotFoundError
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    async with db_client() as session:
        user = await seed_user(session, tg_user_id=9_800_000_001, role=UserRole.owner)
        await session.commit()
        user_id = user.id

    async with db_client() as session:
        result = await get_user_spend_cents(session, user_id=user_id)

    assert result == 0, f"expected 0 spend_cents for user with no logs, got {result}"


@pytest.mark.asyncio
async def test_spend_cents_aggregates_current_month(db_client):
    """3 logs in current MSK month → ceil(sum(est_cost_usd) * 100)."""
    from app.services.spend_cap import get_user_spend_cents
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    async with db_client() as session:
        user = await seed_user(session, tg_user_id=9_800_000_002, role=UserRole.owner)
        await session.commit()
        user_id = user.id

    # Логи с est_cost_usd=[0.005, 0.0123, 0.001] → sum=0.0183 → ceil(0.0183*100) = ceil(1.83) = 2
    costs = [0.005, 0.0123, 0.001]
    for cost in costs:
        async with db_client() as session:
            await seed_ai_usage_log(session, user_id=user_id, est_cost_usd=cost)

    async with db_client() as session:
        result = await get_user_spend_cents(session, user_id=user_id)

    expected = math.ceil(sum(costs) * 100)  # ceil(1.83) = 2
    assert result == expected, (
        f"expected {expected} spend_cents (sum={sum(costs):.4f} USD), got {result}"
    )


@pytest.mark.asyncio
async def test_spend_cents_excludes_previous_month(db_client):
    """Logs from previous MSK month are NOT counted in current spend."""
    from app.services.spend_cap import get_user_spend_cents
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    async with db_client() as session:
        user = await seed_user(session, tg_user_id=9_800_000_003, role=UserRole.owner)
        await session.commit()
        user_id = user.id

    # Дата в прошлом месяце MSK: вычесть 35 дней от текущего дня
    now_msk = datetime.now(ZoneInfo("Europe/Moscow"))
    # Первый день текущего MSK-месяца
    month_start_msk = now_msk.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Лог ДО первого числа текущего месяца (5 дней назад от начала месяца)
    from datetime import timedelta
    prev_month_ts = month_start_msk - timedelta(days=5)
    prev_month_ts_utc = prev_month_ts.astimezone(timezone.utc)

    async with db_client() as session:
        await seed_ai_usage_log(
            session, user_id=user_id, est_cost_usd=9.99, ts=prev_month_ts_utc
        )

    async with db_client() as session:
        result = await get_user_spend_cents(session, user_id=user_id)

    assert result == 0, (
        f"previous-month logs must not count in current month spend, got {result}"
    )


@pytest.mark.asyncio
async def test_spend_cents_isolated_per_user(db_client):
    """Two users with different logs → each sees only their own spend."""
    from app.services.spend_cap import get_user_spend_cents
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    async with db_client() as session:
        user_a = await seed_user(session, tg_user_id=9_800_000_004, role=UserRole.owner)
        user_b = await seed_user(session, tg_user_id=9_800_000_005, role=UserRole.member)
        await session.commit()
        id_a, id_b = user_a.id, user_b.id

    async with db_client() as session:
        await seed_ai_usage_log(session, user_id=id_a, est_cost_usd=0.010)
    async with db_client() as session:
        await seed_ai_usage_log(session, user_id=id_b, est_cost_usd=0.500)

    async with db_client() as session:
        spend_a = await get_user_spend_cents(session, user_id=id_a)
        spend_b = await get_user_spend_cents(session, user_id=id_b)

    assert spend_a != spend_b, (
        f"users with different logs must have different spend: "
        f"spend_a={spend_a}, spend_b={spend_b}"
    )
    assert spend_a == math.ceil(0.010 * 100), f"user_a spend mismatch: {spend_a}"
    assert spend_b == math.ceil(0.500 * 100), f"user_b spend mismatch: {spend_b}"


@pytest.mark.asyncio
async def test_spend_cents_cache_hits_within_ttl(db_client):
    """Second call within TTL returns cached value (same result without extra DB hit).

    Contract: repeated calls to get_user_spend_cents within TTL (60 sec)
    return the same value even if a new log was inserted after first call.
    This verifies the cache is active (implementation-agnostic: does not
    mandate a specific cache library).
    """
    from app.services.spend_cap import get_user_spend_cents, invalidate_user_spend_cache
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    async with db_client() as session:
        user = await seed_user(session, tg_user_id=9_800_000_006, role=UserRole.owner)
        await session.commit()
        user_id = user.id

    async with db_client() as session:
        await seed_ai_usage_log(session, user_id=user_id, est_cost_usd=0.010)

    async with db_client() as session:
        first_result = await get_user_spend_cents(session, user_id=user_id)

    # Insert a new log AFTER first call (cache should still return first_result)
    async with db_client() as session:
        await seed_ai_usage_log(session, user_id=user_id, est_cost_usd=0.999)

    async with db_client() as session:
        second_result = await get_user_spend_cents(session, user_id=user_id)

    # Within TTL the cache must return the same value as first call
    assert second_result == first_result, (
        f"within TTL, second call must return cached value={first_result}, "
        f"got {second_result} (cache is not working)"
    )

    # Cleanup: invalidate so later tests are unaffected
    await invalidate_user_spend_cache(user_id)


@pytest.mark.asyncio
async def test_seconds_until_next_msk_month_positive():
    """seconds_until_next_msk_month() returns int > 0 and < 32 * 86400."""
    from app.services.spend_cap import seconds_until_next_msk_month  # RED

    result = seconds_until_next_msk_month()

    assert isinstance(result, int), f"expected int, got {type(result).__name__}"
    assert result > 0, f"seconds until next month must be positive, got {result}"
    # 32 days × 86400 sec/day = upper bound (any calendar month < 32 days)
    assert result < 32 * 86400, (
        f"seconds until next month must be < 32 days, got {result}"
    )


@pytest.mark.asyncio
async def test_invalidate_cache_drops_user_entry(db_client):
    """After invalidate_user_spend_cache, next call re-queries DB and gets fresh value."""
    from app.services.spend_cap import get_user_spend_cents, invalidate_user_spend_cache
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole

    async with db_client() as session:
        user = await seed_user(session, tg_user_id=9_800_000_007, role=UserRole.owner)
        await session.commit()
        user_id = user.id

    async with db_client() as session:
        await seed_ai_usage_log(session, user_id=user_id, est_cost_usd=0.010)

    async with db_client() as session:
        first_result = await get_user_spend_cents(session, user_id=user_id)

    # Insert new log — cache would normally hide this
    async with db_client() as session:
        await seed_ai_usage_log(session, user_id=user_id, est_cost_usd=0.050)

    # Invalidate cache entry for this user
    await invalidate_user_spend_cache(user_id)

    async with db_client() as session:
        after_invalidate = await get_user_spend_cents(session, user_id=user_id)

    assert after_invalidate > first_result, (
        f"after invalidation, re-query must pick up new log: "
        f"first={first_result}, after_invalidate={after_invalidate}"
    )
    expected = math.ceil((0.010 + 0.050) * 100)
    assert after_invalidate == expected, (
        f"post-invalidation spend expected {expected} cents, got {after_invalidate}"
    )
