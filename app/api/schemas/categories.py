"""Pydantic schemas for /api/v1/categories endpoints (CAT-01, CAT-02).

Uses string Literal for `kind` (not enum import) to keep serialization
simple; the service layer converts to ``CategoryKind`` before persisting.
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


CategoryKindStr = Literal["expense", "income"]


class CategoryCreate(BaseModel):
    """POST /categories request body."""

    name: str = Field(min_length=1, max_length=200)
    kind: CategoryKindStr
    sort_order: int = Field(default=0, ge=0)


class CategoryUpdate(BaseModel):
    """PATCH /categories/{id} request body — all fields optional.

    Caller may pass only the fields they want to change. Empty body is
    valid (no-op). The service layer applies non-None fields only.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_archived: Optional[bool] = None


class CategoryRead(BaseModel):
    """GET /categories response item — also returned by POST/PATCH."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: CategoryKindStr
    is_archived: bool
    sort_order: int
    created_at: datetime
