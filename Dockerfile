# Single Dockerfile for api/bot/worker containers (D-03).
#
# Build:
#   docker build --build-arg SERVICE=api    -t budget-api    .
#   docker build --build-arg SERVICE=bot    -t budget-bot    .
#   docker build --build-arg SERVICE=worker -t budget-worker .
#
# Source: 01-RESEARCH.md Pattern 8 + 01-CONTEXT.md D-01 (uv) and D-03 (build-arg SERVICE).
# All three Python services share the same image layers (deps + app/) and only
# differ in the entrypoint command, selected at runtime via the SERVICE env var
# (passed through from the build-arg). This keeps the layer cache warm across
# all three services and minimises build time on a single VPS.
FROM python:3.12-slim AS base

ARG SERVICE
ENV SERVICE=${SERVICE}

# Install uv (fast Python package manager, D-01) — copies the prebuilt uv
# binary from the official image, avoiding curl|sh installation drift.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency manifests first so the deps layer is cached independently
# from app code. uv.lock is optional in early phases; if it exists we use
# --locked for reproducibility, otherwise we resolve fresh.
COPY pyproject.toml uv.lock* ./

# Install Python dependencies (all three services share the same deps).
# --no-install-project skips installing the local project itself; we COPY the
# source tree below. --no-dev excludes test deps from the runtime image.
RUN uv sync --locked --no-install-project --no-dev 2>/dev/null \
    || uv sync --no-install-project --no-dev

# Copy application code and Alembic migration scripts.
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# Copy entrypoints and migration script.
COPY main_api.py main_bot.py main_worker.py ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Default CMD selects service based on SERVICE build-arg (shell form so the
# variable is expanded by /bin/sh at container start). The api container runs
# entrypoint.sh which performs `alembic upgrade head` before starting uvicorn.
CMD if [ "$SERVICE" = "api" ]; then \
      ./entrypoint.sh; \
    elif [ "$SERVICE" = "bot" ]; then \
      uv run python main_bot.py; \
    elif [ "$SERVICE" = "worker" ]; then \
      uv run python main_worker.py; \
    else \
      echo "Unknown SERVICE: $SERVICE (must be api/bot/worker)" && exit 1; \
    fi
