"""/api/v1/me v1.0 extension — PATCH /me (Phase 22, BE-01).

The legacy ``GET /me`` lives directly in :mod:`app.api.router` (handler
``get_me``) and is unchanged by Phase 22. This module ADDS the v1.0
PATCH endpoint that lets the SettingsScreen edit ``income_cents`` after
onboarding without going through the full ``/onboarding/complete`` flow.

Why a separate router file:
    Keeps the legacy GET handler unchanged (no risk of breaking the v0.x
    contract) while exposing PATCH under the same ``/me`` path. The
    plan-level note about ``MeV10Response`` is honoured here too — the
    PATCH response carries the v1.0 shape (with ``income_cents``).

Auth model:
    * ``Depends(get_current_user)`` — required (the user is patching their
      own row).
    * ``require_onboarded`` is INTENTIONALLY OMITTED so half-onboarded
      users (those who completed bot-bind but not the v1.0 flow) can still
      set ``income_cents`` if a future flow needs it. The current
      onboarding-complete path covers the common case; PATCH /me is here
      for SettingsScreen edits AFTER onboarding.
"""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_db,
    get_db_with_tenant_scope,
)
from app.api.schemas.me_v10 import (
    AccountDeleteResponse,
    ConsentGrantResponse,
    ConsentRevokeResponse,
    MePatchV10,
    MeV10Response,
)
from app.db.models import AppUser, PdnAuditEvent
from app.services.pdn_audit import record_audit


me_router = APIRouter(
    tags=["me"],
    # No prefix — PATCH /me is mounted at the same path as the legacy GET.
    dependencies=[Depends(get_current_user)],
)


async def build_me_response(
    db: AsyncSession, user: AppUser
) -> MeV10Response:
    """Single source of truth for the /me payload (Phase 67 P2-6 / R8).

    Both ``GET /me`` (app.api.router.get_me) and ``PATCH /me`` (patch_me below)
    build their response через этот helper, гарантируя симметрию по
    ``income_cents`` и любым будущим полям. Previously the two handlers
    constructed the response independently — GET omitted ``income_cents``
    while PATCH included it (the asymmetry P2-6 fixes).

    ``ai_spend_cents`` читается через cached spend service (60s TTL).
    """
    from app.services.spend_cap import get_user_spend_cents

    spend_cents = await get_user_spend_cents(db, user_id=user.id)
    return MeV10Response(
        tg_user_id=user.tg_user_id,
        tg_chat_id=user.tg_chat_id,
        cycle_start_day=user.cycle_start_day,
        onboarded_at=(
            user.onboarded_at.isoformat() if user.onboarded_at else None
        ),
        chat_id_known=user.tg_chat_id is not None,
        role=user.role.value,
        ai_spend_cents=int(spend_cents),
        ai_spending_cap_cents=int(user.spending_cap_cents or 0),
        income_cents=user.income_cents,
    )


@me_router.patch("/me", response_model=MeV10Response)
async def patch_me(
    body: MePatchV10,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    current_user: Annotated[AppUser, Depends(get_current_user)],
) -> MeV10Response:
    """PATCH /api/v1/me — partial v1.0 user update (BE-01).

    Currently supported fields: ``income_cents`` (gt=0, ≤100M ₽).

    Status codes:
        200: updated
        422: validation (Pydantic strict, range bounds)

    Returns the full v1.0 /me payload (mirrors the GET handler shape +
    ``income_cents``) so the client can refresh its cached state without
    a follow-up GET.
    """
    if body.income_cents is not None:
        current_user.income_cents = body.income_cents
        await db.flush()

    # P2-6 / R8: shared builder keeps GET /me и PATCH /me симметричными.
    return await build_me_response(db, current_user)


# ---------- Phase 33 — Compliance endpoints ----------


@me_router.post(
    "/me/consent",
    status_code=status.HTTP_200_OK,
    response_model=ConsentGrantResponse,
    responses={200: {"description": "Consent granted (idempotent)."}},
)
async def grant_consent(
    request: Request,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConsentGrantResponse:
    """Phase 33 CMP-33-04: idempotent ПДн consent grant.

    Sets ``app_user.pdn_consent_at = now()`` if not already set; writes an
    audit-event ``granted``. Idempotent — повторный вызов с уже-granted
    consent: timestamp не перезаписывается, но audit event фиксируется.
    """
    now = datetime.now(timezone.utc)
    was_null = current_user.pdn_consent_at is None
    if was_null:
        current_user.pdn_consent_at = now
        await db.flush()
    await record_audit(
        db,
        user_id=current_user.id,
        event=PdnAuditEvent.granted,
        ip=request.client.host if request.client else None,
        metadata={"policy_version": "v0.1", "was_null": was_null},
    )
    await db.commit()
    return {
        "pdn_consent_at": current_user.pdn_consent_at.isoformat(),
        "policy_version": "v0.1",
    }


@me_router.delete(
    "/me/consent",
    status_code=status.HTTP_200_OK,
    response_model=ConsentRevokeResponse,
)
async def revoke_consent(
    request: Request,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConsentRevokeResponse:
    """Phase 33 CMP-33-04: revoke consent.

    Nulls ``app_user.pdn_consent_at`` + writes audit event ``revoked``.
    После этого user не сможет пройти ``/onboarding/complete`` без
    нового grant.
    """
    was_set = current_user.pdn_consent_at is not None
    current_user.pdn_consent_at = None
    await db.flush()
    await record_audit(
        db,
        user_id=current_user.id,
        event=PdnAuditEvent.revoked,
        ip=request.client.host if request.client else None,
        metadata={"was_set": was_set},
    )
    await db.commit()
    return {"pdn_consent_at": None, "revoked": was_set}


@me_router.get(
    "/me/export",
    status_code=status.HTTP_200_OK,
    # Phase 69 (B1): INTENTIONALLY response_model=None. This route returns
    # an arbitrary nested data-dump (right-of-access export). Synthesising a
    # Pydantic model would risk reshaping compliance keys (a regression), so
    # it stays free-form and is EXEMPTED in tests/test_openapi_contract.py.
    response_model=None,
)
async def export_my_data(
    request: Request,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Phase 33 CMP-33-06: data export (right of access).

    Uses the same DB session as ``get_current_user`` so any pending
    AppUser upsert (DEV_MODE X-Test-User path) is already visible to
    SELECT. Tenant GUC is set manually before reading RLS-scoped tables.
    """
    # Import here to keep router import graph small.
    from app.db.session import set_tenant_scope
    from app.services.data_export import build_export

    await set_tenant_scope(db, current_user.id)
    data = await build_export(db, user_id=current_user.id)
    await record_audit(
        db,
        user_id=current_user.id,
        event=PdnAuditEvent.data_export,
        ip=request.client.host if request.client else None,
        metadata={"format_version": "1.0"},
    )
    await db.commit()
    return data


@me_router.delete(
    "/me/account",
    status_code=status.HTTP_200_OK,
    # Phase 69 (B1): fixed structured shape → typed (NOT a free-form dump).
    response_model=AccountDeleteResponse,
    responses={
        200: {"description": "Soft-delete scheduled; hard-delete in 30 days."},
        410: {"description": "Already deleted."},
    },
)
async def delete_my_account(
    request: Request,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountDeleteResponse:
    """Phase 33 CMP-33-02: account soft-delete (30-day cooling)."""
    from app.services.account_deletion import soft_delete_account

    if current_user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "error": "already_deleted",
                "deleted_at": current_user.deleted_at.isoformat(),
            },
        )
    user = await soft_delete_account(db, user_id=current_user.id)
    await record_audit(
        db,
        user_id=current_user.id,
        event=PdnAuditEvent.deletion_requested,
        ip=request.client.host if request.client else None,
        metadata={"cooling_days": 30},
    )
    await db.commit()
    return {
        "deleted_at": user.deleted_at.isoformat(),
        "purge_after_days": 30,
        "message": (
            "Account scheduled for deletion. Data will be permanently "
            "removed in 30 days. To cancel, re-grant consent before then."
        ),
    }
