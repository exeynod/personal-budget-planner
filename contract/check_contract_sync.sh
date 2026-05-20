#!/usr/bin/env bash
#
# Phase 69 B5 — contract sync-guard.
#
# Regenerates every generated contract artifact from the single source of
# truth (the FastAPI OpenAPI schema → contract/openapi.json) and fails if any
# of them differs from what is committed. This is the enforcement boundary that
# prevents the drift class Phase 69 fixed from silently re-appearing: a backend
# response-model change without regenerated TS/Swift types makes the guard fail.
#
# The three artifacts and their generators (run in dependency order — the web
# and iOS generators READ contract/openapi.json, so the backend dump goes first):
#
#   1. contract/openapi.json
#        ← app.openapi() dumped deterministically (sort_keys, trailing \n)
#   2. frontend/src/api/generated/schema.ts
#        ← `npm run gen:api` (openapi-typescript reads ../contract/openapi.json)
#   3. ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift
#        ← `python3 contract/gen_swift_dto.py` (Python stdlib, reads openapi.json)
#
# All three generators are deterministic/idempotent (verified in 69-01/02/03),
# so on a clean, in-sync tree the final `git diff --exit-code` is empty.
#
# ---------------------------------------------------------------------------
# Dump modes (how step 1, the backend openapi.json dump, is produced)
# ---------------------------------------------------------------------------
# The backend dump needs `main_api.app` importable. That differs by environment,
# so the dump strategy is selectable via --dump=MODE (or $CONTRACT_DUMP):
#
#   docker  (default) Pipe contract/dump_openapi.py into the running docker `api`
#                     container (`make contract`). Use this LOCALLY — the host
#                     .venv is intentionally not maintained.
#   python            Run `python3 contract/dump_openapi.py` directly. Use this
#                     where the app is importable in-process (CI backend job:
#                     `uv run` / activated venv with all deps installed).
#   skip              Do NOT re-dump openapi.json; only regenerate the web +
#                     iOS artifacts from the COMMITTED openapi.json and diff.
#                     Lightweight guard for a Node+Python-only CI job — it still
#                     catches TS/Swift drift but cannot catch a backend schema
#                     change that was never dumped (pair with a `python` run in
#                     the backend job for full coverage).
#
# Usage:
#   bash contract/check_contract_sync.sh                 # docker dump (local)
#   bash contract/check_contract_sync.sh --dump=python   # in-process dump (CI backend)
#   bash contract/check_contract_sync.sh --dump=skip      # diff committed openapi (CI light)
#   CONTRACT_DUMP=skip bash contract/check_contract_sync.sh
#
set -euo pipefail

# --- locate repo root (this script lives in contract/) -----------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- parse args / env --------------------------------------------------------
DUMP_MODE="${CONTRACT_DUMP:-docker}"
for arg in "$@"; do
  case "$arg" in
    --dump=*) DUMP_MODE="${arg#--dump=}" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

OPENAPI="contract/openapi.json"
WEB_SCHEMA="frontend/src/api/generated/schema.ts"
SWIFT_DTO="ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift"

REGEN_CMD='make contract && (cd frontend && npm run gen:api) && python3 contract/gen_swift_dto.py'

log() { printf '\033[1m[contract-sync]\033[0m %s\n' "$*"; }

# --- step 1: regenerate contract/openapi.json --------------------------------
case "$DUMP_MODE" in
  docker)
    log "Dumping openapi.json via docker api container (make contract)…"
    make contract
    ;;
  python)
    log "Dumping openapi.json via in-process python (python3 contract/dump_openapi.py)…"
    python3 contract/dump_openapi.py
    ;;
  skip)
    log "Skipping openapi.json dump — diffing against the committed artifact (--dump=skip)."
    ;;
  *)
    echo "invalid --dump mode: '$DUMP_MODE' (expected docker|python|skip)" >&2
    exit 2
    ;;
esac

# --- step 2: regenerate the web schema ---------------------------------------
log "Regenerating web schema.ts (cd frontend && npm run gen:api)…"
( cd frontend && npm run gen:api )

# --- step 3: regenerate the iOS DTOs -----------------------------------------
log "Regenerating iOS GeneratedDTO.swift (python3 contract/gen_swift_dto.py)…"
python3 contract/gen_swift_dto.py

# --- step 4: assert nothing drifted ------------------------------------------
# Diff exactly the generated paths. --dump=skip excludes openapi.json from the
# diff set (it was not regenerated, so a stale-but-committed file must not fail
# the light guard); the other modes include it.
DIFF_PATHS=("$WEB_SCHEMA" "$SWIFT_DTO")
if [ "$DUMP_MODE" != "skip" ]; then
  DIFF_PATHS=("$OPENAPI" "${DIFF_PATHS[@]}")
fi

log "Checking git diff on: ${DIFF_PATHS[*]}"
if git diff --exit-code -- "${DIFF_PATHS[@]}"; then
  log "OK — generated contract types are in sync with the schema."
  exit 0
fi

# Non-empty diff → drift. Name the stale files + the exact regen command.
STALE="$(git diff --name-only -- "${DIFF_PATHS[@]}")"
{
  echo
  echo "ERROR: generated contract types are STALE — they drifted from the schema."
  echo
  echo "Out-of-sync file(s):"
  echo "$STALE" | sed 's/^/  - /'
  echo
  echo "Fix: regenerate all contract artifacts and commit them:"
  echo "  $REGEN_CMD"
  echo
} >&2
exit 1
