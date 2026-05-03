"""Actual transactions REST routes — ACT-01, ACT-02, ACT-04, ACT-05, D-53.

Five endpoints under one router (single ``Depends(get_current_user)``):

Period-scoped:
  GET  /periods/{period_id}/actual?kind=&category_id=   — ACT-01 list

Item-scoped:
  POST   /actual                — ACT-01 create; source=mini_app forced server-side (D-53)
  GET    /actual/balance        — ACT-04 balance for active period  ← MUST be before /{id}
  PATCH  /actual/{actual_id}    — ACT-05 partial update; tx_date triggers period re-resolve
  DELETE /actual/{actual_id}    — hard delete

URL ordering: ``/actual/balance`` is declared BEFORE ``/actual/{actual_id}``.
If the order is reversed, FastAPI would try to parse the literal string "balance"
as an int path parameter → 422 on every GET /actual/balance request (T-04-25).

Exception → HTTP mapping:
    ActualNotFoundError     → 404
    CategoryNotFoundError   → 404
    PeriodNotFoundError     → 404  (also used for no active period in /balance)
    FutureDateError         → 400
    InvalidCategoryError    → 400
    KindMismatchError       → 400

Status codes:
    200: success (all endpoints)
    400: FutureDateError / InvalidCategoryError / KindMismatchError
    403: missing / invalid X-Telegram-Init-Data (router-level dep)
    404: ActualNotFound / CategoryNotFound / PeriodNotFound / no active period
    422: Pydantic validation (gt=0, max_length, wrong types)
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.actual import (
    ActualCreate,
    ActualRead,
    ActualUpdate,
    BalanceResponse,
    KindStr,
)
from app.db.models import ActualSource
from app.services import actual as actual_svc
from app.services import periods as periods_svc
from app.services.actual import ActualNotFoundError, FutureDateError
from app.services.categories import CategoryNotFoundError
from app.services.planned import (
    InvalidCategoryError,
    KindMismatchError,
)


actual_router = APIRouter(
    tags=["actual"],
    dependencies=[Depends(get_current_user)],
)


# ---------- Period-scoped endpoints ----------


@actual_router.get(
    "/periods/{period_id}/actual",
    response_model=list[ActualRead],
)
async def list_actual(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    kind: Optional[KindStr] = Query(default=None),
    category_id: Optional[int] = Query(default=None, gt=0),
) -> list[ActualRead]:
    """GET /api/v1/periods/{period_id}/actual — list actual rows for a period.

    Optional filters: ``kind=expense|income``, ``category_id=<int>``.
    Returns an empty list if the period does not exist (no 404 — consistent
    with planned.py behaviour; UI detects onboarding state via /periods/current).
    """
    rows = await actual_svc.list_actual_for_period(
        db, period_id, kind=kind, category_id=category_id,
    )
    return [ActualRead.model_validate(r) for r in rows]


# ---------- Item-scoped endpoints ----------


@actual_router.post(
    "/actual",
    response_model=ActualRead,
    status_code=status.HTTP_200_OK,
)
async def create_actual(
    body: ActualCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActualRead:
    """POST /api/v1/actual — create a new actual transaction.

    D-53: ``source`` is forced to ``ActualSource.mini_app`` server-side.
    The ``ActualCreate`` schema does not expose a ``source`` field, so callers
    cannot override it. Bot transactions go through ``POST /internal/bot/actual``
    and receive ``source=ActualSource.bot`` there.

    D-52: if no BudgetPeriod covers ``tx_date``, one is auto-created.

    Status codes:
        200: created
        400: FutureDateError / InvalidCategoryError / KindMismatchError
        404: category not found
        422: Pydantic validation
    """
    try:
        row = await actual_svc.create_actual(
            db,
            kind=body.kind,
            amount_cents=body.amount_cents,
            description=body.description,
            category_id=body.category_id,
            tx_date=body.tx_date,
            source=ActualSource.mini_app,
        )
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
    except FutureDateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return ActualRead.model_validate(row)


@actual_router.get(
    "/actual/balance",
    response_model=BalanceResponse,
)
async def get_balance(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BalanceResponse:
    """GET /api/v1/actual/balance — balance for the currently active period.

    ACT-04: aggregates planned vs actual per category for the active period.
    Returns 404 when no active period exists (onboarding not complete).

    IMPORTANT: this route must be declared BEFORE ``/actual/{actual_id}`` in the
    router to prevent FastAPI matching the literal "balance" as a path int (T-04-25).

    Status codes:
        200: balance data
        404: no active budget period (onboarding incomplete)
    """
    period = await periods_svc.get_current_active_period(db)
    if period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active budget period — complete onboarding first",
        )
    bal = await actual_svc.compute_balance(db, period.id)
    return BalanceResponse(**bal)


@actual_router.patch(
    "/actual/{actual_id}",
    response_model=ActualRead,
)
async def update_actual(
    actual_id: int,
    body: ActualUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActualRead:
    """PATCH /api/v1/actual/{actual_id} — partial update.

    ACT-05: if ``tx_date`` is provided in the patch body, the service
    re-resolves ``period_id`` for the new date (D-52 auto-create included).

    Status codes:
        200: updated
        400: FutureDateError / InvalidCategoryError / KindMismatchError
        404: actual row not found / category not found
        422: Pydantic validation
    """
    try:
        row = await actual_svc.update_actual(db, actual_id, body)
    except ActualNotFoundError as exc:
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
    except FutureDateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return ActualRead.model_validate(row)


@actual_router.delete(
    "/actual/{actual_id}",
    response_model=ActualRead,
)
async def delete_actual(
    actual_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActualRead:
    """DELETE /api/v1/actual/{actual_id} — hard delete.

    Returns the deleted row so callers can confirm what was removed.

    Status codes:
        200: deleted (returns deleted row state)
        404: actual row does not exist
    """
    try:
        row = await actual_svc.delete_actual(db, actual_id)
    except ActualNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return ActualRead.model_validate(row)
