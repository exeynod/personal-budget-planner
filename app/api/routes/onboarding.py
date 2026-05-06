"""Onboarding REST route — ONB-01, PER-02, CAT-03.

Atomic 4-step orchestration is owned by ``app.services.onboarding``; this
route only translates the Pydantic body into kw-args, maps domain exceptions
to HTTP status codes (404 / 409), and serializes the result.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.db.models import AppUser
from app.api.schemas.onboarding import (
    OnboardingCompleteRequest,
    OnboardingCompleteResponse,
)
from app.services import onboarding as onb_svc
from app.services.onboarding import (
    AlreadyOnboardedError,
    OnboardingUserNotFoundError,
)


onboarding_router = APIRouter(
    prefix="/onboarding",
    tags=["onboarding"],
    dependencies=[Depends(get_current_user)],
)


@onboarding_router.post(
    "/complete",
    response_model=OnboardingCompleteResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"description": "App user not found — call GET /me first"},
        409: {"description": "Already onboarded (D-10 / T-double-onboard)"},
        422: {"description": "Validation error (e.g. cycle_start_day out of [1,28])"},
    },
)
async def complete_onboarding(
    body: OnboardingCompleteRequest,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OnboardingCompleteResponse:
    """POST /api/v1/onboarding/complete — atomic seed + first period + flag user.

    Returns:
        - 200 + ``OnboardingCompleteResponse`` on success.
        - 404 if the AppUser row has not been bootstrapped (caller must hit
          ``GET /me`` first per Phase 1 D-11).
        - 409 if the user is already onboarded (D-10 / T-double-onboard).
        - 422 if ``cycle_start_day`` not in [1, 28] (Pydantic ``Field``).
    """
    try:
        result = await onb_svc.complete_onboarding(
            db,
            tg_user_id=current_user.tg_user_id,
            starting_balance_cents=body.starting_balance_cents,
            cycle_start_day=body.cycle_start_day,
            seed_default_categories=body.seed_default_categories,
        )
    except AlreadyOnboardedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except OnboardingUserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return OnboardingCompleteResponse(**result)
