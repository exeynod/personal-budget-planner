"""FastAPI entry point for the api container.

Run via ``entrypoint.sh`` (D-09):
    alembic upgrade head && uvicorn main_api:app --host 0.0.0.0 --port 8000

Lifespan:
- Startup: ``configure_logging`` per D-13 (json/console renderer chosen by ENV).
- AI startup init: generate missing category embeddings (AICAT-05).
- Shutdown: dispose async SQLA engine to drain asyncpg pool.

Routes mounted:
- ``/healthz`` — public health probe (INF-05).
- ``/api/v1/me`` — owner-only, initData-auth (AUTH-01, AUTH-02).
- ``/api/v1/internal/health`` — X-Internal-Token-protected (INF-04).

Security:
- ``docs_url=None`` when ``DEV_MODE=False`` to reduce attack surface.
"""
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from sqlalchemy import select

from app.api.router import internal_router, public_router
from app.core.logging import configure_logging
from app.core.settings import settings, validate_production_settings
from app.db.models import Category, CategoryEmbedding
from app.db.session import AsyncSessionLocal, async_engine

logger = structlog.get_logger(__name__)


async def _init_missing_embeddings() -> None:
    """Generate embeddings for categories that don't have one yet (AICAT-05).

    Runs at API startup. Only when ENABLE_AI_CATEGORIZATION=True and
    OPENAI_API_KEY is configured (not 'changeme'). Skips gracefully on error
    so startup is never blocked by AI subsystem failures.
    """
    if not settings.ENABLE_AI_CATEGORIZATION:
        logger.info("ai.embeddings.startup_skipped", reason="ENABLE_AI_CATEGORIZATION=False")
        return

    if settings.OPENAI_API_KEY in ("", "changeme"):
        logger.warning(
            "ai.embeddings.startup_skipped",
            reason="OPENAI_API_KEY not configured",
        )
        return

    try:
        from app.ai.embedding_service import get_embedding_service

        embedding_svc = get_embedding_service()

        async with AsyncSessionLocal() as session:
            # Fetch all active categories
            cats_result = await session.execute(
                select(Category).where(Category.is_archived == False)  # noqa: E712
            )
            categories = cats_result.scalars().all()

            if not categories:
                logger.info("ai.embeddings.startup", categories=0, generated=0)
                return

            # Fetch category_ids that already have embeddings
            existing_result = await session.execute(
                select(CategoryEmbedding.category_id)
            )
            existing_ids: set[int] = {row[0] for row in existing_result.fetchall()}

            # Only process categories without embeddings
            missing = [c for c in categories if c.id not in existing_ids]

            generated = 0
            for cat in missing:
                try:
                    vector = await embedding_svc.embed_text(cat.name)
                    await embedding_svc.upsert_category_embedding(session, cat.id, vector)
                    generated += 1
                except Exception:
                    logger.warning(
                        "ai.embeddings.startup_item_failed",
                        category_id=cat.id,
                        exc_info=True,
                    )

        logger.info(
            "ai.embeddings.startup",
            categories=len(categories),
            existing=len(existing_ids),
            generated=generated,
        )

    except Exception:
        logger.warning(
            "ai.embeddings.startup_failed",
            exc_info=True,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: startup → yield → shutdown."""
    configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    validate_production_settings()
    logger.info(
        "api.startup",
        dev_mode=settings.DEV_MODE,
        domain=settings.PUBLIC_DOMAIN,
    )
    await _init_missing_embeddings()
    yield
    await async_engine.dispose()
    logger.info("api.shutdown")


app = FastAPI(
    title="TG Budget Planner API",
    version="1.0.0",
    lifespan=lifespan,
    # Disable docs in production to reduce attack surface (T-devmode).
    docs_url="/api/docs" if settings.DEV_MODE else None,
    redoc_url=None,
)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict:
    """Health check endpoint for Docker and Caddy (INF-05)."""
    return {"status": "ok"}


# Mount routers
app.include_router(public_router, prefix="/api/v1", tags=["public"])
app.include_router(internal_router, prefix="/api/v1", tags=["internal"])
