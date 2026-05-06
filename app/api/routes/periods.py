"""Periods REST routes — PER-01, PER-02 (read-only in Phase 2).

Phase 2 exposes only ``GET /periods/current``. Period mutation paths
(``close_period``, next-period creation) are owned by the worker (Phase 5).

Phase 11 (Plan 11-05): handlers use ``get_db_with_tenant_scope`` +
``get_current_user_id`` and pass ``user_id`` to period_svc calls.
``actual_svc.compute_balance`` (called by /balance) is refactored in
Plan 11-06 — for now it relies on RLS via the tenant-scoped session.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
)
from app.api.schemas.actual import BalanceResponse
from app.api.schemas.periods import PeriodRead
from app.services import actual as actual_svc
from app.services import periods as period_svc
from app.services.planned import PeriodNotFoundError


periods_router = APIRouter(
    prefix="/periods",
    tags=["periods"],
    dependencies=[Depends(get_current_user)],
)


@periods_router.get("", response_model=list[PeriodRead])
async def list_periods(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[PeriodRead]:
    """GET /api/v1/periods — list all budget periods, newest first (DSH-06).

    Used by PeriodSwitcher to populate navigation. Returns an empty list
    (not 404) when no periods exist (onboarding incomplete).
    Includes both active and closed periods.
    """
    periods = await period_svc.list_all_periods(db, user_id=user_id)
    return [PeriodRead.model_validate(p) for p in periods]


@periods_router.get("/current", response_model=PeriodRead)
async def get_current_period(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> PeriodRead:
    """GET /api/v1/periods/current — returns the active budget period.

    Returns 404 if no active period exists (e.g., before onboarding).
    Phase 2 does NOT lazy-create a period here — that's the Phase 5 worker job.
    """
    period = await period_svc.get_current_active_period(db, user_id=user_id)
    if period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active budget period — complete onboarding first",
        )
    return PeriodRead.model_validate(period)


@periods_router.get(
    "/{period_id}/balance",
    response_model=BalanceResponse,
)
async def get_period_balance(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> BalanceResponse:
    """GET /api/v1/periods/{period_id}/balance — balance for any period (DSH-05/06).

    Allows viewing data for archived (closed) periods via PeriodSwitcher.
    Reuses compute_balance service from actual.py — same response shape as
    GET /actual/balance but accepts an explicit period_id instead of
    defaulting to the active period.

    Status codes:
        200: balance data
        404: period does not exist
    """
    # Phase 11 note: compute_balance signature is refactored in Plan 11-06
    # (actuals scope). For now it reads via RLS-backed session — cross-tenant
    # access already produces empty results / PeriodNotFoundError. Once 11-06
    # lands, this call will be updated to pass ``user_id=user_id`` explicitly.
    try:
        bal = await actual_svc.compute_balance(db, period_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return BalanceResponse(**bal)
