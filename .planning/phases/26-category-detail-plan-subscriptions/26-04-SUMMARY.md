---
phase: 26-category-detail-plan-subscriptions
plan: 04
subsystem: ui
tags: [react, typescript, vitest, posterRouter, plan-month, posterSlider, regulars, single-patch, tdd]

# Dependency graph
requires:
  - phase: 26-category-detail-plan-subscriptions
    plan: 01
    provides: "PATCH /api/v1/plan-month — atomic batch plan-cents update with Σplan ≤ income validation; PATCH /categories/:id rollover field"
  - phase: 26-category-detail-plan-subscriptions
    plan: 02
    provides: "CategoryDetailMount + PLAN_FOCUS_TODO marker for «+ ПОДНЯТЬ ЛИМИТ» retrofit; updateCategoryV10 wrapper"
  - phase: 25-home-transactions-add-sheet
    plan: 02
    provides: "PosterRouterProvider / usePosterRouter / common barrel"
  - phase: 25-home-transactions-add-sheet
    plan: 03
    provides: "listCategoriesV10 / listActualV10 / CategoryV10 / ActualV10Read types"
  - phase: 25-home-transactions-add-sheet
    plan: 04
    provides: "HomeMount push-target receiver — PlanMount swaps in for PlanViewPlaceholder"
  - phase: 24-onboarding-v10
    provides: "Step03Plan reference (8 sliders pattern); Toast component (componentsV10)"
  - phase: 23-design-system-foundation
    provides: "PosterSlider / Chip / PosterButton / Mass / Eyebrow / cobalt-yellow-red tokens"
  - phase: 22-v10-data-model
    provides: "/api/v1/me MeV10Response.income_cents (BE-01); SubscriptionV10 ext fields (BE-12); subscription post/unpost endpoints (BE-13)"

provides:
  - "patchPlanMonth(plans) — typed wrapper for PATCH /api/v1/plan-month (atomic batch save with overflow handling)"
  - "listSubscriptionsV10/postSubscription/unpostSubscription/patchSubscriptionV10/deleteSubscription — V1.0 subscriptions surface (used by Plan 26-04 regulars block + Plan 26-06 SubscriptionsMount)"
  - "PlanMonthItem/PlanMonthPatchPayload/PlanMonthResponse/SubscriptionV10Read/SubscriptionV10UpdatePayload/SubscriptionPostResponse — typed wire shapes"
  - "Pure compute helpers (computeSurplus / computeIsOverflow / computeRolloverAggregates / computeRegularsList / applyPlanEdit / plansFromCategories) — no React, no fetch, deterministic"
  - "PlanView presentational component (PLAN-V10-01..06: cobalt poster, Mass «PLAN МЕСЯЦА.», surplus plate yellow OK / red OVER, 2 rollover aggregate plates, regulars post/unpost block, N category PosterSliders + chip-pair (rollover), inline overflow error, СОХРАНИТЬ CTA)"
  - "PlanMount data-fetcher orchestrating parallel listCategoriesV10 + listSubscriptionsV10 + getCurrentPeriod + getMeV10 + sequential listActualV10; immutable applyPlanEdit on slider drag; optimistic chip PATCH; post/unpost reload + Toast; submit → patchPlanMonth → 200 toast + router.pop / 400 inline overflow message"
  - "Plan/index.ts barrel re-exporting Mount/View/Props + 6 helpers + RegularRow/RolloverAggregates types"
  - "HomeMount swap: PLAN-bar tap now pushes the real PlanMount (placeholder removed)"
  - "CategoryDetailMount swap: «+ ПОДНЯТЬ ЛИМИТ» now pushes <PlanMount focusCategoryId={catId} /> deep-link (PLAN_FOCUS_TODO marker resolved)"

affects:
  - 26-05-ios-plan        (parallel iOS counterpart — same compute formulas, byte-identical numbers; ran concurrently in another worktree)
  - 26-06-web-subscriptions  (will reuse listSubscriptionsV10 + patchSubscriptionV10 + deleteSubscription wrappers added here)
  - 26-07-ios-subscriptions  (iOS counterpart — uses parallel SubscriptionsV10API)
  - 27                    (PlanViewPlaceholder export still lives in _placeholders.tsx as no-op for safety; remove in cleanup)
  - 28                    (window.alert on PATCH chip failure → upgrade to PosterToast; slider tap-to-input UX polish)

# Tech tracking
tech-stack:
  added: []   # all dependencies already present (react 18, vitest, @testing-library/react)
  patterns:
    - "Triad of pure-helpers + props-only view + router-bound mount (now applied to Home, Transactions, CategoryDetail, Plan)."
    - "Atomic batch endpoint — single PATCH /plan-month replaces N updateCategoryV10 calls (no race, server-side Σ validation)."
    - "Optimistic chip PATCH — replace state.categories with server-returned row from updateCategoryV10."
    - "Reload-token pattern after post/unpost — re-runs full effect to refresh subscription posted_txn_id state."
    - "Toast UX (T-26-04-02) — every post/unpost shows ✓ confirmation; user can undo via inline button without leaving the screen."
    - "ApiError(status=400) → inline overflow message (saveError state) without window.alert (kept alert only for the chip endpoint per Plan 26-02 minimum-viable convention)."
    - "PosterSlider built-in 300ms debounce on onCommit — but mount aggregates edits in local state and PATCHes only on submit, so onCommit is currently optional."
    - "scrollIntoView({behavior: 'smooth', block: 'center'}) deep-link from CategoryDetail focus param."

key-files:
  created:
    - frontend/src/api/v10/planMonth.ts
    - frontend/src/api/v10/subscriptions.ts
    - frontend/src/screensV10/Plan/computePlan.ts
    - frontend/src/screensV10/Plan/__tests__/computePlan.test.ts
    - frontend/src/screensV10/Plan/PlanView.tsx
    - frontend/src/screensV10/Plan/PlanView.module.css
    - frontend/src/screensV10/Plan/__tests__/PlanView.test.tsx
    - frontend/src/screensV10/Plan/PlanMount.tsx
    - frontend/src/screensV10/Plan/__tests__/PlanMount.test.tsx
    - frontend/src/screensV10/Plan/index.ts
  modified:
    - frontend/src/api/types.ts                              # +6 types: SubscriptionV10Ext/Read/UpdatePayload, SubscriptionPostResponse, PlanMonthItem/PatchPayload/Response
    - frontend/src/api/v10/index.ts                          # re-exports for plan-month + subscriptions surface
    - frontend/src/screensV10/Home/HomeMount.tsx             # swap PlanViewPlaceholder → PlanMount
    - frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx  # swap PlanViewPlaceholder → PlanMount with focusCategoryId

key-decisions:
  - "Single PATCH /plan-month endpoint instead of N updateCategoryV10 calls. Backend (Plan 26-01) validates Σplan ≤ income atomically; client gets {error: 'plan_overflow', income_cents, sum_plan_cents} on 400 to display inline. This eliminates race conditions (N concurrent PATCHes could leave plan in inconsistent overflow state) and provides a single submit gate for the user."
  - "Plans state is mount-controlled (not category-derived). On load, plansFromCategories(categories) seeds the draft from persisted plan_cents; slider drag mutates plans via applyPlanEdit (immutable). categories is also updated optimistically by chip PATCH (rollover field), but slider edits never round-trip until submit. This keeps the UI snappy and the network surface atomic."
  - "Sort visible categories by ord ASC (e.g. '01', '02', ...) for stable display. Falls back to '99' for missing ord (legacy v0.x rows). Mirrors HomeView aggregate ordering convention."
  - "Filter savings + paused categories from the visible list (computeRolloverAggregates + plansFromCategories also skip them). System 'savings' category is pseudo-row for backend bookkeeping; paused are user-archived. Both are excluded from the surplus denominator and from the slider list."
  - "ApiError(400) → inline saveError; ApiError(other) → saveError with raw message; non-Api error → fallback message. The chip PATCH still uses window.alert (T-26-02-04 convention); upgrade to PosterToast deferred to Phase 28."
  - "Toast brief delay (600ms) before router.pop after successful submit — gives user time to read «✓ ПЛАН СОХРАНЁН» before sliding back to Home/CategoryDetail."
  - "PosterButton variant: yellow tone is implemented via the surplus plate's .ok background color, not via PosterButton (which only supports primary/ghost/destructive). The save CTA uses 'primary' when enabled, 'ghost' when disabled (overflow). This matches existing button vocabulary; a yellow CTA variant is a Phase 28 polish add."
  - "scrollIntoView smooth + center for focusCategoryId — gives the deep-link from CategoryDetail a clear visual cue (the focused row receives a yellow outline via .focused class)."

patterns-established:
  - "Atomic batch save pattern: local-only edits during interaction → single PATCH on submit → ApiError(400) inline error display → router.pop on success."
  - "Toast confirmation for reversible actions: post/unpost regulars show ✓ message; user can immediately tap «ОТМЕНА» on the same row to undo (T-26-04-02 mitigation)."
  - "PLAN_FOCUS_TODO grep marker convention works as designed — Plan 26-02 left the marker in CategoryDetailMount.tsx; Plan 26-04 found it via search and resolved both the comment and the implementation in one pass."

requirements-completed:
  - PLAN-V10-01    # tap PLAN-bar from Home → push PlanView on cobalt; eyebrow «MGMT / LIMITS» + Mass «PLAN МЕСЯЦА.»
  - PLAN-V10-02    # plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» = income − Σplan; OK yellow / OVER red blocks СОХРАНИТЬ CTA
  - PLAN-V10-03    # 2 rollover-плашки «→ ПРОЧЕЕ X ₽» / «→ НАКОПЛЕНИЯ Y ₽» aggregating remainders by policy
  - PLAN-V10-04    # block «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» — monthly subs with day_of_month + post/unpost CTAs + ✓ ПРОВЕДЕНО toast
  - PLAN-V10-05    # N PosterSlider per category (step 50000 = 500₽) + chip-pair «ПРОЧЕЕ / НАКОПЛЕНИЯ» PATCH /categories/:id rollover
  - PLAN-V10-06    # СОХРАНИТЬ → patchPlanMonth(plans) atomic; 200 → toast + router.pop; 400 → inline «Σplan превышает доход»

# Metrics
duration: ~22m
completed: 2026-05-10
---

# Phase 26 Plan 04: Web PLAN мая Summary

**Built the V10 web Plan editor end-to-end (PLAN-V10-01..06) — push-stack screen on cobalt with «PLAN МЕСЯЦА.» Mass headline, surplus plate (yellow OK / red OVER) gated on `income − Σplan`, 2 rollover aggregate plates («→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ»), РЕГУЛЯРНЫЕ block listing monthly subs with post/unpost CTAs + Toast confirmation, N PosterSliders (step 500₽) per category each with a «ПРОЧЕЕ / НАКОПЛЕНИЯ» chip-pair routing to PATCH /categories/:id, and a single PATCH /plan-month atomic save with inline overflow error display — split into 2 typed API wrappers, pure compute helpers, props-only View, and a Mount data-fetcher wired to PosterRouter + ApiError(400) handling; HomeMount PLAN-bar tap and CategoryDetail «+ ПОДНЯТЬ ЛИМИТ» both land on the real screen, with deep-link `focusCategoryId` scrolling to the relevant slider row.**

## Performance

- **Duration:** ~22 min (~1300s wall-clock from worktree base reset to final task commit)
- **Started:** 2026-05-10T21:17:00Z (approx — after worktree branch reset)
- **Completed:** 2026-05-10T21:39:00Z (approx)
- **Tasks:** 4 of 4 (5 commits — TDD RED/GREEN split for Task 2; Tasks 1/3/4 atomic)
- **Files created:** 10 (2 API wrappers + 1 compute + 1 view + 1 css + 1 mount + 1 barrel + 3 test files)
- **Files modified:** 4 (types extension, v10 barrel re-export, HomeMount swap, CategoryDetailMount swap)

## Accomplishments

- **6 pure compute helpers** unit-tested with 21 cases covering happy + edge (paused/savings exclusion, immutability invariants, sort by day_of_month).
- **PlanView (~250 LOC + ~165 CSS LOC)** renders all 6 PLAN-V10-* requirements: ← НАЗАД header + Eyebrow «MGMT / LIMITS», Mass «PLAN МЕСЯЦА.» (Archivo Black), surplus plate with yellow OK / red OVER tone modifier, 2 rollover aggregate plates («→ ПРОЧЕЕ X ₽» / «→ НАКОПЛЕНИЯ Y ₽»), regulars block with `data-testid="regular-row-{id}"` rows + ghost-variant ПРОВЕСТИ → / ОТМЕНА CTAs, N category sliders with PosterSlider step=50_000 cents + chip-pair Chip components, inline overflow error, primary-variant СОХРАНИТЬ CTA disabled when `isOverflow || submitting`.
- **PlanMount** orchestrates parallel fetch (categories + period + subscriptions + me) → sequential actuals fetch → category filter (drop savings/paused) + sort by ord ASC → plansFromCategories initial draft → 6 callback handlers (slider drag immutable applyPlanEdit, optimistic chip PATCH, post/unpost reload-token, atomic submit with ApiError(400) → saveError); cancellation guard against unmount race.
- **API surface extension**: `patchPlanMonth(plans)` typed wrapper + 5 subscriptions wrappers (list/post/unpost/patch/delete) + 6 wire-shape interfaces (PlanMonthItem/Patch/Response, SubscriptionV10Read/Ext/UpdatePayload, SubscriptionPostResponse). Re-exported from `frontend/src/api/v10/index.ts` barrel.
- **HomeMount swap** — PLAN-bar tap pushes `<PlanMount />` (placeholder import removed; placeholder export still lives in `_placeholders.tsx` as no-op for safety).
- **CategoryDetailMount swap** — «+ ПОДНЯТЬ ЛИМИТ» pushes `<PlanMount focusCategoryId={catId} />` (PLAN_FOCUS_TODO marker resolved; comment block updated).
- **21/21 compute tests + 13/13 PlanView tests + 2/2 PlanMount smoke tests + 0 regressions in 419-test project suite** all pass; tsc strict clean.

## Compute formulas (final shapes)

```
surplus              = incomeCents − Σ plans[*].plan_cents       (signed)
isOverflow           = surplus < 0
rolloverAggregates   = for each cat where (code != 'savings' && !paused):
                         remainder = max(0, plan − fact)
                         add remainder to (rollover='savings' ? savingsCents : miscCents)
                       fact = Σ |amount_cents| where category_id=cat.id ∧ kind='expense'
regularsList         = subs.filter(s => s.cycle === 'monthly' && s.day_of_month != null)
                          .map(s => RegularRow{id, name, dayOfMonth, categoryName, amountCents, postedTxnId})
                          .sort(byDayOfMonth ASC)
applyPlanEdit        = if catId in plans: replace plan_cents in-place (preserve order)
                       else: append new entry
                       (immutable — original array unchanged)
plansFromCategories  = filter savings + paused; map to {category_id, plan_cents: c.plan_cents ?? 0}
```

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1: API extensions (planMonth + subscriptions wrappers + types)** — `04ffc27` (feat)
2. **Task 2 RED: failing tests for compute helpers** — `841b5cb` (test)
3. **Task 2 GREEN: implement compute helpers (21/21 pass)** — `3de8dad` (feat)
4. **Task 3: PlanView presenter + CSS module + 13 view tests** — `92071e5` (feat)
5. **Task 4: PlanMount + barrel + HomeMount/CategoryDetailMount swap** — `a66c8f5` (feat)

Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol.

## Files Created/Modified

### Created

- `frontend/src/api/v10/planMonth.ts` (~38 LOC) — `patchPlanMonth(plans)` typed wrapper for atomic batch plan-cents update; documents 400/404/422 error contract.
- `frontend/src/api/v10/subscriptions.ts` (~95 LOC) — V1.0 subscriptions surface: `listSubscriptionsV10`, `postSubscription`, `unpostSubscription`, `patchSubscriptionV10`, `deleteSubscription`. All typed against `SubscriptionV10Read & SubscriptionV10UpdatePayload`.
- `frontend/src/screensV10/Plan/computePlan.ts` (~190 LOC) — 6 pure helpers: computeSurplus / computeIsOverflow / computeRolloverAggregates / computeRegularsList / applyPlanEdit / plansFromCategories + RolloverAggregates / RegularRow types.
- `frontend/src/screensV10/Plan/__tests__/computePlan.test.ts` (~340 LOC, 21 tests) — covers surplus arithmetic, overflow predicate, rollover aggregation (mixed/skip/over), regulars filter+sort+join, immutable in-place edit + append.
- `frontend/src/screensV10/Plan/PlanView.tsx` (~250 LOC) — pure presenter; all 6 PLAN-V10-* requirements; no fetch, no router import.
- `frontend/src/screensV10/Plan/PlanView.module.css` (~165 LOC) — cobalt root + paper text; .surplusPlate.{ok,overflow} tone modifier; rollover aggregate plates; regularRow grid; catRow vertical stack with .focused outline; inline error styling.
- `frontend/src/screensV10/Plan/__tests__/PlanView.test.tsx` (~280 LOC, 13 tests) — header, OK/OVER plate + CTA gate, rollover aggregates, regulars empty/rendered/post/unpost, sliders, chip-pair, focusCategoryId, ← НАЗАД, СОХРАНЯЕМ state, submit invocation.
- `frontend/src/screensV10/Plan/PlanMount.tsx` (~290 LOC) — parallel fetch + filter/sort + draft state + 6 callback handlers + Toast wiring; loading/error sub-views with retry + back; cancellation guard.
- `frontend/src/screensV10/Plan/__tests__/PlanMount.test.tsx` (~110 LOC, 2 smoke tests) — vi.mock api modules; assert loading state + post-fetch surplus computation.
- `frontend/src/screensV10/Plan/index.ts` (~16 LOC) — barrel re-exporting Mount/View/Props + 6 helpers + RegularRow/RolloverAggregates types.

### Modified

- `frontend/src/api/types.ts` — added Phase 26 V1.0 ext + plan-month section: `SubscriptionV10Ext`, `SubscriptionV10Read` (intersection), `SubscriptionV10UpdatePayload`, `SubscriptionPostResponse`, `PlanMonthItem`, `PlanMonthPatchPayload`, `PlanMonthResponse`. All defensively typed (optional + nullable) for the schema-gap pattern documented in CategoryV10.
- `frontend/src/api/v10/index.ts` — re-exported `patchPlanMonth` + `PlanMonthItem|Patch|Response` types alongside existing surface; re-exported all 5 subscriptions wrappers + 4 types.
- `frontend/src/screensV10/Home/HomeMount.tsx` — swap `PlanViewPlaceholder` import for `PlanMount`; `onPlanTap` now pushes `<PlanMount />`. Placeholder import fully removed.
- `frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx` — swap `PlanViewPlaceholder` for `PlanMount`; `handlePushPlan` now pushes `<PlanMount focusCategoryId={catId} />`. PLAN_FOCUS_TODO marker comment block updated to reflect the resolution.

## Decisions Made

(See `key-decisions` in frontmatter for the full list.)

Highlights:

- **Single PATCH /plan-month replaces N updateCategoryV10 calls.** Atomic + race-free + server-side Σ validation. Client catches `ApiError(status=400)` for inline overflow display.
- **Mount-controlled `plans` state, optimistic `categories` state.** Slider drag updates `plans` via immutable `applyPlanEdit` (no PATCH until submit). Chip-pair PATCHes immediately and replaces the row in `categories` from the response (no refetch needed).
- **PosterButton 'yellow' variant doesn't exist.** Save CTA uses `primary` when enabled, `ghost` when disabled. The yellow tone is on the surplus plate's `.ok` background only. A yellow CTA variant is Phase 28 polish.
- **scrollIntoView smooth + center for focusCategoryId.** Deep-link from CategoryDetail gives focused row a yellow outline (`.focused` class) + smooth scroll. `Element.prototype.scrollIntoView` is stubbed in tests via beforeAll because jsdom lacks it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] PosterButton variant 'yellow' doesn't exist**

- **Found during:** Task 3 (PlanView coding)
- **Issue:** Plan's pseudo-code suggested `variant={props.isOverflow ? 'ghost' : 'yellow'}` for the save CTA. PosterButton only supports `'primary' | 'ghost' | 'destructive'` (frontend/src/componentsV10/PosterButton.tsx). Compile-time TS error.
- **Fix:** Used `'primary'` when enabled, `'ghost'` when disabled. The yellow tone semantically belongs to the surplus plate (which uses `.ok` background = `var(--poster-yellow)`), not to the CTA. A yellow CTA variant is a Phase 28 polish.
- **Files modified:** frontend/src/screensV10/Plan/PlanView.tsx
- **Verification:** tsc strict clean; CTA renders correctly; tests assert disabled state via `cta?.disabled`.

**2. [Rule 1 — Bug] ru-RU thousand separator is U+00A0 NBSP, tests using ASCII space failed**

- **Found during:** Task 3 (PlanView test execution)
- **Issue:** `(50_000).toLocaleString('ru-RU')` returns `"50 000"` (NBSP between thousands). Tests asserting `toContain('50 000')` (with ASCII space) failed.
- **Fix:** Changed assertions to normalize whitespace: `expect(plate.textContent?.replace(/\s+/g, ' ')).toMatch(/50[ ]?000/)`. This works against both NBSP and ASCII variants and survives potential locale-data drift between vitest jsdom + node Intl.
- **Files modified:** frontend/src/screensV10/Plan/__tests__/PlanView.test.tsx
- **Verification:** 13/13 tests pass.

**3. [Rule 1 — Bug] vitest `beforeAll` not auto-imported**

- **Found during:** Task 3 (PlanView test execution)
- **Issue:** Used `beforeAll(() => Element.prototype.scrollIntoView = vi.fn())` to stub jsdom-missing API, but vitest doesn't auto-import lifecycle hooks; `ReferenceError: beforeAll is not defined`.
- **Fix:** Added `beforeAll` to the named import from `'vitest'`.
- **Files modified:** frontend/src/screensV10/Plan/__tests__/PlanView.test.tsx
- **Verification:** Tests run without ReferenceError.

**4. [Rule 1 — Bug] PosterRouterProvider props shape is `root`, not `initial`**

- **Found during:** Task 4 (PlanMount smoke test)
- **Issue:** Initial test wrapper used `<PosterRouterProvider initial={node}>` based on guess; actual API is `<PosterRouterProvider root={node} />` with no children needed (default render is `PosterRouterView`).
- **Fix:** Read PosterRouter.tsx source; updated wrapper to use `root` prop with no children.
- **Files modified:** frontend/src/screensV10/Plan/__tests__/PlanMount.test.tsx
- **Verification:** 2/2 smoke tests pass.

---

**Total deviations:** 4 auto-fixed (4× Rule 1 plan-spec / runtime mismatches; no scope creep).

**Impact on plan:** No scope creep. Plan files_modified list respected 1:1. All deviations were small adjustments to plan-spec discrepancies discovered at coding/test time; no architectural changes; no extra surface added.

## Issues Encountered

- **Pre-existing benign test stderr noise:** `usePosterRouter outside Provider` test (Plan 25-02) emits a known error log to stderr during the full project test run. Not a regression; same noise as documented in 25-04 / 26-02 SUMMARYs.
- **Pre-existing `npm run build` failures** in `src/screensV10/__tests__/TxV10TabDemote.test.tsx` (`node:fs` / `__dirname` undefined) — documented in 26-02 SUMMARY as SCOPE BOUNDARY. The looser `npx tsc --noEmit` (used as the verify gate here) is clean for all touched files.
- **Parallel commits on same branch:** plans 26-05/06/07 are running concurrently in other worktrees — `git log --oneline -8` shows commits from `feat(26-05)` and `feat(26-07)` interleaved with mine. My five commits cleanly contain only my files (verified via diff at each task boundary; HomeMount swap is web-only; iOS HomePlaceholders.swift is independent territory).

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-26-04-01 (Tampering: patchPlanMonth body):** mitigated. UI uses typed `PlanMonthItem[]` — TS prevents passing arbitrary keys at compile time; backend Pydantic model_validator (Phase 26-01) is the second layer; UI also blocks submit when isOverflow.
- **T-26-04-02 (Repudiation: postSubscription accidental click):** mitigated. Toast confirms every post with `✓ ПРОВЕДЕНО · → реестр`; the row immediately flips to «ОТМЕНА» button so user can undo inline without leaving the screen (POST /unpost endpoint).
- **T-26-04-03 (Information Disclosure: Σplan calc client-side):** accepted. Calculation is pure from user's own data; no cross-tenant info flows through this code path.
- **T-26-04-04 (DoS: Spam slider commits → N PATCHes):** mitigated. `applyPlanEdit` only updates local state during slider drag; `patchPlanMonth` fires only on submit (single batch). PosterSlider's built-in 300ms debounce on `onCommit` is unused here (we don't need per-commit PATCHes); kept the prop wired for forward compat.
- **T-26-04-05 (Tampering: rollover chip arbitrary value):** mitigated. Type-safe `'misc' | 'savings'` literal narrowed in callback signature; backend Literal validation is the second layer; UI chip-pair only emits these two values.

No new security surface introduced — PlanMount only reads from authenticated GET endpoints (RLS-gated) and calls user-initiated PATCH/POST per explicit interaction.

## Known Stubs

- **`window.alert` on chip PATCH failure** in PlanMount.handleRolloverChip — mirrors Plan 26-02 minimum-viable convention. Plan 28 polish may upgrade to a poster-styled toast (existing `componentsV10/Toast` is available).

These stubs do NOT block PLAN-V10-01..06 acceptance — the screen renders, surplus plate updates live as user drags sliders, regulars post/unpost works with toast confirmation, and submit either succeeds (toast + pop) or shows inline overflow error.

## Next Phase Readiness

- **Plan 26-05 (iOS Plan, parallel):** iOS `PlanData.swift` / `PlanViewModel.swift` mirror this Mount's compute pipeline. Compute formulas above are the source of truth — iOS implementation should produce byte-identical numbers.
- **Plan 26-06 (web Subscriptions):** can reuse `listSubscriptionsV10`, `patchSubscriptionV10`, `deleteSubscription` wrappers added here. SubscriptionV10Read type with day_of_month/account_id/posted_txn_id is also exported from the v10 barrel.
- **Plan 26-07 (iOS Subscriptions):** independent — uses parallel SubscriptionsV10API.
- **Backend (Plan 26-01) is in place** — both `patchPlanMonth` and `updateCategoryV10` (with rollover) work against the live API; ApiError(400) for plan_overflow is the only inline-handled case (other 4xx fall through to generic message).
- **Phase 27 cleanup:** `PlanViewPlaceholder` export still lives in `_placeholders.tsx` as a no-op (no longer imported); remove during Phase 27 mgmt-screen consolidation.
- **Phase 28 polish:** replace window.alert with PosterToast on chip PATCH failures; consider a yellow CTA variant for the save button to match the surplus plate tone semantically; explore slider tap-to-input numeric keypad UX (PosterSlider already supports inline editing on tap, but could reuse AddSheet's Keypad for parity).

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/api/v10/planMonth.ts
- FOUND: frontend/src/api/v10/subscriptions.ts
- FOUND: frontend/src/screensV10/Plan/computePlan.ts
- FOUND: frontend/src/screensV10/Plan/__tests__/computePlan.test.ts
- FOUND: frontend/src/screensV10/Plan/PlanView.tsx
- FOUND: frontend/src/screensV10/Plan/PlanView.module.css
- FOUND: frontend/src/screensV10/Plan/__tests__/PlanView.test.tsx
- FOUND: frontend/src/screensV10/Plan/PlanMount.tsx
- FOUND: frontend/src/screensV10/Plan/__tests__/PlanMount.test.tsx
- FOUND: frontend/src/screensV10/Plan/index.ts
- FOUND: frontend/src/api/types.ts (modified — +6 V10/plan-month interfaces)
- FOUND: frontend/src/api/v10/index.ts (modified — re-exports)
- FOUND: frontend/src/screensV10/Home/HomeMount.tsx (modified — PlanMount swap)
- FOUND: frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx (modified — PlanMount focusCategoryId swap)

**Commits exist (verified via `git log --oneline`):**
- FOUND: 04ffc27 (feat: API extensions)
- FOUND: 841b5cb (test: compute helpers RED)
- FOUND: 3de8dad (feat: compute helpers GREEN)
- FOUND: 92071e5 (feat: PlanView + CSS + tests)
- FOUND: a66c8f5 (feat: PlanMount + barrel + HomeMount/CategoryDetailMount swap)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npm test -- screensV10/Plan --run`: 36/36 pass (21 compute + 13 view + 2 mount)
- `cd frontend && npm test -- --run`: 419/419 pass (full project; +36 new tests, no regressions)
- `grep -c "patchPlanMonth\|listSubscriptionsV10\|postSubscription\|unpostSubscription\|deleteSubscription" frontend/src/api/v10/index.ts`: 5 (≥5 required)
- `grep -c "SubscriptionV10\|PlanMonthItem\|PlanMonthResponse" frontend/src/api/types.ts`: ≥6 (multiple type defs)
- `grep -c "export function" frontend/src/screensV10/Plan/computePlan.ts`: 6 (≥6 required)
- `grep -c "Mass\|Eyebrow\|PosterSlider\|Chip\|PosterButton" frontend/src/screensV10/Plan/PlanView.tsx`: ≥5
- `grep -c "ОСТАЛОСЬ РАСПРЕДЕЛИТЬ\|РЕГУЛЯРНЫЕ\|КАТЕГОРИИ\|ПРОЧЕЕ\|НАКОПЛЕНИЯ\|ПРОВЕСТИ\|СОХРАНИТЬ" frontend/src/screensV10/Plan/PlanView.tsx`: ≥7
- `grep -c "patchPlanMonth\|postSubscription\|unpostSubscription\|updateCategoryV10\|computeSurplus" frontend/src/screensV10/Plan/PlanMount.tsx`: 13 (≥5 required)
- `grep -c "PlanMount" frontend/src/screensV10/Home/HomeMount.tsx`: 2 (import + push)
- `grep -v '^//' frontend/src/screensV10/Home/HomeMount.tsx | grep -c "PlanViewPlaceholder"`: 0 (placeholder removed from non-comment code)
- `grep -c "PlanMount" frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx`: 4 (import + comment + push usage)

**No accidental file deletions** in any of my task commits (verified — all five task commits are pure additions/modifications; no `D` lines in `git show --stat`).

## TDD Gate Compliance

- Plan 26-04 Task 2 marked `tdd="true"` — followed RED → GREEN cycle:
  - Task 2 RED: `841b5cb` (test, 21 failing — file didn't exist) → GREEN: `3de8dad` (feat, 21 passing)
- Tasks 1, 3, 4 — atomic feat commits (Task 3's view tests landed alongside the view in the same commit; this is documented as the «view + tests together» pattern from 26-02 Task 3, mirrored here).
- No REFACTOR commits — no cleanup needed.
- TDD gate for compute helpers committed in correct order (test before feat).

---
*Phase: 26-category-detail-plan-subscriptions*
*Plan: 04*
*Completed: 2026-05-10*
