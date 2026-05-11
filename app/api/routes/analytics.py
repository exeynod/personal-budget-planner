"""REST endpoints for Phase 8 Analytics (ANL-07).

All endpoints are GET, read-only. Protected by get_current_user (OWNER_TG_ID).
Range mapping: 1M=1 period, 3M=3 periods, 6M=6 periods, 12M=12 periods.
Period resolution (active + closed, desc order) is done in the service layer.

Phase 11 (Plan 11-06): handlers используют ``get_db_with_tenant_scope`` +
``get_current_user_id``; service вызовы передают ``user_id=user_id``.

Phase 38-02 (REQ-38-02): добавлен event-tracking endpoint
``POST /analytics/event`` под отдельным ``event_router`` — без
``require_onboarded`` (нужен для landing.hit / onboarding.started событий).
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.analytics import (
    ForecastResponse,
    TopCategoriesResponse,
    TopOverspendResponse,
    TrendResponse,
)
from app.db.models import AppUser
from app.services import analytics as analytics_service

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
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


# ---------------------------------------------------------------------------
# Phase 38-02 (REQ-38-02) — event-tracking endpoint.
#
# Mounted under its own router so it does NOT inherit ``require_onboarded``
# (event log должен работать ещё до завершения onboarding'a — например для
# ``landing.hit`` / ``onboarding.started``). ``get_current_user`` всё равно
# нужен — клиент анонимный нам не интересен.
# ---------------------------------------------------------------------------

event_router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
)


@event_router.post("/event", status_code=204)
async def post_event(
    payload: Annotated[dict, Body(...)],
    user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Log a client-side analytics event. Fire-and-forget semantics.

    Body: ``{"event": "<name>", "props": {...}}``. Бесшумно игнорирует payload
    без валидного ``event``, не raise'ит при сбое (service layer глотает
    ошибки + логирует WARNING).
    """
    event_name = payload.get("event")
    props = payload.get("props", {})
    if not event_name or not isinstance(event_name, str):
        return  # silently ignore — fire-and-forget client semantics
    await analytics_service.track_event(
        db,
        event_name=event_name,
        user_id=user.id,
        props=props if isinstance(props, dict) else {},
    )
