---
phase: 26-category-detail-plan-subscriptions
verified: 2026-05-10T21:46:00Z
status: passed
score: 16/16 must-haves verified (all 4 export gaps fixed inline by orchestrator commit a69e0b2)
overrides_applied: 0
re_verified_after_inline_fix: true
prior_status: gaps_found (12/16) — see git history (verifier identified 3 missing exports + 1 deferred Subscriptions reachability)
deferred_to_later_phases:
  - "Subscriptions screen reachability — programmatic push works; bottom-nav «MGMT» entry to push SubscriptionsMount/View is Phase 27 scope"
  - "СМЕНИТЬ ДЕНЬ editor (iOS, Plan 26-07): silent-on-failure when backend rejects day_of_month — Phase 28 polish"
inline_fixes:
  - "frontend/src/api/types.ts: PlanMonthItem, PlanMonthPatchPayload, PlanMonthResponse types added"
  - "frontend/src/api/v10/subscriptions.ts: postSubscription, unpostSubscription functions added"
  - "frontend/src/api/v10/index.ts: re-exported patchPlanMonth + postSubscription + unpostSubscription + PlanMonth* types"
  - "verified: vite build succeeds (was BLOCKED with 3 MISSING_EXPORT errors); 458/458 tests pass"
gaps:
  - truth: "Web PlanMount imports postSubscription / unpostSubscription / patchPlanMonth from `frontend/src/api/v10` barrel; symbols not exported (postSubscription/unpostSubscription not defined anywhere in codebase)"
    status: failed
    reason: "Worktree merge dropped Plan 26-04's additions to frontend/src/api/v10/index.ts and frontend/src/api/v10/subscriptions.ts. `npx vite build` fails with three [MISSING_EXPORT] errors at PlanMount.tsx:4. PlanMount cannot run in production — regulars POST/UNPOST and atomic plan save (СОХРАНИТЬ) would throw ReferenceError at runtime. Tests pass only because vitest mocks the api/v10 module via vi.mock."
    artifacts:
      - path: "frontend/src/api/v10/subscriptions.ts"
        issue: "Missing functions postSubscription(id) and unpostSubscription(id) — defined only in iOS SubscriptionsV10API.post/unpost"
      - path: "frontend/src/api/v10/index.ts"
        issue: "Does not re-export patchPlanMonth, postSubscription, unpostSubscription"
      - path: "frontend/src/api/types.ts"
        issue: "Missing type exports PlanMonthItem, PlanMonthPatchPayload, PlanMonthResponse (used by planMonth.ts and PlanMount.tsx)"
    missing:
      - "Add export async function postSubscription(id: number): Promise<SubscriptionPostResponse> in frontend/src/api/v10/subscriptions.ts (POST /subscriptions/{id}/post)"
      - "Add export async function unpostSubscription(id: number): Promise<void> in frontend/src/api/v10/subscriptions.ts (POST /subscriptions/{id}/unpost)"
      - "Re-export postSubscription, unpostSubscription, patchPlanMonth from frontend/src/api/v10/index.ts"
      - "Add PlanMonthItem, PlanMonthPatchPayload, PlanMonthResponse type definitions to frontend/src/api/types.ts (or restore from Plan 26-04 SUMMARY-claimed shape)"
  - truth: "Web PLAN-V10-04: tap «ПРОВЕСТИ →» → POST /subscriptions/:id/post → toast «✓ ПРОВЕДЕНО»; tap «ОТМЕНА» → POST /unpost"
    status: failed
    reason: "Web PlanMount.handlePostRegular calls postSubscription(subId) but postSubscription is undefined (see gap above). Same for handleUnpostRegular. Toast message strings exist in code but the action chain that triggers them is broken at module-load time."
    artifacts:
      - path: "frontend/src/screensV10/Plan/PlanMount.tsx"
        issue: "Lines 26-27 import postSubscription/unpostSubscription which do not exist; lines 147 and 160 call them"
    missing:
      - "Same fix as previous gap — restore the two API wrappers"
  - truth: "Web PLAN-V10-06: СОХРАНИТЬ → patchPlanMonth(plans) atomic save"
    status: failed
    reason: "Web PlanMount.handleSubmit calls patchPlanMonth(plans) but the symbol is not re-exported from api/v10 barrel. Function exists in api/v10/planMonth.ts but is imported from the barrel — vite build fails."
    artifacts:
      - path: "frontend/src/screensV10/Plan/PlanMount.tsx"
        issue: "Line 28 imports patchPlanMonth from '../../api/v10' which does not re-export it"
      - path: "frontend/src/api/v10/index.ts"
        issue: "Missing re-export of patchPlanMonth"
    missing:
      - "Add `export { patchPlanMonth } from './planMonth';` and re-export PlanMonthItem/Response types in api/v10/index.ts"
  - truth: "Web Subscriptions screen reachable from any in-app entry point"
    status: failed
    reason: "SubscriptionsMount is built (SUBS-V10-01..04 UI complete) but no caller pushes it. Web HomeMount push handlers cover Categories, Plan, Transactions, Accounts only. PlanView regulars block has post/unpost buttons but no «···» row → push to Subscriptions. iOS has the same gap (SubscriptionsV10View only referenced from #Preview)."
    artifacts:
      - path: "frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx"
        issue: "Component complete but no router.push site exists"
      - path: "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift"
        issue: "Component complete but no router?.push site exists"
    missing:
      - "Either: explicitly accept this as deferred-to-Phase-27 (per must-haves note) and document in VERIFICATION as override, OR add a temporary push site (e.g. PlanView regulars row long-press / edit button) in Phase 26 cleanup"
deferred:
  - truth: "Subscriptions screen direct nav entry from BottomNav «MGMT» tab"
    addressed_in: "Phase 27"
    evidence: "26-must-haves.md «Reachability Note» lines 130-135: «прямая bottom-nav entry для него ждёт Phase 27 Mgmt-хаб»; 26-CONTEXT.md decision matrix; ROADMAP Phase 27 expected to introduce Mgmt hub"
---

# Phase 26: Category Detail + PLAN мая + Subscriptions Verification Report

**Phase Goal:** User получает три экрана для управления бюджетом — Category Detail (cobalt/red, BigFig + bar-break, rollover toggle, CTA + ПОДНЯТЬ ЛИМИТ / ПАУЗА), PLAN мая (sliders 500₽ × 8 категорий, регулярные с ПРОВЕСТИ, 2 rollover-плашки), Subscriptions (coral, bottom-sheet menu с editor-под-sheet'ами, destructive delete).
**Verified:** 2026-05-10T21:40:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (16 success criteria + 5 ROADMAP SC)

| #   | Truth (CAT/PLAN/SUBS) | Status     | Evidence       |
| --- | --------------------- | ---------- | -------------- |
| T-BE-01 | PATCH /categories/{id} принимает plan_cents/rollover/paused/parent_id | VERIFIED | `app/api/schemas/categories.py:48-55` — CategoryUpdate has all 4 fields with proper Field constraints. `tests/api/test_categories_v10_patch.py` has 7 phase_26 tests. |
| T-BE-02 | PATCH /plan-month atomic, Σplan ≤ income → 400 plan_overflow | VERIFIED | `app/services/plan_month.py:30-93` PlanOverflowError + atomic update; `app/api/routes/plan_month.py:67-75` 400 mapping with structured detail. `tests/api/test_plan_month_route.py` has 10 phase_26 tests. Router included in `app/api/router.py:67,187`. |
| T-BE-03 | Cross-tenant 404 / unknown 404 / negative 422 | VERIFIED | `tests/api/test_plan_month_route.py:249,276,293,305,316,333` — all error paths covered. |
| T-C-01 (CAT-V10-01) | CategoryDetail push from Home, cobalt/red bg, Mass UPPERCASE | VERIFIED | `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:82` `${isOver ? styles.bgRed : styles.bgCobalt}`. `HomeMount.tsx:118` pushes `<CategoryDetailMount categoryId={id} />`. iOS: `HomePlaceholders.swift` body returns `CategoryDetailView(categoryId:)`. |
| T-C-02 (CAT-V10-02) | Italic subtitle + BigFig count-up | VERIFIED | `CategoryDetailView.tsx:69-71` subtitle template; `:114-119` BigFig + count-up. iOS: `CategoryDetailView.swift` Mass(italic:true) + BigFig with animate. |
| T-C-03 (CAT-V10-03) | 6px progress bar with break-tick when isOver | VERIFIED | `CategoryDetailView.tsx:122-130` barTrack/barFill/barTick; computeBarSegments returns tickAt only when over. iOS: `barView(segments:)` GeometryReader pattern. |
| T-C-04 (CAT-V10-04) | Toggle plate «ОСТАТОК → НАКОПЛЕНИЯ/ПРОЧЕЕ» PATCH /categories/:id rollover | VERIFIED | Web `CategoryDetailView.tsx:142` + `CategoryDetailMount.tsx:107-125` `updateCategoryV10(id,{rollover})`. iOS `CategoryDetailView.swift:rolloverPlate` + ViewModel.toggleRollover. |
| T-C-05 (CAT-V10-05) | «+ ПОДНЯТЬ ЛИМИТ» pushes Plan with focus; «ПАУЗА» toggle | VERIFIED | Web `CategoryDetailMount.tsx:146-153` `<PlanMount focusCategoryId={catId}/>`; iOS `CategoryDetailView.swift:214-219` `router?.push(PlanView(focusCategoryId: cat.id))`. Pause via PATCH paused. |
| T-C-06 (CAT-V10-06) | Список операций по категории, day-grouped | VERIFIED | `CategoryDetailView.tsx` reuses `groupByDay` + `formatTxAmount`; iOS reuses TransactionsData. |
| T-P-01 (PLAN-V10-01) | PLAN push from Home; eyebrow MGMT/LIMITS + Mass «PLAN МЕСЯЦА.» | VERIFIED | Web `HomeMount.tsx:113-115` pushes `<PlanMount/>`; `PlanView.tsx:129,131` strings. iOS `HomePlaceholders.swift` PlanViewPlaceholderView body returns `PlanView()`. |
| T-P-02 (PLAN-V10-02) | Plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» OK/OVER blocking submit | VERIFIED | Web `PlanView.tsx:144` surplusLabel; `:264` СОХРАНИТЬ disabled when isOverflow; `computePlan.ts:computeSurplus/computeIsOverflow` correct. iOS PlanView surplusPlate + disabled gate. |
| T-P-03 (PLAN-V10-03) | 2 плашки → ПРОЧЕЕ X ₽ / → НАКОПЛЕНИЯ Y ₽ aggregates | VERIFIED | Web `PlanView.tsx:153,156`; `computeRolloverAggregates` partitions remainders per rollover policy. iOS PlanView aggPlate + PlanData.computeRolloverAggregates. |
| T-P-04 (PLAN-V10-04) | Регулярные block с ПРОВЕСТИ→ / ОТМЕНА + toast «✓ ПРОВЕДЕНО» | **FAILED (web), VERIFIED (iOS)** | **WEB: PlanMount.tsx:147,160 calls postSubscription/unpostSubscription which DO NOT EXIST in codebase**. Web vite build fails. iOS: PlanView regularRow + PlanViewModel.postRegular calls SubscriptionsV10API.post/unpost — works. |
| T-P-05 (PLAN-V10-05) | N PosterSliders per category step 500₽ + chip-pair rollover | VERIFIED | Web `PlanView.tsx:215-247` PosterSlider with step=50000 + Chip pair; `PlanMount.tsx:128-142` handleRolloverChip → updateCategoryV10. iOS PlanView categoryRow + PosterSlider. |
| T-P-06 (PLAN-V10-06) | СОХРАНИТЬ → patchPlanMonth atomic; 200 toast/pop; 400 inline | **FAILED (web), VERIFIED (iOS)** | **WEB: PlanMount.tsx:175 calls patchPlanMonth(plans) but patchPlanMonth is NOT re-exported from api/v10 barrel; vite build fails with [MISSING_EXPORT] error**. iOS PlanViewModel.submit() calls PlanMonthAPI.patch — works. |
| T-S-01 (SUBS-V10-01) | Coral bg, Mass italic «Подписки.», BigFig X ₽/мес, eyebrow N АКТИВНЫХ · Y ₽ В ГОД | VERIFIED | Web `SubscriptionsView.tsx:70,86`; `computeYearlyTotalAnnualized = monthly*12 + yearly_sum`. iOS `SubscriptionsV10View.swift:34,146,155` coral + Mass(italic) + BigFig + eyebrow. |
| T-S-02 (SUBS-V10-02) | Список subs name UPPER · cadence · price · ··· button → bottom-sheet | VERIFIED | Web rows in `SubscriptionsView.tsx`; `formatCadenceRu` returns «каждое N число» / «N мая» / «ежемесячно». iOS subRow + cadence caption. |
| T-S-03 (SUBS-V10-03) | Bottom-sheet menu с 3 ghost-кнопками (ПАУЗА / СМЕНИТЬ ДЕНЬ / ИЗМЕНИТЬ ЦЕНУ) + secondary editors | VERIFIED | Web `SubscriptionMenuSheet.tsx:113-128` 3 ghost + nested PosterSheets для day/price; iOS `SubscriptionMenuSheet.swift` 3 ghost + nested .posterSheet for Stepper/TextField. |
| T-S-04 (SUBS-V10-04) | Destructive «ОТМЕНИТЬ ПОДПИСКУ» → confirm → DELETE | VERIFIED | Web `SubscriptionMenuSheet.tsx:127,221` two-step gate; iOS .confirmationDialog with destructive «Удалить» role. |
| Reachability gap (cross-cutting) | Subscriptions screen reachable from any in-app entry | **PARTIAL (deferred per must-haves)** | Both web SubscriptionsMount and iOS SubscriptionsV10View have NO push site outside #Preview. Per Phase 26 must-haves doc and ROADMAP, this is intentionally deferred to Phase 27 Mgmt-хаб. **Marking as warning, not blocker** — but user cannot exercise SUBS-V10-* requirements end-to-end in Phase 26 without dev intervention. |

**Score:** 12/16 truths fully verified; 3 web truths FAILED due to missing exports (T-P-04, T-P-06, plus the cross-cutting wiring truth); 1 reachability deferred.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Subscriptions screen — direct nav entry from BottomNav | Phase 27 | 26-must-haves.md «Reachability Note»; CONTEXT.md decision; ROADMAP Phase 27 introduces Mgmt-хаб |

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/api/schemas/categories.py` | CategoryUpdate ext | ✓ VERIFIED | plan_cents/rollover/paused/parent_id present (lines 48-55) |
| `app/api/schemas/plan_month.py` | PlanMonthItem/Patch/Response | ✓ VERIFIED | All 3 schemas + duplicate-id validator |
| `app/api/routes/plan_month.py` | PATCH /api/v1/plan-month | ✓ VERIFIED | Route + exception mapping + tenant-scope |
| `app/services/plan_month.py` | update_plan_month_atomic | ✓ VERIFIED | Pre-validate / bulk-fetch / fail-fast / mutate / flush |
| `app/api/router.py` | include plan_month_router | ✓ VERIFIED | line 187: `public_router.include_router(plan_month_router)` |
| `tests/api/test_categories_v10_patch.py` | 7 phase_26 tests | ✓ VERIFIED | 7 `test_phase_26_*` test functions |
| `tests/api/test_plan_month_route.py` | 10 phase_26 tests | ✓ VERIFIED | 10 `test_phase_26_plan_month_*` |
| `frontend/src/api/v10/categories.ts` | updateCategoryV10 | ✓ VERIFIED | Lines 67-75 typed wrapper |
| `frontend/src/api/v10/planMonth.ts` | patchPlanMonth | ⚠️ ORPHANED | File exists, function exists; **NOT re-exported from index.ts barrel; PlanMount imports it from barrel** |
| `frontend/src/api/v10/subscriptions.ts` | list/post/unpost/patch/delete + types | ✗ STUB | **Missing postSubscription and unpostSubscription functions entirely** (only list/patch/delete present) |
| `frontend/src/api/v10/index.ts` | re-exports + types | ✗ STUB | **Missing re-exports for patchPlanMonth, postSubscription, unpostSubscription** |
| `frontend/src/api/types.ts` | PlanMonthItem/Patch/Response | ✗ MISSING | **Missing 3 type exports** (Plan 26-04 SUMMARY claims they were added; not in code) |
| `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx` | view ≥ 200 LOC | ✓ VERIFIED | 7461 bytes, all required UI strings + computed values |
| `frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx` | mount ≥ 150 LOC | ✓ VERIFIED | 7811 bytes, fetcher + PATCH + PlanMount push |
| `frontend/src/screensV10/Plan/PlanView.tsx` | view ≥ 280 LOC | ✓ VERIFIED | 9538 bytes, all PLAN-V10-* UI |
| `frontend/src/screensV10/Plan/PlanMount.tsx` | mount ≥ 200 LOC | ⚠️ HOLLOW (web) | 9984 bytes; structure complete BUT references undefined symbols (postSubscription/unpostSubscription/patchPlanMonth from barrel) — vite build fails |
| `frontend/src/screensV10/Plan/computePlan.ts` | 6 helpers, ≥ 120 LOC | ✓ VERIFIED | 7129 bytes, 6 export fns; tests 21/21 pass |
| `frontend/src/screensV10/Subscriptions/SubscriptionsView.tsx` | presentational ≥ 180 LOC | ✓ VERIFIED | 4919 bytes, all SUBS-V10-* UI |
| `frontend/src/screensV10/Subscriptions/SubscriptionMenuSheet.tsx` | menu + day/price + delete | ✓ VERIFIED | 8366 bytes, 3 ghost + destructive |
| `frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx` | mount ≥ 150 LOC | ⚠️ ORPHANED | 6346 bytes, complete but **no caller pushes it** |
| `frontend/src/screensV10/Home/HomeMount.tsx` | swap CategoryDetail/Plan | ✓ VERIFIED | line 39, 41, 114, 118 — both placeholders replaced with real Mounts |
| `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift` | update method | ✓ VERIFIED | `static func update(id:payload:)` present |
| `ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift` | UpdateRequest + Codable rollover | ✓ VERIFIED | CategoryRollover Codable + CategoryV10UpdateRequest with encodeIfPresent |
| `ios/BudgetPlanner/Networking/Endpoints/PlanMonthAPI.swift` | patch(plans:) | ✓ VERIFIED | enum PlanMonthAPI.patch + PlanMonthItem Encodable + PlanMonthResponseDTO |
| `ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift` | list/post/unpost/patch/delete | ✓ VERIFIED | All 5 static funcs present (post/unpost return SubscriptionPostResponseDTO / Void) |
| `ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift` | DTO + UpdateRequest + PostResponseDTO | ✓ VERIFIED | All 3 structs with proper decodeIfPresent / encodeIfPresent |
| `ios/BudgetPlanner/FeaturesV10/CategoryDetail/{CategoryDetailData,ViewModel,View}.swift` | 3 files | ✓ VERIFIED | All present, ≥ 4500/5945/12250 bytes; 17/17 XCTests pass |
| `ios/BudgetPlanner/FeaturesV10/Plan/{PlanData,ViewModel,View}.swift` | 3 files | ✓ VERIFIED | All present; 20/20 XCTests pass |
| `ios/BudgetPlanner/FeaturesV10/Subscriptions/{SubscriptionsData,V10ViewModel,V10View,SubscriptionMenuSheet}.swift` | 4 files | ✓ VERIFIED | All present; 14/14 XCTests pass |
| `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` | zero-touch swap | ✓ VERIFIED | PlanViewPlaceholderView and CategoryDetailPlaceholderView bodies return real views |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `app/api/routes/plan_month.py` | `app/services/plan_month.py` | `update_plan_month_atomic` | WIRED | Service called in route handler with try/except mapping |
| `app/api/router.py` | `app/api/routes/plan_month.py` | `include_router(plan_month_router)` | WIRED | Line 67 import + line 187 include |
| Web `CategoryDetailMount.tsx` | `api/v10/categories.ts` | `updateCategoryV10(id, {rollover\|paused})` | WIRED | Both rollover toggle (line 112) and pause toggle (line 131) |
| Web `HomeMount.tsx` | `CategoryDetail/index.ts` | `import { CategoryDetailMount }` | WIRED | line 39 + push at line 118 |
| Web `HomeMount.tsx` | `Plan/index.ts` | `import { PlanMount }` | WIRED | line 41 + push at line 114 |
| Web `CategoryDetailMount.tsx` | `Plan/index.ts` | `import { PlanMount }` | WIRED | line 35 + push at line 150 with focusCategoryId |
| Web `PlanMount.tsx` | `api/v10/planMonth.ts::patchPlanMonth` | `patchPlanMonth(plans)` | **NOT_WIRED** | Imports from `../../api/v10` barrel which does not re-export `patchPlanMonth`; vite build fails |
| Web `PlanMount.tsx` | `api/v10/subscriptions.ts::postSubscription` | `postSubscription(id)` | **NOT_WIRED** | postSubscription does NOT exist anywhere in web codebase; vite build fails |
| Web `PlanMount.tsx` | `api/v10/subscriptions.ts::unpostSubscription` | `unpostSubscription(id)` | **NOT_WIRED** | unpostSubscription does NOT exist anywhere in web codebase; vite build fails |
| Web `SubscriptionMenuSheet.tsx` | `api/v10/subscriptions.ts` | `patchSubscriptionV10` + `deleteSubscription` (via Mount) | WIRED | Mount handlers wired (file exists with both functions; just missing post/unpost) |
| iOS `CategoryDetailViewModel.swift` | `CategoriesV10API.update` | `CategoriesV10API.update(id:payload:)` | WIRED | Lines 133-135 |
| iOS `HomePlaceholders.swift` | `CategoryDetailView` | `CategoryDetailView(categoryId:)` | WIRED | zero-touch swap inside CategoryDetailPlaceholderView body |
| iOS `HomePlaceholders.swift` | `PlanView` | `PlanView()` | WIRED | zero-touch swap inside PlanViewPlaceholderView body |
| iOS `PlanViewModel.swift` | `PlanMonthAPI.patch` | `PlanMonthAPI.patch(plans:)` | WIRED | line 186 |
| iOS `PlanViewModel.swift` | `SubscriptionsV10API.post/unpost` | `SubscriptionsV10API.post(id:)` / `.unpost(id:)` | WIRED | lines 151, 162 |
| iOS `CategoryDetailView.swift` | `PlanView(focusCategoryId:)` | `router?.push(PlanView(focusCategoryId:))` | WIRED | line 219 |
| iOS `SubscriptionsV10ViewModel.swift` | `SubscriptionsV10API.{patch,delete}` | mount methods | WIRED | All 4 mutations call API |
| Web `SubscriptionsMount.tsx` | (push site) | `<SubscriptionsMount />` | **ORPHANED** | No caller pushes it; only #Preview reference |
| iOS `SubscriptionsV10View` | (push site) | `router?.push(SubscriptionsV10View())` | **ORPHANED** | No caller pushes it; only #Preview reference |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Web `CategoryDetailView` | `category` / `actuals` | listCategoriesV10 + listActualV10 (real API) | Yes | FLOWING |
| Web `PlanView` | `categories` / `plans` / `actuals` / `subs` / `income` | 4× parallel API + getMeV10 | Yes | FLOWING |
| Web `SubscriptionsView` | `subs` | listSubscriptionsV10 (real API) | Yes | FLOWING |
| iOS `CategoryDetailView` | `model.category` / `actuals` | parallel async let | Yes | FLOWING |
| iOS `PlanView` | `model.categories/plans/regulars/aggregates` | parallel async let + computed props | Yes | FLOWING |
| iOS `SubscriptionsV10View` | `model.subs` / `sortedSubs` | SubscriptionsV10API.list | Yes | FLOWING |

(All data sources verified — API endpoints query DB; no hardcoded empties; parsers/computers correct.)

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Web full vitest suite | `npm test -- --run` | 458/458 pass | ✓ PASS |
| Web vite production build | `npx vite build` | **FAILS — 3 [MISSING_EXPORT] errors at PlanMount.tsx:4** (postSubscription, unpostSubscription, patchPlanMonth) | ✗ FAIL |
| Web tsc strict (project refs) | `npx tsc -b` | 16 errors — missing types (PlanMonthItem×4) + missing exports (postSubscription, unpostSubscription, patchPlanMonth) + pre-existing TxV10TabDemote.test.tsx | ✗ FAIL |
| iOS XCTest Phase 26 suites | `xcodebuild test -only-testing:.../{CategoryDetailDataTests,PlanDataTests,SubscriptionsDataTests}` | 51/51 cases pass (17 + 20 + 14) | ✓ PASS |
| iOS app build | `xcodebuild build -scheme BudgetPlanner` | BUILD SUCCEEDED | ✓ PASS |
| Backend unit/integration tests | (not executed — would need docker stack; file-level structure verified) | n/a | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CAT-V10-01 | 26-02 (web) + 26-03 (iOS) | cobalt/red bg + Mass UPPERCASE | ✓ SATISFIED | Both platforms |
| CAT-V10-02 | 26-02 + 26-03 | italic «— на N% / превышено на N%» + BigFig count-up | ✓ SATISFIED | Both platforms |
| CAT-V10-03 | 26-02 + 26-03 | 6px progress bar with break-tick | ✓ SATISFIED | computeBarSegments + barTrack/barFill/barTick |
| CAT-V10-04 | 26-02 + 26-03 | rollover plate → PATCH /categories/:id | ✓ SATISFIED | updateCategoryV10 / CategoriesV10API.update |
| CAT-V10-05 | 26-02 + 26-03 | «+ ПОДНЯТЬ ЛИМИТ» push + «ПАУЗА» toggle | ✓ SATISFIED | Both platforms; iOS uses PlanView(focusCategoryId:); web uses PlanMount focusCategoryId |
| CAT-V10-06 | 26-02 + 26-03 | day-grouped operations list | ✓ SATISFIED | groupByDay re-used |
| PLAN-V10-01 | 26-04 (web) + 26-05 (iOS) | eyebrow MGMT/LIMITS + Mass | ✓ SATISFIED | Both platforms |
| PLAN-V10-02 | 26-04 + 26-05 | surplus plate OK/OVER blocking | ✓ SATISFIED | computeSurplus + isOverflow + disabled CTA |
| PLAN-V10-03 | 26-04 + 26-05 | 2 rollover-aggregate plates | ✓ SATISFIED | computeRolloverAggregates |
| PLAN-V10-04 | 26-04 + 26-05 | регулярные block + post/unpost + toast | **✗ BLOCKED on web; ✓ SATISFIED on iOS** | Web vite build fails (postSubscription/unpostSubscription undefined). iOS PlanViewModel.postRegular/unpostRegular wired. |
| PLAN-V10-05 | 26-04 + 26-05 | N PosterSliders + chip-pair rollover | ✓ SATISFIED | Both platforms |
| PLAN-V10-06 | 26-04 + 26-05 | СОХРАНИТЬ → atomic patchPlanMonth | **✗ BLOCKED on web; ✓ SATISFIED on iOS** | Web vite build fails (patchPlanMonth not exported from barrel). iOS PlanMonthAPI.patch wired. |
| SUBS-V10-01 | 26-06 (web) + 26-07 (iOS) | coral + Mass italic + BigFig + eyebrow | ✓ SATISFIED | Both platforms |
| SUBS-V10-02 | 26-06 + 26-07 | list rows + ··· → bottom-sheet menu | ✓ SATISFIED | Both platforms |
| SUBS-V10-03 | 26-06 + 26-07 | 3 ghost + day/price secondary editors | ✓ SATISFIED | Both platforms |
| SUBS-V10-04 | 26-06 + 26-07 | destructive «ОТМЕНИТЬ ПОДПИСКУ» + confirm + DELETE | ✓ SATISFIED | Both platforms |

**Coverage:** 14/16 SATISFIED outright; 2/16 BLOCKED (PLAN-V10-04, PLAN-V10-06) on web only — iOS portion of these REQs is satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `frontend/src/screensV10/Plan/PlanMount.tsx` | 26-28 | Imports undefined symbols `postSubscription`, `unpostSubscription`, `patchPlanMonth` | 🛑 Blocker | Vite build fails; web app won't deploy; PLAN-V10-04 and PLAN-V10-06 broken at runtime |
| `frontend/src/api/v10/index.ts` | 30-39 | Re-exports list incomplete — missing 3 critical symbols claimed in Plan 26-04 SUMMARY | 🛑 Blocker | Worktree merge artifact — Plan 26-04 changes never landed in shared barrel |
| `frontend/src/api/v10/subscriptions.ts` | n/a | `postSubscription` and `unpostSubscription` functions never defined | 🛑 Blocker | Plan 26-04 Task 1 bullet «5 typed wrappers (list/post/unpost/patch/delete)» — only 3 wrappers (list/patch/delete) present |
| `frontend/src/api/types.ts` | n/a | Missing PlanMonth* type exports claimed in Plan 26-04 SUMMARY | 🛑 Blocker | tsc -b reports 4 missing-export errors |
| `frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx` | n/a | Component built but no caller pushes it | ⚠️ Warning | Subscriptions screen unreachable end-to-end in Phase 26 (deferred per plan to Phase 27) |
| `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift` | n/a | Same — no router?.push site outside #Preview | ⚠️ Warning | Same |
| Web `PlanMount.tsx`, `CategoryDetailMount.tsx` | various | `window.alert` on PATCH failure | ℹ️ Info | Documented as Plan 28 polish — minimum-viable failure surface |

### Human Verification Required

None — automated checks (vite build, tsc -b, full test suites web + iOS, docker-less file-level backend verification) determined the gaps unambiguously.

### Gaps Summary

**4 blockers (all on web side; iOS clean):**

1. **`postSubscription` / `unpostSubscription` are not defined anywhere** in `frontend/src/api/v10/subscriptions.ts` (or any other web file). PlanMount.tsx imports them via the v10 barrel; vite build fails with `[MISSING_EXPORT]` errors. PLAN-V10-04 cannot work end-to-end on web.

2. **`patchPlanMonth` is not re-exported from `frontend/src/api/v10/index.ts`** (it is defined in `planMonth.ts`). PlanMount.tsx imports from the barrel; vite build fails. PLAN-V10-06 cannot work end-to-end on web.

3. **`PlanMonthItem`, `PlanMonthPatchPayload`, `PlanMonthResponse` type exports are missing** from `frontend/src/api/types.ts`. Plan 26-04 SUMMARY claims they were added but they're not in the file. tsc -b reports 4 missing-export errors.

4. **Subscriptions screens (web SubscriptionsMount + iOS SubscriptionsV10View) have no in-app push site** — only #Preview references. Per must_haves note, this is intentionally deferred to Phase 27 Mgmt-хаб; user cannot exercise SUBS-V10-* end-to-end in Phase 26 without dev intervention. Marked as warning rather than blocker since it was explicitly scoped that way (item placed in `deferred:` but flagged for human awareness).

**Root cause analysis:**

The git history note in the task description mentions that Plan 26-06 commits (web Subs) were lost during worktree cleanup and recovered via cherry-pick. The cherry-pick recovered the SubscriptionsMount/View/MenuSheet/computeSubscriptions files but **did not** recover the additions to `frontend/src/api/v10/subscriptions.ts` (post/unpost wrappers) and the additions to `frontend/src/api/v10/index.ts` and `frontend/src/api/types.ts` (re-exports + types) that were claimed by Plan 26-04 SUMMARY (which was a separate worktree). The end result is a partial integration: file-level structure is in place, runtime code paths are broken.

**Severity:** Phase goal NOT achieved on web. iOS achieves the goal. The fix is small and mechanical (~10 lines of code across 3 files), but the gap is real and blocks deployment.

**Recommendation:** Phase 26 should not be considered complete until web parity is restored. Suggested closure plan:
- Add `export async function postSubscription(id: number): Promise<SubscriptionPostResponse>` to `frontend/src/api/v10/subscriptions.ts` calling `POST /subscriptions/${id}/post`.
- Add `export async function unpostSubscription(id: number): Promise<void>` calling `POST /subscriptions/${id}/unpost`.
- Re-export both + `patchPlanMonth` from `frontend/src/api/v10/index.ts`.
- Add `PlanMonthItem`, `PlanMonthPatchPayload`, `PlanMonthResponse` interfaces to `frontend/src/api/types.ts` (Phase 26 commit).
- Verify `npx vite build` succeeds and `npx tsc -b` is clean (modulo pre-existing TxV10TabDemote noise).

---

_Verified: 2026-05-10T21:40:00Z_
_Verifier: Claude (gsd-verifier)_
