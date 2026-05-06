"""REST endpoints for Phase 8 Analytics (ANL-07).

All endpoints are GET, read-only. Protected by get_current_user (OWNER_TG_ID).
Range mapping: 1M=1 period, 3M=3 periods, 6M=6 periods, 12M=12 periods.
Period resolution (active + closed, desc order) is done in the service layer.

Phase 11 (Plan 11-06): handlers используют ``get_db_with_tenant_scope`` +
``get_current_user_id``; service вызовы передают ``user_id=user_id``.
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
)
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
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    range: AnalyticsRange = Query(default="1M"),
) -> TrendResponse:
    data = await analytics_service.get_trend(db, user_id=user_id, range_=range)
    return TrendResponse(**data)


@router.get("/top-overspend", response_model=TopOverspendResponse)
async def get_top_overspend(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    range: AnalyticsRange = Query(default="1M"),
) -> TopOverspendResponse:
    data = await analytics_service.get_top_overspend(db, user_id=user_id, range_=range)
    return TopOverspendResponse(**data)


@router.get("/top-categories", response_model=TopCategoriesResponse)
async def get_top_categories(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    range: AnalyticsRange = Query(default="1M"),
) -> TopCategoriesResponse:
    data = await analytics_service.get_top_categories(db, user_id=user_id, range_=range)
    return TopCategoriesResponse(**data)


@router.get("/forecast", response_model=ForecastResponse)
async def get_forecast(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    range: AnalyticsRange = Query(default="1M"),
) -> ForecastResponse:
    data = await analytics_service.get_forecast(db, user_id=user_id, range_=range)
    return ForecastResponse(**data)
