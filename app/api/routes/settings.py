"""Settings REST routes — SET-01 (cycle_start_day).

Per SET-01 / D-17: PATCH does NOT recompute existing budget periods; only
periods created after the change use the new value (worker job, Phase 5).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.settings import SettingsRead, SettingsUpdate
from app.services import settings as settings_svc
from app.services.settings import UserNotFoundError


settings_router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(get_current_user)],
)


@settings_router.get("", response_model=SettingsRead)
async def get_settings(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SettingsRead:
    """GET /api/v1/settings — returns current user-level settings."""
    try:
        cycle = await settings_svc.get_cycle_start_day(db, current_user["id"])
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return SettingsRead(cycle_start_day=cycle)


@settings_router.patch("", response_model=SettingsRead)
async def update_settings(
    body: SettingsUpdate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SettingsRead:
    """PATCH /api/v1/settings — update cycle_start_day.

    Per SET-01 / D-17: existing budget periods are NOT recomputed. Only
    periods created in the future (worker job, Phase 5) will use the new
    value. Pydantic ``Field(ge=1, le=28)`` enforces range — out-of-range
    values return 422 before reaching the service.
    """
    try:
        new_value = await settings_svc.update_cycle_start_day(
            db,
            tg_user_id=current_user["id"],
            cycle_start_day=body.cycle_start_day,
        )
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return SettingsRead(cycle_start_day=new_value)
