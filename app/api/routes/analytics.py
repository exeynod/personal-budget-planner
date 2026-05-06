"""REST endpoints for Phase 8 Analytics (ANL-07).

All endpoints are GET, read-only. Protected by get_current_user (OWNER_TG_ID).
Range mapping: 1M=1 period, 3M=3 periods, 6M=6 periods, 12M=12 periods.
Period resolution (active + closed, desc order) is done in the service layer.
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.analytics import (
    ForecastResponse,
    TopCategoriesResponse,
    TopOverspendResponse,
    TrendResponse,
)
from app.services import analytics as analytics_service

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_user)],
)

AnalyticsRange = Literal["1M", "3M", "6M", "12M"]


@router.get("/trend", response_model=TrendResponse)
async def get_trend(
    range: AnalyticsRange = Query(default="1M"),
    db: AsyncSession = Depends(get_db),
) -> TrendResponse:
    data = await analytics_service.get_trend(db, range_=range)
    return TrendResponse(**data)


@router.get("/top-overspend", response_model=TopOverspendResponse)
async def get_top_overspend(
    range: AnalyticsRange = Query(default="1M"),
    db: AsyncSession = Depends(get_db),
) -> TopOverspendResponse:
    data = await analytics_service.get_top_overspend(db, range_=range)
    return TopOverspendResponse(**data)


@router.get("/top-categories", response_model=TopCategoriesResponse)
async def get_top_categories(
    range: AnalyticsRange = Query(default="1M"),
    db: AsyncSession = Depends(get_db),
) -> TopCategoriesResponse:
    data = await analytics_service.get_top_categories(db, range_=range)
    return TopCategoriesResponse(**data)


@router.get("/forecast", response_model=ForecastResponse)
async def get_forecast(
    range: AnalyticsRange = Query(default="1M"),
    db: AsyncSession = Depends(get_db),
) -> ForecastResponse:
    data = await analytics_service.get_forecast(db, range_=range)
    return ForecastResponse(**data)
