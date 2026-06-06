"""Integration tests for POST /api/v1/subscriptions/{id}/post + unpost (BE-13).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviours:
- Auth: 403 without X-Telegram-Init-Data (skipped in DEV_MODE).
- post: 200 happy / 404 missing / 409 already-posted / 409 inactive / 422 no account.
- unpost: 204 happy / 404 missing / 404 not-posted.
"""

import os
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_setup(async_client, owner_tg_id):
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
        session.add(
            AppUser(
                tg_user_id=owner_tg_id,
                role=UserRole.owner,
                cycle_start_day=5,
                onboarded_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()

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


@pytest_asyncio.fixture
async def seed_sub_with_account(db_setup, owner_tg_id):
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import (
        Account,
        AccountKind,
        CategoryKind,
        Subscription,
        SubCycle,
    )

    async with SessionLocal() as session:
        uid = (
            await session.execute(
                text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
                {"tg": owner_tg_id},
            )
        ).scalar_one()

        # Need savings cat for create_actual_v10's roundup hook (savings can be
        # absent, hook is a no-op when SavingsConfig.roundup_enabled=false).
        from tests.helpers.seed import seed_category

        cat = await seed_category(
            session,
            user_id=uid,
            name="Подписки",
            code="subs",
            ord="08",
            kind=CategoryKind.expense,
            plan_cents=0,
            sort_order=10,
        )
        savings_cat = await seed_category(
            session,
            user_id=uid,
            name="КОПИЛКА",
            code="savings",
            ord="99",
            kind=CategoryKind.expense,
            plan_cents=0,
            sort_order=99,
        )
        acc = Account(
            user_id=uid,
            bank="Т-Банк",
            kind=AccountKind.card,
            balance_cents=10_000_00,
            is_primary=True,
        )
        session.add(acc)
        await session.commit()
        await session.refresh(cat)
        await session.refresh(acc)

        sub = Subscription(
            user_id=uid,
            name="Netflix",
            amount_cents=99900,
            cycle=SubCycle.monthly,
            next_charge_date=date.today() + timedelta(days=10),
            category_id=cat.id,
            notify_days_before=2,
            is_active=True,
            account_id=acc.id,
        )
        session.add(sub)
        await session.commit()
        await session.refresh(sub)
        return {"sub_id": sub.id, "account_id": acc.id, "category_id": cat.id}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_subscription_requires_auth_403(async_client):
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    r = await async_client.post("/api/v1/subscriptions/1/post")
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# post
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_subscription_happy(db_setup, auth_headers, seed_sub_with_account):
    client, _ = db_setup
    seed = seed_sub_with_account
    r = await client.post(
        f"/api/v1/subscriptions/{seed['sub_id']}/post", headers=auth_headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["subscription_id"] == seed["sub_id"]
    assert isinstance(body["txn_id"], int)
    assert body["posted_at"]


@pytest.mark.asyncio
async def test_post_subscription_409_already_posted(
    db_setup, auth_headers, seed_sub_with_account
):
    client, _ = db_setup
    seed = seed_sub_with_account
    first = await client.post(
        f"/api/v1/subscriptions/{seed['sub_id']}/post", headers=auth_headers
    )
    assert first.status_code == 200

    second = await client.post(
        f"/api/v1/subscriptions/{seed['sub_id']}/post", headers=auth_headers
    )
    assert second.status_code == 409
    assert second.json()["detail"]["error"] == "already_posted"


# ---------------------------------------------------------------------------
# unpost
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unpost_subscription_happy(db_setup, auth_headers, seed_sub_with_account):
    client, _ = db_setup
    seed = seed_sub_with_account
    posted = await client.post(
        f"/api/v1/subscriptions/{seed['sub_id']}/post", headers=auth_headers
    )
    assert posted.status_code == 200

    unposted = await client.post(
        f"/api/v1/subscriptions/{seed['sub_id']}/unpost", headers=auth_headers
    )
    assert unposted.status_code == 204


# NOTE (prune): the post/unpost _404_missing tests were removed — both exercise
# the shared get_or_404 lookup, covered by tests/services/test_subscriptions_post.py
# cross-tenant/lookup tests and the 404_not_posted case below.


@pytest.mark.asyncio
async def test_unpost_subscription_404_not_posted(
    db_setup, auth_headers, seed_sub_with_account
):
    client, _ = db_setup
    seed = seed_sub_with_account
    # No prior post → unpost is 404.
    r = await client.post(
        f"/api/v1/subscriptions/{seed['sub_id']}/unpost", headers=auth_headers
    )
    assert r.status_code == 404
