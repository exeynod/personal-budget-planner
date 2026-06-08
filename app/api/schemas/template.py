"""Pydantic schemas for v1.1 plan-template endpoints (AGREED §B/§C).

Template = reusable, non-per-period plan. ``items`` carry per-category limits;
``lines`` carry recurring detail rows.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


TemplateKindStr = Literal["expense", "income"]


class TemplateItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_id: int
    limit_cents: int


class TemplateItemUpsert(BaseModel):
    limit_cents: int = Field(ge=0)


class TemplateLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    title: str
    amount_cents: int
    day_of_period: Optional[int]
    kind: TemplateKindStr


class TemplateLineCreate(BaseModel):
    category_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    amount_cents: int = Field(gt=0)
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)
    kind: TemplateKindStr


class TemplateLineUpdate(BaseModel):
    category_id: Optional[int] = Field(default=None, gt=0)
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    amount_cents: Optional[int] = Field(default=None, gt=0)
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)
    kind: Optional[TemplateKindStr] = None


class TemplateRead(BaseModel):
    """Full plan template — per-category limits (items) + recurring lines.

    Response of POST /template/save-current (overwrite-from-current-period).
    """

    items: list[TemplateItemRead]
    lines: list[TemplateLineRead]
