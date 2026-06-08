"""Worker unit tests for notify_subscriptions_job and charge_subscriptions_job.

Phase 6 D-88: tests/test_worker_charge.py (name fixed per D-88 — used by 06-07 Task 1).

Test strategy:
- DB-backed tests use _require_db() self-skip when DATABASE_URL is unavailable.
- Notify tests use AsyncMock to mock aiogram Bot.send_message — no real Telegram needed.
- Charge tests use a real DB session for accurate idempotency / date advance checks.

Covered behaviors:
  - test_charge_monthly_advance: sub cycle=monthly, next_charge_date=today → PlannedTransaction
    created, next_charge_date advances by 1 month
  - test_charge_yearly_advance: sub cycle=yearly → advances by 1 year
  - test_charge_idempotency: job run twice → second run logs warning, no duplicate PlannedTransaction
  - test_charge_inactive_skipped: is_active=False → subscription not processed
  - test_notify_send_called: Bot.send_message called with correct chat_id, text contains sub name
  - test_notify_no_chat_id_skip: AppUser.tg_chat_id=None → send_message never called
"""
import os
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio


def _require_db():
    """Skip test when DATABASE_URL is not configured."""
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ────────────────────────────────────────────────────────────────
# DB fixture
# ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_setup(async_client):
    """Real DB session; truncates all relevant tables before each test."""
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
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

    yield SessionLocal

    await engine.dispose()


# ────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────

async def _seed_user_and_category(SessionLocal, *, tg_chat_id: int = 999):
    """Insert AppUser and a Category; return (tg_user_id, cat_id, user_pk_id)."""
    from app.db.models import AppUser, Category, CategoryKind

    async with SessionLocal() as session:
        user = AppUser(
            tg_user_id=123456789,
            tg_chat_id=tg_chat_id,
            notify_days_before=2,
        )
        session.add(user)
        await session.flush()
        from tests.helpers.seed import seed_category
        cat = await seed_category(
            session,
            user_id=user.id,
            name="Подписки",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=1,
        )
        await session.commit()
        await session.refresh(user)
        await session.refresh(cat)
        return user.tg_user_id, cat.id, user.id


async def _seed_subscription(SessionLocal, *, cat_id: int, cycle: str, charge_date: date, is_active: bool = True, user_id: int):
    """Insert a Subscription; return subscription id."""
    from app.db.models import SubCycle, Subscription

    cycle_enum = SubCycle.monthly if cycle == "monthly" else SubCycle.yearly
    async with SessionLocal() as session:
        sub = Subscription(
            user_id=user_id,
            name="Netflix Test",
            amount_cents=149900,
            cycle=cycle_enum,
            next_charge_date=charge_date,
            category_id=cat_id,
            notify_days_before=2,
            is_active=is_active,
        )
        session.add(sub)
        await session.commit()
        await session.refresh(sub)
        return sub.id


# ────────────────────────────────────────────────────────────────
# notify_subscriptions_job tests
#
# ADR-0007: the charge_subscriptions daily job was removed — recurring
# payments are materialised at rollover (close_period). The former
# test_charge_* cases (monthly/yearly advance, idempotency, inactive-skip)
# now live in tests/test_recurring_payments.py against the new model.
# ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_notify_send_called(db_setup, monkeypatch):
    """Bot.send_message is called with correct chat_id; text contains subscription name."""
    _require_db()
    SessionLocal = db_setup
    fake_today = date(2026, 5, 10)
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr("app.worker.jobs.notify_subscriptions._today_in_app_tz", lambda: fake_today, raising=False)

    tg_user_id, cat_id, user_pk_id = await _seed_user_and_category(SessionLocal, tg_chat_id=555123)
    charge_date = date(2026, 5, 12)
    sub_id = await _seed_subscription(
        SessionLocal, cat_id=cat_id, cycle="monthly", charge_date=charge_date, user_id=user_pk_id
    )

    sent_calls = []

    async def fake_send_message(chat_id, text, **kwargs):
        sent_calls.append({"chat_id": chat_id, "text": text})

    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock(side_effect=fake_send_message)
    mock_bot.session = MagicMock()
    mock_bot.session.close = AsyncMock()

    import app.worker.jobs.notify_subscriptions as notify_module
    notify_module.AsyncSessionLocal = SessionLocal
    from app.worker.jobs.notify_subscriptions import notify_subscriptions_job

    with patch("app.worker.jobs.notify_subscriptions.Bot", return_value=mock_bot):
        await notify_subscriptions_job()

    assert len(sent_calls) == 1, f"Expected 1 send_message call, got {len(sent_calls)}"
    call = sent_calls[0]
    assert call["chat_id"] == 555123, f"Expected chat_id=555123, got {call['chat_id']}"
    assert "Netflix Test" in call["text"], (
        f"Expected subscription name in text, got: {call['text']!r}"
    )
    assert "12.05" in call["text"], (
        f"Expected charge date '12.05' in text, got: {call['text']!r}"
    )


@pytest.mark.asyncio
async def test_notify_no_chat_id_skip(db_setup, monkeypatch):
    """When AppUser.tg_chat_id is None, send_message must never be called."""
    _require_db()
    SessionLocal = db_setup
    fake_today = date(2026, 5, 10)
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr("app.worker.jobs.notify_subscriptions._today_in_app_tz", lambda: fake_today, raising=False)

    from app.db.models import AppUser, CategoryKind
    from tests.helpers.seed import seed_category
    async with SessionLocal() as session:
        user = AppUser(tg_user_id=123456789, tg_chat_id=None, notify_days_before=2)
        session.add(user)
        await session.flush()
        cat = await seed_category(session, user_id=user.id, name="Сервисы", kind=CategoryKind.expense, is_archived=False, sort_order=1)
        await session.commit()
        await session.refresh(user)
        await session.refresh(cat)
        cat_id = cat.id
        user_pk_id = user.id

    charge_date = date(2026, 5, 12)
    await _seed_subscription(SessionLocal, cat_id=cat_id, cycle="monthly", charge_date=charge_date, user_id=user_pk_id)

    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock()
    mock_bot.session = MagicMock()
    mock_bot.session.close = AsyncMock()

    import app.worker.jobs.notify_subscriptions as notify_module
    notify_module.AsyncSessionLocal = SessionLocal
    from app.worker.jobs.notify_subscriptions import notify_subscriptions_job

    with patch("app.worker.jobs.notify_subscriptions.Bot", return_value=mock_bot):
        await notify_subscriptions_job()

    mock_bot.send_message.assert_not_called()
