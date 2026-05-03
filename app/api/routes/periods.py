"""Periods REST routes — PER-01, PER-02 (read-only in Phase 2).

Phase 2 exposes only ``GET /periods/current``. Period mutation paths
(``close_period``, next-period creation) are owned by the worker (Phase 5).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.periods import PeriodRead
from app.services import periods as period_svc


periods_router = APIRouter(
    prefix="/periods",
    tags=["periods"],
    dependencies=[Depends(get_current_user)],
)


@periods_router.get("", response_model=list[PeriodRead])
async def list_periods(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PeriodRead]:
    """GET /api/v1/periods — list all budget periods, newest first (DSH-06).

    Used by PeriodSwitcher to populate navigation. Returns an empty list
    (not 404) when no periods exist (onboarding incomplete).
    Includes both active and closed periods.
    """
    periods = await period_svc.list_all_periods(db)
    return [PeriodRead.model_validate(p) for p in periods]


@periods_router.get("/current", response_model=PeriodRead)
async def get_current_period(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PeriodRead:
    """GET /api/v1/periods/current — returns the active budget period.

    Returns 404 if no active period exists (e.g., before onboarding).
    Phase 2 does NOT lazy-create a period here — that's the Phase 5 worker job.
    """
    period = await period_svc.get_current_active_period(db)
    if period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active budget period — complete onboarding first",
        )
    return PeriodRead.model_validate(period)
