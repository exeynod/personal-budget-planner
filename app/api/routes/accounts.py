"""/api/v1/accounts endpoints — read-only single-balance surface (v1.1).

v1.1 (AGREED §G2): account-management UI (Счета / детали / перевод /
set-primary) выпилен. Под капотом остаётся один неявный primary-account на
юзера; ``actual_transaction.account_id`` ссылается на него. The only
remaining route is a read of the account list so HOME can show the balance —
mutating routes (POST / PATCH / DELETE / set-primary) removed.

Endpoints:
    GET /api/v1/accounts — list (primary first; read-only)
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.accounts import AccountRead
from app.services import accounts as acct_svc


accounts_router = APIRouter(
    prefix="/accounts",
    tags=["accounts"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@accounts_router.get("", response_model=list[AccountRead])
async def list_accounts(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[AccountRead]:
    """GET /api/v1/accounts — list user's accounts (primary first, read-only)."""
    rows = await acct_svc.list_accounts(db, user_id=user_id)
    return [AccountRead.model_validate(r) for r in rows]
