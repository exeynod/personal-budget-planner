"""Categories REST routes — CAT-01, CAT-02 (soft archive).

Thin handlers over ``app.services.categories``: routes do request/response
shape mapping (Pydantic <-> ORM) and exception → HTTP status mapping. All
business logic — including the soft-archive semantics, default seed list, and
ordering — lives in the service layer.

Phase 11 (Plan 11-05): handlers use ``get_db_with_tenant_scope`` (which sets
``SET LOCAL app.current_user_id`` за one transaction) plus
``get_current_user_id`` (resolves ``app_user.id`` PK from the validated
Telegram user). Both are passed through to the service layer where queries
explicitly filter by ``user_id``.
"""
import structlog
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding_service import get_embedding_service
from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
)
from app.api.schemas.categories import CategoryCreate, CategoryRead, CategoryUpdate
from app.core.settings import settings
from app.services import categories as cat_svc
from app.services.categories import CategoryNotFoundError

logger = structlog.get_logger(__name__)


categories_router = APIRouter(
    prefix="/categories",
    tags=["categories"],
    dependencies=[Depends(get_current_user)],
)


@categories_router.get("", response_model=list[CategoryRead])
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    include_archived: bool = False,
) -> list[CategoryRead]:
    """GET /api/v1/categories?include_archived=<bool>

    Default: returns only active categories (CAT-02). Pass ``include_archived=true``
    to include archived rows (for the archive-management UI).
    """
    cats = await cat_svc.list_categories(
        db, user_id=user_id, include_archived=include_archived
    )
    return [CategoryRead.model_validate(c) for c in cats]


@categories_router.post("", response_model=CategoryRead, status_code=status.HTTP_200_OK)
async def create_category(
    body: CategoryCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    background_tasks: BackgroundTasks,
) -> CategoryRead:
    """POST /api/v1/categories — create a new category (CAT-01).

    Phase 10.1: schedules embedding generation for the new category in
    background so it becomes visible to /ai/suggest-category immediately
    (without requiring a subsequent rename).
    """
    cat = await cat_svc.create_category(
        db,
        user_id=user_id,
        name=body.name,
        kind=body.kind,
        sort_order=body.sort_order,
    )
    if settings.ENABLE_AI_CATEGORIZATION:
        # Commit BEFORE registering the background task. FastAPI runs
        # background tasks after the response is sent, but the dependency
        # cleanup (get_db's session.commit()) is not strictly ordered
        # before the background task acquires its own session — leading
        # to ForeignKeyViolationError when _refresh_embedding's fresh
        # session can't see the not-yet-committed category row.
        await db.commit()
        background_tasks.add_task(_refresh_embedding, cat.id, cat.name)
    return CategoryRead.model_validate(cat)


async def _refresh_embedding(category_id: int, name: str) -> None:
    """Background task: regenerate category embedding after name change (AICAT-04).

    Runs outside the request lifecycle — uses its own DB session.
    Skips silently if OPENAI_API_KEY is not configured.
    """
    from app.db.session import AsyncSessionLocal

    try:
        from app.ai.embedding_service import augment_category_name_for_embedding

        embedding_svc = get_embedding_service()
        vector = await embedding_svc.embed_text(
            augment_category_name_for_embedding(name)
        )
        async with AsyncSessionLocal() as session:
            await embedding_svc.upsert_category_embedding(session, category_id, vector)
            # AsyncSession's async-with does NOT auto-commit on exit
            # (only closes the session) — without this, the upsert is
            # silently rolled back even though the SQL was issued.
            await session.commit()
        logger.info("category.embedding.refreshed", category_id=category_id)
    except Exception:
        logger.warning(
            "category.embedding.refresh_failed",
            category_id=category_id,
            exc_info=True,
        )


@categories_router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    background_tasks: BackgroundTasks,
) -> CategoryRead:
    """PATCH /api/v1/categories/{id} — partial update including is_archived toggle.

    Returns 404 if the category does not exist (``CategoryNotFoundError``).
    When name changes and AI categorization is enabled, schedules an embedding
    refresh as a background task so the suggestion index stays up to date (AICAT-04).
    """
    # Phase 10.1: capture old name BEFORE update so we can skip embedding
    # regeneration when the patch doesn't actually change the name (avoids
    # a wasted OpenAI API call on no-op renames).
    old_name: str | None = None
    if settings.ENABLE_AI_CATEGORIZATION and body.name is not None:
        try:
            existing = await cat_svc.get_or_404(db, category_id, user_id=user_id)
            old_name = existing.name
        except CategoryNotFoundError:
            old_name = None

    try:
        cat = await cat_svc.update_category(db, category_id, body, user_id=user_id)
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # Schedule embedding refresh ONLY when the name actually changed.
    if (
        settings.ENABLE_AI_CATEGORIZATION
        and body.name is not None
        and body.name != old_name
    ):
        # Same rationale as create_category: commit before scheduling so
        # the background task's fresh session sees the renamed row.
        await db.commit()
        background_tasks.add_task(_refresh_embedding, cat.id, cat.name)

    return CategoryRead.model_validate(cat)


@categories_router.delete("/{category_id}", response_model=CategoryRead)
async def archive_category(
    category_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> CategoryRead:
    """DELETE /api/v1/categories/{id} — soft-archive (D-14, CAT-02).

    Sets ``is_archived=true`` rather than physically deleting; historical
    transactions referencing this category remain intact. Use PATCH with
    ``is_archived=false`` to unarchive. Returns 404 if missing.
    """
    try:
        cat = await cat_svc.archive_category(db, category_id, user_id=user_id)
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return CategoryRead.model_validate(cat)
