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
