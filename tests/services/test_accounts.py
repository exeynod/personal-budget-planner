"""Unit tests for app/services/accounts.py (Phase 22, Plan 22.06).

Covers BE-02 (Account CRUD) and BE-03 (balance delta-accounting).

Service contract (per spawner objective + PLAN.md):
- create_account / list_accounts / get_account / get_or_404
- update_account / delete_account / set_primary
- apply_balance_delta
- Domain exceptions: AccountNotFoundError, AccountHasTxnsError

Behavior coverage (DB-backed):
1. test_create_account_first_is_auto_primary — first account auto-primary even if primary=False.
2. test_create_account_second_with_primary_true_demotes_prior — atomic flip.
3. test_create_account_second_with_primary_false_keeps_prior — no demotion.
4. test_apply_balance_delta_updates_in_place — delta arithmetic.
5. test_apply_balance_delta_returns_new_balance — return value matches DB.
6. test_delete_account_with_no_txns_succeeds — clean delete works.
7. test_delete_account_with_subscription_blocks — sub.account_id reference blocks delete.
8. test_set_primary_demotes_prior_atomically — explicit set_primary call.
9. test_list_accounts_only_returns_user_scope — tenant isolation via user_id filter.
10. test_get_or_404_cross_tenant_returns_not_found — cross-tenant id raises.
11. test_get_account_returns_none_on_miss — get_account is non-raising sibling.
12. test_update_account_primary_true_demotes_prior — update path also demotes.

DB-backed: requires DATABASE_URL pointing to a Postgres at v1.0 schema HEAD
(0015_v10_rls_finalize). Self-skips otherwise via _require_db().

NOTE on actual_transaction.account_id: migration 0014 does NOT add an
``account_id`` column to actual_transaction. Per spawner Option B, balance
delta-accounting via parent.account_id is deferred to plan 22.07 (roundup)
or 22.13 (routers); delete-protection in this plan covers only
``subscription.account_id`` references. The service code includes a
``hasattr`` guard for forward-compat once the column lands.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------- Test fixtures (self-contained; no tests/helpers/seed dependency) ----------


async def _truncate_v1_tables(session):
    """Truncate v1.0 domain tables in FK-safe order. Bypasses RLS (admin role)."""
    from sqlalchemy import text

    await session.execute(text("RESET ROLE"))
    await session.execute(text("SET LOCAL row_security = off"))
    # FK depth order — children first, parents last.
    for tbl in (
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        "subscription",
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
    """Truncate, seed a single owner AppUser, return its PK id.

    Each test gets a fresh schema via TRUNCATE. The fixture doesn't call
    set_tenant_scope — individual tests do that explicitly to mirror the
    real request-handler pattern (Phase 11 RLS contract).
    """
    _require_db()
    await _truncate_v1_tables(db_session)
    user = await _seed_user(db_session, tg_user_id=9_000_001_001)
    yield {"id": user.id, "tg_user_id": user.tg_user_id}


@pytest_asyncio.fixture
async def two_users(db_session):
    """Truncate, seed two owner AppUsers, return their ids."""
    _require_db()
    await _truncate_v1_tables(db_session)
    user_a = await _seed_user(db_session, tg_user_id=9_000_001_010)
    user_b = await _seed_user(db_session, tg_user_id=9_000_001_011)
    yield {"a_id": user_a.id, "b_id": user_b.id}


# ---------- Tests ----------


@pytest.mark.asyncio
async def test_service_module_importable():
    """Sanity: module imports cleanly with all required symbols."""
    from app.services import accounts as svc

    for name in (
        "create_account",
        "list_accounts",
        "get_account",
        "get_or_404",
        "update_account",
        "delete_account",
        "set_primary",
        "apply_balance_delta",
        "AccountNotFoundError",
        "AccountHasTxnsError",
    ):
        assert hasattr(svc, name), f"missing symbol: {name}"


@pytest.mark.asyncio
async def test_create_account_first_is_auto_primary(db_session, owner_user):
    """First account is always primary, even if caller passes primary=False (auto-promotion)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    acct = await svc.create_account(
        db_session,
        user_id=owner_user["id"],
        bank="Т-Банк",
        kind=AccountKind.card,
        balance_cents=10000,
        primary=False,  # explicitly false — should be overridden
    )
    assert acct.is_primary is True
    assert acct.balance_cents == 10000
    assert acct.bank == "Т-Банк"


@pytest.mark.asyncio
async def test_create_account_second_with_primary_true_demotes_prior(db_session, owner_user):
    """Second account with primary=True flips first account to is_primary=False."""
    from app.db.models import Account, AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    first = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    assert first.is_primary is True

    second = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="СБЕР", kind=AccountKind.card, balance_cents=5000, primary=True,
    )
    assert second.is_primary is True

    # Re-read first to verify demotion.
    await db_session.refresh(first)
    assert first.is_primary is False

    # Verify exactly one primary remains.
    from sqlalchemy import func, select
    primary_count = await db_session.scalar(
        select(func.count()).select_from(Account)
        .where(Account.user_id == owner_user["id"], Account.is_primary.is_(True))
    )
    assert primary_count == 1


@pytest.mark.asyncio
async def test_create_account_second_with_primary_false_keeps_prior(db_session, owner_user):
    """Second account with primary=False does NOT demote first."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    first = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    second = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Наличные", kind=AccountKind.cash, balance_cents=300, primary=False,
    )
    await db_session.refresh(first)
    assert first.is_primary is True
    assert second.is_primary is False


@pytest.mark.asyncio
async def test_apply_balance_delta_updates_in_place(db_session, owner_user):
    """delta_cents=-500 reduces balance by 500; positive delta increases."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    acct = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=10000,
    )

    new_balance = await svc.apply_balance_delta(
        db_session, account_id=acct.id, user_id=owner_user["id"], delta_cents=-500
    )
    assert new_balance == 9500

    new_balance = await svc.apply_balance_delta(
        db_session, account_id=acct.id, user_id=owner_user["id"], delta_cents=2000
    )
    assert new_balance == 11500

    # Verify persisted via fresh read.
    await db_session.refresh(acct)
    assert acct.balance_cents == 11500


@pytest.mark.asyncio
async def test_apply_balance_delta_unknown_account_raises(db_session, owner_user):
    """apply_balance_delta with non-existent account_id raises AccountNotFoundError."""
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc
    from app.services.accounts import AccountNotFoundError

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(AccountNotFoundError):
        await svc.apply_balance_delta(
            db_session, account_id=999_999, user_id=owner_user["id"], delta_cents=100
        )


@pytest.mark.asyncio
async def test_delete_account_with_no_refs_succeeds(db_session, owner_user):
    """Deleting an account with no subscription/txn references works."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc
    from app.services.accounts import AccountNotFoundError

    await set_tenant_scope(db_session, owner_user["id"])
    # Two accounts so the deleted one is non-primary (delete protection refuses sole primary).
    acct1 = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    acct2 = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Наличные", kind=AccountKind.cash, balance_cents=0,
    )
    # acct2 is non-primary (acct1 was first → auto primary). Delete acct2.
    await svc.delete_account(
        db_session, account_id=acct2.id, user_id=owner_user["id"]
    )
    with pytest.raises(AccountNotFoundError):
        await svc.get_or_404(db_session, account_id=acct2.id, user_id=owner_user["id"])

    # acct1 still there
    refreshed = await svc.get_or_404(
        db_session, account_id=acct1.id, user_id=owner_user["id"]
    )
    assert refreshed.is_primary is True


@pytest.mark.asyncio
async def test_delete_account_with_subscription_blocks(db_session, owner_user):
    """Account referenced by subscription.account_id cannot be deleted (BE-02)."""
    from datetime import date as _date

    from app.db.models import (
        AccountKind,
        CategoryKind,
        SubCycle,
        Subscription,
    )
    from tests.helpers.seed import seed_category
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc
    from app.services.accounts import AccountHasTxnsError

    await set_tenant_scope(db_session, owner_user["id"])
    acct = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=10000,
    )
    # Need a category for the subscription FK. Phase 22 added Category.code/ord
    # NOT NULL columns (migration 0013) — supply them explicitly so the
    # service-layer test is decoupled from any onboarding-seed helper.
    cat = await seed_category(
        db_session,
        user_id=owner_user["id"], name="Подписки",
        kind=CategoryKind.expense, sort_order=10,
        code="subs", ord="10",
    )
    await db_session.flush()

    sub = Subscription(
        user_id=owner_user["id"],
        name="Netflix",
        amount_cents=99900,
        cycle=SubCycle.monthly,
        next_charge_date=_date(2026, 6, 1),
        category_id=cat.id,
        notify_days_before=2,
        is_active=True,
        account_id=acct.id,
    )
    db_session.add(sub)
    await db_session.flush()

    with pytest.raises(AccountHasTxnsError) as exc_info:
        await svc.delete_account(
            db_session, account_id=acct.id, user_id=owner_user["id"]
        )
    assert exc_info.value.account_id == acct.id
    assert exc_info.value.sub_count >= 1


@pytest.mark.asyncio
async def test_delete_account_sole_primary_blocked(db_session, owner_user):
    """Cannot delete the sole primary account when other accounts exist (would leave user without primary)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    primary = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Наличные", kind=AccountKind.cash, balance_cents=0,
    )
    # Deleting primary while another non-primary exists → ValueError ("would orphan primary").
    with pytest.raises(ValueError):
        await svc.delete_account(
            db_session, account_id=primary.id, user_id=owner_user["id"]
        )


@pytest.mark.asyncio
async def test_set_primary_demotes_prior_atomically(db_session, owner_user):
    """set_primary(account_id) clears primary on others and sets on this account."""
    from app.db.models import Account, AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    a = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    b = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Наличные", kind=AccountKind.cash, balance_cents=0,
    )
    assert a.is_primary is True
    assert b.is_primary is False

    updated = await svc.set_primary(
        db_session, account_id=b.id, user_id=owner_user["id"]
    )
    assert updated.id == b.id
    assert updated.is_primary is True

    await db_session.refresh(a)
    assert a.is_primary is False

    # Exactly one primary remains.
    from sqlalchemy import func, select
    primary_count = await db_session.scalar(
        select(func.count()).select_from(Account)
        .where(Account.user_id == owner_user["id"], Account.is_primary.is_(True))
    )
    assert primary_count == 1


@pytest.mark.asyncio
async def test_list_accounts_only_returns_user_scope(db_session, two_users):
    """User A's list must not include user B's accounts (BE-02 tenant isolation)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    a_id, b_id = two_users["a_id"], two_users["b_id"]

    await set_tenant_scope(db_session, a_id)
    a1 = await svc.create_account(
        db_session, user_id=a_id, bank="A-Bank", kind=AccountKind.card, balance_cents=100,
    )
    await set_tenant_scope(db_session, b_id)
    b1 = await svc.create_account(
        db_session, user_id=b_id, bank="B-Bank", kind=AccountKind.cash, balance_cents=200,
    )

    await set_tenant_scope(db_session, a_id)
    a_list = await svc.list_accounts(db_session, user_id=a_id)
    a_ids = {acct.id for acct in a_list}
    assert a1.id in a_ids
    assert b1.id not in a_ids
    assert all(acct.user_id == a_id for acct in a_list)


@pytest.mark.asyncio
async def test_get_or_404_cross_tenant_returns_not_found(db_session, two_users):
    """Cross-tenant get_or_404 raises AccountNotFoundError (404 leakage absent)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc
    from app.services.accounts import AccountNotFoundError

    a_id, b_id = two_users["a_id"], two_users["b_id"]

    await set_tenant_scope(db_session, a_id)
    a_acct = await svc.create_account(
        db_session, user_id=a_id, bank="A-Bank", kind=AccountKind.card, balance_cents=0,
    )

    # User B tries to read user A's account by id → 404 (not 403, not data leak).
    await set_tenant_scope(db_session, b_id)
    with pytest.raises(AccountNotFoundError):
        await svc.get_or_404(db_session, account_id=a_acct.id, user_id=b_id)


@pytest.mark.asyncio
async def test_get_account_returns_none_on_miss(db_session, owner_user):
    """get_account is the non-raising variant — returns None on miss."""
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    result = await svc.get_account(
        db_session, account_id=999_999, user_id=owner_user["id"]
    )
    assert result is None


@pytest.mark.asyncio
async def test_update_account_primary_true_demotes_prior(db_session, owner_user):
    """update_account(primary=True) demotes other primary atomically."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    a = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    b = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Наличные", kind=AccountKind.cash, balance_cents=0,
    )
    assert a.is_primary is True

    updated = await svc.update_account(
        db_session, account_id=b.id, user_id=owner_user["id"],
        primary=True,
    )
    assert updated.is_primary is True

    await db_session.refresh(a)
    assert a.is_primary is False


@pytest.mark.asyncio
async def test_update_account_balance_field(db_session, owner_user):
    """update_account can patch arbitrary fields (mask, balance_cents)."""
    from app.db.models import AccountKind
    from app.db.session import set_tenant_scope
    from app.services import accounts as svc

    await set_tenant_scope(db_session, owner_user["id"])
    acct = await svc.create_account(
        db_session, user_id=owner_user["id"],
        bank="Т-Банк", kind=AccountKind.card, balance_cents=0,
    )
    updated = await svc.update_account(
        db_session, account_id=acct.id, user_id=owner_user["id"],
        balance_cents=12345, mask="·· 4408",
    )
    assert updated.balance_cents == 12345
    assert updated.mask == "·· 4408"
