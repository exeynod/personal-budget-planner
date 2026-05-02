"""Pydantic schemas for /api/v1/settings endpoints (SET-01)."""
from pydantic import BaseModel, Field


class SettingsRead(BaseModel):
    """GET /settings response."""

    cycle_start_day: int


class SettingsUpdate(BaseModel):
    """PATCH /settings request body.

    ``cycle_start_day`` must be in [1, 28] per HLD §3 + PER-01 contract.
    Pydantic returns 422 on out-of-range values, satisfying
    ``tests/test_settings.py::test_invalid_cycle_day``.

    Per SET-01 / CONTEXT.md D-17 the service does NOT recompute existing
    periods — the new value applies to the next period only.
    """

    cycle_start_day: int = Field(ge=1, le=28)
