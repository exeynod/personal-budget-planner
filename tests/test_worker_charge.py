"""Worker unit tests for notify_subscriptions_job.

Phase 6 D-88: tests/test_worker_charge.py (name fixed per D-88 — used by 06-07 Task 1).
ADR-0007: the daily charge_subscriptions job was removed (recurring payments
are materialised at rollover); this module now covers only the notify job.
Notify reads MATERIALISED occurrences — unposted
``planned_transaction(source=subscription_auto)`` rows — because the
subscription cursor is advanced into the NEXT period at materialisation time
and can no longer drive "N days before charge" matching.

Test strategy:
- DB-backed tests use _require_db() self-skip when DATABASE_URL is unavailable.
- Notify tests use AsyncMock to mock aiogram Bot.send_message — no real Telegram needed.

Covered behaviors:
  - test_notify_send_called: post-rollover state (cursor already in the next
    period, occurrence materialised) → push sent notify_days_before days
    before planned_date; text contains sub name + occurrence date
  - test_notify_no_chat_id_skip: AppUser.tg_chat_id=None → send_message never
    called even with a due occurrence
  - test_notify_zero_days_and_posted_skipped: notify_days_before=0 → push on
    the charge day; already-posted occurrence → no push
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
    from app.db.models import AppUser, CategoryKind

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


async def _seed_subscription(
    SessionLocal,
    *,
    cat_id: int,
    cycle: str,
    charge_date: date,
    is_active: bool = True,
    user_id: int,
    name: str = "Netflix Test",
    notify_days_before: int = 2,
):
    """Insert a Subscription; return subscription id."""
    from app.db.models import SubCycle, Subscription

    cycle_enum = SubCycle.monthly if cycle == "monthly" else SubCycle.yearly
    async with SessionLocal() as session:
        sub = Subscription(
            user_id=user_id,
            name=name,
            amount_cents=149900,
            cycle=cycle_enum,
            next_charge_date=charge_date,
            category_id=cat_id,
            notify_days_before=notify_days_before,
            is_active=is_active,
        )
        session.add(sub)
        await session.commit()
        await session.refresh(sub)
        return sub.id


async def _seed_period(
    SessionLocal, *, user_id: int, period_start: date, period_end: date
):
    """Seed an active BudgetPeriod; return period id."""
    from app.db.session import set_tenant_scope
    from tests.helpers.seed import seed_budget_period

    async with SessionLocal() as session:
        await set_tenant_scope(session, user_id)
        period = await seed_budget_period(
            session,
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
        )
        await session.commit()
        return period.id


async def _seed_occurrence(
    SessionLocal,
    *,
    user_id: int,
    cat_id: int,
    sub_id: int,
    period_id: int,
    planned_date: date,
    posted: bool = False,
):
    """Seed a materialised recurring occurrence (post-rollover state).

    ADR-0007: at rollover the subscription cursor is already advanced into the
    NEXT period — the notify job must therefore match on this row's
    planned_date, not on subscription.next_charge_date.
    """
    from app.db.models import CategoryKind, PlanSource
    from app.db.session import set_tenant_scope
    from tests.helpers.seed import seed_actual_transaction, seed_planned_transaction

    async with SessionLocal() as session:
        await set_tenant_scope(session, user_id)
        occ = await seed_planned_transaction(
            session,
            user_id=user_id,
            period_id=period_id,
            kind=CategoryKind.expense,
            amount_cents=149900,
            category_id=cat_id,
            source=PlanSource.subscription_auto,
            planned_date=planned_date,
            subscription_id=sub_id,
            original_charge_date=planned_date,
        )
        if posted:
            txn = await seed_actual_transaction(
                session,
                user_id=user_id,
                period_id=period_id,
                kind=CategoryKind.expense,
                amount_cents=149900,
                category_id=cat_id,
                tx_date=planned_date,
            )
            occ.posted_txn_id = txn.id
        await session.commit()
        return occ.id


# ────────────────────────────────────────────────────────────────
# notify_subscriptions_job tests
#
# ADR-0007: the charge_subscriptions daily job was removed — recurring
# payments are materialised at rollover (close_period); those flows are
# covered in tests/test_recurring_payments.py. Notify now matches on the
# materialised occurrence rows (planned_date − notify_days_before == today),
# so every test below seeds the POST-rollover state: cursor in the next
# period + occurrence in the current one.
# ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_send_called(db_setup, monkeypatch):
    """Post-rollover: push goes out N days before the OCCURRENCE planned_date.

    The subscription cursor is already advanced into the next period (as
    close_period leaves it after materialisation) — matching on the cursor
    would find nothing; matching on the materialised row must fire.
    """
    _require_db()
    SessionLocal = db_setup
    fake_today = date(2026, 5, 10)
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr(
        "app.worker.jobs.notify_subscriptions._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )

    tg_user_id, cat_id, user_pk_id = await _seed_user_and_category(
        SessionLocal, tg_chat_id=555123
    )
    occurrence_date = date(2026, 5, 12)  # today + notify_days_before(2)
    # Cursor already rolled into the NEXT period (post-materialisation state).
    sub_id = await _seed_subscription(
        SessionLocal,
        cat_id=cat_id,
        cycle="monthly",
        charge_date=date(2026, 6, 12),
        user_id=user_pk_id,
    )
    period_id = await _seed_period(
        SessionLocal,
        user_id=user_pk_id,
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
    )
    await _seed_occurrence(
        SessionLocal,
        user_id=user_pk_id,
        cat_id=cat_id,
        sub_id=sub_id,
        period_id=period_id,
        planned_date=occurrence_date,
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
    """When AppUser.tg_chat_id is None, send_message must never be called.

    Even with a due materialised occurrence — no chat, nowhere to push.
    """
    _require_db()
    SessionLocal = db_setup
    fake_today = date(2026, 5, 10)
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr(
        "app.worker.jobs.notify_subscriptions._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )

    from app.db.models import AppUser, CategoryKind
    from tests.helpers.seed import seed_category

    async with SessionLocal() as session:
        user = AppUser(tg_user_id=123456789, tg_chat_id=None, notify_days_before=2)
        session.add(user)
        await session.flush()
        cat = await seed_category(
            session,
            user_id=user.id,
            name="Сервисы",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=1,
        )
        await session.commit()
        await session.refresh(user)
        await session.refresh(cat)
        cat_id = cat.id
        user_pk_id = user.id

    sub_id = await _seed_subscription(
        SessionLocal,
        cat_id=cat_id,
        cycle="monthly",
        charge_date=date(2026, 6, 12),
        user_id=user_pk_id,
    )
    period_id = await _seed_period(
        SessionLocal,
        user_id=user_pk_id,
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
    )
    await _seed_occurrence(
        SessionLocal,
        user_id=user_pk_id,
        cat_id=cat_id,
        sub_id=sub_id,
        period_id=period_id,
        planned_date=date(2026, 5, 12),
    )

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


@pytest.mark.asyncio
async def test_notify_zero_days_and_posted_skipped(db_setup, monkeypatch):
    """notify_days_before=0 → push on the charge day; posted occurrence → silent.

    Two subscriptions, both with an occurrence planned for today and
    notify_days_before=0: the unposted one produces a «сегодня» push, the
    already-posted one (posted_txn_id set) must NOT notify.
    """
    _require_db()
    SessionLocal = db_setup
    fake_today = date(2026, 5, 10)
    monkeypatch.setattr("app.services.periods._today_in_app_tz", lambda: fake_today)
    monkeypatch.setattr(
        "app.worker.jobs.notify_subscriptions._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )

    tg_user_id, cat_id, user_pk_id = await _seed_user_and_category(
        SessionLocal, tg_chat_id=555123
    )
    period_id = await _seed_period(
        SessionLocal,
        user_id=user_pk_id,
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
    )
    sub_due = await _seed_subscription(
        SessionLocal,
        cat_id=cat_id,
        cycle="monthly",
        charge_date=date(2026, 6, 10),
        user_id=user_pk_id,
        name="Netflix Test",
        notify_days_before=0,
    )
    await _seed_occurrence(
        SessionLocal,
        user_id=user_pk_id,
        cat_id=cat_id,
        sub_id=sub_due,
        period_id=period_id,
        planned_date=fake_today,
    )
    sub_posted = await _seed_subscription(
        SessionLocal,
        cat_id=cat_id,
        cycle="monthly",
        charge_date=date(2026, 6, 10),
        user_id=user_pk_id,
        name="Spotify Test",
        notify_days_before=0,
    )
    await _seed_occurrence(
        SessionLocal,
        user_id=user_pk_id,
        cat_id=cat_id,
        sub_id=sub_posted,
        period_id=period_id,
        planned_date=fake_today,
        posted=True,
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
    assert "Netflix Test" in sent_calls[0]["text"]
    assert "сегодня" in sent_calls[0]["text"]
    assert all("Spotify Test" not in c["text"] for c in sent_calls), (
        "posted occurrence must not notify"
    )
