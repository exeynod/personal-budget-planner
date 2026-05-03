"""Pydantic schemas for /api/v1/.../planned and /api/v1/planned endpoints (PLN-01, PLN-02, TPL-04)."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


PlanSourceStr = Literal["template", "manual", "subscription_auto"]
KindStr = Literal["expense", "income"]


class PlannedCreate(BaseModel):
    """POST /periods/{id}/planned — manual creation only.

    Service layer always sets source='manual' for this endpoint.
    The ``kind`` field MUST match the kind of the referenced category
    (validated by service layer; mismatch → 400 KindMismatchError).
    """

    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: int = Field(gt=0)
    planned_date: Optional[date] = None


class PlannedUpdate(BaseModel):
    """PATCH /planned/{id} — partial update."""

    kind: Optional[KindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = Field(default=None, gt=0)
    planned_date: Optional[date] = None


class PlannedRead(BaseModel):
    """Response item for GET/POST/PATCH planned endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    period_id: int
    kind: KindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    planned_date: Optional[date]
    source: PlanSourceStr
    subscription_id: Optional[int]


class ApplyTemplateResponse(BaseModel):
    """POST /periods/{id}/apply-template response (TPL-04, PER-05)."""

    period_id: int
    created: int = Field(
        ge=0,
        description="Number of new planned rows created (0 if idempotent no-op)",
    )
    planned: list[PlannedRead]
