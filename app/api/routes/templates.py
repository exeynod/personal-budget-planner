"""Plan template REST routes — TPL-01, TPL-02 UI backend, TPL-03 snapshot.

Thin handlers over ``app.services.templates``: routes do request/response
shape mapping (Pydantic <-> ORM) and domain-exception → HTTP status mapping.
All business logic — including the destructive snapshot semantics (D-32),
archived-category guard (D-36), and ordering — lives in the service layer.

Phase 11 (Plan 11-05): handlers use ``get_db_with_tenant_scope`` +
``get_current_user_id`` and forward ``user_id`` to all service calls.

Endpoints (all under router-level ``Depends(get_current_user)``):

- ``GET    /api/v1/template/items``                      — TPL-01
- ``POST   /api/v1/template/items``                      — TPL-01, TPL-02
- ``PATCH  /api/v1/template/items/{item_id}``            — TPL-02
- ``DELETE /api/v1/template/items/{item_id}``            — TPL-02
- ``POST   /api/v1/template/snapshot-from-period/{pid}`` — TPL-03 (D-32)

Exception → HTTP mapping:
    TemplateItemNotFoundError → 404
    CategoryNotFoundError     → 404
    PeriodNotFoundError       → 404
    InvalidCategoryError      → 400
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
from app.api.schemas.templates import (
    SnapshotFromPeriodResponse,
    TemplateItemCreate,
    TemplateItemRead,
    TemplateItemUpdate,
)
from app.services import templates as tpl_svc
from app.services.categories import CategoryNotFoundError
from app.services.planned import InvalidCategoryError, PeriodNotFoundError
from app.services.templates import TemplateItemNotFoundError


templates_router = APIRouter(
    prefix="/template",
    tags=["templates"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@templates_router.get("/items", response_model=list[TemplateItemRead])
async def list_template_items(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[TemplateItemRead]:
    """GET /api/v1/template/items — list all template items (TPL-01).

    Returns rows ordered by (category_id, sort_order, id).
    """
    items = await tpl_svc.list_template_items(db, user_id=user_id)
    return [TemplateItemRead.model_validate(it) for it in items]


@templates_router.post(
    "/items",
    response_model=TemplateItemRead,
    status_code=status.HTTP_200_OK,
)
async def create_template_item(
    body: TemplateItemCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateItemRead:
    """POST /api/v1/template/items — create a new template item.

    Status codes:
        200: created
        422: Pydantic validation (amount_cents <= 0, day_of_period out of range)
        404: category does not exist
        400: category exists but is_archived=True
    """
    try:
        item = await tpl_svc.create_template_item(db, user_id=user_id, body=body)
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return TemplateItemRead.model_validate(item)


@templates_router.patch("/items/{item_id}", response_model=TemplateItemRead)
async def update_template_item(
    item_id: int,
    body: TemplateItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateItemRead:
    """PATCH /api/v1/template/items/{id} — partial update.

    Status codes:
        200: updated
        422: Pydantic validation
        404: template item or new category_id does not exist
        400: new category is archived
    """
    try:
        item = await tpl_svc.update_template_item(db, item_id, body, user_id=user_id)
    except TemplateItemNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return TemplateItemRead.model_validate(item)


@templates_router.delete("/items/{item_id}", response_model=TemplateItemRead)
async def delete_template_item(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> TemplateItemRead:
    """DELETE /api/v1/template/items/{id} — hard delete.

    Per CLAUDE.md convention: soft-delete is reserved for ``category`` only;
    template/planned/actual rows are hard-deleted.

    Status codes:
        200: deleted (returns the deleted item state for client refresh)
        404: template item does not exist
    """
    try:
        item = await tpl_svc.delete_template_item(db, item_id, user_id=user_id)
    except TemplateItemNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return TemplateItemRead.model_validate(item)


@templates_router.post(
    "/snapshot-from-period/{period_id}",
    response_model=SnapshotFromPeriodResponse,
    status_code=status.HTTP_200_OK,
)
async def snapshot_from_period(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SnapshotFromPeriodResponse:
    """POST /api/v1/template/snapshot-from-period/{period_id} — TPL-03 (D-32).

    Destructively overwrites PlanTemplate from the period's planned rows.
    Includes ``source IN ('template', 'manual')``; EXCLUDES
    ``subscription_auto`` so subscription rows do not pollute the template.

    Returns ``{template_items: [...], replaced: <prev_count>}``.

    Status codes:
        200: snapshot applied (always — even with empty template)
        404: period does not exist
    """
    try:
        result = await tpl_svc.snapshot_from_period(
            db, user_id=user_id, period_id=period_id
        )
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return SnapshotFromPeriodResponse(
        template_items=[
            TemplateItemRead.model_validate(it) for it in result["template_items"]
        ],
        replaced=result["replaced"],
    )
