"""Pydantic schemas for /api/v1/periods endpoints (PER-01, PER-02)."""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


PeriodStatusStr = Literal["active", "closed"]


class PeriodRead(BaseModel):
    """GET /periods/current response — also used in lists.

    ``ending_balance_cents`` and ``closed_at`` are NULL while the period is
    active and populated only when worker `close_period` finalizes it
    (Phase 5, PER-04).
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    period_start: date
    period_end: date
    starting_balance_cents: int
    ending_balance_cents: Optional[int]
    status: PeriodStatusStr
    closed_at: Optional[datetime]
