"""Pydantic schemas for /api/v1/subscriptions endpoints (SUB-01, D-72).

Threat mitigations:
- T-06-01: amount_cents Field(gt=0) rejects zero/negative values → 422
- T-06-03: notify_days_before Field(ge=0, le=30) limits range → 422
"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import SubCycle
from app.api.schemas.categories import CategoryRead


class SubscriptionCreate(BaseModel):
    """POST /subscriptions request body."""

    name: str = Field(..., min_length=1, max_length=255)
    amount_cents: int = Field(..., gt=0)
    cycle: SubCycle
    next_charge_date: date
    category_id: int
    notify_days_before: Optional[int] = Field(None, ge=0, le=30)
    is_active: bool = True


class SubscriptionUpdate(BaseModel):
    """PATCH /subscriptions/{id} request body — all fields optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    amount_cents: Optional[int] = Field(None, gt=0)
    cycle: Optional[SubCycle] = None
    next_charge_date: Optional[date] = None
    category_id: Optional[int] = None
    notify_days_before: Optional[int] = Field(None, ge=0, le=30)
    is_active: Optional[bool] = None


class SubscriptionRead(BaseModel):
    """GET /subscriptions response item — also returned by POST/PATCH."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount_cents: int
    cycle: SubCycle
    next_charge_date: date
    category_id: int
    notify_days_before: int
    is_active: bool
    category: CategoryRead


class ChargeNowResponse(BaseModel):
    """POST /subscriptions/{id}/charge-now response (D-72).

    planned_id: ID of the created PlannedTransaction
    next_charge_date: updated next_charge_date after advancing cycle
    """

    planned_id: int
    next_charge_date: date
