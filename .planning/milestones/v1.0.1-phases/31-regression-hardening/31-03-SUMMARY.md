---
phase: 31-regression-hardening
plan: 03
subsystem: testing
tags: [ios, xctest, money-formatter, period-clamp, regression]

requires:
  - phase: 17-21
    provides: iOS BudgetPlanner XCTest suite (Domain/MoneyFormatter, Domain/Period)
provides:
  - "iOS XCTest 358/358 green (was 356/358 with 2 failing test expectations)"
  - "Corrected testRoundRubles input/expected math (10 000 rubles = 1_000_000 cents)"
  - "Corrected testCycleDayClampedInFebruary expectations to match periodFor() clamp semantics"
affects: [32-release-prep, future iOS regression runs]

tech-stack:
  added: []
  patterns:
    - "Test expectations stay in sync with production clamp/parse semantics — when production logic is correct and unchanged in the milestone, test expectation is the bug."

key-files:
  created:
    - .planning/phases/31-regression-hardening/31-03-SUMMARY.md
  modified:
    - ios/BudgetPlannerTests/MoneyTests.swift
    - ios/BudgetPlannerTests/PeriodTests.swift

key-decisions:
  - "Choice A (fix) over Choice B (skip) for both tests — diagnosis was unambiguous: production logic correct, test expectations wrong. No risk of masking a real bug."
  - "testRoundRubles: input cents was 10000 (= 100 RUB), expected '10 000' RUB — corrected input to 1_000_000 cents (= 10 000 RUB)."
  - "testCycleDayClampedInFebruary: assertion expected start=2026-02-15 but periodFor(2026-02-15, cycleStartDay=31) correctly rolls back to 2026-01-31, ends 2026-02-27 — the test author's own inline comments already proved this; corrected the XCTAssertEqual calls to match."

patterns-established:
  - "When XCTest expectation mismatches production output, first verify production semantics against domain spec/HLD before mutating implementation. In this plan, periodFor()/MoneyFormatter behaviour matched docs/HLD.md and TS reference implementations; only the assertions were wrong."

requirements-completed: [REG-04]

duration: ~3min
completed: 2026-05-10
---

# Phase 31 Plan 03: Regression Hardening — iOS XCTest Cleanup Summary

**Fixed 2 iOS test-expectation bugs (MoneyFormatter.testRoundRubles, Period.testCycleDayClampedInFebruary) so XCTest suite is 358/358 green; production logic untouched.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-10T23:35Z
- **Completed:** 2026-05-10T23:37Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- iOS XCTest suite restored to 358 passing / 0 failing / 0 skipped (was 356 passing / 2 failing).
- `testRoundRubles` now correctly drives `MoneyFormatter.format` with 1_000_000 cents to assert "10 000" rubles output.
- `testCycleDayClampedInFebruary` now asserts the actual `periodFor()` clamp result (start `2026-01-31`, end `2026-02-27`) for `date=2026-02-15, cycleStartDay=31` in non-leap February.
- REG-04 closed cleanly via Choice A (fix) — no `XCTSkipIf` debt left behind.

## Task Commits

Single atomic commit per plan instruction (`fix(31-03): isolate iOS pre-existing test failures (REG-04)`):

1. **Task 1: testRoundRubles diagnose + fix** — corrected input cents.
2. **Task 2: testCycleDayClampedInFebruary fix** — corrected expected start/end.
3. **Task 3: Full suite verification + commit + SUMMARY** — `xcodebuild test` exit 0; SUMMARY created.

## Files Created/Modified

- `ios/BudgetPlannerTests/MoneyTests.swift` — corrected `testRoundRubles` input from `10000` cents to `1_000_000` cents (so format result matches expected "10 000").
- `ios/BudgetPlannerTests/PeriodTests.swift` — corrected `testCycleDayClampedInFebruary` expected start to `2026-01-31` and added missing expected end assertion `2026-02-27`; removed misleading inline `_ = (start, end)` placeholder.
- `.planning/phases/31-regression-hardening/31-03-SUMMARY.md` — this file.

## Decisions Made

- **Choice A over Choice B for both tests.** Plan offered fix-or-skip with skip explicitly acceptable. Diagnosis was unambiguous:
  - `MoneyFormatter.format(cents:)` follows kopecks→rubles convention documented in `docs/HLD.md` and ported from web `format.ts`. Test expectation "10 000" from 10_000 cents would imply 10 000 rubles from 100 rubles input — physically impossible. Test was wrong.
  - `Period.periodFor()` clamp logic is verified by sibling tests (`testCycleDay31InJanuary` already asserts `2026-01-31` start, `2026-02-27` end for the same configuration starting one day earlier). The failing test's own author left inline comments deriving the correct expected values (`period_start = 2026-01-31`, `end = 2026-02-27`) but neglected to update `XCTAssertEqual`.
- No XCTSkipIf debt introduced.

## Verification

- `xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` → **Test Succeeded**.
- Suite totals: **Executed 358 tests, with 0 failures (0 unexpected) in 0.536 s.**
- Targeted re-run of just the two fixed tests also passes individually.

## Deviations from Plan

None — plan executed exactly as written. Plan permitted either Choice A (fix) or Choice B (skip); chose A on diagnostic certainty per plan guidance.

## Issues Encountered

- Working tree had a pre-existing unrelated change at `app/api/dependencies.py` from Phase 31 REG-01 (helper `_dev_mode_resolve_test_user`). Per SCOPE BOUNDARY rule (only commit task-related files), this file was deliberately excluded from the 31-03 commit. Will be picked up by its owning plan.

## Next Phase Readiness

- iOS XCTest gate is green; release-prep wave (Phase 32) and any further regression checks can run unblocked.
- No remaining REG-04 work.

## Self-Check: PASSED

- `ios/BudgetPlannerTests/MoneyTests.swift` — FOUND, diff confirms `1_000_000` cents input.
- `ios/BudgetPlannerTests/PeriodTests.swift` — FOUND, diff confirms `2026-01-31` / `2026-02-27` assertions.
- XCTest run exit 0 with 358/358 PASS verified via `xcodebuild test` log.
- SUMMARY commit hash recorded below.

---
*Phase: 31-regression-hardening*
*Completed: 2026-05-10*
