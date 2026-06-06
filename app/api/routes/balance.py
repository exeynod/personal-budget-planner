"""Balance reconcile route (v1.1, AGREED §H — корректировка остатка).

POST /api/v1/balance/reconcile — enter the real balance; the app writes a
balancing adjustment so the displayed balance equals the entered value.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.balance import (
    ReconcileBalanceRequest,
    ReconcileBalanceResponse,
)
from app.services import actual as actual_svc
from app.services.actual import reconcile_balance
from app.services.periods import get_current_active_period
from app.services.planned import PeriodNotFoundError


balance_router = APIRouter(
    prefix="/balance",
    tags=["balance"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@balance_router.post("/reconcile", response_model=ReconcileBalanceResponse)
async def reconcile(
    body: ReconcileBalanceRequest,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> ReconcileBalanceResponse:
    """POST /api/v1/balance/reconcile — set displayed balance to target."""
    try:
        txn = await reconcile_balance(
            db, user_id=user_id, target_balance_cents=body.target_balance_cents
        )
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="No active period"
        ) from exc

    period = await get_current_active_period(db, user_id=user_id)
    bal = await actual_svc.compute_balance(db, period.id, user_id=user_id)
    return ReconcileBalanceResponse(
        adjustment_txn_id=txn.id if txn is not None else None,
        balance_now_cents=int(bal["balance_now_cents"]),
    )
