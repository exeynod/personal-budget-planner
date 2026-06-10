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
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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
        logger.info(
            "ai.embeddings.startup_skipped", reason="ENABLE_AI_CATEGORIZATION=False"
        )
        return

    if settings.OPENAI_API_KEY in ("", "changeme"):
        logger.warning(
            "ai.embeddings.startup_skipped",
            reason="OPENAI_API_KEY not configured",
        )
        return

    try:
        from app.ai.embedding_service import (
            augment_category_name_for_embedding,
            get_embedding_service,
        )

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
                    vector = await embedding_svc.embed_text(
                        augment_category_name_for_embedding(cat.name)
                    )
                    await embedding_svc.upsert_category_embedding(
                        session, cat.id, vector
                    )
                    generated += 1
                except Exception:
                    logger.warning(
                        "ai.embeddings.startup_item_failed",
                        category_id=cat.id,
                        exc_info=True,
                    )
            # AsyncSession async-with не auto-commit; без этого все upsert'ы
            # откатываются и таблица category_embedding остаётся пустой.
            await session.commit()

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
    # DEV-only synthetic seed (idempotent; runs BEFORE embedding init
    # so freshly-seeded categories get vectors in the same boot).
    if settings.DEV_MODE:
        from app.dev_seed import seed_dev_data

        await seed_dev_data(settings.OWNER_TG_ID)
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


# ---------------------------------------------------------------------------
# Global exception handlers (Этап 3 WI-A)
#
# Goal: no unhandled exception ever leaks a traceback to the client. All three
# handlers below produce a clean JSON body and log server-side. They sit
# BELOW FastAPI's own ``HTTPException`` handling, so the 103 explicit
# ``raise HTTPException`` call-sites keep their status codes / detail shapes
# untouched (Starlette dispatches HTTPException to its dedicated handler,
# which we do NOT override).
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """422 for request-body / query / path validation failures.

    Preserves FastAPI's default body shape ``{"detail": [<errors>]}`` — the
    frontend (``frontend/src/api``) and the test-suite both read
    ``resp.json()["detail"]`` and rely on this exact form (see e.g.
    ``tests/api/test_plan_month_route.py``, ``tests/test_actual_crud.py``).
    We only add a structured log line; the response is byte-compatible with
    the framework default. ``jsonable_encoder`` mirrors FastAPI's own
    serialization so ``ValueError`` payloads inside ``ctx`` stay JSON-safe.
    """
    from fastapi.encoders import jsonable_encoder

    logger.info(
        "api.validation_error",
        path=request.url.path,
        method=request.method,
        error_count=len(exc.errors()),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": jsonable_encoder(exc.errors())},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Domain ``ValueError`` → 422 instead of a 500.

    Many service helpers raise plain ``ValueError`` for invalid domain input
    (e.g. ``CategoryKind(<bad>)`` in ``app/services/actual.py`` /
    ``categories.py``, the manual validators in
    ``app/services/onboarding_v10.py``). Routes that already catch their own
    ``ValueError`` (e.g. ``onboarding_v10.py`` → 422) are unaffected: this
    net only fires for the ones that escape. ``HTTPException`` is a subclass
    of ``Exception`` but NOT of ``ValueError``, so it never lands here and
    keeps its own status code.

    422 (not 500) is the right class: an escaped ``ValueError`` means the
    request carried semantically invalid data the validators missed. The
    message is surfaced (these are developer/domain messages, never secrets);
    we log at warning with the traceback for observability.
    """
    logger.warning(
        "api.value_error",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort 500 with a clean body — never leak a traceback.

    Catches anything not handled by FastAPI's ``HTTPException`` handler, the
    ``RequestValidationError`` handler, or the ``ValueError`` handler above.
    The traceback goes to the structured log (``logging.exception`` semantics
    via ``exc_info=True``); the client gets a fixed, non-revealing body.
    """
    logger.error(
        "api.unhandled_exception",
        path=request.url.path,
        method=request.method,
        exc_type=type(exc).__name__,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.get("/healthz", tags=["health"])
async def healthz() -> dict:
    """Health check endpoint for Docker and Caddy (INF-05)."""
    return {"status": "ok"}


# Mount routers
app.include_router(public_router, prefix="/api/v1", tags=["public"])
app.include_router(internal_router, prefix="/api/v1", tags=["internal"])

# Phase 33 CMP-33-03 — public legal docs (Privacy + ToS).
# Mounted WITHOUT /api/v1 prefix so users can read policy BEFORE
# Telegram auth occurs. No auth dependency.
from app.api.routes.legal import legal_router  # noqa: E402

app.include_router(legal_router, tags=["legal"])

# Phase 34 (REQ-34-03, REQ-34-05) — YooKassa webhook endpoint.
# Mounted WITHOUT /api/v1 prefix (clean URL для регистрации в YooKassa
# admin panel). Auth: YooKassa IP allowlist (edge-level), идемпотентность
# через UNIQUE(yookassa_payment_id) + state-transition guard в обработчике.
from app.api.routes.webhooks.yookassa import router as yookassa_webhook_router  # noqa: E402

app.include_router(yookassa_webhook_router, tags=["webhooks"])

# Phase 34-05 (REQ-34-04, REQ-34-06) — user-facing billing + subscription routes.
# Router declares its own ``/api/v1`` prefix (mirrors legal_router / yookassa
# webhook patterns), so we include it WITHOUT an additional prefix here.
from app.api.routes.billing import router as billing_router  # noqa: E402

app.include_router(billing_router)
