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
    # v1.1: bridge план↔факт — non-null once the row is posted to an actual.
    posted_txn_id: Optional[int] = None


class ApplyTemplateResponse(BaseModel):
    """POST /periods/{id}/apply-template response (TPL-04, PER-05)."""

    period_id: int
    created: int = Field(
        ge=0,
        description="Number of new planned rows created (0 if idempotent no-op)",
    )
    planned: list[PlannedRead]


# ---------- v1.1: per-period plan limits + post/unpost/batch ----------


class PeriodPlanRow(BaseModel):
    category_id: int
    limit_cents: int


class PeriodPlanUpdate(BaseModel):
    plans: list[PeriodPlanRow]


class PeriodPlanResponse(BaseModel):
    plans: list[PeriodPlanRow]


class PostPlannedRequest(BaseModel):
    tx_date: date


class PostPlannedResponse(BaseModel):
    txn_id: int
    planned_id: int


class PostPlannedBatchRequest(BaseModel):
    planned_ids: list[int] = Field(min_length=1)
    tx_date: Optional[date] = None


class PostPlannedBatchResponse(BaseModel):
    posted: list[int]
    skipped: list[int]
