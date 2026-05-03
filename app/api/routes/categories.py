"""Categories REST routes — CAT-01, CAT-02 (soft archive).

Thin handlers over ``app.services.categories``: routes do request/response
shape mapping (Pydantic <-> ORM) and exception → HTTP status mapping. All
business logic — including the soft-archive semantics, default seed list, and
ordering — lives in the service layer.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.categories import CategoryCreate, CategoryRead, CategoryUpdate
from app.services import categories as cat_svc
from app.services.categories import CategoryNotFoundError


categories_router = APIRouter(
    prefix="/categories",
    tags=["categories"],
    dependencies=[Depends(get_current_user)],
)


@categories_router.get("", response_model=list[CategoryRead])
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = False,
) -> list[CategoryRead]:
    """GET /api/v1/categories?include_archived=<bool>

    Default: returns only active categories (CAT-02). Pass ``include_archived=true``
    to include archived rows (for the archive-management UI).
    """
    cats = await cat_svc.list_categories(db, include_archived=include_archived)
    return [CategoryRead.model_validate(c) for c in cats]


@categories_router.post("", response_model=CategoryRead, status_code=status.HTTP_200_OK)
async def create_category(
    body: CategoryCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CategoryRead:
    """POST /api/v1/categories — create a new category (CAT-01)."""
    cat = await cat_svc.create_category(
        db,
        name=body.name,
        kind=body.kind,
        sort_order=body.sort_order,
    )
    return CategoryRead.model_validate(cat)


@categories_router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CategoryRead:
    """PATCH /api/v1/categories/{id} — partial update including is_archived toggle.

    Returns 404 if the category does not exist (``CategoryNotFoundError``).
    """
    try:
        cat = await cat_svc.update_category(db, category_id, body)
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return CategoryRead.model_validate(cat)


@categories_router.delete("/{category_id}", response_model=CategoryRead)
async def archive_category(
    category_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CategoryRead:
    """DELETE /api/v1/categories/{id} — soft-archive (D-14, CAT-02).

    Sets ``is_archived=true`` rather than physically deleting; historical
    transactions referencing this category remain intact. Use PATCH with
    ``is_archived=false`` to unarchive. Returns 404 if missing.
    """
    try:
        cat = await cat_svc.archive_category(db, category_id)
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return CategoryRead.model_validate(cat)
