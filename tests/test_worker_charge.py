"""Worker unit tests for notify_subscriptions_job and charge_subscriptions_job.

Phase 6 D-88: tests/test_worker_charge.py (name fixed per D-88 — used by 06-07 Task 1).

Test strategy:
- DB-backed tests use _require_db() self-skip when DATABASE_URL is unavailable.
- Notify tests use AsyncMock to mock aiogram Bot.send_message — no real Telegram needed.
- Charge tests use a real DB session for accurate idempotency / date advance checks.

Covered behaviors:
  TestChargeSubscriptionsJob:
  - test_monthly_advance: sub cycle=monthly, next_charge_date=today → PlannedTransaction
    created, next_charge_date advances by 1 month
  - test_yearly_advance: sub cycle=yearly → advances by 1 year
  - test_idempotency: job run twice → second run logs warning, no duplicate PlannedTransaction
  - test_inactive_skipped: is_active=False → subscription not processed

  TestNotifySubscriptionsJob:
  - test_send_called: Bot.send_message called with correct chat_id, text contains sub name
  - test_no_chat_id_skip: AppUser.tg_chat_id=None → send_message never called
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
# DB fixture (shared across both test classes)
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

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE category, planned_transaction, "
                "actual_transaction, plan_template_item, subscription, "
                "budget_period, app_user RESTART IDENTITY CASCADE"
            )
        )

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
    """Insert AppUser and a Category; return (user, category)."""
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.db.models import AppUser, Category, CategoryKind

    async with SessionLocal() as session:
        user = AppUser(
            tg_user_id=123456789,
            tg_chat_id=tg_chat_id,
            notify_days_before=2,
        )
        cat = Category(
            name="Подписки",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=1,
        )
        session.add_all([user, cat])
        await session.commit()
        await session.refresh(user)
        await session.refresh(cat)
        return user.tg_user_id, cat.id


async def _seed_subscription(SessionLocal, *, cat_id: int, cycle: str, charge_date: date, is_active: bool = True):
    """Insert a Subscription; return subscription id."""
    from app.db.models import SubCycle, Subscription

    cycle_enum = SubCycle.monthly if cycle == "monthly" else SubCycle.yearly
    async with SessionLocal() as session:
        sub = Subscription(
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


def _patch_today_worker(monkeypatch, fake_today: date):
    """Patch _today_in_app_tz in both service and worker modules."""
    monkeypatch.setattr(
        "app.services.periods._today_in_app_tz",
        lambda: fake_today,
    )
    monkeypatch.setattr(
        "app.worker.jobs.charge_subscriptions._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )
    monkeypatch.setattr(
        "app.worker.jobs.notify_subscriptions._today_in_app_tz",
        lambda: fake_today,
        raising=False,
    )


# ────────────────────────────────────────────────────────────────
# TestChargeSubscriptionsJob
# ────────────────────────────────────────────────────────────────

class TestChargeSubscriptionsJob:

    @pytest.mark.asyncio
    async def test_monthly_advance(self, db_setup, monkeypatch):
        """Monthly subscription: PlannedTransaction created, date advances +1 month."""
        _require_db()
        SessionLocal = db_setup
        fake_today = date(2026, 5, 10)
        _patch_today_worker(monkeypatch, fake_today)

        tg_user_id, cat_id = await _seed_user_and_category(SessionLocal)
        sub_id = await _seed_subscription(
            SessionLocal, cat_id=cat_id, cycle="monthly", charge_date=fake_today
        )

        from app.worker.jobs.charge_subscriptions import charge_subscriptions_job
        await charge_subscriptions_job()

        from sqlalchemy import select
        from app.db.models import PlannedTransaction, Subscription

        async with SessionLocal() as session:
            planned_rows = (
                await session.execute(
                    select(PlannedTransaction).where(
                        PlannedTransaction.subscription_id == sub_id
                    )
                )
            ).scalars().all()
            assert len(planned_rows) == 1, "Expected exactly one PlannedTransaction"

            sub = await session.get(Subscription, sub_id)
            assert sub.next_charge_date == date(2026, 6, 10), (
                f"Expected 2026-06-10, got {sub.next_charge_date}"
            )

    @pytest.mark.asyncio
    async def test_yearly_advance(self, db_setup, monkeypatch):
        """Yearly subscription: PlannedTransaction created, date advances +1 year."""
        _require_db()
        SessionLocal = db_setup
        fake_today = date(2026, 5, 10)
        _patch_today_worker(monkeypatch, fake_today)

        tg_user_id, cat_id = await _seed_user_and_category(SessionLocal)
        sub_id = await _seed_subscription(
            SessionLocal, cat_id=cat_id, cycle="yearly", charge_date=fake_today
        )

        from app.worker.jobs.charge_subscriptions import charge_subscriptions_job
        await charge_subscriptions_job()

        from sqlalchemy import select
        from app.db.models import PlannedTransaction, Subscription

        async with SessionLocal() as session:
            planned_rows = (
                await session.execute(
                    select(PlannedTransaction).where(
                        PlannedTransaction.subscription_id == sub_id
                    )
                )
            ).scalars().all()
            assert len(planned_rows) == 1, "Expected exactly one PlannedTransaction"

            sub = await session.get(Subscription, sub_id)
            assert sub.next_charge_date == date(2027, 5, 10), (
                f"Expected 2027-05-10, got {sub.next_charge_date}"
            )

    @pytest.mark.asyncio
    async def test_idempotency(self, db_setup, monkeypatch):
        """Running charge job twice does not create duplicate PlannedTransaction.

        The second run hits AlreadyChargedError (unique constraint on
        subscription_id + original_charge_date) and logs a warning — no crash.
        """
        _require_db()
        SessionLocal = db_setup
        fake_today = date(2026, 5, 10)
        _patch_today_worker(monkeypatch, fake_today)

        tg_user_id, cat_id = await _seed_user_and_category(SessionLocal)
        sub_id = await _seed_subscription(
            SessionLocal, cat_id=cat_id, cycle="monthly", charge_date=fake_today
        )

        from app.worker.jobs.charge_subscriptions import charge_subscriptions_job

        # First run: creates PlannedTransaction, advances next_charge_date.
        await charge_subscriptions_job()

        # Advance today so the job finds the subscription again based on the
        # new next_charge_date — but set next_charge_date back manually
        # to simulate a duplicate attempt on the same original_charge_date.
        from app.db.models import Subscription
        async with SessionLocal() as session:
            sub = await session.get(Subscription, sub_id)
            # Reset next_charge_date to original to force a duplicate attempt.
            sub.next_charge_date = fake_today
            await session.commit()

        # Second run: should detect AlreadyChargedError, log warning, not crash.
        await charge_subscriptions_job()

        from sqlalchemy import select
        from app.db.models import PlannedTransaction
        async with SessionLocal() as session:
            planned_rows = (
                await session.execute(
                    select(PlannedTransaction).where(
                        PlannedTransaction.subscription_id == sub_id
                    )
                )
            ).scalars().all()
            # Still exactly one — no duplicate created.
            assert len(planned_rows) == 1, (
                f"Expected 1 PlannedTransaction (idempotency), got {len(planned_rows)}"
            )

    @pytest.mark.asyncio
    async def test_inactive_skipped(self, db_setup, monkeypatch):
        """Subscription with is_active=False must not be processed."""
        _require_db()
        SessionLocal = db_setup
        fake_today = date(2026, 5, 10)
        _patch_today_worker(monkeypatch, fake_today)

        tg_user_id, cat_id = await _seed_user_and_category(SessionLocal)
        sub_id = await _seed_subscription(
            SessionLocal,
            cat_id=cat_id,
            cycle="monthly",
            charge_date=fake_today,
            is_active=False,
        )

        from app.worker.jobs.charge_subscriptions import charge_subscriptions_job
        await charge_subscriptions_job()

        from sqlalchemy import select
        from app.db.models import PlannedTransaction
        async with SessionLocal() as session:
            planned_rows = (
                await session.execute(
                    select(PlannedTransaction).where(
                        PlannedTransaction.subscription_id == sub_id
                    )
                )
            ).scalars().all()
            assert len(planned_rows) == 0, "Inactive subscription must not be charged"


# ────────────────────────────────────────────────────────────────
# TestNotifySubscriptionsJob
# ────────────────────────────────────────────────────────────────

class TestNotifySubscriptionsJob:

    @pytest.mark.asyncio
    async def test_send_called(self, db_setup, monkeypatch):
        """Bot.send_message is called with correct chat_id; text contains subscription name."""
        _require_db()
        SessionLocal = db_setup
        fake_today = date(2026, 5, 10)
        _patch_today_worker(monkeypatch, fake_today)

        # Subscription due in 2 days (notify_days_before=2, today=May 10, charge=May 12).
        tg_user_id, cat_id = await _seed_user_and_category(
            SessionLocal, tg_chat_id=555123
        )
        charge_date = date(2026, 5, 12)
        sub_id = await _seed_subscription(
            SessionLocal, cat_id=cat_id, cycle="monthly", charge_date=charge_date
        )

        # Mock aiogram Bot to capture send_message calls.
        sent_calls = []

        async def fake_send_message(chat_id, text, **kwargs):
            sent_calls.append({"chat_id": chat_id, "text": text})

        mock_bot = MagicMock()
        mock_bot.send_message = AsyncMock(side_effect=fake_send_message)
        mock_bot.session = MagicMock()
        mock_bot.session.close = AsyncMock()

        with patch(
            "app.worker.jobs.notify_subscriptions.Bot",
            return_value=mock_bot,
        ):
            from app.worker.jobs.notify_subscriptions import notify_subscriptions_job
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
    async def test_no_chat_id_skip(self, db_setup, monkeypatch):
        """When AppUser.tg_chat_id is None, send_message must never be called."""
        _require_db()
        SessionLocal = db_setup
        fake_today = date(2026, 5, 10)
        _patch_today_worker(monkeypatch, fake_today)

        # Seed user with no tg_chat_id.
        from app.db.models import AppUser, Category, CategoryKind
        async with SessionLocal() as session:
            user = AppUser(
                tg_user_id=123456789,
                tg_chat_id=None,
                notify_days_before=2,
            )
            cat = Category(
                name="Сервисы",
                kind=CategoryKind.expense,
                is_archived=False,
                sort_order=1,
            )
            session.add_all([user, cat])
            await session.commit()
            await session.refresh(cat)
            cat_id = cat.id

        charge_date = date(2026, 5, 12)
        await _seed_subscription(
            SessionLocal, cat_id=cat_id, cycle="monthly", charge_date=charge_date
        )

        mock_bot = MagicMock()
        mock_bot.send_message = AsyncMock()
        mock_bot.session = MagicMock()
        mock_bot.session.close = AsyncMock()

        with patch(
            "app.worker.jobs.notify_subscriptions.Bot",
            return_value=mock_bot,
        ):
            from app.worker.jobs.notify_subscriptions import notify_subscriptions_job
            await notify_subscriptions_job()

        mock_bot.send_message.assert_not_called()
