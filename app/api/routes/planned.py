"""Planned transactions REST routes — PLN-01, PLN-02, PLN-03 backend, TPL-04 apply.

Two groups of endpoints under one router (single ``Depends(get_current_user)``):

Period-scoped:
  GET  /periods/{period_id}/planned?kind=&category_id=
  POST /periods/{period_id}/planned
  POST /periods/{period_id}/apply-template

Item-scoped:
  PATCH  /planned/{planned_id}
  DELETE /planned/{planned_id}

The split mirrors HLD §4.4 + §4.5 (period actions vs single-row CRUD).
Both URL groups live in one APIRouter (no ``prefix=``) so a single
router-level dependency covers them all.

Exception → HTTP mapping:
    PlannedNotFoundError              → 404
    PeriodNotFoundError               → 404
    CategoryNotFoundError             → 404
    InvalidCategoryError              → 400
    KindMismatchError                 → 400
    SubscriptionPlannedReadOnlyError  → 400
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.planned import (
    ApplyTemplateResponse,
    KindStr,
    PlannedCreate,
    PlannedRead,
    PlannedUpdate,
)
from app.services import planned as plan_svc
from app.services.categories import CategoryNotFoundError
from app.services.planned import (
    InvalidCategoryError,
    KindMismatchError,
    PeriodNotFoundError,
    PlannedNotFoundError,
    SubscriptionPlannedReadOnlyError,
)


planned_router = APIRouter(
    tags=["planned"],
    dependencies=[Depends(get_current_user)],
)


# ---------- Period-scoped endpoints ----------


@planned_router.get(
    "/periods/{period_id}/planned",
    response_model=list[PlannedRead],
)
async def list_planned(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    kind: Optional[KindStr] = Query(default=None),
    category_id: Optional[int] = Query(default=None, gt=0),
) -> list[PlannedRead]:
    """GET /api/v1/periods/{period_id}/planned — list planned rows for a period.

    Optional filters: ``kind=expense|income``, ``category_id=<int>``.
    Returns an empty list if the period does not exist (no 404 — UI uses
    GET /periods/current separately to detect onboarding state).
    """
    rows = await plan_svc.list_planned_for_period(
        db, period_id, kind=kind, category_id=category_id,
    )
    return [PlannedRead.model_validate(r) for r in rows]


@planned_router.post(
    "/periods/{period_id}/planned",
    response_model=PlannedRead,
    status_code=status.HTTP_200_OK,
)
async def create_manual_planned(
    period_id: int,
    body: PlannedCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlannedRead:
    """POST /api/v1/periods/{period_id}/planned — create with source=manual.

    Status codes:
        200: created
        422: Pydantic validation
        404: period or category does not exist
        400: category archived OR kind mismatch with category
    """
    try:
        row = await plan_svc.create_manual_planned(db, period_id, body)
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except KindMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return PlannedRead.model_validate(row)


@planned_router.post(
    "/periods/{period_id}/apply-template",
    response_model=ApplyTemplateResponse,
    status_code=status.HTTP_200_OK,
)
async def apply_template(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplyTemplateResponse:
    """POST /api/v1/periods/{period_id}/apply-template — TPL-04, PER-05.

    D-31 idempotent: повторный вызов = 200 + ``created=0`` (existing rows
    returned). Phase 5 worker ``close_period`` будет звать этот endpoint
    при создании каждого нового периода.

    Status codes:
        200: applied (or no-op if already applied)
        404: period does not exist
    """
    try:
        result = await plan_svc.apply_template_to_period(db, period_id=period_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return ApplyTemplateResponse(
        period_id=result["period_id"],
        created=result["created"],
        planned=[PlannedRead.model_validate(r) for r in result["planned"]],
    )


# ---------- Item-scoped endpoints ----------


@planned_router.patch("/planned/{planned_id}", response_model=PlannedRead)
async def update_planned(
    planned_id: int,
    body: PlannedUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlannedRead:
    """PATCH /api/v1/planned/{id} — partial update.

    Status codes:
        200: updated
        422: Pydantic validation
        404: planned row or new category_id does not exist
        400: new category archived OR kind mismatch OR row is subscription_auto (D-37)
    """
    try:
        row = await plan_svc.update_planned(db, planned_id, body)
    except PlannedNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except KindMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except SubscriptionPlannedReadOnlyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return PlannedRead.model_validate(row)


@planned_router.delete("/planned/{planned_id}", response_model=PlannedRead)
async def delete_planned(
    planned_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlannedRead:
    """DELETE /api/v1/planned/{id} — hard delete.

    Status codes:
        200: deleted (returns the deleted row state)
        404: planned row does not exist
        400: row is subscription_auto (managed by worker, not user — D-37)
    """
    try:
        row = await plan_svc.delete_planned(db, planned_id)
    except PlannedNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except SubscriptionPlannedReadOnlyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return PlannedRead.model_validate(row)
