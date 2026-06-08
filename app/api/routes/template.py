"""Plan-template REST routes (v1.1, AGREED §B/§C).

Replaces the deprecated 410-Gone ``templates_router``. Serves the reusable
plan template: per-category limits (``items``) + recurring detail rows
(``lines``).

    GET    /api/v1/template/items
    PUT    /api/v1/template/items/{category_id}
    GET    /api/v1/template/lines?category_id=
    POST   /api/v1/template/lines
    PATCH  /api/v1/template/lines/{id}
    DELETE /api/v1/template/lines/{id}
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.template import (
    TemplateItemRead,
    TemplateItemUpsert,
    TemplateLineCreate,
    TemplateLineRead,
    TemplateLineUpdate,
    TemplateRead,
)
from app.services import planned as plan_svc
from app.services.categories import CategoryNotFoundError
from app.services.planned import (
    InvalidCategoryError,
    KindMismatchError,
    PeriodNotFoundError,
    PlannedNotFoundError,
)


template_router = APIRouter(
    prefix="/template",
    tags=["template"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@template_router.get("/items", response_model=list[TemplateItemRead])
async def list_template_items(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[TemplateItemRead]:
    rows = await plan_svc.list_template_items(db, user_id=user_id)
    return [TemplateItemRead.model_validate(r) for r in rows]


@template_router.post(
    "/save-current", response_model=TemplateRead, status_code=status.HTTP_200_OK
)
async def save_template_from_current(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateRead:
    """Overwrite the plan template from the current active period (one txn).

    Snapshots current effective per-category EXPENSE limits (Category.plan_cents)
    → template items, and current manual planned rows → template lines.
    """
    try:
        result = await plan_svc.save_template_from_current(db, user_id=user_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return TemplateRead(
        items=[TemplateItemRead.model_validate(r) for r in result["items"]],
        lines=[TemplateLineRead.model_validate(r) for r in result["lines"]],
    )


@template_router.put("/items/{category_id}", response_model=TemplateItemRead)
async def upsert_template_item(
    category_id: int,
    body: TemplateItemUpsert,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateItemRead:
    try:
        row = await plan_svc.upsert_template_item(
            db, user_id=user_id, category_id=category_id, limit_cents=body.limit_cents
        )
    except CategoryNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TemplateItemRead.model_validate(row)


@template_router.get("/lines", response_model=list[TemplateLineRead])
async def list_template_lines(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    category_id: Optional[int] = Query(default=None, gt=0),
) -> list[TemplateLineRead]:
    rows = await plan_svc.list_template_lines(
        db, user_id=user_id, category_id=category_id
    )
    return [TemplateLineRead.model_validate(r) for r in rows]


@template_router.post(
    "/lines", response_model=TemplateLineRead, status_code=status.HTTP_200_OK
)
async def create_template_line(
    body: TemplateLineCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateLineRead:
    try:
        row = await plan_svc.create_template_line(
            db,
            user_id=user_id,
            category_id=body.category_id,
            title=body.title,
            amount_cents=body.amount_cents,
            kind=body.kind,
            day_of_period=body.day_of_period,
        )
    except CategoryNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except KindMismatchError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TemplateLineRead.model_validate(row)


@template_router.patch("/lines/{line_id}", response_model=TemplateLineRead)
async def update_template_line(
    line_id: int,
    body: TemplateLineUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateLineRead:
    patch = body.model_dump(exclude_unset=True)
    try:
        row = await plan_svc.update_template_line(db, line_id, patch, user_id=user_id)
    except PlannedNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CategoryNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TemplateLineRead.model_validate(row)


@template_router.delete("/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_line(
    line_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    try:
        await plan_svc.delete_template_line(db, line_id, user_id=user_id)
    except PlannedNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
