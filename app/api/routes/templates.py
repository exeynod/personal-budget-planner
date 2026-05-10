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

CR-05 fix (Phase 22 review): the deprecated handlers no longer accept request
bodies or DB sessions. Pydantic schema validation (422) and ``SET LOCAL
app.current_user_id`` are skipped — every deprecated endpoint short-circuits
to 410 immediately so a malformed POST/PATCH/DELETE body cannot leak validator
behaviour or burn DB cycles on a deprecated surface.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    get_current_user,
    require_onboarded,
)
from app.api.schemas.templates import TemplateItemRead


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
async def list_template_items() -> list[TemplateItemRead]:
    """DEPRECATED: GET /api/v1/template/items — returns empty list.

    Plan 22.13: ``plan_template_item`` table was dropped (CONTEXT D-02).
    Use ``GET /api/v1/categories`` and read ``plan_cents`` instead.

    No DB dependency: the endpoint always returns ``[]`` so we skip the
    ``SET LOCAL app.current_user_id`` round-trip the deprecated handler
    would otherwise force on every legacy poll (CR-05 fix).
    """
    return []


@templates_router.post(
    "/items",
    status_code=status.HTTP_410_GONE,
)
async def create_template_item_deprecated() -> None:
    """DEPRECATED: POST /api/v1/template/items — 410 Gone.

    No request body parsing or DB dependency: the endpoint short-circuits to
    410 immediately so malformed bodies cannot trigger 422 validators on a
    deprecated surface (CR-05 fix).
    """
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@templates_router.patch(
    "/items/{item_id}",
    status_code=status.HTTP_410_GONE,
)
async def update_template_item_deprecated(item_id: int) -> None:
    """DEPRECATED: PATCH /api/v1/template/items/{id} — 410 Gone.

    The path parameter is preserved so OpenAPI advertises the same URL
    shape, but no body / DB / auth-side-effect dependencies run before the
    410 is raised (CR-05 fix).
    """
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@templates_router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_410_GONE,
)
async def delete_template_item_deprecated(item_id: int) -> None:
    """DEPRECATED: DELETE /api/v1/template/items/{id} — 410 Gone (CR-05 fix)."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@templates_router.post(
    "/snapshot-from-period/{period_id}",
    status_code=status.HTTP_410_GONE,
)
async def snapshot_from_period_deprecated(period_id: int) -> None:
    """DEPRECATED: POST /api/v1/template/snapshot-from-period/{id} — 410 Gone (CR-05 fix)."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)
