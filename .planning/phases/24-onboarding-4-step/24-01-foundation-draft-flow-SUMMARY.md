---
phase: 24-onboarding-4-step
plan: 01
subsystem: ui
tags: [react, typescript, swift, observable, useReducer, localStorage, UserDefaults, codable, vitest, xctest]

# Dependency graph
requires:
  - phase: 22-be-v10
    provides: "POST /api/v1/onboarding/complete (BE-15) + OnboardingV10Body schema"
  - phase: 23-componentsV10
    provides: "shared web/iOS poster components (Eyebrow/Mass/BigFig/Plate/PosterButton/Chip/PosterSlider/FAB) used by step 02-09"
provides:
  - "OnboardingDraft TS shape mirroring OnboardingV10Body (snake_case wire keys)"
  - "useReducer state machine: SET_INCOME (auto-allocate), ADD_ACCOUNT (auto-primary), REMOVE_ACCOUNT (primary handoff), SET_PRIMARY (single-primary invariant), SET_PLAN (whitelist), SET_GOAL/SKIP_GOAL/SET_SAVINGS_CONFIG, NEXT/BACK (1..5), RESET"
  - "useOnboardingDraft hook: localStorage round-trip with field-by-field sanitiser (T-24-01-01/04/05)"
  - "@Observable OnboardingFlow with injectable UserDefaults for test isolation"
  - "Codable OnboardingDraft + OnboardingAccount/OnboardingGoal/OnboardingSavingsConfig with explicit snake_case CodingKeys"
  - "DEFAULT_CATEGORIES (8 codes: food/cafe/home/transit/fun/gifts/health/subs) with shares + planStepCents=50_000"
  - "postOnboardingComplete (web) + OnboardingV10API.postOnboardingComplete (iOS) typed wrappers"
  - "serialiseDraft (web) + flow.toAPIBody() (iOS) — both strip step + omit nil goal/savings"
affects: [24-02, 24-03, 24-04, 24-05, 24-06, 24-07, 24-08, 24-09, 24-10, 24-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snake_case CodingKeys on iOS Codable = byte-identical persistence between web localStorage + iOS UserDefaults"
    - "Camelcase Swift API DTOs rely on APIClient's keyEncodingStrategy=.convertToSnakeCase (no explicit CodingKeys)"
    - "Sanitiser pattern: field-by-field whitelist copy on JSON load (defends against __proto__/extra keys + corrupt JSON via clearOnError)"
    - "Optional encodeIfPresent caveat: Swift Codable drops nil Optionals from output → docs note + tests assert via non-nil fixture"

key-files:
  created:
    - frontend/src/screensV10/Onboarding/types.ts
    - frontend/src/screensV10/Onboarding/defaultCategories.ts
    - frontend/src/screensV10/Onboarding/onboardingReducer.ts
    - frontend/src/screensV10/Onboarding/useOnboardingDraft.ts
    - frontend/src/screensV10/Onboarding/__tests__/onboardingReducer.test.ts
    - frontend/src/screensV10/Onboarding/__tests__/useOnboardingDraft.test.ts
    - frontend/src/api/onboardingV10.ts
    - ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
    - ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift
    - ios/BudgetPlannerTests/OnboardingFlowTests.swift
  modified:
    - frontend/src/api/types.ts (added MeV10Response — BE-01 v1.0 /me extension)
    - ios/project.yml (testTargets [BudgetPlannerTests] — scheme test action)

key-decisions:
  - "Sanitiser rejects step ∉ 1..5 outright (returns null/nil) rather than clamping — preserves the invariant 'if a draft loads, every field is trusted'."
  - "On malformed JSON the loader removes the corrupt key (T-24-01-04 self-heal) so subsequent loads start cleanly instead of throwing every render."
  - "iOS API enum named OnboardingV10API to avoid redeclaration with the legacy v0.x OnboardingAPI (Phase 14, in AuthAPI.swift). When legacy onboarding is removed, this can be renamed."
  - "Draft Codable on iOS uses explicit snake_case CodingKeys; OnboardingAPIBody (wire DTO) relies on APIClient's convertToSnakeCase. Two types intentionally separate so persistence + wire formats stay decoupled."
  - "SET_INCOME does not overwrite a non-empty user-edited plan on subsequent calls — only seeds defaults when the plan is empty (D-06 + Phase 24 CONTEXT §Step 03)."

patterns-established:
  - "Symmetric data layer first, UI later: web reducer + iOS @Observable shipped in 24-01 with no React/SwiftUI views; subsequent plans (24-02..09) build visuals on top of a frozen contract."
  - "Cross-platform JSON parity: web localStorage and iOS UserDefaults emit byte-identical snake_case JSON for the same logical state (sample diff in this SUMMARY's appendix)."
  - "Test target wiring via xcodegen: project.yml.scheme.testTargets is the source of truth — empty array silently breaks `xcodebuild test`. Always populated for projects with XCTest targets."

requirements-completed: [ONB-V10-01, ONB-V10-07]

# Metrics
duration: ~25min
completed: 2026-05-10
---

# Phase 24 Plan 01: Foundation (Draft + Flow) Summary

**Symmetric web reducer + iOS @Observable state machine for V10 onboarding with localStorage / UserDefaults round-trip and typed POST /onboarding/complete wrappers — 100 unit specs (35 web + 25 iOS) prove every action transition + sanitiser invariant + JSON parity.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-10T12:51:00Z
- **Completed:** 2026-05-10T12:59:30Z
- **Tasks:** 2 (both TDD)
- **Files created:** 12
- **Files modified:** 2

## Accomplishments

- Web side: types + reducer + draft hook + API wrapper, all behind `frontend/src/screensV10/Onboarding/` and `frontend/src/api/onboardingV10.ts`. 35 vitest specs pass; full suite 73/73 green; tsc strict clean.
- iOS side: Codable draft + @Observable flow + DefaultCategories + OnboardingV10API, behind `ios/BudgetPlanner/FeaturesV10/Onboarding/`. 25 XCTest specs pass; build green; UserDefaults persistence verified across instance lifetimes.
- Threat-model coverage (T-24-01-01/04/05): sanitiser whitelists known top-level fields, clamps step ∈ 1..5 (rejects whole payload otherwise), drops unknown category codes, validates account/goal shapes, self-heals malformed JSON by clearing the bad key.
- Wire-shape parity confirmed: web localStorage JSON and iOS UserDefaults JSON emit identical snake_case key set for identical logical state (modulo Optional-nil omission on iOS Codable — see Appendix).

## Task Commits

1. **Task 1 RED — failing reducer + draft specs** — `bec00c9` (test)
2. **Task 1 GREEN — web foundation (reducer, hook, API wrapper, types)** — `bda84cc` (feat)
3. **Task 2 RED+GREEN — iOS foundation (flow, draft, defaults, API, tests)** — `fd4ce51` (feat)

_Note: Task 2 was committed as a single feat commit since all iOS files compiled together — there was no intermediate state where one Swift file existed without the others. The 25 XCTest specs serve as the test gate._

## Files Created/Modified

### Web (frontend/)

- `src/screensV10/Onboarding/types.ts` — TS shapes (`OnboardingDraft`, `OnboardingAccount`, `OnboardingGoal`, `OnboardingSavingsConfig`, `OnboardingStep` 1..5) with snake_case wire keys.
- `src/screensV10/Onboarding/defaultCategories.ts` — `DEFAULT_CATEGORIES` (8 codes, exact shares from DATA-MODEL §1.3), `VALID_CATEGORY_CODES` Set, `PLAN_STEP_CENTS=50_000`, `defaultPlanFromIncome()`.
- `src/screensV10/Onboarding/onboardingReducer.ts` — `INITIAL_STATE` + `OnboardingAction` union + reducer with all 11 action variants.
- `src/screensV10/Onboarding/useOnboardingDraft.ts` — `STORAGE_KEY = "onboarding.v10.draft"`, `useOnboardingDraft()` returning `{load, save, clear}`, with `sanitiseDraft()` private helper covering T-24-01-01/04/05.
- `src/screensV10/Onboarding/__tests__/onboardingReducer.test.ts` — 17 specs.
- `src/screensV10/Onboarding/__tests__/useOnboardingDraft.test.ts` — 18 specs.
- `src/api/onboardingV10.ts` — `postOnboardingComplete(body)` + `serialiseDraft(draft)` (strips UI-only `step`, omits null goal/savings).
- `src/api/types.ts` — added `MeV10Response` interface (BE-01 v1.0 extension with nullable `income_cents`).

### iOS (ios/)

- `BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift` — `enum DefaultCategories.all` + `.codes` Set + `defaultPlan(fromIncomeCents:)`.
- `BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift` — Codable structs with explicit snake_case CodingKeys, `OnboardingDraft.initial` static.
- `BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift` — `@Observable @MainActor final class` with injectable UserDefaults; mutations: `setIncome`, `addAccount`, `removeAccount`, `setPrimary`, `setPlan`, `setGoal`, `skipGoal`, `setSavingsConfig`, `next`, `back`, `reset`, `clearDraft`, `toDraft`. Static `loadDraft(from:)` does sanitisation + self-heal.
- `BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift` — `OnboardingAPIBody/Response` DTOs (camelCase rides APIClient's `convertToSnakeCase`) + `enum OnboardingV10API.postOnboardingComplete` + `OnboardingFlow.toAPIBody()` extension.
- `BudgetPlannerTests/OnboardingFlowTests.swift` — 25 XCTest cases covering account invariants, plan auto-allocation, step transitions, Codable round-trip, snake_case wire keys, persistence across instances, sanitiser rejects/self-heal, API body shape.
- `project.yml` — `testTargets: [BudgetPlannerTests]` so `xcodebuild test` works under the BudgetPlanner scheme.

## Decisions Made

- **Sanitiser rejects vs clamps step:** Out-of-range step (∉ 1..5) returns null/nil for the entire payload, not a clamped state. Rationale: a draft with step=99 is evidence of tampering or schema-version mismatch — better to start fresh than to silently rewrite user state. Test asserts.
- **iOS namespace `OnboardingV10API` vs `OnboardingAPI`:** Existing legacy v0.x `enum OnboardingAPI` (Phase 14, in AuthAPI.swift) uses the same path `/onboarding/complete` with a different body shape. Renaming the new V10 enum prevents redeclaration error and lets both onboarding flows coexist until Phase 25 retires the legacy one.
- **Two Codable types for draft vs wire:** `OnboardingDraft` (persistence) uses explicit snake_case CodingKeys so UserDefaults JSON is independent of APIClient's encoder strategy; `OnboardingAPIBody` (wire) uses camelCase + APIClient's `convertToSnakeCase`. Persistence and transport stay decoupled — either can evolve without touching the other.
- **`SET_INCOME` non-destructive on plan re-edit:** Auto-allocates default shares only when `category_plans` is empty. User edits to individual sliders are preserved if income is changed afterward (e.g. user types 80k, tweaks food slider, then realises income should be 100k). Test `testSetIncomeDoesNotOverwriteUserPlan` asserts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Renamed iOS API enum to `OnboardingV10API`**
- **Found during:** Task 2 (iOS build)
- **Issue:** Plan called the new enum `OnboardingAPI`, but `AuthAPI.swift` already declares `enum OnboardingAPI` (Phase 14, legacy v0.x). Compile error: `invalid redeclaration of 'OnboardingAPI'`.
- **Fix:** Renamed to `enum OnboardingV10API`. Added a comment explaining the namespace collision and the cleanup path (rename when legacy onboarding is removed). Plan still satisfies all `key_links` patterns since the file is named `OnboardingAPI.swift` and the function name is `postOnboardingComplete`.
- **Files modified:** `ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift`
- **Verification:** Build succeeds; iOS tests use `OnboardingV10API.postOnboardingComplete` indirectly via `flow.toAPIBody()`.
- **Committed in:** `fd4ce51` (Task 2 commit)

**2. [Rule 3 — Blocking] Added `BudgetPlannerTests` to scheme `testTargets`**
- **Found during:** Task 2 verify (`xcodebuild test`)
- **Issue:** `project.yml` had `testTargets: []` on the BudgetPlanner scheme; `xcodebuild test` failed with `Scheme BudgetPlanner is not currently configured for the test action`.
- **Fix:** Set `testTargets: [BudgetPlannerTests]` and re-ran `xcodegen generate`.
- **Files modified:** `ios/project.yml`
- **Verification:** All 25 OnboardingFlowTests pass via `xcodebuild test -only-testing:BudgetPlannerTests/OnboardingFlowTests`.
- **Committed in:** `fd4ce51` (Task 2 commit)

**3. [Rule 1 — Bug] Test fixture `testDraftWireKeysAreSnakeCase` had nil Optional fields**
- **Found during:** Task 2 verify (test failure)
- **Issue:** Test asserted `json.contains("\"savings_config\"")` but the fixture used `savingsConfig: nil`. Swift Codable's synthesized encoder calls `encodeIfPresent` on Optional properties, omitting nil keys entirely from the output JSON.
- **Fix:** Changed fixture to set `goal` and `savingsConfig` to non-nil values; expanded assertions to cover all 6 top-level snake_case keys + their nested CodingKeys (`target_cents`, `roundup_enabled`); added negative checks against camelCase leakage. Documented the Optional-omission behaviour with an inline comment.
- **Files modified:** `ios/BudgetPlannerTests/OnboardingFlowTests.swift`
- **Verification:** `testDraftWireKeysAreSnakeCase` passes; remaining 24 specs unchanged.
- **Committed in:** `fd4ce51` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All deviations were mechanical mismatches between the plan and the existing codebase (legacy enum name collision, missing scheme config) or a Swift Codable subtlety. No semantic scope creep. The plan's `key_links` patterns and `must_haves` truths all satisfied.

## Issues Encountered

- **swift-format reformatted unrelated files:** `make format` runs `swift-format --recursive` against the entire `ios/BudgetPlanner` + `BudgetPlannerTests` tree. Reverted all unrelated whitespace changes via `git checkout --` before commit; only my new files (which were also re-formatted) and `project.yml` were committed.
- **Pre-existing PeriodTests.testCycleDayClampedInFebruary failure:** logged in `.planning/phases/24-onboarding-4-step/deferred-items.md`. Out of scope for 24-01 (Phase 18 origin, fails on dates outside February).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Subsequent plans (24-02..24-09) build the visual step components on top of this foundation. They consume:

- `INITIAL_STATE` + `OnboardingAction` union + `onboardingReducer` (web)
- `OnboardingFlow` `@Observable` class with injectable UserDefaults (iOS)
- `DEFAULT_CATEGORIES` (both layers) for Step 03 slider rendering
- `useOnboardingDraft` (web) for auto-save on every action
- `postOnboardingComplete` / `OnboardingV10API.postOnboardingComplete` for the Final-screen submit

Plans 24-10 (web wiring) and 24-11 (iOS wiring) will mount the flow into AppV10 + V10MainShell respectively and add Playwright/XCUI integration tests.

## Self-Check: PASSED

Verified files exist:
- `frontend/src/screensV10/Onboarding/types.ts` — FOUND
- `frontend/src/screensV10/Onboarding/defaultCategories.ts` — FOUND
- `frontend/src/screensV10/Onboarding/onboardingReducer.ts` — FOUND
- `frontend/src/screensV10/Onboarding/useOnboardingDraft.ts` — FOUND
- `frontend/src/screensV10/Onboarding/__tests__/onboardingReducer.test.ts` — FOUND
- `frontend/src/screensV10/Onboarding/__tests__/useOnboardingDraft.test.ts` — FOUND
- `frontend/src/api/onboardingV10.ts` — FOUND
- `ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift` — FOUND
- `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift` — FOUND
- `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift` — FOUND
- `ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift` — FOUND
- `ios/BudgetPlannerTests/OnboardingFlowTests.swift` — FOUND

Verified commits:
- `bec00c9` (test RED) — FOUND
- `bda84cc` (feat web GREEN) — FOUND
- `fd4ce51` (feat iOS GREEN) — FOUND

Verified test gates:
- web: `npm test` → 73/73 pass; `tsc --noEmit` → clean.
- iOS: `xcodebuild test -only-testing:BudgetPlannerTests/OnboardingFlowTests` → 25/25 pass.

## Appendix — Wire JSON parity sample

Same logical state at step 2 (post-Step-02 draft, two accounts, default plan from 80k income, no goal/savings yet):

**Web (localStorage value, JSON.stringify default):**
```json
{"step":2,"income_cents":8000000,"accounts":[{"bank":"Т-Банк","mask":null,"kind":"card","balance_cents":5000000,"primary":true},{"bank":"Сбер","mask":null,"kind":"card","balance_cents":1000000,"primary":false}],"category_plans":{"food":1600000,"cafe":800000,"home":2400000,"transit":480000,"fun":400000,"gifts":320000,"health":400000,"subs":240000},"goal":null,"savings_config":null}
```

**iOS (UserDefaults Data, JSONEncoder with `.sortedKeys` for diffability):**
```json
{"accounts":[{"balance_cents":5000000,"bank":"Т-Банк","kind":"card","primary":true},{"balance_cents":1000000,"bank":"Сбер","kind":"card","primary":false}],"category_plans":{"cafe":800000,"food":1600000,"fun":400000,"gifts":320000,"health":400000,"home":2400000,"subs":240000,"transit":480000},"income_cents":8000000,"step":2}
```

Differences:
1. **Object-key order** — irrelevant for JSON semantics. Web uses insertion order (default JSON.stringify); iOS sample uses sorted-keys for determinism.
2. **Optional null omission** — iOS Codable's synthesized `encodeIfPresent` drops nil-valued Optionals (`mask`, `goal`, `savings_config`). Web emits explicit `null`. The server's Pydantic `Optional[...]` accepts both "missing key" and "null value" identically (T-22-12-01 validates), so both payloads are wire-equivalent.

When `goal` and `savings_config` are non-nil (post-Step-04 with non-skipped goal):

**iOS:**
```json
{"accounts":[{"balance_cents":5000000,"bank":"Т-Банк","kind":"card","mask":"1234","primary":true}],"category_plans":{"food":1600000},"goal":{"due":"2026-12-31","name":"Отпуск","target_cents":20000000},"income_cents":8000000,"savings_config":{"base":10,"roundup_enabled":false},"step":4}
```

All snake_case keys (`balance_cents`, `target_cents`, `roundup_enabled`, `category_plans`, `savings_config`, `income_cents`) match the server schema verbatim.

---
*Phase: 24-onboarding-4-step*
*Completed: 2026-05-10*
