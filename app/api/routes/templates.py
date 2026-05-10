"""Plan template REST routes — DEPRECATED in Phase 22 (plan 22.13).

The underlying ``plan_template_item`` table was dropped in alembic 0013
(CONTEXT D-02). ``Category.plan_cents`` is the v1.0 source of truth for the
per-category monthly plan.

Why the router still exists:
    1. ``app/api/router.py`` imports ``templates_router`` and calls
       ``include_router`` at module top-level. Removing the import would
       break the API boot.
    2. Legacy v0.x clients may still call ``GET /api/v1/template/items``;
       returning a clean empty list keeps them from crashing during the
       v0.x → v1.0 migration window.

Stub behaviour:
    - ``GET    /api/v1/template/items``                      → ``200 []``
    - ``POST   /api/v1/template/items``                      → ``410 Gone``
    - ``PATCH  /api/v1/template/items/{id}``                 → ``410 Gone``
    - ``DELETE /api/v1/template/items/{id}``                 → ``410 Gone``
    - ``POST   /api/v1/template/snapshot-from-period/{pid}`` → ``410 Gone``

Once frontend (web + iOS) drops references to these endpoints (Phase 23-27),
this router file can be deleted along with the include_router line.
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


_GONE_DETAIL = {
    "error": "templates_deprecated",
    "message": (
        "Plan templates were dropped in Phase 22 (v1.0 schema). "
        "Use PATCH /api/v1/categories/{id} with plan_cents instead."
    ),
}


templates_router = APIRouter(
    prefix="/template",
    tags=["templates"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
    deprecated=True,
)


@templates_router.get("/items", response_model=list[TemplateItemRead])
async def list_template_items(
    # Keep the dependency signatures intact so OpenAPI surface unchanged.
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[TemplateItemRead]:
    """DEPRECATED: GET /api/v1/template/items — returns empty list.

    Plan 22.13: ``plan_template_item`` table was dropped (CONTEXT D-02).
    Use ``GET /api/v1/categories`` and read ``plan_cents`` instead.
    """
    return []


@templates_router.post(
    "/items",
    status_code=status.HTTP_410_GONE,
)
async def create_template_item_deprecated(
    body: TemplateItemCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DEPRECATED: POST /api/v1/template/items — 410 Gone."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@templates_router.patch(
    "/items/{item_id}",
    status_code=status.HTTP_410_GONE,
)
async def update_template_item_deprecated(
    item_id: int,
    body: TemplateItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DEPRECATED: PATCH /api/v1/template/items/{id} — 410 Gone."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@templates_router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_410_GONE,
)
async def delete_template_item_deprecated(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DEPRECATED: DELETE /api/v1/template/items/{id} — 410 Gone."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@templates_router.post(
    "/snapshot-from-period/{period_id}",
    status_code=status.HTTP_410_GONE,
)
async def snapshot_from_period_deprecated(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SnapshotFromPeriodResponse:
    """DEPRECATED: POST /api/v1/template/snapshot-from-period/{id} — 410 Gone."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)
