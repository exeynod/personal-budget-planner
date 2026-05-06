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
    # null = unplanned spending (план был 0). Фронт рендерит «Без плана».
    overspend_pct: Optional[float] = None


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
    """Polymorphic response for the analytics "Прогноз / Cashflow" card.

    mode='forecast'  → range=1M; uses active period plan + starting_balance.
    mode='cashflow'  → range>=3M; sums net over N closed periods.
    mode='empty'     → no data to compute.
    """
    model_config = ConfigDict(from_attributes=True)
    mode: str  # 'forecast' | 'cashflow' | 'empty'

    # forecast (1M)
    starting_balance_cents: Optional[int] = None
    planned_income_cents: Optional[int] = None
    planned_expense_cents: Optional[int] = None
    projected_end_balance_cents: Optional[int] = None
    period_end: Optional[str] = None  # ISO date string

    # cashflow (3M+)
    total_net_cents: Optional[int] = None
    monthly_avg_cents: Optional[int] = None
    periods_count: Optional[int] = None
    requested_periods: Optional[int] = None
