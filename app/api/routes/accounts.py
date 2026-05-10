"""/api/v1/accounts endpoints (Phase 22, BE-02).

Thin handlers over ``app.services.accounts``. Each route:
1. Lives under router-level ``Depends(get_current_user) + Depends(require_onboarded)``.
2. Uses ``get_db_with_tenant_scope`` so every query/insert has
   ``SET LOCAL app.current_user_id`` injected — RLS backstop for the
   defence-in-depth tenant isolation policy.
3. Maps domain exceptions to HTTP status codes:
   - ``AccountNotFoundError``                       → 404
   - ``AccountHasTxnsError``                        → 409
   - ``ValueError`` (orphan-primary guard / kind)   → 422

Endpoints:
    GET    /api/v1/accounts                — list (primary first)
    POST   /api/v1/accounts                — create + auto-promote primary
    PATCH  /api/v1/accounts/{id}           — partial update
    DELETE /api/v1/accounts/{id}           — hard delete (refuse if FK refs exist)
    POST   /api/v1/accounts/{id}/set-primary — explicit primary flip
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
from app.api.schemas.accounts import AccountCreate, AccountRead, AccountUpdate
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
    """GET /api/v1/accounts — list user's accounts (primary first)."""
    rows = await acct_svc.list_accounts(db, user_id=user_id)
    return [AccountRead.model_validate(r) for r in rows]


@accounts_router.post(
    "",
    response_model=AccountRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    body: AccountCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> AccountRead:
    """POST /api/v1/accounts — create a new account.

    Status codes:
        201: created
        422: validation (Pydantic strict types, balance bounds, kind enum)
    """
    row = await acct_svc.create_account(
        db,
        user_id=user_id,
        bank=body.bank,
        kind=body.kind,
        balance_cents=body.balance_cents,
        mask=body.mask,
        primary=body.primary,
    )
    return AccountRead.model_validate(row)


@accounts_router.patch("/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: int,
    body: AccountUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> AccountRead:
    """PATCH /api/v1/accounts/{id} — partial update.

    Status codes:
        200: updated
        404: account not found / cross-tenant
        422: orphan-primary guard or kind enum violation
    """
    patch = body.model_dump(exclude_unset=True)
    try:
        row = await acct_svc.update_account(
            db, user_id=user_id, account_id=account_id, **patch
        )
    except acct_svc.AccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return AccountRead.model_validate(row)


@accounts_router.delete(
    "/{account_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_account(
    account_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DELETE /api/v1/accounts/{id} — hard delete.

    Status codes:
        204: deleted
        404: account not found / cross-tenant
        409: account has subscriptions or transactions referencing it
        422: orphan-primary guard (account is sole primary, others exist)
    """
    try:
        await acct_svc.delete_account(
            db, user_id=user_id, account_id=account_id
        )
    except acct_svc.AccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except acct_svc.AccountHasTxnsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "account_has_references",
                "txn_count": exc.txn_count,
                "sub_count": exc.sub_count,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@accounts_router.post(
    "/{account_id}/set-primary",
    response_model=AccountRead,
    status_code=status.HTTP_200_OK,
)
async def set_primary_account(
    account_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> AccountRead:
    """POST /api/v1/accounts/{id}/set-primary — atomic primary flip.

    Demotes any current primary to ``is_primary=False`` and promotes
    ``account_id`` in a single DB transaction. Useful for the
    AccountsScreen "Сделать основным" button.

    Status codes:
        200: updated; returns the freshly promoted account row.
        404: account not found / cross-tenant.
    """
    try:
        row = await acct_svc.set_primary(
            db, user_id=user_id, account_id=account_id
        )
    except acct_svc.AccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return AccountRead.model_validate(row)
