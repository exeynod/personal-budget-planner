---
phase: 69-contract-codegen
plan: 02
subsystem: api
tags: [openapi-typescript, codegen, contract, drift-report, web-types, typescript]

# Dependency graph
requires:
  - phase: 69-01
    provides: "contract/openapi.json — FastAPI OpenAPI dump (CategoryRead v1.0 fields code/ord required; plan_cents/rollover/paused/parent_id/tag defaulted)"
provides:
  - "openapi-typescript@^7.13.0 devDep + gen:api script (idempotent, byte-identical regen)"
  - "frontend/src/api/generated/schema.ts — generated source-of-truth web types (paths + components namespaces)"
  - "frontend/src/api/generated/drift-report.md — per-DTO generated-vs-handwritten diff; the 69-04 migration checklist"
  - "frontend/src/api/generated/README.md — generated-only contract + regen flow"
affects: [69-04, 69-05]

# Tech tracking
tech-stack:
  added: [openapi-typescript@^7.13.0]
  patterns: ["contract→codegen chain: make contract (BE OpenAPI dump) → npm run gen:api (web types); generated/ is generated-only, never hand-edited"]

key-files:
  created:
    - frontend/src/api/generated/schema.ts
    - frontend/src/api/generated/drift-report.md
    - frontend/src/api/generated/README.md
  modified:
    - frontend/package.json
    - frontend/package-lock.json

key-decisions:
  - "openapi-typescript v7 renders defaulted response fields (plan_cents/rollover/paused/tag) as NON-optional (always present on the wire) — only required-no-default fields and bare-optional nullable fields differ; documented this rendering rule in the drift-report so 69-04 tightens stubs correctly."
  - "Kept generated schema.ts shape as-is (paths + components namespaces) — adapter mapping onto call-sites deferred to 69-04 per CONTEXT."
  - "Flagged the SubscriptionRead name collision: contract SubscriptionRead is the tier/billing shape; the CRUD wire DTO is SubscriptionReadV10 — 69-04 must map handwritten SubscriptionRead onto SubscriptionReadV10."

patterns-established:
  - "generated/ dir is generated-only (README + idempotency check guard hand-edits; B5 sync-guard will reinforce)"
  - "drift-report.md as the explicit, reviewable diff before any consumer migration (no silent type drift)"

requirements-completed: [B2]

# Metrics
duration: 12min
completed: 2026-05-21
---

# Phase 69 Plan 02: Web codegen (openapi-typescript) + drift-report Summary

**openapi-typescript@7.13.0 generating a 6640-line source-of-truth `schema.ts` from `contract/openapi.json` (idempotent), plus a per-DTO drift-report catching the missing `tag` field and the CategoryV10 "pending schema" stub drift — generation + diff only, no consumer migration (deferred to 69-04).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-21T00:30Z (approx)
- **Completed:** 2026-05-21
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Installed `openapi-typescript@^7.13.0` (TS ^5.6-compatible) + added `gen:api` script reading `../contract/openapi.json`.
- Generated `frontend/src/api/generated/schema.ts` (6640 lines, `paths` + `components["schemas"]` namespaces); **idempotent** — regen twice yields a byte-identical file.
- Produced `drift-report.md`: full per-DTO diff (CategoryRead/V10, SubscriptionReadV10, MeV10Response, ActualRead/V10) with required-vs-optional analysis and a 69-04 migration checklist.
- All three web gates green with zero consumer changes: build (tsc -b + vite), typecheck:test, vitest **738 passed** (Phase 68 baseline preserved exactly).

## Task Commits

1. **Task 1: install openapi-typescript + gen:api script + generate schema.ts** — `113104c` (feat)
2. **Task 2: drift report (generated vs handwritten) + green gates** — `4354d22` (docs)

**Plan metadata:** (final commit below) (docs: complete plan)

## Files Created/Modified
- `frontend/src/api/generated/schema.ts` — generated openapi-typescript output (source of truth for web DTOs)
- `frontend/src/api/generated/drift-report.md` — generated-vs-handwritten diff + 69-04 checklist
- `frontend/src/api/generated/README.md` — generated-only contract + `npm run gen:api` regen flow
- `frontend/package.json` — `openapi-typescript` devDep + `gen:api` script
- `frontend/package-lock.json` — lockfile update

## Drift-report highlights (the 69-04 checklist)

**Missing-field drifts (must ADD in 69-04):**
- `CategoryRead`/`CategoryV10` — **`tag`** (`"personal"|"business"|"mixed"`, default "personal", Phase 36). The headline drift: emitted on the wire, **absent from the handwritten `CategoryV10`** (and the bare v0.x `CategoryRead`). Add a `CategoryTag` union.
- `ActualRead`/`ActualV10Read` — **`tag`** (`string | null`, optional). Both handwritten Actual DTOs lack it.

**Required/optional tightening (drop "pending schema" stubs):**
- `CategoryV10.code` / `.ord` — **now required-on-wire** (no server default) → drop the `?` (and `code`'s `| null`).
- `CategoryV10.plan_cents` / `.rollover` / `.paused` — carry **server defaults** → openapi-typescript renders them non-optional (always present); drop the "pending schema" comments. `parent_id?: number | null` already matches the generated optional shape.
- Bare v0.x `CategoryRead` (types.ts:33) is missing ALL v1.0 fields → promote to the v1.0 shape so the nested `SubscriptionReadV10.category` carries them.

**Name-collision / nullability flags:**
- Contract `SubscriptionRead` (tier/billing) ≠ handwritten `SubscriptionRead` (CRUD); the CRUD wire DTO is `SubscriptionReadV10`.
- v0.x `ActualRead.kind` is too narrow (`CategoryKind`, 2 values) vs the wire's 4 (`expense|income|roundup|deposit`) — use `ActualV10Kind`.
- `ActualV10Read.account_id` / `.parent_txn_id` — generated **optional** vs handwritten required; keep optional in 69-04 to match the wire (avoid runtime `undefined` crash).

**Matches (no action):** `MeV10Response` (exact, incl. nullability), Subscription v10 ext fields (`account_id`/`day_of_month`/`posted_txn_id` all optional+nullable).

## Gate results
- `npm run gen:api` idempotent — regen twice → byte-identical `schema.ts` (verified via `diff -q`).
- `npm run build` (tsc -b + vite) — green.
- `npm run typecheck:test` (tsc -p tsconfig.test.json --noEmit) — green.
- `npx vitest run` — **738 passed (55 files)**, matches Phase 68 baseline exactly.

## Decisions Made
- Documented openapi-typescript v7's defaulted-field rendering (defaulted response fields → non-optional/always-present) in the drift-report, since it changes how the "pending schema" optional stubs should be tightened in 69-04.
- Left generated `schema.ts` in its native `paths`/`components` shape; adapter/call-site mapping is 69-04's job.

## Deviations from Plan

None - plan executed exactly as written. Generation + diff only; no consumer/types.ts code touched.

## Issues Encountered
None. A pre-existing unrelated working-tree change (`tests/test_worker_charge.py`) was left untouched (out of scope, not staged).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `schema.ts` + `drift-report.md` are the inputs for **69-04** (read-DTO-first consumer migration). The report makes that migration mechanical: add `tag` (Category + Actual), tighten the CategoryV10 stubs, resolve the SubscriptionRead name collision.
- No blockers.

## Self-Check: PASSED

- All 3 generated files exist on disk.
- Both task commits (`113104c`, `4354d22`) present in git history.
- `gen:api` script present in package.json.

---
*Phase: 69-contract-codegen*
*Completed: 2026-05-21*
