"""Integration tests for /api/v1/ai/observation (Phase 27, plan 27-01, AI-V10-03).

Rule-engine endpoint that returns server-side computed observation text
for the AI screen initial-state. Pure Python, no LLM call. Result is
cached per-user in-memory for 1 hour.

Rule priority (highest first):
    1. Over-limit category (fact > plan): "{Name} уже +N% к лимиту"
    2. Tomorrow subscription charge:      "Завтра списание подписок на X ₽"
    3. Last-7-days savings:               "За неделю экономия Y ₽"
    4. Month surplus (income - fact > 0): "{Month} в плюсе на Z ₽"
    Fallback (no data):                   "Веди учёт регулярно — {today}"

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered:
- Auth: 403 without X-Telegram-Init-Data (skipped in DEV_MODE).
- Each rule fires in isolation (4 dedicated tests).
- Fallback fires when no rule matches.
- Cache hit returns identical text+generated_at on second call.
- Cache expiry recomputes after 1h.
- Endpoint smoke: 200 + JSON shape.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture(autouse=True)
async def _clear_observation_cache():
    """Reset OBSERVATION_CACHE before each test for isolation.

    Mirrors the conftest pattern for _rate_buckets / _spend_cache. Must run
    even if the module is not yet importable (RED phase) — best-effort try.
    """
    try:
        import sys

        if "app.services.ai_observation" in sys.modules:
            from app.services.ai_observation import OBSERVATION_CACHE
            OBSERVATION_CACHE.clear()
    except Exception:
        pass  # module may not exist yet during RED
    yield
    try:
        import sys

        if "app.services.ai_observation" in sys.modules:
            from app.services.ai_observation import OBSERVATION_CACHE
            OBSERVATION_CACHE.clear()
    except Exception:
        pass


@pytest_asyncio.fixture
async def db_setup(async_client, owner_tg_id):
    """Async client + fresh DB + seeded onboarded owner.

    Mirrors tests/api/test_savings_api.py db_setup pattern.
    Returns (client, SessionLocal, user_id).
    """
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
        user = AppUser(
            tg_user_id=owner_tg_id,
            role=UserRole.owner,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
            income_cents=100_000_00,  # 100 000 ₽ income (used in surplus rule)
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        uid = user.id

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db
    yield async_client, SessionLocal, uid
    app.dependency_overrides.clear()
    await engine.dispose()


# ---------------------------------------------------------------------------
# Helpers — minimal seeds (Category / Subscription / Period / ActualTransaction)
# ---------------------------------------------------------------------------


async def _seed_period(session, *, user_id: int, today: date) -> int:
    """Create the active BudgetPeriod covering today (returns period_id)."""
    from app.db.models import BudgetPeriod, PeriodStatus

    period = BudgetPeriod(
        user_id=user_id,
        period_start=today.replace(day=1),
        period_end=(today.replace(day=28) + timedelta(days=10)).replace(day=1)
        - timedelta(days=1),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    session.add(period)
    await session.flush()
    return period.id


async def _seed_category(
    session,
    *,
    user_id: int,
    name: str,
    code: str,
    plan_cents: int = 0,
    paused: bool = False,
) -> int:
    from app.db.models import CategoryKind
    from tests.helpers.seed import seed_category

    cat = await seed_category(
        session,
        user_id=user_id,
        name=name,
        code=code,
        ord="01",
        kind=CategoryKind.expense,
        plan_cents=plan_cents,
        paused=paused,
        sort_order=10,
    )
    await session.flush()
    return cat.id


async def _seed_actual(
    session,
    *,
    user_id: int,
    period_id: int,
    category_id: int,
    amount_cents: int,
    tx_date: date,
    kind=None,
):
    from app.db.models import ActualKind, ActualSource, ActualTransaction

    txn = ActualTransaction(
        user_id=user_id,
        period_id=period_id,
        kind=kind or ActualKind.expense,
        amount_cents=amount_cents,
        category_id=category_id,
        tx_date=tx_date,
        source=ActualSource.mini_app,
    )
    session.add(txn)
    await session.flush()
    return txn


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observation_requires_auth(async_client):
    """Without initData header → 403 (router-level get_current_user gate)."""
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    response = await async_client.get("/api/v1/ai/observation")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Service-level rule tests (call build_observation directly)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observation_over_limit_category(db_setup):
    """Priority 1: a category with fact > plan triggers '+N% к лимиту'."""
    client, SessionLocal, uid = db_setup
    from app.services.ai_observation import build_observation

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    today = msk_now.date()
    async with SessionLocal() as session:
        period_id = await _seed_period(session, user_id=uid, today=today)
        cat_id = await _seed_category(
            session, user_id=uid, name="Кафе", code="cafe", plan_cents=10_000_00,
        )
        # Fact 12 000 ₽ > plan 10 000 ₽ → +20%.
        await _seed_actual(
            session,
            user_id=uid,
            period_id=period_id,
            category_id=cat_id,
            amount_cents=-12_000_00,
            tx_date=today,
        )
        await session.commit()

        result = await build_observation(session, user_id=uid, now=msk_now)

    assert "Кафе" in result.text
    assert "%" in result.text
    assert "лимит" in result.text.lower()


@pytest.mark.asyncio
async def test_observation_tomorrow_subs_charge(db_setup):
    """Priority 2: a monthly sub due tomorrow → 'Завтра списание подписок на X ₽'."""
    client, SessionLocal, uid = db_setup
    from app.db.models import SubCycle
    from app.services.ai_observation import build_observation

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    today = msk_now.date()
    tomorrow = today + timedelta(days=1)
    # Subscription day_of_month must be 1..28 (DB CHECK). If tomorrow is 29..31,
    # shift "now" down by a few days for this test only — semantics preserved.
    if tomorrow.day > 28:
        msk_now = msk_now - timedelta(days=tomorrow.day - 27)
        today = msk_now.date()
        tomorrow = today + timedelta(days=1)

    async with SessionLocal() as session:
        cat_id = await _seed_category(
            session, user_id=uid, name="Подписки", code="subs",
        )
        from app.db.models import Subscription

        sub = Subscription(
            user_id=uid,
            name="Netflix",
            amount_cents=599_00,
            cycle=SubCycle.monthly,
            next_charge_date=tomorrow,
            day_of_month=tomorrow.day,
            category_id=cat_id,
            notify_days_before=1,
            is_active=True,
        )
        session.add(sub)
        await session.commit()

        result = await build_observation(session, user_id=uid, now=msk_now)

    assert "Завтра" in result.text
    assert "подпис" in result.text.lower()
    assert "599" in result.text  # rubles, no decimals expected


@pytest.mark.asyncio
async def test_observation_week_savings(db_setup):
    """Priority 3: roundup/deposit txns in last 7 days → 'За неделю экономия Y ₽'."""
    client, SessionLocal, uid = db_setup
    from app.db.models import ActualKind
    from app.services.ai_observation import build_observation

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    today = msk_now.date()
    async with SessionLocal() as session:
        period_id = await _seed_period(session, user_id=uid, today=today)
        cat_id = await _seed_category(
            session, user_id=uid, name="КОПИЛКА", code="savings",
        )
        # 1 000 ₽ deposit + 50 ₽ roundup, both within last 7 days.
        await _seed_actual(
            session, user_id=uid, period_id=period_id, category_id=cat_id,
            amount_cents=-1_000_00, tx_date=today - timedelta(days=2),
            kind=ActualKind.deposit,
        )
        await _seed_actual(
            session, user_id=uid, period_id=period_id, category_id=cat_id,
            amount_cents=-50_00, tx_date=today - timedelta(days=1),
            kind=ActualKind.roundup,
        )
        await session.commit()

        result = await build_observation(session, user_id=uid, now=msk_now)

    assert "недел" in result.text.lower()
    assert "эконом" in result.text.lower()
    assert "1050" in result.text or "1 050" in result.text


@pytest.mark.asyncio
async def test_observation_month_surplus(db_setup):
    """Priority 4: income > Σfact → '{Month} в плюсе на Z ₽'.

    No over-limit, no upcoming subs, no week savings — falls to month surplus.
    User has income_cents=100_000_00 from db_setup; we add a small expense so
    surplus is positive but well below other rules.
    """
    client, SessionLocal, uid = db_setup
    from app.services.ai_observation import build_observation

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    today = msk_now.date()
    async with SessionLocal() as session:
        period_id = await _seed_period(session, user_id=uid, today=today)
        # Plan 50_000, fact 30_000 → fact < plan → no "over-limit" rule.
        cat_id = await _seed_category(
            session, user_id=uid, name="Продукты", code="food",
            plan_cents=50_000_00,
        )
        await _seed_actual(
            session, user_id=uid, period_id=period_id, category_id=cat_id,
            amount_cents=-30_000_00, tx_date=today,
        )
        await session.commit()

        result = await build_observation(session, user_id=uid, now=msk_now)

    # 100k income - 30k fact = 70k surplus.
    assert "плюс" in result.text.lower()
    assert "70" in result.text  # 70 000 or 70000


@pytest.mark.asyncio
async def test_observation_fallback(db_setup):
    """No data at all → 'Веди учёт регулярно — {today}'."""
    client, SessionLocal, uid = db_setup
    from app.db.models import AppUser
    from app.services.ai_observation import build_observation
    from sqlalchemy import update

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    async with SessionLocal() as session:
        # Wipe income so month-surplus rule cannot fire.
        await session.execute(
            update(AppUser).where(AppUser.id == uid).values(income_cents=None)
        )
        await session.commit()

        result = await build_observation(session, user_id=uid, now=msk_now)

    assert "Веди" in result.text
    assert "учёт" in result.text or "учет" in result.text
    # Day number should appear as standalone digits.
    assert str(msk_now.day) in result.text


# ---------------------------------------------------------------------------
# Cache behaviour
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observation_cache_returns_same_text(db_setup):
    """Two calls within TTL return the same ObservationResult instance."""
    client, SessionLocal, uid = db_setup
    from app.services.ai_observation import build_observation

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    async with SessionLocal() as session:
        first = await build_observation(session, user_id=uid, now=msk_now)
        # Simulate "fresh" call shortly after — caller passes a slightly later
        # `now`, but cache must short-circuit.
        second = await build_observation(
            session, user_id=uid, now=msk_now + timedelta(seconds=10),
        )

    assert first.text == second.text
    assert first.generated_at == second.generated_at


@pytest.mark.asyncio
async def test_observation_cache_expires_after_1h(db_setup):
    """After TTL elapses, the cache recomputes."""
    client, SessionLocal, uid = db_setup
    from app.services.ai_observation import OBSERVATION_CACHE, build_observation

    msk_now = datetime.now(ZoneInfo("Europe/Moscow"))
    async with SessionLocal() as session:
        first = await build_observation(session, user_id=uid, now=msk_now)
        # Force the cached entry into the past so the next call must recompute.
        cached = OBSERVATION_CACHE[uid]
        # Replace dataclass: subtract > 1h from generated_at.
        from dataclasses import replace
        OBSERVATION_CACHE[uid] = replace(
            cached, generated_at=cached.generated_at - timedelta(hours=1, seconds=5),
        )
        later = msk_now + timedelta(hours=1, seconds=10)
        second = await build_observation(session, user_id=uid, now=later)

    # generated_at must move forward (recomputed).
    assert second.generated_at > first.generated_at


# ---------------------------------------------------------------------------
# Endpoint smoke
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observation_endpoint_returns_200(db_setup, auth_headers):
    """GET /api/v1/ai/observation → 200 + {text, generated_at}."""
    client, _, _ = db_setup
    r = await client.get("/api/v1/ai/observation", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "text" in body and isinstance(body["text"], str) and body["text"]
    assert "generated_at" in body and isinstance(body["generated_at"], str)
