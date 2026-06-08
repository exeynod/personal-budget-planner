#!/usr/bin/env bash
# Integration test runner — boots full stack, runs pytest against live DB,
# tears down. Use for tests that require docker-compose (test_subscriptions,
# test_settings, tests/ai/test_categorization.py with DB fixtures, etc.).
#
# Usage:
#   ./scripts/run-integration-tests.sh                    # all tests
#   ./scripts/run-integration-tests.sh tests/ai/          # subset
#   ./scripts/run-integration-tests.sh -k test_subscriptions -v
#
# Pass-through arguments are forwarded to pytest verbatim.
#
# Lifecycle:
#   1. up -d (base + dev + test override) — bind-mounts tests/ into api
#   2. wait for api healthy (api waits for db healthy + alembic upgrade)
#   3. exec pytest inside api container
#   4. capture exit code, then `docker compose down` (cleanup)
#
# Why we don't use pytest fixtures for compose lifecycle:
# - Test code stays infra-agnostic.
# - Wrapper script is faster (one boot for the whole suite).
# - CI can call the same script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose
  # Point Compose at the repo-root .env for ${VAR} interpolation (it defaults to
  # deploy/ otherwise → empty passwords). --env-file (not --project-directory)
  # keeps the relative build contexts `context: ..` resolving correctly.
  --env-file "$REPO_ROOT/.env"
  -f deploy/docker-compose.yml
  -f deploy/docker-compose.dev.yml
  -f deploy/docker-compose.test.yml
)

cleanup() {
  echo
  echo ">>> Tearing down stack..."
  "${COMPOSE[@]}" down --remove-orphans
}
trap cleanup EXIT INT TERM

echo ">>> Booting stack (base + dev + test)..."
"${COMPOSE[@]}" up -d --build api

echo ">>> Waiting for api to be healthy (max 60s)..."
for i in $(seq 1 60); do
  status=$(docker inspect tg-budget-planner-test-api-1 \
    --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo ">>> api healthy after ${i}s"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "!!! api did not become healthy in 60s — last status: $status"
    "${COMPOSE[@]}" logs api --tail 30
    exit 1
  fi
  sleep 1
done

echo ">>> Running pytest inside api container..."
echo ">>> Args: $*"
echo

# -T: no TTY (works in CI)
# Default to all tests if no args passed
if [ $# -eq 0 ]; then
  set -- tests/
fi

"${COMPOSE[@]}" exec -T api /app/.venv/bin/python -m pytest "$@"
