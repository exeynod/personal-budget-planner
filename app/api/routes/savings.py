"""/api/v1/savings endpoints (Phase 22, BE-08, BE-09, BE-10).

Three endpoints:
    GET   /api/v1/savings              — read-side aggregator (BE-09)
    PATCH /api/v1/savings/config       — toggle/update roundup config (BE-08)
    POST  /api/v1/savings/deposit      — manual deposit transaction (BE-10)

All under router-level ``Depends(get_current_user) + Depends(require_onboarded)``;
RLS scope set via ``get_db_with_tenant_scope``.

Domain exception → HTTP mapping:
    ValueError                       → 422 (invalid roundup_base, zero amount)
    SavingsCategoryMissingError      → 500 (config drift; onboarding incomplete)
    GoalNotFoundError                → 404 (goal_id supplied but missing)
    AccountNotFoundError             → 404 (account_id supplied but missing)
"""
from datetime import date as _date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.savings import (
    DepositCreate,
    SavingsConfigPatch,
    SavingsConfigRead,
    SavingsSnapshotResponse,
)
from app.services import accounts as acct_svc
from app.services import goals as goal_svc
from app.services import savings as savings_svc
from app.services.roundup import SavingsCategoryMissingError


class DepositResponse(BaseModel):
    """Response for POST /api/v1/savings/deposit (BE-10).

    ``amount_cents`` is the SIGNED storage amount (negative — deposits
    debit the source account). Frontend should display ``|amount|``.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    amount_cents: int
    account_id: Optional[int]
    category_id: int
    tx_date: _date
    description: Optional[str]


savings_router = APIRouter(
    prefix="/savings",
    tags=["savings"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@savings_router.get("", response_model=SavingsSnapshotResponse)
async def get_savings_snapshot(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SavingsSnapshotResponse:
    """GET /api/v1/savings — full snapshot (BE-09).

    Returns total_cents, month_in_cents (current MSK month), config,
    and the user's full goals list.
    """
    snap = await savings_svc.get_savings_snapshot(db, user_id=user_id)
    # ``snap`` is a plain dict with nested ``goals`` (list[dict]) and
    # ``config`` (dict). Pydantic v2 handles ISO date strings → date/datetime
    # via lax-mode coercion; explicit ``model_validate`` walks the tree.
    return SavingsSnapshotResponse.model_validate(snap)


@savings_router.patch("/config", response_model=SavingsConfigRead)
async def patch_savings_config(
    body: SavingsConfigPatch,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SavingsConfigRead:
    """PATCH /api/v1/savings/config — partial update (BE-08).

    Status codes:
        200: updated (or default-seeded if no row existed yet)
        422: roundup_base outside {10, 50, 100}
    """
    try:
        cfg = await savings_svc.upsert_config(
            db,
            user_id=user_id,
            roundup_enabled=body.roundup_enabled,
            roundup_base=body.roundup_base,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return SavingsConfigRead.model_validate(cfg)


@savings_router.post(
    "/deposit",
    response_model=DepositResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_deposit(
    body: DepositCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> DepositResponse:
    """POST /api/v1/savings/deposit — manual deposit (BE-10).

    Creates an actual_transaction(kind='deposit'), debits the source
    account balance, optionally bumps Goal.current_cents — all in one
    DB transaction.

    Status codes:
        201: created
        404: account_id or goal_id not found / cross-tenant
        422: amount_cents == 0
        500: system 'savings' Category missing (onboarding incomplete)
    """
    try:
        txn = await savings_svc.create_deposit(
            db,
            user_id=user_id,
            amount_cents=body.amount_cents,
            account_id=body.account_id,
            goal_id=body.goal_id,
        )
    except SavingsCategoryMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "savings_category_missing",
                "message": "System 'savings' Category not seeded — "
                "onboarding-complete is the only path that creates it.",
            },
        ) from exc
    except (goal_svc.GoalNotFoundError, acct_svc.AccountNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return DepositResponse.model_validate(txn)
