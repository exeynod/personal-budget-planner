"""Budget period creation and retrieval (PER-01, PER-02).

Phase 11 (Plan 11-05, MUL-03): every public function takes ``user_id: int``
keyword-only and filters/inserts ``BudgetPeriod.user_id`` explicitly.
``_today_in_app_tz()`` is a system-wide helper (no DB access) and remains
unchanged.
"""
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.period import period_for
from app.core.settings import settings
from app.db.models import BudgetPeriod, PeriodStatus


def _today_in_app_tz() -> date:
    """Return today's date in the configured APP_TZ (Europe/Moscow)."""
    return datetime.now(ZoneInfo(settings.APP_TZ)).date()


async def get_current_active_period(
    db: AsyncSession, *, user_id: int
) -> Optional[BudgetPeriod]:
    """Return the active period for ``user_id`` (status=active), or None.

    PER-03: chooses the most recent active period (ordered by period_start
    desc) — there should normally be exactly one, but ordering protects
    against transient overlap during period rollover (Phase 5 worker).

    Phase 11: scoped — only returns periods belonging to ``user_id``.
    """
    result = await db.execute(
        select(BudgetPeriod)
        .where(
            BudgetPeriod.user_id == user_id,
            BudgetPeriod.status == PeriodStatus.active,
        )
        .order_by(BudgetPeriod.period_start.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_all_periods(
    db: AsyncSession, *, user_id: int
) -> list[BudgetPeriod]:
    """Return ALL budget periods for ``user_id`` (active + closed), newest first.

    Used by GET /api/v1/periods (DSH-06 PeriodSwitcher) to populate the
    navigation dropdown. Returns empty list (not 404) when no periods exist
    yet (e.g. before onboarding).
    """
    result = await db.execute(
        select(BudgetPeriod)
        .where(BudgetPeriod.user_id == user_id)
        .order_by(BudgetPeriod.period_start.desc())
    )
    return list(result.scalars().all())


async def create_first_period(
    db: AsyncSession,
    *,
    user_id: int,
    starting_balance_cents: int,
    cycle_start_day: int,
) -> BudgetPeriod:
    """PER-02: create the first period covering today, with given starting_balance.

    Period bounds are computed by ``period_for(today_msk, cycle_start_day)``.
    Status is ``active``. Caller (onboarding service) is responsible for
    ensuring no other active period exists — onboarding's idempotency guard
    (``user.onboarded_at IS NOT NULL → AlreadyOnboardedError``) provides
    that check at the orchestration layer.

    Phase 11: row created with ``user_id=user_id`` so it belongs to the
    onboarding tenant.
    """
    today = _today_in_app_tz()
    p_start, p_end = period_for(today, cycle_start_day)
    period = BudgetPeriod(
        user_id=user_id,
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=starting_balance_cents,
        status=PeriodStatus.active,
    )
    db.add(period)
    await db.flush()
    await db.refresh(period)
    return period
