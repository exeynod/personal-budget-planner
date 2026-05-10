"""Pydantic schemas for /api/v1/categories endpoints (CAT-01, CAT-02).

Uses string Literal for `kind` (not enum import) to keep serialization
simple; the service layer converts to ``CategoryKind`` before persisting.

Phase 25 (gap-fix during exec): ``CategoryRead`` exposes the v1.0 ORM
columns (``code``, ``ord``, ``plan_cents``, ``rollover``, ``paused``,
``parent_id``) so HOME-V10 / TXN-V10 / CAT-V10 web + iOS UIs can sort,
filter, and badge without a second roundtrip. Legacy v0.6 clients that
don't reference these fields are unaffected (additive only).
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


CategoryKindStr = Literal["expense", "income"]
RolloverPolicyStr = Literal["misc", "savings"]


class CategoryCreate(BaseModel):
    """POST /categories request body."""

    name: str = Field(min_length=1, max_length=200)
    kind: CategoryKindStr
    sort_order: int = Field(default=0, ge=0)


class CategoryUpdate(BaseModel):
    """PATCH /categories/{id} request body — all fields optional.

    Caller may pass only the fields they want to change. Empty body is
    valid (no-op). The service layer applies non-None fields only.

    Phase 26 (BE Plan 26-01, CAT-V10-04 / PLAN-V10-05) extension: accepts
    the v1.0 ORM columns (``plan_cents``, ``rollover``, ``paused``,
    ``parent_id``) so the CategoryDetail rollover/paused toggles + atomic
    plan-month batch can drive them through the existing
    ``model_dump(exclude_unset=True)`` setattr loop in
    ``app.services.categories.update_category`` без service-side изменений.
    Composite FK (``parent_id``, ``user_id``) → (``id``, ``user_id``)
    enforced на DB-level (alembic 0013); request layer accepts the integer
    and surfaces violations as IntegrityError → 500. Full FK pre-validation
    в Phase 27.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_archived: Optional[bool] = None
    # Phase 26 BE — v1.0 fields per CAT-V10-04 / PLAN-V10-05.
    plan_cents: Optional[int] = Field(default=None, ge=0)
    rollover: Optional[RolloverPolicyStr] = None
    paused: Optional[bool] = None
    parent_id: Optional[int] = None


class CategoryRead(BaseModel):
    """GET /categories response item — also returned by POST/PATCH."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: CategoryKindStr
    is_archived: bool
    sort_order: int
    created_at: datetime
    # Phase 25 v1.0 ORM columns surfaced for HOME-V10 / TXN-V10 / CAT-V10
    # web + iOS UIs (sort by plan_cents, filter by code/paused, etc.).
    code: str
    ord: str
    plan_cents: int = 0
    rollover: RolloverPolicyStr = "misc"
    paused: bool = False
    parent_id: Optional[int] = None
