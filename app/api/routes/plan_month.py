"""PATCH /api/v1/plan-month — atomic batch plan-cents update.

Phase 26 BE Plan 26-01, PLAN-V10-06. Single round-trip replaces N
sequential ``PATCH /categories/{id}`` calls and lets the backend enforce
``Σplan ≤ AppUser.income_cents`` server-side.

Wire contract (T-BE-02):
- Request: ``{"plans": [{"category_id": int>0, "plan_cents": int≥0}, ...]}``
- 200: ``{"categories": [CategoryRead, ...]}`` in the same order as the
  request (insertion order).
- 400: Σplan > income → ``{"detail": {"error": "plan_overflow",
  "income_cents": int, "sum_plan_cents": int}}``.
- 400: plan_cents set on an INCOME category → ``{"detail": {"error":
  "income_limit_forbidden", "category_id": int}}`` (income carries no limit).
- 404: any ``category_id`` is missing OR cross-tenant → free-form text
  ``"category {id} not found"`` (REST convention — не leak existence).
- 422: Pydantic violations (negative plan_cents, empty plans list,
  duplicate category_id, unknown extra keys, etc.).

Auth chain mirrors ``/categories``: get_current_user (HMAC initData) +
require_onboarded (Phase 14 gate) at router level.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.categories import CategoryRead
from app.api.schemas.plan_month import PlanMonthPatch, PlanMonthResponse
from app.services import plan_month as plan_svc


plan_month_router = APIRouter(
    prefix="/plan-month",
    tags=["plan-month"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@plan_month_router.patch("", response_model=PlanMonthResponse)
async def patch_plan_month(
    body: PlanMonthPatch,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> PlanMonthResponse:
    """Atomic batch update of ``Category.plan_cents`` per PLAN-V10-06.

    Service-layer enforces:
    - Σplan ≤ AppUser.income_cents (skipped if income IS NULL) → 400.
    - All referenced categories belong to ``user_id`` → 404 otherwise.
    - Atomicity: any failure rolls back all in-progress mutations.
    """
    plans = [(p.category_id, p.plan_cents) for p in body.plans]
    try:
        cats = await plan_svc.update_plan_month_atomic(
            db, user_id=user_id, plans=plans,
        )
        # Single explicit commit for the whole batch (matches the
        # single-PATCH /categories handler semantics).
        await db.commit()
    except plan_svc.PlanOverflowError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "plan_overflow",
                "income_cents": exc.income_cents,
                "sum_plan_cents": exc.sum_plan_cents,
            },
        ) from exc
    except plan_svc.IncomeLimitForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "income_limit_forbidden",
                "category_id": exc.category_id,
            },
        ) from exc
    except plan_svc.CategoryNotInTenantError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"category {exc.category_id} not found",
        ) from exc

    return PlanMonthResponse(
        categories=[CategoryRead.model_validate(c) for c in cats]
    )
