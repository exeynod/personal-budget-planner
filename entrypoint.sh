#!/bin/sh
# api container entrypoint (D-09): apply Alembic migrations, then start uvicorn.
#
# Source: 01-RESEARCH.md Pattern 9 + 01-CONTEXT.md D-09.
# Failure modes:
#   - alembic exit != 0 (e.g. db not yet ready): set -e aborts; docker
#     restarts the container. Compose `depends_on: db: condition:
#     service_healthy` keeps this loop short.
#   - uvicorn replaces the shell via exec so SIGTERM from docker stop
#     reaches uvicorn directly (graceful shutdown of the lifespan ctx).
set -e

echo "[entrypoint] Running Alembic migrations..."
uv run alembic upgrade head
echo "[entrypoint] Migrations complete."

exec uv run uvicorn main_api:app --host 0.0.0.0 --port 8000
