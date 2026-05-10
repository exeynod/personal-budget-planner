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
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_db_with_tenant_scope,
)
from app.api.schemas.me_v10 import MePatchV10, MeV10Response
from app.db.models import AppUser


me_router = APIRouter(
    tags=["me"],
    # No prefix — PATCH /me is mounted at the same path as the legacy GET.
    dependencies=[Depends(get_current_user)],
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

    # Build the response in the same shape the legacy GET /me handler
    # returns + the v1.0 ``income_cents`` extension. Local import to
    # avoid pulling spend-cap machinery into this module's import graph
    # at request time (router files are imported once at boot).
    from app.services.spend_cap import get_user_spend_cents

    spend_cents = await get_user_spend_cents(db, user_id=current_user.id)
    return MeV10Response(
        tg_user_id=current_user.tg_user_id,
        tg_chat_id=current_user.tg_chat_id,
        cycle_start_day=current_user.cycle_start_day,
        onboarded_at=(
            current_user.onboarded_at.isoformat()
            if current_user.onboarded_at else None
        ),
        chat_id_known=current_user.tg_chat_id is not None,
        role=current_user.role.value,
        ai_spend_cents=int(spend_cents),
        ai_spending_cap_cents=int(current_user.spending_cap_cents or 0),
        income_cents=current_user.income_cents,
    )
