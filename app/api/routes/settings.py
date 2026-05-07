"""Settings REST routes — SET-01 (cycle_start_day) + SET-02 (notify_days_before).

Per SET-01 / D-17: PATCH does NOT recompute existing budget periods; only
periods created after the change use the new value (worker job, Phase 5).

SET-02 (D-77): GET also returns notify_days_before and is_bot_bound;
PATCH accepts optional notify_days_before update.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, require_onboarded
from app.api.schemas.settings import SettingsRead, SettingsUpdate
from app.db.models import AppUser
from app.services import settings as settings_svc
from app.services.settings import UserNotFoundError


settings_router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@settings_router.get("", response_model=SettingsRead)
async def get_settings(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SettingsRead:
    """GET /api/v1/settings — returns current user-level settings."""
    try:
        cycle = await settings_svc.get_cycle_start_day(db, current_user.tg_user_id)
        notify = await settings_svc.get_notify_days_before(db, current_user.tg_user_id)
        is_bot_bound = await settings_svc.get_is_bot_bound(db, current_user.tg_user_id)
        enable_ai_cat = await settings_svc.get_enable_ai_categorization(db, current_user.tg_user_id)
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return SettingsRead(
        cycle_start_day=cycle,
        notify_days_before=notify,
        is_bot_bound=is_bot_bound,
        enable_ai_categorization=enable_ai_cat,
    )


@settings_router.patch("", response_model=SettingsRead)
async def update_settings(
    body: SettingsUpdate,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SettingsRead:
    """PATCH /api/v1/settings — partial update of user-level settings.

    Per SET-01 / D-17: existing budget periods are NOT recomputed. Only
    periods created in the future (worker job, Phase 5) will use the new
    cycle_start_day value.

    Both fields are optional in SettingsUpdate — only provided fields are updated.
    Pydantic enforces ranges: cycle_start_day in [1, 28], notify_days_before in [0, 30].
    """
    try:
        if body.cycle_start_day is not None:
            await settings_svc.update_cycle_start_day(
                db,
                tg_user_id=current_user.tg_user_id,
                cycle_start_day=body.cycle_start_day,
            )
        if body.notify_days_before is not None:
            await settings_svc.update_notify_days_before(
                db,
                tg_user_id=current_user.tg_user_id,
                value=body.notify_days_before,
            )
        if body.enable_ai_categorization is not None:
            await settings_svc.update_enable_ai_categorization(
                db,
                tg_user_id=current_user.tg_user_id,
                value=body.enable_ai_categorization,
            )
        cycle = await settings_svc.get_cycle_start_day(db, current_user.tg_user_id)
        notify = await settings_svc.get_notify_days_before(db, current_user.tg_user_id)
        is_bot_bound = await settings_svc.get_is_bot_bound(db, current_user.tg_user_id)
        enable_ai_cat = await settings_svc.get_enable_ai_categorization(db, current_user.tg_user_id)
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return SettingsRead(
        cycle_start_day=cycle,
        notify_days_before=notify,
        is_bot_bound=is_bot_bound,
        enable_ai_categorization=enable_ai_cat,
    )
