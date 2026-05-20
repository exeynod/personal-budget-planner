---
phase: 69-contract-codegen
plan: 04
subsystem: api
tags: [openapi-typescript, codegen, contract, web-types, read-dto, adapters, typescript]

# Dependency graph
requires:
  - phase: 69-02
    provides: "frontend/src/api/generated/schema.ts (components['schemas']) + drift-report.md — the migration checklist"
provides:
  - "frontend/src/api/generated/adapters.ts — hand-written generated→consumer-name seam (CategoryV10, MeV10Response, SubscriptionV10Read, ActualV10Read, CategoryRollover, CategoryTag, ActualV10Kind, UserRole)"
  - "Web read-DTOs (CategoryRead/CategoryV10, Subscription*, Me*, Actual*) sourced from the generated schema instead of duplicate handwritten field lists"
  - "tag field on the wire now typed (CategoryV10: 'personal'|'business'|'mixed'; ActualV10Read: enum-union | null)"
affects: [69-05, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "adapters.ts seam: generated components['schemas']['X'] aliased onto consumer names; handwritten types.ts re-exports the alias so call-sites don't churn"
    - "field-level override at the adapter (Omit + Partial<Pick> / Omit + & { role: UserRole }) where the generated rendering must be loosened (defaulted fields optional) or narrowed (role → UserRole domain union)"

key-files:
  created:
    - frontend/src/api/generated/adapters.ts
  modified:
    - frontend/src/api/types.ts
    - frontend/src/api/v10/categories.ts
    - frontend/src/screensV10/AddSheet/__tests__/AddSheet.test.tsx
    - frontend/src/screensV10/Accounts/__tests__/AccountDetailView.test.tsx
    - frontend/src/screensV10/Analytics/__tests__/computeAnalytics.test.ts
    - frontend/src/screensV10/Home/__tests__/computeHomeData.test.ts
    - frontend/src/screensV10/Plan/__tests__/computePlan.test.ts
    - frontend/src/screensV10/Subscriptions/__tests__/SubscriptionsView.test.tsx
    - frontend/src/screensV10/Subscriptions/__tests__/computeSubscriptions.test.ts

key-decisions:
  - "code/ord typed NON-optional (in OpenAPI required set, no default) — matches the wire and the drift-report; fixtures that omitted them were updated to supply realistic values (no behaviour change)."
  - "plan_cents/rollover/paused/parent_id/tag kept OPTIONAL on CategoryV10 via an Omit+Partial<Pick> override of the generated CategoryRead. The generated schema renders the defaulted ones non-optional, but the plan must_haves require them optional AND computeHomeData.test.ts has an explicit 'missing optional fields by defaulting' regression — making them required would break that defensive contract / delete a meaningful test. Optional is the safe, must_haves-compliant choice (threat T-69-04-01)."
  - "MeV10Response.role overridden from generated free-string to the UserRole domain union (owner|member|revoked) — the contract serialises the enum as plain string but consumers narrow on it (me.role === 'owner')."
  - "SubscriptionV10Read mapped onto generated SubscriptionReadV10 (the CRUD DTO), NOT the same-named contract SubscriptionRead (tier/billing). Nested category is now the generated v1.0 CategoryRead (raw, all defaulted fields present)."
  - "ActualV10Read.account_id/parent_txn_id stay optional+nullable (generated rendering) — loosens the prior handwritten non-optional shape to match the wire; all consumers already guard with != null / === so no behaviour change (drift #8)."
  - "Write/request payload types (CategoryV10UpdatePayload, SubscriptionV10UpdatePayload, ActualV10CreatePayload, SubscriptionV10Ext) left handwritten — deferred to Phase 70/backlog per 69-CONTEXT."

# Metrics
metrics:
  duration: ~7 min
  tasks_completed: 2
  files_created: 1
  files_modified: 9
  tests: 738 passed (Phase 68 baseline)
  completed: 2026-05-21
---

# Phase 69 Plan 04: Web read-DTO migration onto generated types Summary

Migrated the most-drifted web read-DTOs (`CategoryRead`/`CategoryV10`, `Subscription*`, `Me*`, `Actual*`) off duplicate handwritten field lists and onto the generated `schema.ts` via a thin hand-written `generated/adapters.ts` seam; removed every "pending schema" stub + obsolete schema-gap comment and added the previously-untyped `tag` field — zero behavioural regression (738/738 vitest green).

## What was built

- **`frontend/src/api/generated/adapters.ts`** — the single seam mapping generated `components['schemas']` read DTOs onto the names consumers already import. Exposes `CategoryV10`, `CategoryRollover`, `CategoryTag`, `MeV10Response`, `SubscriptionV10Read`, `ActualV10Read`, `ActualV10Kind`, `UserRole`. `schema.ts` stays generated-only; this file is the hand-written mapping layer.
- **`types.ts`** — `CategoryV10`, `MeV10Response`, `SubscriptionV10Read`, `ActualV10Read`/`ActualV10Kind` re-exported from the adapter; their handwritten field lists + obsolete comments deleted. Write payloads + `SubscriptionV10Ext` untouched.
- **`v10/categories.ts`** — deleted the "Schema gap (documented in 25-03 SUMMARY)" comment block + the stale "once Phase 22 widens CategoryRead" note.

### DTOs migrated (what / how typed)
| DTO | Source | Required-on-wire | Optional |
|-----|--------|------------------|----------|
| `CategoryV10` | `CategoryRead` | id, name, kind, is_archived, sort_order, created_at, **code**, **ord** | plan_cents, rollover, paused, parent_id, **tag** (kept optional per must_haves) |
| `MeV10Response` | `MeV10Response` | all (role narrowed to `UserRole`) | tg_chat_id, onboarded_at, income_cents (nullable) |
| `SubscriptionV10Read` | `SubscriptionReadV10` | id, name, amount_cents, cycle, next_charge_date, category_id, notify_days_before, is_active, category(v1.0) | account_id, day_of_month, posted_txn_id |
| `ActualV10Read` | `ActualRead` | id, period_id, kind(4-val), amount_cents, description, category_id, tx_date, source, created_at | account_id, parent_txn_id, **tag** |

### Stubs / comments removed
- `types.ts`: the `CategoryV10` "pending Phase 22 schema update" stub block (`code?`/`ord?`/`plan_cents?`/`rollover?`/`paused?`/`parent_id?`), the `CategoryRollover` "as of Phase 22 ... does NOT yet emit" note, the `SubscriptionV10Ext` "до full schema deploy" note, the `ActualV10Read` schema-gap comments.
- `v10/categories.ts`: the full "Schema gap (documented in 25-03 SUMMARY)" header block + stale `listCategoriesV10` comment.
- grep for `pending schema|schema gap|wire does NOT emit|pending Phase 22|until ... Phase 22|до full schema` across all 8 migrated read-DTO files → **0 matches**.

### `tag` added where
- `CategoryV10` — `tag: 'personal'|'business'|'mixed'` (optional), Phase 36, was missing entirely.
- `ActualV10Read` — `tag?: ('personal'|'business'|'mixed') | null` (the generated source narrows it to the enum union rather than free `string`; using the generated truth).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Defaulted CategoryV10 fields kept optional via adapter override**
- **Found during:** Task 1 — direct alias `CategoryV10 = CategoryRead` made `plan_cents/rollover/paused/tag` non-optional (openapi-typescript renders defaulted fields as always-present).
- **Issue:** The plan must_haves require these STAY optional, and `computeHomeData.test.ts` has an explicit "missing optional fields by defaulting" regression that constructs a CategoryV10 omitting them. Direct alias broke that test's fixture.
- **Fix:** `CategoryV10 = Omit<CategoryRead, defaulted> & Partial<Pick<CategoryRead, defaulted>>` — keeps `code`/`ord` required (per must_haves) while preserving the defensive optionality of the server-defaulted fields. No runtime change.
- **Files:** `generated/adapters.ts`
- **Commit:** 835388c

**2. [Rule 1 - Bug] MeV10Response.role widening guarded**
- **Found during:** Task 2 — generated `MeV10Response.role` is free `string`; the handwritten type used `UserRole`. Aliasing directly would widen the domain union.
- **Fix:** adapter override `Omit<..., 'role'> & { role: UserRole }`. Prevents loss of narrowing for `me.role === 'owner'` consumers.
- **Files:** `generated/adapters.ts`
- **Commit:** 835388c

**3. [Rule 3 - Blocking] Test fixtures updated to supply now-required code/ord (+ nested category v1.0 fields)**
- **Found during:** Tasks 1 & 2 — making `code`/`ord` required, and the generated `SubscriptionReadV10.category` being the raw v1.0 `CategoryRead`, surfaced fixtures that built bare v0.x category objects.
- **Fix:** added realistic `code`/`ord` (and full v1.0 category fields in the 3 subscription fixtures) to: AddSheet, AccountDetailView, computeAnalytics, computeHomeData, computePlan, SubscriptionsView, computeSubscriptions tests. Assertions unchanged — fixtures are now wire-realistic.
- **Commit:** 835388c

Note: types.ts spans both tasks (single file), so the two-task work was committed as one cohesive read-DTO-migration commit rather than split mid-file.

## Threat mitigations applied
- **T-69-04-01 (nullability):** required/optional taken verbatim from the generated `required` set; `code`/`ord` required, defaulted fields kept optional, `account_id`/`parent_txn_id` kept optional — no field made non-optional that legacy data could violate.
- **T-69-04-02 (silent behaviour change):** full web suite (build + typecheck:test + 738 vitest) green; only types changed, wire body untouched.

## Gate results
- `npm run build` (tsc -b + vite) — green
- `npm run typecheck:test` (tsc -p tsconfig.test.json) — green
- `npx vitest run` — **738 passed (55 files)**, matches Phase 68 baseline (zero regression)
- stub/comment grep across migrated files — 0 matches

## Known Stubs
None — the migration removed the stub Optionals and obsolete comments.

## Self-Check: PASSED
- `frontend/src/api/generated/adapters.ts` — FOUND
- commit 835388c — FOUND
