"""Subscriptions REST routes — SUB-01, SUB-04, SUB-05 (D-71).

Five endpoints under router-level Depends(get_current_user):
  GET    /subscriptions              → list[SubscriptionRead]
  POST   /subscriptions              → SubscriptionRead (200/201)
  PATCH  /subscriptions/{id}         → SubscriptionRead, 404 if not found
  DELETE /subscriptions/{id}         → 204, 404 if not found
  POST   /subscriptions/{id}/charge-now → ChargeNowResponse, 409 on duplicate

Threat mitigations (threat_model 06-03):
  T-06-04: router-level Depends(get_current_user) — only OWNER_TG_ID passes
  T-06-05: unique constraint + IntegrityError → AlreadyChargedError → HTTP 409

Phase 11 (Plan 11-06): handlers used ``get_db_with_tenant_scope`` +
``get_current_user_id``; service вызовы передают ``user_id=user_id``.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
)
from app.api.schemas.subscriptions import (
    ChargeNowResponse,
    SubscriptionCreate,
    SubscriptionRead,
    SubscriptionUpdate,
)
from app.db.models import AppUser, BudgetPeriod, PeriodStatus
from app.services import subscriptions as sub_service

router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[SubscriptionRead])
async def list_subs(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[SubscriptionRead]:
    """GET /api/v1/subscriptions — list user's subscriptions sorted by next_charge_date ASC."""
    subs = await sub_service.list_subscriptions(db, user_id=user_id)
    return [SubscriptionRead.model_validate(s) for s in subs]


@router.post("", response_model=SubscriptionRead)
async def create_sub(
    payload: SubscriptionCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SubscriptionRead:
    """POST /api/v1/subscriptions — create a new subscription.

    Status codes:
        200: created
        400: category_id refers to archived or missing category
        422: Pydantic validation error
    """
    try:
        sub = await sub_service.create_subscription(
            db,
            user_id=user_id,
            name=payload.name,
            amount_cents=payload.amount_cents,
            cycle=payload.cycle,
            next_charge_date=payload.next_charge_date,
            category_id=payload.category_id,
            notify_days_before=payload.notify_days_before,
            is_active=payload.is_active,
        )
        # If next_charge_date falls in the current active period, add planned row.
        active_period = await db.scalar(
            select(BudgetPeriod).where(
                BudgetPeriod.user_id == user_id,
                BudgetPeriod.status == PeriodStatus.active,
            )
        )
        if (
            active_period is not None
            and active_period.period_start <= sub.next_charge_date <= active_period.period_end
        ):
            await sub_service.add_subscription_to_period(
                db, sub, active_period.id, user_id=user_id
            )
        await db.commit()
        return SubscriptionRead.model_validate(sub)
    except sub_service.CategoryNotFoundOrArchived as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="category not found or archived",
        ) from exc


@router.patch("/{sub_id}", response_model=SubscriptionRead)
async def patch_sub(
    sub_id: int,
    payload: SubscriptionUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SubscriptionRead:
    """PATCH /api/v1/subscriptions/{id} — partial update.

    Status codes:
        200: updated
        404: subscription not found
        422: Pydantic validation error
    """
    try:
        sub = await sub_service.update_subscription(
            db, sub_id, payload.model_dump(exclude_unset=True), user_id=user_id
        )
        await db.commit()
        return SubscriptionRead.model_validate(sub)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="subscription not found",
        ) from exc


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sub(
    sub_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DELETE /api/v1/subscriptions/{id} — hard delete (204).

    CLAUDE.md convention: subscriptions are hard-deleted (no soft delete).

    Status codes:
        204: deleted
        404: subscription not found
    """
    try:
        await sub_service.delete_subscription(db, sub_id, user_id=user_id)
        await db.commit()
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="subscription not found",
        ) from exc


@router.post("/{sub_id}/charge-now", response_model=ChargeNowResponse)
async def charge_now(
    sub_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> ChargeNowResponse:
    """POST /api/v1/subscriptions/{id}/charge-now — manual charge (SUB-04).

    Creates a PlannedTransaction(source=subscription_auto) for next_charge_date
    and advances next_charge_date by +1 month (monthly) or +1 year (yearly).

    Idempotency (T-06-05, SUB-05): repeated call for the same charge date
    returns HTTP 409 (unique constraint uq_planned_sub_charge_date fires).

    Status codes:
        200: charged, returns planned_id + new next_charge_date
        404: subscription not found
        409: already charged for this next_charge_date
    """
    # Phase 11: AppUser.cycle_start_day читаем напрямую через user_id (PK).
    # Plan 11-05 оставил settings.py с tg_user_id-сигнатурой; bypass через
    # прямой read проще, чем дополнительный resolve tg_user_id.
    cycle_start = await db.scalar(
        select(AppUser.cycle_start_day).where(AppUser.id == user_id)
    )
    if cycle_start is None:
        cycle_start = 5  # AppUser.cycle_start_day default

    try:
        planned, new_date = await sub_service.charge_subscription(
            db, sub_id, user_id=user_id, cycle_start_day=cycle_start
        )
        await db.commit()
        return ChargeNowResponse(planned_id=planned.id, next_charge_date=new_date)
    except sub_service.AlreadyChargedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="already charged for this date",
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="subscription not found",
        ) from exc
