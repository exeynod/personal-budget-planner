"""CON-01 regression: complete_onboarding atomic — concurrent submit yields
exactly one success and one AlreadyOnboardedError.

This test FAILs against pre-fix code (both winners pass user.onboarded_at IS
None check; one will get IntegrityError from UniqueConstraint, NOT a clean
AlreadyOnboardedError, with partial mutation of user.cycle_start_day).
PASSes after Plan 16-06 (atomic UPDATE-with-WHERE claim).

Covers Plan 16-06 must-haves:
- Two parallel complete_onboarding for one tg_user_id ⇒ exactly one
  success + exactly one AlreadyOnboardedError.
- user.cycle_start_day & user.onboarded_at not overwritten — winner
  set them atomically through UPDATE-WHERE.
- Existing single-flow onboarding still works (sequential repeat path).
"""
from __future__ import annotations

import asyncio
import os

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.db.models import AppUser, UserRole
from app.db.session import AsyncSessionLocal
from app.services.onboarding import (
    AlreadyOnboardedError,
    complete_onboarding,
)


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# Use a tg_user_id well outside the OWNER_TG_ID test default (123456789) and
# the multi-tenant test range (9_000_000_001/2). Plan 16-06 spec value.
_TEST_TG_USER_ID = 999_001_777


async def _hard_cleanup(tg_user_id: int) -> None:
    """Hard-delete all rows for our test user, bypassing RLS.

    Since complete_onboarding creates a BudgetPeriod (FK RESTRICT on app_user),
    we must clean domain rows in FK-depth order BEFORE deleting app_user. We
    bypass RLS via SET LOCAL row_security=off — tests run as superuser
    `budget` per conftest.py, so this is permitted. Two-phase: lookup PK,
    then cascade-delete each table.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(text("SET LOCAL row_security = off"))
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": tg_user_id},
        )
        ids = [row[0] for row in result.all()]
        if ids:
            for tbl in (
                "ai_message",
                "ai_conversation",
                "category_embedding",
                "actual_transaction",
                "planned_transaction",
                "subscription",
                "plan_template_item",
                "budget_period",
                "category",
            ):
                await session.execute(
                    text(f"DELETE FROM {tbl} WHERE user_id = ANY(:uids)"),
                    {"uids": ids},
                )
            await session.execute(
                text("DELETE FROM app_user WHERE id = ANY(:uids)"),
                {"uids": ids},
            )
        await session.commit()


@pytest_asyncio.fixture
async def seeded_app_user_not_onboarded():
    """Insert an AppUser row with onboarded_at=NULL via direct ORM.

    Cleanup happens both pre-test (idempotency for repeated runs) and
    post-test. Yields the freshly-inserted AppUser.
    """
    _require_db()

    # Pre-test cleanup: kill any leftover from a prior crashed run.
    await _hard_cleanup(_TEST_TG_USER_ID)

    async with AsyncSessionLocal() as session:
        u = AppUser(
            tg_user_id=_TEST_TG_USER_ID,
            role=UserRole.member,
            cycle_start_day=5,
            onboarded_at=None,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)

    try:
        yield u
    finally:
        await _hard_cleanup(_TEST_TG_USER_ID)


@pytest.mark.asyncio
async def test_concurrent_complete_onboarding_yields_one_success_one_already(
    seeded_app_user_not_onboarded,
):
    """Two concurrent complete_onboarding for one tg_user_id race against each other.

    Each coroutine MUST use an independent AsyncSession — production serves
    concurrent /onboarding/complete requests from independent get_db() generators;
    a shared session would not exhibit the race window.

    Race-forcing: each attempt acquires its own DB connection by executing
    a trivial SELECT outside `complete_onboarding` first, then waits on an
    asyncio.Barrier(2) so BOTH transactions are open BEFORE either calls
    `complete_onboarding`. Without this barrier, the second gather task
    typically lands AFTER the first commits, hiding the race window. With
    the barrier, both racers progress through the gate-and-mutate path in
    lockstep:
      - pre-fix: both pass `user.onboarded_at IS None` gate, both attempt
        create_first_period, the second hits IntegrityError on
        UniqueConstraint(user_id, period_start) — outcomes contain "error".
      - post-fix: atomic UPDATE-WHERE serialises at row-lock; loser sees
        zero rows in RETURNING and raises a clean AlreadyOnboardedError —
        outcomes are exactly ["already", "success"].
    """
    tg_user_id = seeded_app_user_not_onboarded.tg_user_id

    # Two-arrival barrier — both attempts must reach this point before
    # either proceeds into complete_onboarding's mutate path.
    barrier = asyncio.Barrier(2)

    async def _attempt() -> tuple[str, object]:
        # Open an INDEPENDENT session — concurrent requests in production are
        # served by independent get_db() generators. Cannot share session.
        async with AsyncSessionLocal() as session:
            # Force a connection acquisition + transaction start by issuing a
            # trivial SELECT that pins the connection's snapshot of
            # app_user.onboarded_at BEFORE the barrier releases.
            await session.execute(
                text("SELECT onboarded_at FROM app_user WHERE tg_user_id = :tg"),
                {"tg": tg_user_id},
            )
            # Both racers wait here — guarantees both have an open transaction
            # with `onboarded_at IS NULL` in their read view.
            await barrier.wait()
            try:
                result = await complete_onboarding(
                    session,
                    tg_user_id=tg_user_id,
                    starting_balance_cents=100000,
                    cycle_start_day=1,
                    seed_default_categories=False,
                )
                await session.commit()
                return ("success", result)
            except AlreadyOnboardedError as exc:
                await session.rollback()
                return ("already", exc)
            except Exception as exc:
                await session.rollback()
                return ("error", exc)

    a, b = await asyncio.gather(_attempt(), _attempt())

    outcomes = sorted([a[0], b[0]])
    assert outcomes == ["already", "success"], (
        f"Expected one success + one already-onboarded; got {outcomes!r} "
        f"with details: a={a!r}, b={b!r}"
    )

    # Verify final DB state: exactly one onboarded_at set, cycle_start_day=1.
    async with AsyncSessionLocal() as verify_session:
        row = (await verify_session.execute(
            select(AppUser).where(AppUser.tg_user_id == tg_user_id)
        )).scalar_one()
        assert row.onboarded_at is not None
        assert row.cycle_start_day == 1


@pytest.mark.asyncio
async def test_repeat_complete_after_success_raises_already(
    seeded_app_user_not_onboarded,
):
    """Sequential repeat: second call raises AlreadyOnboardedError (regression for D-10).

    Also pins the contract that a loser MUST NOT overwrite cycle_start_day —
    even though they pass a different value (15), winner's value (1) survives.
    """
    tg_user_id = seeded_app_user_not_onboarded.tg_user_id

    async with AsyncSessionLocal() as session_a:
        result = await complete_onboarding(
            session_a,
            tg_user_id=tg_user_id,
            starting_balance_cents=100000,
            cycle_start_day=1,
            seed_default_categories=False,
        )
        await session_a.commit()
        assert result["onboarded_at"]

    async with AsyncSessionLocal() as session_b:
        with pytest.raises(AlreadyOnboardedError):
            await complete_onboarding(
                session_b,
                tg_user_id=tg_user_id,
                starting_balance_cents=200000,
                cycle_start_day=15,
                seed_default_categories=False,
            )

    # cycle_start_day must remain 1 (winner value), not 15 (loser).
    async with AsyncSessionLocal() as verify_session:
        row = (await verify_session.execute(
            select(AppUser).where(AppUser.tg_user_id == tg_user_id)
        )).scalar_one()
        assert row.cycle_start_day == 1, "Loser must NOT overwrite cycle_start_day"
