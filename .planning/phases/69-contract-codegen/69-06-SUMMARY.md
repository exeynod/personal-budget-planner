---
phase: 69-contract-codegen
plan: 06
subsystem: contract-codegen
tags: [ci, codegen, sync-guard, contract, drift]
requires:
  - "contract/openapi.json (69-01 make contract)"
  - "frontend gen:api → schema.ts (69-02)"
  - "contract/gen_swift_dto.py → GeneratedDTO.swift (69-03)"
provides:
  - "contract/check_contract_sync.sh — regen-all + git-diff-empty drift guard"
  - "make contract-check convenience target"
  - "CI enforcement: contract change without regenerated client types fails the build"
affects:
  - ".github/workflows/ci.yml backend job"
tech-stack:
  added: []
  patterns:
    - "regen-then-git-diff-exit-code as a cross-stack drift gate"
    - "selectable openapi dump mode (docker/python/skip) for local-vs-CI portability"
key-files:
  created:
    - contract/check_contract_sync.sh
    - contract/README.md
  modified:
    - Makefile
    - .github/workflows/ci.yml
    - .planning/ROADMAP.md
decisions:
  - "Run the full guard in the existing CI backend job (--dump=python) rather than a separate light job: the backend job already has uv-synced deps (app importable in-process) so it can re-dump openapi.json AND regen TS/Swift, giving authoritative cross-stack coverage in one place. --dump=skip retained for local fast checks / future Node-only jobs."
  - "Diff set excludes openapi.json under --dump=skip (it isn't regenerated in that mode, so a committed-but-stale schema must not false-fail the light guard)."
metrics:
  duration: ~25m
  completed: 2026-05-21
  tasks: 2
  files: 5
---

# Phase 69 Plan 06: B5 CI Sync-Guard for Generated Contract Types Summary

A regen-all + git-diff-empty drift guard (`contract/check_contract_sync.sh`,
`make contract-check`) that fails when generated TS/Swift types drift from the
FastAPI OpenAPI schema, wired into the CI backend job so a contract change
without regenerated client types fails the build.

## What was built

- **`contract/check_contract_sync.sh`** — regenerates the three contract
  artifacts in dependency order (backend dump → web → iOS), then
  `git diff --exit-code` on exactly those paths. Exit 0 = in sync; exit 1 on
  drift, printing the stale file name(s) and the exact regen one-liner.
  `set -euo pipefail`. Repo-root-anchored so CWD is irrelevant.
  - Selectable openapi dump strategy via `--dump=` / `$CONTRACT_DUMP`:
    - `docker` (default, local): `make contract` pipes the dump script into the
      running `api` container.
    - `python` (CI backend): `python3 contract/dump_openapi.py` in-process
      (app importable via uv-synced deps).
    - `skip` (light): regen web+iOS from the committed openapi.json, diff only
      those (no backend dump needed).
- **`make contract-check`** — wraps the script (honors `$CONTRACT_DUMP`).
- **`contract/README.md`** — regen pipeline + dependency order, dump-mode table,
  CI wiring rationale, and how-to-fix-on-failure.
- **`.github/workflows/ci.yml`** — added to the existing `backend` job: Node 20
  setup + `frontend npm ci`, then `CONTRACT_DUMP=python uv run bash
  contract/check_contract_sync.sh`. Authoritative guard catching both a stale
  openapi.json and stale TS/Swift types.

## What it checks

Regenerates `contract/openapi.json` (mode-dependent), `frontend/src/api/generated/schema.ts`,
and `ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift`, then asserts
`git diff --exit-code` on those paths is empty. All three generators are
deterministic (sort_keys / sorted output, verified 69-01/02/03), so the guard
fires only on real drift, never key-order noise (T-69-06-02 mitigated).

## Gate — pass-then-fail-then-revert proof

1. **PASS on clean tree (skip mode):** `bash contract/check_contract_sync.sh --dump=skip` → exit 0, "OK — generated contract types are in sync."
2. **PASS on clean tree (docker mode, full incl. openapi.json dump):** `make contract-check` → byte-stable dump from the live docker `api`, exit 0, empty diff on all 3 paths.
3. **FAIL on drift:** injected a `__drift_probe__` property into the committed `contract/openapi.json` (simulating a backend schema change committed without regenerating client types), ran `--dump=skip` → regen produced `__drift_probe__?: string` in schema.ts and `let DriftProbe: String?` in GeneratedDTO.swift; guard exit 1, named both stale files + printed regen command.
4. **Reverted:** `git checkout --` on all 3 artifacts → clean tree restored.

Note on the realistic drift model: a raw hand-edit to a generated file is
overwritten by the regen step (correct — generated files are not hand-edited),
so the meaningful drift the guard catches is *source schema changed but client
types not regenerated+committed*, which the probe test exercises.

## Regen command documentation

`contract/README.md` — full pipeline (ordered), one-liner
(`make contract && (cd frontend && npm run gen:api) && python3 contract/gen_swift_dto.py`),
dump-mode table, and fix-on-failure steps. The same one-liner is printed by the
guard's failure message.

## Deviations from Plan

None — plan executed as written. The plan offered "dump-in-CI vs diff-only";
chose dump-in-CI (`--dump=python` in the backend job) for full coverage and kept
`--dump=skip` available, as the plan permitted ("pick the approach that keeps CI
green and still catches drift; document it").

## Verification

- `bash contract/check_contract_sync.sh --dump=skip` → exit 0 (in sync).
- `make contract-check` (docker dump) → exit 0, empty diff incl. openapi.json.
- Drift probe → exit 1 naming stale files; reverted clean.
- `.github/workflows/ci.yml` parses as valid YAML (PyYAML safe_load OK) and
  references the guard.
- `contract/README.md` documents the regen pipeline + fix-on-failure (contains `gen:api`).
- Web build untouched (only generated files round-trip identically); iOS build
  config untouched.

## Self-Check: PASSED

- FOUND: contract/check_contract_sync.sh
- FOUND: contract/README.md
- FOUND: commit 461ccf7 (Task 1)
- FOUND: commit e6448a9 (Task 2)
