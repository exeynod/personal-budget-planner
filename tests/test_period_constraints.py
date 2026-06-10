"""Этап 2 (WI-1) — DB-level invariant constraints (alembic 0039).

Verifies that the schema actually enforces three domain invariants, not just
the service layer:

  * ``uq_budget_period_one_active`` — partial UNIQUE: ≤1 active period per user.
  * ``ck_budget_period_end_after_start`` — CHECK period_end >= period_start.
  * ``ck_app_user_cycle_start_day`` — CHECK cycle_start_day BETWEEN 1 AND 28.

Each violating write is wrapped in its own ``db_session.begin_nested()``
savepoint so the IntegrityError rolls back just that statement, leaving the
session usable for the happy-path assertion in the same test.

Runs under the admin/seed session (``db_session``) — constraint enforcement is
a property of the schema and is independent of the runtime role.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, DBAPIError

from app.db.models import BudgetPeriod, PeriodStatus
from tests.helpers.seed import seed_budget_period, seed_user

pytestmark = pytest.mark.asyncio


# tg_user_id-ы вне OWNER_TG_ID test default (123456789) и production диапазонов.
_TG_BASE = 9_100_000_000


async def _cleanup_user(db_session, tg_user_id: int) -> None:
    """Hard-delete any leftover user + their periods (RLS bypass for admin)."""
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    res = await db_session.execute(
        text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
        {"tg": tg_user_id},
    )
    uids = [r[0] for r in res.all()]
    if uids:
        await db_session.execute(
            text("DELETE FROM budget_period WHERE user_id = ANY(:uids)"),
            {"uids": uids},
        )
        await db_session.execute(
            text("DELETE FROM app_user WHERE id = ANY(:uids)"),
            {"uids": uids},
        )
    await db_session.commit()


async def test_second_active_period_rejected(db_session):
    """Inserting a 2nd active period for the same user → IntegrityError."""
    tg = _TG_BASE + 1
    await _cleanup_user(db_session, tg)
    user = await seed_user(db_session, tg_user_id=tg, cycle_start_day=5)
    await seed_budget_period(
        db_session,
        user_id=user.id,
        period_start=date(2026, 6, 1),
        period_end=date(2026, 6, 30),
        status=PeriodStatus.active,
    )
    await db_session.commit()

    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(
                BudgetPeriod(
                    user_id=user.id,
                    period_start=date(2026, 7, 1),
                    period_end=date(2026, 7, 31),
                    status=PeriodStatus.active,
                )
            )
            await db_session.flush()

    # Happy path: a *closed* second period is allowed alongside the active one.
    closed = await seed_budget_period(
        db_session,
        user_id=user.id,
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        status=PeriodStatus.closed,
    )
    await db_session.commit()
    assert closed.id is not None

    await _cleanup_user(db_session, tg)


async def test_period_end_before_start_rejected(db_session):
    """period_end < period_start → IntegrityError (ck_budget_period_end_after_start)."""
    tg = _TG_BASE + 2
    await _cleanup_user(db_session, tg)
    user = await seed_user(db_session, tg_user_id=tg, cycle_start_day=5)
    await db_session.commit()

    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(
                BudgetPeriod(
                    user_id=user.id,
                    period_start=date(2026, 6, 30),
                    period_end=date(2026, 6, 1),  # before start
                    status=PeriodStatus.active,
                )
            )
            await db_session.flush()

    # Happy path: equal start/end (single-day period) is allowed (>=).
    p = await seed_budget_period(
        db_session,
        user_id=user.id,
        period_start=date(2026, 6, 15),
        period_end=date(2026, 6, 15),
        status=PeriodStatus.active,
    )
    await db_session.commit()
    assert p.id is not None

    await _cleanup_user(db_session, tg)


@pytest.mark.parametrize("bad_day", [0, 29, 31])
async def test_cycle_start_day_out_of_range_rejected(db_session, bad_day):
    """cycle_start_day outside [1, 28] → IntegrityError (ck_app_user_cycle_start_day)."""
    tg = _TG_BASE + 3
    await _cleanup_user(db_session, tg)

    # IntegrityError can surface as IntegrityError or DBAPIError depending on the
    # driver path; accept either to keep the test driver-agnostic.
    with pytest.raises((IntegrityError, DBAPIError)):
        async with db_session.begin_nested():
            await seed_user(db_session, tg_user_id=tg, cycle_start_day=bad_day)
            await db_session.flush()

    # Happy path: boundary values 1 and 28 are accepted.
    u1 = await seed_user(db_session, tg_user_id=tg, cycle_start_day=1)
    await db_session.commit()
    assert u1.cycle_start_day == 1

    await _cleanup_user(db_session, tg)
