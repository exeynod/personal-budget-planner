"""Unit tests for period_for() — pure date arithmetic (PER-01).

These tests must run without DB access. period_for is a pure function
imported from app.core.period (will be created in Plan 02-02).

Wave 0 RED state: import will fail with ModuleNotFoundError until
app.core.period exists. That failure is the intended Wave-0 RED.
"""
from datetime import date

import pytest


# (date, cycle_start_day, expected_period_start, expected_period_end, rationale)
CASES = [
    (date(2026, 2, 15), 5, date(2026, 2, 5), date(2026, 3, 4), "HLD §3 example 1"),
    (date(2026, 2, 3), 5, date(2026, 1, 5), date(2026, 2, 4), "HLD §3 example 2"),
    (date(2026, 2, 5), 5, date(2026, 2, 5), date(2026, 3, 4), "day == cycle_start"),
    (date(2026, 2, 4), 5, date(2026, 1, 5), date(2026, 2, 4), "day == cycle_start - 1"),
    (
        date(2026, 1, 15),
        31,
        date(2025, 12, 31),
        date(2026, 1, 30),
        "csd=31, d=Jan 15 < Jan 31 → previous-month anchor Dec 31; period must contain d (HLD §3)",
    ),
    (
        date(2024, 2, 29),
        31,
        date(2024, 2, 29),
        date(2024, 3, 30),
        "leap year: Feb 2024 has 29 — clamp",
    ),
    (date(2026, 12, 15), 5, date(2026, 12, 5), date(2027, 1, 4), "year rollover"),
    (date(2026, 1, 3), 5, date(2025, 12, 5), date(2026, 1, 4), "year rollunder"),
    (
        date(2026, 3, 1),
        28,
        date(2026, 2, 28),
        date(2026, 3, 27),
        "Feb 2026 doesn't have day 28+ — clamp to 28",
    ),
]


@pytest.mark.parametrize("d,csd,exp_start,exp_end,reason", CASES)
def test_period_for(d, csd, exp_start, exp_end, reason):
    from app.core.period import period_for

    start, end = period_for(d, csd)
    assert start == exp_start, f"{reason}: start mismatch (got {start})"
    assert end == exp_end, f"{reason}: end mismatch (got {end})"


def test_period_for_returns_tuple_of_dates():
    """Sanity: возвращаемые значения — date (не datetime)."""
    from app.core.period import period_for

    start, end = period_for(date(2026, 2, 15), 5)
    assert type(start) is date
    assert type(end) is date


def test_period_for_invariant_end_minus_start_plus_1_in_28_31_range():
    """Invariant: длина периода ≈ 28-31 день."""
    from app.core.period import period_for

    start, end = period_for(date(2026, 2, 15), 5)
    delta_days = (end - start).days + 1
    assert 28 <= delta_days <= 31, f"period length {delta_days} out of range"
