"""Embedding backfill helper (Phase 14 MTONB-03, D-14-03).

Generates `category_embedding` rows for all of a user's active categories
that don't yet have one. Used by:
  (a) app/services/onboarding.py:complete_onboarding — inline async,
      5th atomic step (new in Phase 14).
  (b) Future on-demand fallback in app/api/routes/ai_suggest.py if
      a category lacks an embedding when first queried (deferred).

Failure mode: any exception from EmbeddingService.embed_texts is logged
at WARNING and swallowed — caller receives 0. This keeps onboarding
success rate at 100% even when OpenAI is degraded; the AI-suggest path
will fallback to on-demand or surface "no suggestion" gracefully.

Security (T-14-03-03): queries filter strictly by Category.user_id == user_id
and pass the same user_id to upsert_category_embedding — no cross-tenant
writes possible at the app layer. Phase 11 RLS is the backstop.
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding_service import (
    augment_category_name_for_embedding,
    get_embedding_service,
)
from app.db.models import Category, CategoryEmbedding

logger = structlog.get_logger(__name__)


async def backfill_user_embeddings(
    db: AsyncSession,
    *,
    user_id: int,
) -> int:
    """Generate missing embeddings for a single user's active categories.

    Args:
        db: AsyncSession (caller-managed transaction; this helper does
            NOT commit — onboarding wraps everything in one atomic txn).
        user_id: app_user.id PK; queries scope all reads/writes to it.

    Returns:
        Count of CategoryEmbedding rows actually created (0..N).
        On provider failure returns 0 without raising.

    Idempotent: categories that already have a CategoryEmbedding row
    are excluded via LEFT JOIN (CategoryEmbedding.category_id IS NULL
    filter). Re-running for the same user does not duplicate rows or
    overwrite existing embeddings.

    Archived categories (is_archived=True) are skipped — they are not
    surfaced to the AI suggest endpoint and do not need embeddings.
    """
    # 1. Find this user's active categories that lack an embedding.
    #    LEFT JOIN approach via outerjoin → filter where ce.category_id IS NULL.
    stmt = (
        select(Category.id, Category.name)
        .outerjoin(
            CategoryEmbedding,
            CategoryEmbedding.category_id == Category.id,
        )
        .where(
            Category.user_id == user_id,
            Category.is_archived.is_(False),
            CategoryEmbedding.category_id.is_(None),
        )
        .order_by(Category.id)
    )
    result = await db.execute(stmt)
    rows: list[tuple[int, str]] = list(result.all())

    if not rows:
        logger.info(
            "embedding_backfill.skip_empty",
            user_id=user_id,
        )
        return 0

    category_ids = [cid for cid, _ in rows]
    # 2. Augment names with synonym packs to lift cosine recall on short
    #    Russian probes (Phase 10.1 pattern); same as create_category +
    #    update_category background tasks.
    embed_inputs = [augment_category_name_for_embedding(name) for _, name in rows]

    embedding_svc = get_embedding_service()
    try:
        vectors = await embedding_svc.embed_texts(embed_inputs)
    except Exception as exc:
        logger.warning(
            "embedding_backfill.provider_failed",
            user_id=user_id,
            category_count=len(category_ids),
            error=str(exc),
        )
        return 0

    # 3. Upsert each embedding (single transaction, caller commits).
    #    WR-01: catch DB errors per-row to honor the documented contract
    #    "embedding failure does NOT roll back onboarding". An FK or
    #    unique-violation here would otherwise propagate up through
    #    complete_onboarding → get_db → ROLLBACK, throwing away the
    #    seed_default_categories work and the AppUser.onboarded_at flag.
    written = 0
    for category_id, vector in zip(category_ids, vectors, strict=True):
        try:
            await embedding_svc.upsert_category_embedding(
                db,
                category_id=category_id,
                vector=vector,
                user_id=user_id,
            )
            written += 1
        except Exception as exc:
            logger.warning(
                "embedding_backfill.upsert_failed",
                user_id=user_id,
                category_id=category_id,
                error=str(exc),
            )

    logger.info(
        "embedding_backfill.completed",
        user_id=user_id,
        count=written,
        attempted=len(category_ids),
    )
    return written
