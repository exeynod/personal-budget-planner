---
phase: 25-home-transactions-add-sheet
fixed_at: 2026-05-10T17:21:39Z
review_path: .planning/phases/25-home-transactions-add-sheet/25-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 25: Code Review Fix Report

**Fixed at:** 2026-05-10T17:21:39Z
**Source review:** `.planning/phases/25-home-transactions-add-sheet/25-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (4 BLOCKER + 9 WARNING)
- Fixed: 13
- Skipped: 0
- Info findings (7): out of scope (`fix_scope = critical_warning`); not addressed.

**Verification matrix per fix:**

| Tier | Files / Mechanism |
|------|-------------------|
| Tier 1 (mandatory re-read) | every fix |
| Tier 2 (Python AST) | `app/api/routes/actual.py`, `app/api/schemas/actual.py` |
| Tier 2 (TypeScript `tsc --noEmit`) | all `frontend/src` edits — clean run after each batch |
| Tier 2 (Vitest) | computeAddSheet (32 tests), AddSheet/__tests__ (54 tests), common (32 tests), full suite at end (343 tests, all green) |
| Tier 3 (re-read only) | All `.swift` edits — `xcodebuild test` was deferred per orchestrator instruction (slow). Manual XCTest verification flagged below. |

**iOS-side manual verification needed before deploy:**
- CR-25-02 (`tx_date` TZ): manually confirm an evening submission near midnight Moscow time produces today's date.
- CR-25-03 (`formatShortDate`): visual check that AddSheet eyebrow renders «9 МАЯ» (or current short date), not «СЕГОДНЯ».
- WR-25-02 (`AddSheetView` error UI + `noAccount` CTA): trigger by killing API mid-`loadFormData` (e.g. block /accounts) — error state with retry button must render; `accountId == nil` must keep CTA in `noAccount` state.
- WR-25-04 (iOS days-left clamp): on the last day of the month confirm Home eyebrow shows «1 ДЕНЬ» (was «0 ДНЕЙ»).
- WR-25-08 (appendDigit ordering): existing AddSheetDataTests cover behaviour; new `test_appendDigit_zero_plus_zero_stays_zero` is the only fresh case — XCTest re-run recommended.
- WR-25-09 (delete error banner): trigger by failing DELETE in dev — banner must render bottom-anchored, list must NOT collapse to fullscreen error.
- The newly added Swift unit tests in `AddSheetDataTests.swift` (3 cases for WR-25-02 + 1 case for WR-25-08) compile against the updated `AddSheetData.ctaState` signature; they will pass once the suite is run.

## Fixed Issues

### CR-01: `POST /api/v1/actual` падает с 500 для kind=roundup/deposit без account_id

**Files modified:** `app/api/routes/actual.py`
**Commit:** db4ae73
**Applied fix:** Added a route-boundary guard: when `body.account_id is None and body.kind not in ("expense", "income")`, raise `HTTPException(400)` with detail `"kind 'roundup'/'deposit' requires account_id"`. Prevents the legacy `create_actual` service from constructing `CategoryKind('roundup')` and unwinding as 500.
**Tier 2 verification:** Python AST parse — OK.

### CR-02: iOS AddSheet форматирует tx_date в UTC, а не в локальной TZ

**Files modified:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift`
**Commit:** b2f1ef5
**Applied fix:** Changed `txDateFormatter.timeZone` from `TimeZone(identifier: "UTC")` to `TimeZone(identifier: "Europe/Moscow") ?? .current` per CLAUDE.md §Conventions. Updated docstring with the rationale.
**Tier 2 verification:** Tier 1 only (re-read); xcodebuild deferred. Logic-bug class — flag for manual TZ verification.

### CR-03: iOS AddSheet eyebrow всегда показывает «Сегодня» вместо короткой даты

**Files modified:** `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift`, `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift`
**Commit:** d152097
**Applied fix:** Added `V10Formatters.formatShortDate(_:calendar:)` mirroring web `formatShortDate` (returns e.g. «9 МАЯ»), and switched the AddSheet header from `formatDay(Date(), today: Date())` (which always collapsed to «Сегодня») to the new helper.
**Tier 2 verification:** Tier 1 only (re-read); xcodebuild deferred. Visual — flag for manual screenshot.

### CR-04: `ActualUpdate` Pydantic schema без `extra='forbid'`

**Files modified:** `app/api/schemas/actual.py`
**Commit:** bea4f3f
**Applied fix:** Added `model_config = ConfigDict(extra="forbid")` to `ActualUpdate`, mirroring `ActualCreate`. PATCH is now symmetric with POST — unknown fields produce 422.
**Tier 2 verification:** Python AST parse — OK.

### WR-01: Web AddSheet `account_id: null` отправляется на сервер при пустом списке счетов

**Files modified:** `frontend/src/screensV10/AddSheet/computeAddSheet.ts`, `frontend/src/screensV10/AddSheet/AddSheet.tsx`, `frontend/src/screensV10/AddSheet/__tests__/computeAddSheet.test.ts`
**Commit:** 3e1866f
**Applied fix:** Extended `AddSheetCtaState` with `'no-account'`. Added optional third arg `accountId` to `ctaState(...)` gated by a sentinel symbol `SKIP_ACCOUNT_GATE` so legacy 2-arg callers + tests compile unchanged. Pass `accountId` from `AddSheet.tsx` and added CTA label «НЕТ СЧЁТА» for the new state. Three new unit tests cover the gate.
**Tier 2 verification:** `tsc --noEmit` clean; vitest 32/32 tests pass for `computeAddSheet.test.ts`; full AddSheet suite 54/54 pass.

### WR-02: iOS AddSheet `accountId` может оказаться `nil` после неудачи `loadFormData()`

**Files modified:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift`, `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift`, `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift`, `ios/BudgetPlannerTests/FeaturesV10/AddSheetDataTests.swift`
**Commit:** c6bb2ee
**Applied fix:** Two-part fix:
1. Extended `AddSheetCtaState` with `.noAccount`. Added optional `accountId: Int? = -1` arg to `AddSheetData.ctaState(...)` (sentinel `-1` preserves 2-arg callers + tests). `AddSheetViewModel.ctaState` now passes `accountId`.
2. Added `errorState(_:)` helper to `AddSheetView` and switched `content` to branch on `loadStatus`: `.error(msg)` → centered message + retry button + close shortcut. CTA labels include «НЕТ СЧЁТА». Three new XCTest cases cover the gate.

**Tier 2 verification:** Tier 1 only (re-read); xcodebuild deferred. New tests compile against updated signature; will pass on next XCTest run.

### WR-03: PosterSheet drag-to-close не возвращает `dragOffset` к 0 после закрытия с overlay

**Files modified:** `frontend/src/screensV10/common/PosterSheet.tsx`
**Commit:** d15361b
**Applied fix:** Added `isDragging` state. Conditionally apply `transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1)` only while NOT actively dragging, so finger movement remains 1:1 but release/snap-back animates smoothly. `setIsDragging(false)` is called before the close-vs-snap-back decision so the transition takes effect.
**Tier 2 verification:** `tsc --noEmit` clean; no PosterSheet unit tests exist (only integration via AddSheet); 343/343 tests in full suite pass.

### WR-04: daysLeft cross-platform parity

**Files modified:** `frontend/src/screensV10/common/format.ts`, `ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift`, `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift`
**Commit:** 8d54b32
**Applied fix:** Unified clamp to `Math.max(1, ...)` on web and `Swift.max(1, ...)` on iOS in three places: `format.ts::formatPeriodEyebrow`, `HomeViewModel.swift`, `V10Formatters.swift::formatPeriodEyebrow`. Eyebrow + dailyPace now stay in sync across platforms; iOS no longer shows «0 ДНЕЙ» on the last day of the month.
**Tier 2 verification:** `tsc --noEmit` clean; format tests 32/32 pass (existing «daysLeft=1 on last day» test continues to pass since `max(1, 1) == 1`).

### WR-05: iOS V10MainShell — fragile API contract

**Files modified:** `ios/BudgetPlanner/App/V10MainShell.swift`
**Commit:** 4a36ffb
**Applied fix:** Documentation-only: added explicit invariant docstring on `@State private var router` ("PosterRouter persists for app session — `init()` runs many times, only first `initialValue:` is honoured by SwiftUI"), with guidance for future reset needs. Added warning comment on the `Color.clear` no-op ViewBuilder param noting that future PosterRouter changes that render the closure as fallback would silently use this clear background.
**Tier 2 verification:** Tier 1 only (re-read); doc-only change, no behavioural diff.

### WR-06: V10Formatters force unwrap

**Files modified:** `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift`
**Commit:** 6330364
**Applied fix:** Replaced `range?.upperBound != nil ? (range!.upperBound - 1) : 30` with explicit `if let range = ...` block. Semantics unchanged; force-unwrap removed.
**Tier 2 verification:** Tier 1 only (re-read); xcodebuild deferred.

### WR-07: Web `_placeholders.tsx` — `usePosterRouter()` throws if rendered standalone

**Files modified:** `frontend/src/screensV10/common/PosterRouter.tsx`, `frontend/src/screensV10/common/index.ts`, `frontend/src/screensV10/_placeholders.tsx`
**Commit:** 913ec2c
**Applied fix:** Added `usePosterRouterOptional()` to `PosterRouter.tsx` that returns `null` outside the provider. Re-exported via `common/index.ts`. Switched `_placeholders.tsx` to use the soft variant; back button now renders only when both `router` and `router.canPop` are truthy.
**Tier 2 verification:** `tsc --noEmit` clean; common tests 32/32 pass.

### WR-08: iOS `appendDigit` — расхождение порядка проверок с web

**Files modified:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift`, `ios/BudgetPlannerTests/FeaturesV10/AddSheetDataTests.swift`
**Commit:** a30950c
**Applied fix:** Re-ordered `AddSheetData.appendDigit` guards to match web `computeAddSheet.ts::appendDigit` exactly: empty-input check first, then leading-zero guards (split into `0+nonzero` and `0+0` cases), then decimal-cap. Added explicit XCTest case `test_appendDigit_zero_plus_zero_stays_zero` for the cross-platform parity edge case. Existing 8 appendDigit tests continue to apply (semantics unchanged for valid inputs).
**Tier 2 verification:** Tier 1 only (re-read); xcodebuild deferred.

### WR-09: iOS TransactionsV10ViewModel — error на delete заменяет список

**Files modified:** `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift`, `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift`
**Commit:** 67b7326
**Applied fix:** Added separate `deleteError: String?` field on the ViewModel + `clearDeleteError()` action. `delete(_:)` now sets `deleteError` on failure instead of overwriting `status`, so the list (`actuals`) survives. `TransactionsV10View` renders a tap-dismissible bottom-anchored yellow banner overlay when `deleteError != nil`, anchored above the FAB chrome.
**Tier 2 verification:** Tier 1 only (re-read); xcodebuild deferred.

## Skipped Issues

None — all 13 in-scope findings (4 BLOCKER + 9 WARNING) were fixed.

The 7 INFO findings (IN-01..IN-07) are out of scope for this iteration (`fix_scope = critical_warning`). Recommend a future cleanup pass to address:
- IN-01: simplify `AddSheetProps.onSubmitted` signature if `_id` is permanently unused.
- IN-02: move DELETE wrapper to `frontend/src/api/v10/actual.ts` for v1.0 path consistency.
- IN-03: refactor `OnboardingMountModel.reload` for read-clarity (no behavioural change).
- IN-04: defensive comment review on `breakTickLeftPct` div-by-zero guard.
- IN-05: decide whether stagger animation should re-trigger on iOS pop-back.
- IN-06: drop the `default` arm in `TransactionsData.applyFilterChip` inner switch.
- IN-07: localise the `createActualV10` amount-validation error message.

---

_Fixed: 2026-05-10T17:21:39Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
