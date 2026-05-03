"""Budget period creation and retrieval (PER-01, PER-02)."""
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


async def get_current_active_period(db: AsyncSession) -> Optional[BudgetPeriod]:
    """Return the active period (status=active), or None if none exists.

    PER-03: chooses the most recent active period (ordered by period_start
    desc) — there should normally be exactly one, but ordering protects
    against transient overlap during period rollover (Phase 5 worker).
    """
    result = await db.execute(
        select(BudgetPeriod)
        .where(BudgetPeriod.status == PeriodStatus.active)
        .order_by(BudgetPeriod.period_start.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_all_periods(db: AsyncSession) -> list[BudgetPeriod]:
    """Return ALL budget periods (active + closed), ordered by period_start DESC.

    Used by GET /api/v1/periods (DSH-06 PeriodSwitcher) to populate the
    navigation dropdown. Returns empty list (not 404) when no periods exist
    yet (e.g. before onboarding).
    """
    result = await db.execute(
        select(BudgetPeriod).order_by(BudgetPeriod.period_start.desc())
    )
    return list(result.scalars().all())


async def create_first_period(
    db: AsyncSession,
    *,
    starting_balance_cents: int,
    cycle_start_day: int,
) -> BudgetPeriod:
    """PER-02: create the first period covering today, with given starting_balance.

    Period bounds are computed by ``period_for(today_msk, cycle_start_day)``.
    Status is ``active``. Caller (onboarding service) is responsible for
    ensuring no other active period exists — onboarding's idempotency guard
    (``user.onboarded_at IS NOT NULL → AlreadyOnboardedError``) provides
    that check at the orchestration layer.
    """
    today = _today_in_app_tz()
    p_start, p_end = period_for(today, cycle_start_day)
    period = BudgetPeriod(
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=starting_balance_cents,
        status=PeriodStatus.active,
    )
    db.add(period)
    await db.flush()
    await db.refresh(period)
    return period
