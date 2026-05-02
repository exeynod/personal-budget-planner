"""Period engine: pure function `period_for(date, cycle_start_day) -> (start, end)`.

Reference: docs/HLD.md §3 + Phase 02 RESEARCH Pattern 4.

Examples (cycle_start_day=5):
    date=2026-02-15 -> (2026-02-05, 2026-03-04)
    date=2026-02-03 -> (2026-01-05, 2026-02-04)
    date=2026-02-05 -> (2026-02-05, 2026-03-04)  # day == cycle_start_day = start

Edge case: if cycle_start_day > last_day_of(month) (e.g. 31 in February),
the value is clamped to the last day of that month per HLD §3 contract.
This keeps the function robust even when the upstream Pydantic validator
(`Field(ge=1, le=28)`) is bypassed (e.g., direct Python invocation in worker).
"""
from calendar import monthrange
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta


def _clamp_day_to_month(year: int, month: int, day: int) -> int:
    """Return ``min(day, last_day_of_month)``.

    Allows callers to pass ``cycle_start_day=31`` and have it auto-fit February
    (28 in non-leap years, 29 in leap years).
    """
    last = monthrange(year, month)[1]
    return min(day, last)


def period_for(d: date, cycle_start_day: int) -> tuple[date, date]:
    """Compute ``(period_start, period_end)`` for the period containing ``d``.

    Args:
        d: Any date — function returns the period that includes this date.
        cycle_start_day: 1..28 by API contract (validated upstream by
            Pydantic ``Field(ge=1, le=28)``). Values 29..31 are tolerated
            via month-day clamping but not officially supported in the API.

    Returns:
        ``(period_start, period_end)`` — both inclusive, both ``date`` objects.
        ``period_end`` is always one day before the next period's start.

    Raises:
        ValueError: if ``cycle_start_day < 1`` (defensive; upstream validation
            should reject this earlier).
    """
    if cycle_start_day < 1:
        raise ValueError(f"cycle_start_day must be >= 1, got {cycle_start_day}")

    # Step 1: figure out which month's "cycle_start_day" this date belongs to.
    # The current month's start-day, possibly clamped if cycle > 28.
    cur_clamped = _clamp_day_to_month(d.year, d.month, cycle_start_day)

    if d.day >= cur_clamped:
        # `d` is on/after this month's cycle start — it's within the
        # period that started this month.
        ps_year, ps_month = d.year, d.month
    else:
        # `d` is before this month's cycle start — it belongs to the
        # period that started the previous month.
        prev = d - relativedelta(months=1)
        ps_year, ps_month = prev.year, prev.month

    period_start_day = _clamp_day_to_month(ps_year, ps_month, cycle_start_day)
    period_start = date(ps_year, ps_month, period_start_day)

    # period_end = (period_start + 1 month, clamped) - 1 day
    next_anchor = period_start + relativedelta(months=1)
    next_day = _clamp_day_to_month(next_anchor.year, next_anchor.month, cycle_start_day)
    period_end = date(next_anchor.year, next_anchor.month, next_day) - timedelta(days=1)

    return period_start, period_end
