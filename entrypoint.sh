#!/bin/sh
# api container entrypoint (D-09): apply Alembic migrations, then start uvicorn.
#
# Phase 12 D-11-07-02: alembic uses ADMIN_DATABASE_URL (privileged role)
# for DDL operations (CREATE/ALTER ROLE, GRANTs in migration 0007). Runtime
# uvicorn uses DATABASE_URL which connects as budget_app (NOSUPERUSER NOBYPASSRLS)
# so RLS policies actually enforce at runtime.
#
# Source: 01-RESEARCH.md Pattern 9 + 01-CONTEXT.md D-09 + Phase 12 plan 12-05.
# Failure modes:
#   - alembic exit != 0 (e.g. db not yet ready): set -e aborts; docker
#     restarts the container. Compose `depends_on: db: condition:
#     service_healthy` keeps this loop short.
#   - uvicorn replaces the shell via exec so SIGTERM from docker stop
#     reaches uvicorn directly (graceful shutdown of the lifespan ctx).
set -e

echo "[entrypoint] Running Alembic migrations under ADMIN_DATABASE_URL..."
DATABASE_URL="${ADMIN_DATABASE_URL:-$DATABASE_URL}" uv run alembic upgrade head
echo "[entrypoint] Migrations complete."

exec uv run uvicorn main_api:app --host 0.0.0.0 --port 8000
