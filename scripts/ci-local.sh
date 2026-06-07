#!/usr/bin/env bash
# Local mirror of .github/workflows/ci.yml — "green locally = green CI".
#
# This matters because push to master = auto-deploy (GitHub Actions deploy.yml
# fires on a green CI run). There is no manual gate between merge and prod, so
# this script is the last line of defence before you push. It runs the SAME
# jobs CI runs, in the same order, so a red here means a red (and a blocked
# deploy) there.
#
# CI jobs mirrored (.github/workflows/ci.yml):
#   1. backend          → pytest against a real PostgreSQL + contract sync-guard
#   2. frontend-build   → tsc -b && vite build
#   3. frontend-e2e     → playwright (native-liquid-glass + responsive)
#   Also run here (defence-in-depth, not a separate CI job): the schema-SoT
#   DDL gate.
#
# Backend tests need a live Postgres. CI spins a `pgvector/pgvector:pg16`
# service; locally we reuse the docker-compose test stack via
# scripts/run-integration-tests.sh (boots api+db, runs pytest inside the
# container, tears down). Frontend runs natively (node) like CI.
#
# Escape hatches (for a partial/urgent push — use consciously):
#   SKIP_BACKEND=1   skip the docker-backed pytest job
#   SKIP_FRONTEND=1  skip vite build + vitest
#   SKIP_E2E=1       skip Playwright (slowest; needs browsers installed)
#   SKIP_DDL=1       skip the schema-SoT DDL gate
#
# Usage:
#   bash scripts/ci-local.sh        # full mirror
#   SKIP_E2E=1 bash scripts/ci-local.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

fail=0
step() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }
record() {
  # record <name> <rc>
  if [ "$2" -ne 0 ]; then
    printf '\033[31mFAIL\033[0m: %s (exit %s)\n' "$1" "$2"
    fail=1
  else
    printf '\033[32mOK\033[0m: %s\n' "$1"
  fi
}

# ------------------------------------------------------------------
# 0. Schema-SoT DDL gate (fast, no deps)
# ------------------------------------------------------------------
if [ "${SKIP_DDL:-0}" != "1" ]; then
  step "DDL gate (no raw schema DDL outside alembic/versions/)"
  bash scripts/check-no-manual-ddl.sh
  record "check-no-manual-ddl" $?
else
  echo "SKIP_DDL=1 → skipping DDL gate"
fi

# ------------------------------------------------------------------
# 1. Backend: pytest (real Postgres) + contract sync-guard
#    Mirrors CI job `backend`. run-integration-tests.sh boots the
#    docker-compose test stack (runs alembic upgrade head on bring-up
#    via entrypoint.sh) and runs pytest inside the api container.
# ------------------------------------------------------------------
if [ "${SKIP_BACKEND:-0}" != "1" ]; then
  step "Backend: pytest (docker-compose test stack)"
  bash scripts/run-integration-tests.sh -q
  record "backend pytest" $?

  step "Backend: contract sync-guard (regen-all + git-diff-empty)"
  # CI runs this in-process (CONTRACT_DUMP=python) because deps are uv-synced.
  # Locally the .venv may be broken, so default to the docker strategy (dumps
  # openapi.json from the live api container). Override with CONTRACT_DUMP=python
  # if you have a working local uv env.
  CONTRACT_DUMP="${CONTRACT_DUMP:-docker}" bash contract/check_contract_sync.sh
  record "contract sync-guard" $?
else
  echo "SKIP_BACKEND=1 → skipping backend pytest + contract guard"
fi

# ------------------------------------------------------------------
# 2. Frontend build: tsc -b && vite build  (mirrors CI job frontend-build)
# ------------------------------------------------------------------
if [ "${SKIP_FRONTEND:-0}" != "1" ]; then
  step "Frontend: install (npm ci)"
  ( cd frontend && npm ci )
  record "frontend npm ci" $?

  step "Frontend: build (tsc -b && vite build)"
  ( cd frontend && npm run build )
  record "frontend build" $?

  step "Frontend: unit tests (vitest run)"
  ( cd frontend && npm test )
  record "frontend vitest" $?
else
  echo "SKIP_FRONTEND=1 → skipping frontend build + vitest"
fi

# ------------------------------------------------------------------
# 3. Frontend e2e: Playwright (mirrors CI job frontend-e2e)
# ------------------------------------------------------------------
if [ "${SKIP_E2E:-0}" != "1" ]; then
  step "Frontend: e2e (Playwright — native-liquid-glass + responsive)"
  ( cd frontend && npx playwright install --with-deps chromium && npx playwright test )
  record "frontend playwright" $?
else
  echo "SKIP_E2E=1 → skipping Playwright e2e"
fi

# ------------------------------------------------------------------
echo
if [ "$fail" -ne 0 ]; then
  printf '\033[31m=== ci-local: FAILED ===\033[0m\n'
  exit 1
fi
printf '\033[32m=== ci-local: all mirrored jobs green ===\033[0m\n'
