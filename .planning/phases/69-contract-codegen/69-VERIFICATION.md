---
phase: 69-contract-codegen
verified: 2026-05-21T01:25:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 69: Contract Codegen (R4) Verification Report

**Phase Goal:** Единый источник истины для API-контракта — генерировать TS и Swift DTO из FastAPI OpenAPI; убрать рукописные наборы типов и «pending schema» заглушки.
**Verified:** 2026-05-21T01:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `openapi.json` deterministic, covers 8 domains, regenerable artifact | ✓ VERIFIED | `make contract` run twice → byte-identical (sha256 `e27092fd…` both runs); zero git diff vs committed. 8 domains present (see table below). |
| 2 | TS + Swift DTO generated idempotently; web + iOS build green | ✓ VERIFIED | `npm run gen:api` twice → empty diff; `gen_swift_dto.py` twice → empty diff. Web build ✓ (vite built in 290ms). iOS `xcodebuild build` → Build Succeeded, GeneratedDTO.swift compiled. |
| 3 | Key read-DTO migrated; NO "pending schema" stubs; zero regressions; all 3 test-suites green | ✓ VERIFIED | Backend 778 passed/0 failed; Web 738 passed (55 files); iOS 609 tests/0 failures. Zero "pending schema" matches in source files (only in drift-report.md docs). Read-DTOs sourced from generated `Schemas['CategoryRead'\|'MeV10Response'\|'ActualRead'\|'SubscriptionReadV10']` via adapters.ts; iOS mirrors enforced. |
| 4 | CI sync-guard fails on drift + regen documented | ✓ VERIFIED | `check_contract_sync.sh --dump=skip` PASS exit 0 on clean tree (git-diff + DTO-mirror check, 5 mirrors). Real drift test (added schema field) → exit 1, named stale files + regen cmd. CI wired with `--dump=python` (.github/workflows/ci.yml:127). README §"Regen pipeline" documents full command. |

**Score:** 4/4 truths verified

### Domain Coverage (Criterion 1)

| Domain | Paths | Example |
|--------|-------|---------|
| subscriptions | 5 | `/api/v1/subscriptions` |
| categories | 3 | `/api/v1/categories` |
| actuals | ✓ | `/api/v1/actual`, `/api/v1/actual/balance`, `/api/v1/periods/{period_id}/actual` |
| me | 9 | `/api/v1/me`, `/api/v1/me/subscription/cancel`, `/api/v1/me/tier` |
| ai | 7 | `/api/v1/ai/chat` |
| accounts | 3 | `/api/v1/accounts` |
| savings | 3 | `/api/v1/savings` |
| goals | 2 | `/api/v1/goals` |

All 8 required domains present (69 total paths). NOTE: domain is `/api/v1/actual` (singular) — substring "actuals" returns 0, but the actuals domain IS covered.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `contract/openapi.json` | deterministic dump, 8 domains | ✓ VERIFIED | 317KB, sort_keys, idempotent across 2 `make contract` runs |
| `contract/dump_openapi.py` | dump target | ✓ VERIFIED | wired via `make contract` |
| `frontend/src/api/generated/schema.ts` | openapi-typescript output | ✓ VERIFIED | idempotent; consumed by adapters.ts |
| `frontend/src/api/generated/adapters.ts` | read-DTOs onto generated | ✓ VERIFIED | CategoryRead/MeV10Response/ActualRead/SubscriptionReadV10 derived from `Schemas[...]` |
| `ios/.../Generated/GeneratedDTO.swift` | vanilla Codable codegen | ✓ VERIFIED | 83 structs/1 enum, idempotent; picked up by xcodegen (project.pbxproj), compiled in build |
| `contract/gen_swift_dto.py` | iOS codegen (stdlib) | ✓ VERIFIED | idempotent across 2 runs |
| `contract/check_contract_sync.sh` | CI sync-guard | ✓ VERIFIED | git-diff + DTO-mirror, --dump=docker\|python\|skip |
| `contract/check_dto_mirrors.py` | mirror field-set guard | ✓ VERIFIED | 5 mirrors checked, all OK |
| `contract/README.md` | regen docs | ✓ VERIFIED | §"Regen pipeline" + §"Sync-guard" |
| `tests/test_openapi_contract.py` | contract guard test | ✓ VERIFIED | 4 tests, in 778-pass suite |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| FastAPI app | openapi.json | dump_openapi.py / make contract | WIRED | deterministic dump |
| openapi.json | schema.ts | npm run gen:api | WIRED | idempotent |
| openapi.json | GeneratedDTO.swift | gen_swift_dto.py | WIRED | idempotent |
| schema.ts | read-DTOs (types.ts) | adapters.ts `Schemas[...]` | WIRED | CategoryRead/MeV10Response/ActualRead/SubscriptionReadV10 |
| GeneratedDTO.swift | xcodegen build | project.pbxproj Sources | WIRED | compiled in iOS build |
| sync-guard | CI | ci.yml --dump=python | WIRED | line 127 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| openapi determinism | `make contract` ×2 | sha256 identical | ✓ PASS |
| TS gen idempotent | `npm run gen:api` ×2 | empty git diff | ✓ PASS |
| Swift gen idempotent | `gen_swift_dto.py` ×2 | empty git diff | ✓ PASS |
| guard PASS on clean tree | `check_contract_sync.sh --dump=skip` | exit 0 | ✓ PASS |
| guard FAIL on drift | tamper schema field, run guard | exit 1, names stale files + regen cmd | ✓ PASS |
| backend suite | `pytest tests/ -q` (docker) | 778 passed, 34 skipped, 1 xpassed, 0 failed | ✓ PASS |
| web build | `npm run build` | built OK | ✓ PASS |
| web typecheck | `npm run typecheck:test` | exit 0 | ✓ PASS |
| web tests | `npx vitest run` | 738 passed (55 files) | ✓ PASS |
| iOS build | `xcodebuild build` | Build Succeeded | ✓ PASS |
| iOS tests | `xcodebuild test` | 609 tests, 0 failures | ✓ PASS |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| frontend/src/api/generated/drift-report.md | "pending schema" mentions (6) | ℹ️ Info | Documentation describing removed stubs — NOT source code. Migrated source files (types.ts, adapters.ts, CategoryV10DTO.swift) have 0 matches. No impact. |

No blocking or warning anti-patterns. No "pending schema"/"pending Phase 22"/"wire does NOT emit" in any migrated read-DTO source file.

### Human Verification Required

None. All gates are programmatically verifiable and all passed. Working tree restored clean; production docker compose restored (`docker compose up -d`).

### Gaps Summary

No gaps. All 4 ROADMAP success criteria verified against the actual codebase by running the real gates:
- Criterion 1: openapi.json deterministic + 8 domains — PASS
- Criterion 2: TS+Swift idempotent, web+iOS build green — PASS
- Criterion 3: read-DTOs migrated, no pending stubs, 3 suites green (778/738/609, 0 failures) — PASS
- Criterion 4: sync-guard fails on drift (proven exit 1) + documented — PASS

---

_Verified: 2026-05-21T01:25:00Z_
_Verifier: Claude (gsd-verifier)_
