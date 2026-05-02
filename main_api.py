"""FastAPI entry point for the api container.

Run via ``entrypoint.sh`` (D-09):
    alembic upgrade head && uvicorn main_api:app --host 0.0.0.0 --port 8000

Lifespan:
- Startup: ``configure_logging`` per D-13 (json/console renderer chosen by ENV).
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

from app.api.router import internal_router, public_router
from app.core.logging import configure_logging
from app.core.settings import settings
from app.db.session import async_engine

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: startup → yield → shutdown."""
    configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    logger.info(
        "api.startup",
        dev_mode=settings.DEV_MODE,
        domain=settings.PUBLIC_DOMAIN,
    )
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
