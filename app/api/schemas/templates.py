"""Pydantic schemas for /api/v1/template/* endpoints (TPL-01, TPL-03)."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TemplateItemCreate(BaseModel):
    """POST /template/items request body."""

    category_id: int = Field(gt=0)
    amount_cents: int = Field(gt=0, description="Amount in kopecks; must be > 0")
    description: Optional[str] = Field(default=None, max_length=500)
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)
    sort_order: int = Field(default=0, ge=0)


class TemplateItemUpdate(BaseModel):
    """PATCH /template/items/{id} request body — all fields optional."""

    category_id: Optional[int] = Field(default=None, gt=0)
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)
    sort_order: Optional[int] = Field(default=None, ge=0)


class TemplateItemRead(BaseModel):
    """GET /template/items response item — also returned by POST/PATCH."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    amount_cents: int
    description: Optional[str]
    day_of_period: Optional[int]
    sort_order: int


class SnapshotFromPeriodResponse(BaseModel):
    """POST /template/snapshot-from-period/{period_id} response (TPL-03)."""

    model_config = ConfigDict(from_attributes=True)

    template_items: list[TemplateItemRead]
    replaced: int = Field(
        ge=0, description="Number of template items deleted before snapshot"
    )
