"""/api/v1/goals endpoints (Phase 22, BE-11).

Thin handlers over ``app.services.goals``. Same routing pattern as
``app/api/routes/accounts.py``:

* Router-level ``Depends(get_current_user) + Depends(require_onboarded)``.
* ``get_db_with_tenant_scope`` injects ``app.current_user_id`` GUC for RLS.
* Domain exception mapping:
    GoalNotFoundError      → 404
    GoalValidationError    → 422 (subclass of ValueError)
    ValueError (any other) → 422

Endpoints:
    GET    /api/v1/goals
    POST   /api/v1/goals
    PATCH  /api/v1/goals/{id}
    DELETE /api/v1/goals/{id}
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
from app.api.schemas.goals import GoalCreate, GoalRead, GoalUpdate
from app.services import goals as goal_svc


goals_router = APIRouter(
    prefix="/goals",
    tags=["goals"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@goals_router.get("", response_model=list[GoalRead])
async def list_goals(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[GoalRead]:
    """GET /api/v1/goals — list goals (oldest first)."""
    rows = await goal_svc.list_goals(db, user_id=user_id)
    return [GoalRead.model_validate(r) for r in rows]


@goals_router.post(
    "",
    response_model=GoalRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_goal(
    body: GoalCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> GoalRead:
    """POST /api/v1/goals — create a new savings goal.

    Status codes:
        201: created
        422: Pydantic validation (name length, target>0, due in future)
             or service-layer ``GoalValidationError``.
    """
    try:
        row = await goal_svc.create_goal(
            db,
            user_id=user_id,
            name=body.name,
            target_cents=body.target_cents,
            due=body.due,
        )
    except ValueError as exc:
        # Covers GoalValidationError (subclass) + any other ValueError.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return GoalRead.model_validate(row)


@goals_router.patch("/{goal_id}", response_model=GoalRead)
async def update_goal(
    goal_id: int,
    body: GoalUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> GoalRead:
    """PATCH /api/v1/goals/{id} — partial update.

    Status codes:
        200: updated
        404: goal not found / cross-tenant
        422: validation error
    """
    patch = body.model_dump(exclude_unset=True)
    try:
        row = await goal_svc.update_goal(
            db, goal_id, user_id=user_id, **patch
        )
    except goal_svc.GoalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return GoalRead.model_validate(row)


@goals_router.delete(
    "/{goal_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_goal(
    goal_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DELETE /api/v1/goals/{id} — hard delete.

    Past deposits referencing this goal_id remain in actual_transaction
    as ``kind=deposit`` rows (no FK cascade — by design, BE-11).

    Status codes:
        204: deleted
        404: goal not found / cross-tenant
    """
    try:
        await goal_svc.delete_goal(db, goal_id, user_id=user_id)
    except goal_svc.GoalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
