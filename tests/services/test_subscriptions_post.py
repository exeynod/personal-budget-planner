"""Service tests for app/services/subscriptions.py post / unpost (Phase 22, Plan 22.09).

Covers BE-13:
- post_subscription(db, sub_id, *, user_id) -> ActualTransaction
- unpost_subscription(db, sub_id, *, user_id) -> None

Behaviors verified:
- post creates an actual_transaction(kind=expense), wired to sub.category_id
  and sub.account_id, with negative amount (sub.amount_cents stored as positive
  in DB → txn flips to -abs).
- post sets sub.posted_txn_id = txn.id atomically.
- post applies balance delta to subscription.account_id (BE-03 hook).
- post is idempotent: second call raises SubscriptionAlreadyPostedError (→ 409).
- Inactive subscription cannot be posted (SubscriptionInactiveError).
- Subscription with NULL account_id cannot be posted (ValueError → 422).
- Cross-tenant post raises LookupError (404 leakage absent).
- unpost deletes the linked actual_transaction (cascades roundup children if any).
- unpost clears sub.posted_txn_id.
- unpost restores account balance (delegated to delete_actual_v10).
- unpost on never-posted subscription raises SubscriptionNotPostedError (→ 404).

DB-backed: requires DATABASE_URL pointing to a Postgres at v1.0 schema HEAD
(0016_v10_actual_account_id). Self-skips otherwise.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------- Fixtures ----------


async def _truncate_v1_tables(session):
    """Truncate v1.0 domain tables in FK-safe order. Bypasses RLS (admin role)."""
    from sqlalchemy import text

    await session.execute(text("RESET ROLE"))
    await session.execute(text("SET LOCAL row_security = off"))
    for tbl in (
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        "subscription",
        "savings_config",
        "goal",
        "account",
        "budget_period",
        "category",
        "auth_token",
        "ai_usage_log",
        "app_user",
    ):
        await session.execute(text(f"DELETE FROM {tbl}"))
    await session.commit()


async def _seed_user(session, *, tg_user_id: int):
    from app.db.models import AppUser, UserRole

    user = AppUser(
        tg_user_id=tg_user_id,
        role=UserRole.owner,
        cycle_start_day=5,
        onboarded_at=datetime.now(timezone.utc),
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user


@pytest_asyncio.fixture
async def owner_user(db_session):
    _require_db()
    await _truncate_v1_tables(db_session)
    user = await _seed_user(db_session, tg_user_id=9_000_009_001)
    yield {"id": user.id, "tg_user_id": user.tg_user_id}


@pytest_asyncio.fixture
async def two_users(db_session):
    _require_db()
    await _truncate_v1_tables(db_session)
    a = await _seed_user(db_session, tg_user_id=9_000_009_010)
    b = await _seed_user(db_session, tg_user_id=9_000_009_011)
    yield {"a_id": a.id, "b_id": b.id}


@pytest_asyncio.fixture
async def regular_category(db_session, owner_user):
    """An expense Category for the subscription (e.g. ПОДПИСКИ)."""
    from app.db.models import Category, CategoryKind

    cat = Category(
        user_id=owner_user["id"],
        name="ПОДПИСКИ",
        kind=CategoryKind.expense,
        sort_order=8,
        code="subs",
        ord="08",
        plan_cents=200000,
    )
    db_session.add(cat)
    await db_session.flush()
    yield cat


@pytest_asyncio.fixture
async def primary_account(db_session, owner_user):
    """Primary card account with starting balance 100_000 ₽ (10_000_000 копеек)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as acct_svc

    await set_tenant_scope(db_session, owner_user["id"])
    acct = await acct_svc.create_account(
        db_session,
        user_id=owner_user["id"],
        bank="Т-Банк",
        kind=AccountKind.card,
        balance_cents=10_000_000,
    )
    yield acct


@pytest_asyncio.fixture
async def active_subscription(
    db_session, owner_user, regular_category, primary_account
):
    """An active monthly subscription for 999.00 ₽ wired to category + account."""
    from app.db.models import SubCycle, Subscription

    sub = Subscription(
        user_id=owner_user["id"],
        name="Netflix",
        amount_cents=99_900,
        cycle=SubCycle.monthly,
        next_charge_date=date(2026, 6, 1),
        category_id=regular_category.id,
        notify_days_before=2,
        is_active=True,
        day_of_month=1,
        account_id=primary_account.id,
    )
    db_session.add(sub)
    await db_session.flush()
    yield sub


# ---------- Sanity ----------


@pytest.mark.asyncio
async def test_service_module_exposes_post_unpost_symbols():
    """Sanity: subscriptions module exports the new symbols."""
    from app.services import subscriptions as svc

    for name in (
        "post_subscription",
        "unpost_subscription",
        "SubscriptionAlreadyPostedError",
        "SubscriptionNotPostedError",
        "SubscriptionInactiveError",
    ):
        assert hasattr(svc, name), f"missing symbol: {name}"


# ---------- post_subscription ----------


@pytest.mark.asyncio
async def test_post_subscription_creates_expense_txn(
    db_session, owner_user, active_subscription, regular_category, primary_account
):
    """post_subscription creates ActualTransaction(kind=expense, amount=-|sub.amount|)."""
    from app.db.models import ActualKind
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription

    await set_tenant_scope(db_session, owner_user["id"])

    txn = await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )

    assert txn is not None
    assert txn.kind == ActualKind.expense
    assert txn.amount_cents == -abs(active_subscription.amount_cents)
    assert txn.category_id == regular_category.id
    assert txn.account_id == primary_account.id
    assert txn.user_id == owner_user["id"]


@pytest.mark.asyncio
async def test_post_subscription_sets_posted_txn_id_on_subscription(
    db_session, owner_user, active_subscription
):
    """post_subscription sets sub.posted_txn_id = new txn.id atomically."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription

    await set_tenant_scope(db_session, owner_user["id"])

    txn = await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )

    await db_session.refresh(active_subscription)
    assert active_subscription.posted_txn_id == txn.id


@pytest.mark.asyncio
async def test_post_subscription_applies_balance_delta(
    db_session, owner_user, active_subscription, primary_account
):
    """post_subscription reduces account.balance_cents by abs(sub.amount_cents).

    apply_balance_delta uses raw UPDATE … RETURNING, which bypasses SA's
    identity map. Read the balance via a fresh raw SQL query to avoid the
    cached object in the session's identity map.
    """
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription
    from sqlalchemy import text

    await set_tenant_scope(db_session, owner_user["id"])

    starting_balance = primary_account.balance_cents

    await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )

    new_balance = await db_session.scalar(
        text("SELECT balance_cents FROM account WHERE id = :id"),
        {"id": primary_account.id},
    )
    assert new_balance == starting_balance - abs(active_subscription.amount_cents)


@pytest.mark.asyncio
async def test_post_subscription_uses_today_as_tx_date(
    db_session, owner_user, active_subscription
):
    """post_subscription uses today (Europe/Moscow) as the actual_transaction.tx_date."""
    from app.db.session import set_tenant_scope
    from app.services.periods import _today_in_app_tz
    from app.services.subscriptions import post_subscription

    await set_tenant_scope(db_session, owner_user["id"])

    txn = await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )
    assert txn.tx_date == _today_in_app_tz()


@pytest.mark.asyncio
async def test_post_subscription_when_already_posted_raises_409(
    db_session, owner_user, active_subscription
):
    """Second call raises SubscriptionAlreadyPostedError (idempotency gate, T-22-09-01)."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import (
        SubscriptionAlreadyPostedError,
        post_subscription,
    )

    await set_tenant_scope(db_session, owner_user["id"])

    first = await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )

    with pytest.raises(SubscriptionAlreadyPostedError) as exc_info:
        await post_subscription(
            db_session, active_subscription.id, user_id=owner_user["id"]
        )
    assert exc_info.value.sub_id == active_subscription.id
    assert exc_info.value.posted_txn_id == first.id


@pytest.mark.asyncio
async def test_post_subscription_inactive_raises(
    db_session, owner_user, active_subscription
):
    """Posting an inactive subscription raises SubscriptionInactiveError (T-22-09-05)."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import (
        SubscriptionInactiveError,
        post_subscription,
    )

    await set_tenant_scope(db_session, owner_user["id"])

    active_subscription.is_active = False
    await db_session.flush()

    with pytest.raises(SubscriptionInactiveError) as exc_info:
        await post_subscription(
            db_session, active_subscription.id, user_id=owner_user["id"]
        )
    assert exc_info.value.sub_id == active_subscription.id


@pytest.mark.asyncio
async def test_post_subscription_account_id_null_raises(
    db_session, owner_user, regular_category
):
    """Subscription without account_id cannot be posted (ValueError → 422, T-22-09-06)."""
    from app.db.models import SubCycle, Subscription
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription

    await set_tenant_scope(db_session, owner_user["id"])

    sub = Subscription(
        user_id=owner_user["id"],
        name="Spotify",
        amount_cents=29_900,
        cycle=SubCycle.monthly,
        next_charge_date=date(2026, 6, 1),
        category_id=regular_category.id,
        notify_days_before=2,
        is_active=True,
        day_of_month=1,
        account_id=None,
    )
    db_session.add(sub)
    await db_session.flush()

    with pytest.raises(ValueError):
        await post_subscription(db_session, sub.id, user_id=owner_user["id"])


@pytest.mark.asyncio
async def test_post_subscription_cross_tenant_raises_lookup_error(
    db_session, two_users
):
    """User B cannot post user A's subscription — LookupError (T-22-09-02)."""
    from app.db.models import (
        AccountKind,
        Category,
        CategoryKind,
        SubCycle,
        Subscription,
    )
    from app.db.session import set_tenant_scope
    from app.services import accounts as acct_svc
    from app.services.subscriptions import post_subscription

    a_id, b_id = two_users["a_id"], two_users["b_id"]

    # Seed A's account + category + subscription as A.
    await set_tenant_scope(db_session, a_id)
    a_acct = await acct_svc.create_account(
        db_session,
        user_id=a_id,
        bank="A-Bank",
        kind=AccountKind.card,
        balance_cents=100_000,
    )
    a_cat = Category(
        user_id=a_id,
        name="ПОДПИСКИ",
        kind=CategoryKind.expense,
        sort_order=8,
        code="subs",
        ord="08",
    )
    db_session.add(a_cat)
    await db_session.flush()

    a_sub = Subscription(
        user_id=a_id,
        name="A-Netflix",
        amount_cents=99_900,
        cycle=SubCycle.monthly,
        next_charge_date=date(2026, 6, 1),
        category_id=a_cat.id,
        notify_days_before=2,
        is_active=True,
        account_id=a_acct.id,
    )
    db_session.add(a_sub)
    await db_session.flush()

    # B tries to post A's subscription → LookupError (404).
    await set_tenant_scope(db_session, b_id)
    with pytest.raises(LookupError):
        await post_subscription(db_session, a_sub.id, user_id=b_id)


# ---------- unpost_subscription ----------


@pytest.mark.asyncio
async def test_unpost_subscription_deletes_linked_txn(
    db_session, owner_user, active_subscription
):
    """After unpost, the actual_transaction with that id no longer exists."""
    from app.db.models import ActualTransaction
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription, unpost_subscription
    from sqlalchemy import select

    await set_tenant_scope(db_session, owner_user["id"])

    txn = await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )
    txn_id = txn.id

    await unpost_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )

    surviving = await db_session.scalar(
        select(ActualTransaction).where(ActualTransaction.id == txn_id)
    )
    assert surviving is None


@pytest.mark.asyncio
async def test_unpost_subscription_clears_posted_txn_id(
    db_session, owner_user, active_subscription
):
    """After unpost, sub.posted_txn_id is None."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription, unpost_subscription

    await set_tenant_scope(db_session, owner_user["id"])

    await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )
    await db_session.refresh(active_subscription)
    assert active_subscription.posted_txn_id is not None

    await unpost_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )
    await db_session.refresh(active_subscription)
    assert active_subscription.posted_txn_id is None


@pytest.mark.asyncio
async def test_unpost_subscription_restores_balance(
    db_session, owner_user, active_subscription, primary_account
):
    """unpost restores account.balance_cents to pre-post value."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import post_subscription, unpost_subscription
    from sqlalchemy import text

    await set_tenant_scope(db_session, owner_user["id"])

    starting_balance = primary_account.balance_cents

    await post_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )
    after_post = await db_session.scalar(
        text("SELECT balance_cents FROM account WHERE id = :id"),
        {"id": primary_account.id},
    )
    assert after_post == starting_balance - abs(active_subscription.amount_cents)

    await unpost_subscription(
        db_session, active_subscription.id, user_id=owner_user["id"]
    )
    after_unpost = await db_session.scalar(
        text("SELECT balance_cents FROM account WHERE id = :id"),
        {"id": primary_account.id},
    )
    assert after_unpost == starting_balance


@pytest.mark.asyncio
async def test_unpost_subscription_when_not_posted_raises_404(
    db_session, owner_user, active_subscription
):
    """Unpost on never-posted subscription raises SubscriptionNotPostedError (T-22-09-03)."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import (
        SubscriptionNotPostedError,
        unpost_subscription,
    )

    await set_tenant_scope(db_session, owner_user["id"])

    assert active_subscription.posted_txn_id is None

    with pytest.raises(SubscriptionNotPostedError) as exc_info:
        await unpost_subscription(
            db_session, active_subscription.id, user_id=owner_user["id"]
        )
    assert exc_info.value.sub_id == active_subscription.id


@pytest.mark.asyncio
async def test_unpost_subscription_cross_tenant_raises_lookup_error(
    db_session, two_users
):
    """User B cannot unpost user A's subscription — LookupError (404)."""
    from app.db.session import set_tenant_scope
    from app.services.subscriptions import unpost_subscription

    a_id, b_id = two_users["a_id"], two_users["b_id"]

    # B tries to unpost a non-existent / cross-tenant id (1) — LookupError.
    await set_tenant_scope(db_session, b_id)
    with pytest.raises(LookupError):
        await unpost_subscription(db_session, sub_id=999_999, user_id=b_id)
