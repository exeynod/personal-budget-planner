"""Pydantic schemas for /api/v1/settings endpoints (SET-01, SET-02).

SET-02 extension (D-77): adds notify_days_before to SettingsRead/SettingsUpdate.
T-06-03 mitigation: notify_days_before Field(ge=0, le=30) limits range → 422.
"""
from typing import Optional

from pydantic import BaseModel, Field


class SettingsRead(BaseModel):
    """GET /settings response."""

    cycle_start_day: int
    notify_days_before: int
    is_bot_bound: bool


class SettingsUpdate(BaseModel):
    """PATCH /settings request body.

    ``cycle_start_day`` must be in [1, 28] per HLD §3 + PER-01 contract.
    Pydantic returns 422 on out-of-range values, satisfying
    ``tests/test_settings.py::test_invalid_cycle_day``.

    Per SET-01 / CONTEXT.md D-17 the service does NOT recompute existing
    periods — the new value applies to the next period only.

    ``notify_days_before`` optional; ge=0, le=30 (T-06-03 / D-77).
    """

    cycle_start_day: Optional[int] = Field(None, ge=1, le=28)
    notify_days_before: Optional[int] = Field(None, ge=0, le=30)
