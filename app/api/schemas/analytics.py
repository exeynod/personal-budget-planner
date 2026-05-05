"""Pydantic response schemas for Phase 8 Analytics endpoints (ANL-07)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class TrendPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    period_label: str
    expense_cents: int
    income_cents: int


class TrendResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    points: list[TrendPoint]


class OverspendItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: int
    name: str
    planned_cents: int
    actual_cents: int
    overspend_pct: float


class TopOverspendResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    items: list[OverspendItem]


class TopCategoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: int
    name: str
    actual_cents: int
    planned_cents: int


class TopCategoriesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    items: list[TopCategoryItem]


class ForecastResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    insufficient_data: bool
    current_balance_cents: int
    projected_end_balance_cents: Optional[int] = None
    will_burn_cents: Optional[int] = None
    period_end: Optional[str] = None  # ISO date string
