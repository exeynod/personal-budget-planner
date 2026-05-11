"""/api/v1/onboarding/complete v1.0 endpoint (Phase 22, BE-15).

This v1.0 path REPLACES the legacy ``/api/v1/onboarding/complete`` (Phase 2
ONB-01). Per CONTEXT D-04 the v0.x backward compat is dropped — single user
in production, only the v0.6 iOS client is hitting the API and it is being
rewritten for v1.0 in Phase 23+. Plan 22.13 unmounts ``onboarding_router``
and mounts ``onboarding_v10_router`` in its place.

Body shape: see :class:`app.api.schemas.onboarding_v10.OnboardingV10Body`.
Service: :func:`app.services.onboarding_v10.complete_v10` runs the 8-step
atomic flow (validate, conflict-check, AppUser update, accounts insert,
8 default Categories, system 'savings' Category, optional Goal,
SavingsConfig).

Tenant scope:
    Onboarding-complete needs to write rows for a user that does NOT yet
    have ``onboarded_at`` set. ``require_onboarded`` is intentionally NOT
    applied here (this IS the path that flips the bit). We still set the
    ``app.current_user_id`` GUC manually before calling the service so RLS
    policies on Account / Goal / SavingsConfig accept the inserts.

Domain exception → HTTP mapping:
    OnboardingConflictError    → 409 (already-onboarded)
    PlanExceedsIncomeError     → 422 (subclass of ValueError)
    ValueError                 → 422 (validators)
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db,
)
from app.api.schemas.onboarding_v10 import (
    OnboardingV10Body,
    OnboardingV10Response,
)
from app.db.session import set_tenant_scope
from app.services import onboarding_v10 as onboarding_v10_svc


onboarding_v10_router = APIRouter(
    prefix="/onboarding",
    tags=["onboarding"],
    # NOTE: ``require_onboarded`` deliberately omitted — this endpoint is the
    # entry path that flips the onboarded_at flag.
    dependencies=[Depends(get_current_user)],
)


@onboarding_v10_router.post(
    "/complete",
    response_model=OnboardingV10Response,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "PDN consent required (Phase 33 CMP-33-04)."},
        409: {"description": "User already onboarded (T-22-11-01)."},
        422: {"description": "Validation error (T-22-11-02..04)."},
    },
)
async def complete_v10(
    body: OnboardingV10Body,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> OnboardingV10Response:
    """POST /api/v1/onboarding/complete v1.0 (BE-15).

    Atomic flow: validators (Pydantic strict + service-side cross-checks) →
    conflict gate → AppUser.income_cents/onboarded_at → Account rows → 8
    default Categories with plan_cents → system 'savings' Category →
    optional Goal → SavingsConfig.

    All side effects run in a single DB transaction; ``get_db`` commits on
    successful return and rolls back on any raise (so a 409 leaves no
    partial state).
    """
    # Set tenant GUC before any insert so RLS on account / goal /
    # savings_config accepts our writes (those policies check
    # ``current_setting('app.current_user_id')::bigint == user_id``).
    await set_tenant_scope(db, user_id)

    try:
        result = await onboarding_v10_svc.complete_v10(
            db,
            user_id=user_id,
            income_cents=body.income_cents,
            accounts=[a.model_dump() for a in body.accounts],
            category_plans=body.category_plans,
            goal=body.goal.model_dump() if body.goal else None,
            savings_config=(
                body.savings_config.model_dump() if body.savings_config else None
            ),
        )
    except onboarding_v10_svc.PdnConsentRequiredError as exc:
        # Phase 33 CMP-33-04: ПДн consent gate.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "pdn_consent_required",
                "privacy_url": "/legal/privacy",
                "consent_endpoint": "/api/v1/me/consent",
                "message": "ПДн consent required before onboarding (152-ФЗ)",
            },
        ) from exc
    except onboarding_v10_svc.OnboardingConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "already_onboarded",
                "account_count": exc.account_count,
                "message": str(exc),
            },
        ) from exc
    except onboarding_v10_svc.PlanExceedsIncomeError as exc:
        # Subclass of ValueError; catch first so it gets the explicit body.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "plan_exceeds_income",
                "sum_plan_cents": exc.sum_plan,
                "income_cents": exc.income,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return OnboardingV10Response.model_validate(result)
