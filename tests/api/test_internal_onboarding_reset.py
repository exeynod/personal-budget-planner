"""Integration tests for DELETE /api/v1/internal/onboarding/reset (Phase 22, Plan 22.14, BE-15).

Verifies:
- 403 without X-Internal-Token / wrong token (verify_internal_token gate).
- 422 when ``user_id`` query param missing or non-positive.
- 200 + ``{user_id, deleted_account_ids}`` shape on success.
- Reset clears Account / Goal / SavingsConfig rows and sets
  AppUser.income_cents=NULL, onboarded_at=NULL, Category.plan_cents=0.
- Cross-tenant isolation: admin reset for user A leaves user B's state intact
  (account / income / categories untouched).
- Idempotent: re-running on already-reset user returns
  ``deleted_account_ids: []``.

DB-backed: requires DATABASE_URL pointing at v1.0 schema HEAD. Self-skips
otherwise. Mirrors the pattern from tests/api/test_onboarding_v10_api.py and
tests/test_internal_bot.py.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------------------------------------------------------------------------
# Fixtures (local to this file — keep conftest churn minimal)
# ---------------------------------------------------------------------------


@pytest.fixture
def internal_headers(internal_token):
    """``X-Internal-Token`` header dict for the configured test secret."""
    return {"X-Internal-Token": internal_token}


@pytest_asyncio.fixture
async def db_setup(async_client):
    """Truncate v1.0 tables and override ``get_db`` to use a real session.

    Yields ``(client, SessionLocal)`` so individual tests can seed extra rows
    via the same engine the FastAPI app uses. Mirrors test_onboarding_v10_api.
    """
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

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
    yield async_client, SessionLocal
    await engine.dispose()


async def _seed_onboarded_user(
    SessionLocal, *, tg_user_id: int, primary_balance_cents: int = 10_000_00
) -> int:
    """Seed AppUser + 1 Account + 8 categories + savings cat + Goal + SavingsConfig.

    Mirrors the post-``complete_v10`` shape so reset has something real to
    delete. Returns the AppUser PK.
    """
    from sqlalchemy import text

    from app.db.models import (
        Account,
        AccountKind,
        AppUser,
        CategoryKind,
        UserRole,
    )

    async with SessionLocal() as session:
        # Bypass RLS for the multi-statement seed (tests run as superuser).
        await session.execute(text("SET LOCAL row_security = off"))

        user = AppUser(
            tg_user_id=tg_user_id,
            role=UserRole.owner,
            cycle_start_day=5,
            income_cents=200_000_00,
            onboarded_at=datetime.now(timezone.utc),
        )
        session.add(user)
        await session.flush()

        acc = Account(
            user_id=user.id,
            bank="Т-Банк",
            kind=AccountKind.card,
            balance_cents=primary_balance_cents,
            is_primary=True,
        )
        session.add(acc)
        await session.flush()

        from tests.helpers.seed import seed_category

        # 8 default categories with non-zero plan_cents — reset must zero them.
        for i, code in enumerate(
            ["food", "cafe", "home", "transit", "fun", "gifts", "health", "subs"],
            start=1,
        ):
            await seed_category(
                session,
                user_id=user.id,
                name=code.upper(),
                code=code,
                ord=f"{i:02d}",
                kind=CategoryKind.expense,
                plan_cents=10_000_00,
                is_archived=False,
                sort_order=i,
            )
        # v1.1: savings category / Goal / SavingsConfig removed (AGREED §G1).
        await session.commit()
        return user.id


# ---------------------------------------------------------------------------
# Auth gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_without_token_returns_403(async_client):
    """No ``X-Internal-Token`` header → 403 from ``verify_internal_token``."""
    resp = await async_client.delete("/api/v1/internal/onboarding/reset?user_id=1")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_reset_with_wrong_token_returns_403(async_client):
    """Wrong header value → 403."""
    resp = await async_client.delete(
        "/api/v1/internal/onboarding/reset?user_id=1",
        headers={"X-Internal-Token": "definitely-not-the-secret"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Query-param validation (token ok)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_missing_user_id_returns_422(async_client, internal_headers):
    """No ``user_id`` query param → FastAPI returns 422."""
    resp = await async_client.delete(
        "/api/v1/internal/onboarding/reset",
        headers=internal_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reset_with_zero_user_id_returns_422(async_client, internal_headers):
    """``user_id=0`` violates ``Query(gt=0)`` → 422."""
    resp = await async_client.delete(
        "/api/v1/internal/onboarding/reset?user_id=0",
        headers=internal_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reset_with_negative_user_id_returns_422(async_client, internal_headers):
    """``user_id=-5`` violates ``Query(gt=0)`` → 422."""
    resp = await async_client.delete(
        "/api/v1/internal/onboarding/reset?user_id=-5",
        headers=internal_headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Happy path — reset clears all v1.0 onboarding state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_clears_accounts_goals_savings_and_zeros_plans(
    db_setup, internal_headers
):
    """End-to-end: seed full v1.0 state → reset → verify wiped + idempotent."""
    from sqlalchemy import func, select

    client, SessionLocal = db_setup

    user_id = await _seed_onboarded_user(SessionLocal, tg_user_id=9_001_011_001)

    resp = await client.delete(
        f"/api/v1/internal/onboarding/reset?user_id={user_id}",
        headers=internal_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user_id"] == user_id
    assert isinstance(body["deleted_account_ids"], list)
    assert len(body["deleted_account_ids"]) == 1

    from app.db.models import (
        Account,
        AppUser,
        Category,
    )

    async with SessionLocal() as session:
        # Account wiped (v1.1: goal/savings_config tables removed).
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Account)
                .where(Account.user_id == user_id)
            )
        ) == 0

        # AppUser.income / onboarded_at nulled.
        user = await session.scalar(select(AppUser).where(AppUser.id == user_id))
        assert user.income_cents is None
        assert user.onboarded_at is None

        # Categories preserved (FK integrity), plan_cents zeroed.
        cats = (
            (await session.execute(select(Category).where(Category.user_id == user_id)))
            .scalars()
            .all()
        )
        assert len(cats) == 8  # 8 default (v1.1: savings category removed)
        for c in cats:
            assert c.plan_cents == 0, f"category {c.code} plan_cents not zeroed"

    # Idempotent: re-running yields empty deleted list.
    resp2 = await client.delete(
        f"/api/v1/internal/onboarding/reset?user_id={user_id}",
        headers=internal_headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["deleted_account_ids"] == []


# ---------------------------------------------------------------------------
# Cross-tenant isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_for_user_a_does_not_affect_user_b(db_setup, internal_headers):
    """Admin reset targeting user A leaves user B's state fully intact."""
    from sqlalchemy import func, select

    client, SessionLocal = db_setup

    user_a_id = await _seed_onboarded_user(
        SessionLocal, tg_user_id=9_001_011_002, primary_balance_cents=10_000_00
    )
    user_b_id = await _seed_onboarded_user(
        SessionLocal, tg_user_id=9_001_011_003, primary_balance_cents=99_999_00
    )

    resp = await client.delete(
        f"/api/v1/internal/onboarding/reset?user_id={user_a_id}",
        headers=internal_headers,
    )
    assert resp.status_code == 200

    from app.db.models import Account, AppUser, Category
    from sqlalchemy import text

    async with SessionLocal() as session:
        # Bypass RLS so we can read user_b's rows from an unscoped session.
        await session.execute(text("SET LOCAL row_security = off"))

        # User B's account still present (v1.1: goal/savings_config removed).
        b_acc_count = await session.scalar(
            select(func.count())
            .select_from(Account)
            .where(Account.user_id == user_b_id)
        )
        assert b_acc_count == 1
        b_acc = await session.scalar(
            select(Account).where(Account.user_id == user_b_id)
        )
        assert b_acc.balance_cents == 99_999_00

        # User B's income / onboarded_at intact.
        user_b = await session.scalar(select(AppUser).where(AppUser.id == user_b_id))
        assert user_b.income_cents == 200_000_00
        assert user_b.onboarded_at is not None

        # User B's category plans still non-zero (default seed).
        b_plan_sum = await session.scalar(
            select(func.sum(Category.plan_cents)).where(
                Category.user_id == user_b_id,
                Category.code != "savings",
            )
        )
        assert b_plan_sum and int(b_plan_sum) > 0
