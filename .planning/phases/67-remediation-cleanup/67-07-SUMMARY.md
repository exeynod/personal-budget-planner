---
phase: 67-remediation-cleanup
plan: 07
subsystem: ios
tags: [ios, savings, goals, apiclient, testing, seam, auth, money-mutation]
requires:
  - "67-03: APIClient final auth semantics (401/403 strict logout)"
  - "67-05: APIError.userFacingRu + deferred lastCreatedGoalId removal"
provides:
  - "Injectable API struct seam on SavingsViewModel + GoalDetailViewModel"
  - "reloadPending coalescing on SavingsViewModel.load()"
  - "Behavioural money-mutation tests (deposit/createGoal/deleteGoal/optimistic-revert)"
  - "APIClient 401/403 logout + MSK yyyy-MM-dd decode regression locks"
  - "URLProtocolStub for APIClient seam testing"
affects:
  - "ios/BudgetPlanner/Features/Savings/*"
  - "ios/BudgetPlannerTests/Networking/*"
tech-stack:
  added: []
  patterns:
    - "Injectable struct-of-closures API seam (default .live) — mirror of SubscriptionsViewModel.API"
    - "reloadPending coalesce: skip-and-replay load() requested while in-flight"
    - "URLProtocol stub injected via URLSession(configuration:) → APIClient(baseURL:session:)"
    - "Private date decoder exercised through real request<T> decode (not a re-created copy)"
key-files:
  created:
    - "ios/BudgetPlannerTests/Networking/URLProtocolStub.swift"
    - "ios/BudgetPlannerTests/Networking/APIClientForbiddenTests.swift"
    - "ios/BudgetPlannerTests/Networking/APIClientDateDecodeTests.swift"
  modified:
    - "ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift"
    - "ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift"
    - "ios/BudgetPlannerTests/Features/Savings/SavingsViewModelTests.swift"
    - "ios/BudgetPlannerTests/Features/Savings/GoalDetailViewModelTests.swift"
decisions:
  - "Removed dead lastCreatedGoalId/clearLastCreatedGoalId() — no view consumer (only VM + test); the existing test assertions were dropped in Task 2"
  - "make test target does not exist in ios/Makefile — ran full suite via xcodebuild test directly (Rule 3 blocking-issue resolution)"
  - "Private APIClient date decoder exercised through a real GoalDTO request decode (due=yyyy-MM-dd, created_at=timestamp) rather than re-creating the decoder — pins the EXACT production decoder at the call-site"
metrics:
  duration: "~15m"
  completed: 2026-05-20
  tests-added: 41
  tests-total: 609
---

# Phase 67 Plan 07: iOS Savings/GoalDetail seam + coalesce + APIClient regression tests Summary

Made iOS money mutations behaviourally testable via an injectable `API` struct seam on `SavingsViewModel`/`GoalDetailViewModel`, added `reloadPending` coalescing so a post-deposit reload isn't dropped during pull-to-refresh, and regression-locked app-wide `APIClient` 401/403 strict-logout + MSK `yyyy-MM-dd` decode via URLProtocol-stub tests — APIClient source untouched.

## What Was Built

**Task 1 (P1-4 / R2) — seam + coalesce + dead-code removal** (`21f812f`)
- `SavingsViewModel.API` struct (summary, accountsList, patchRoundupEnabled, patchRoundupBase, postDeposit, goalsCreate, goalsDelete) + `static let live` + `init(api: API = .live)`. All direct static calls replaced with `api.*`.
- `reloadPending` coalescing ported into `SavingsViewModel.load()` (mirror of `SubscriptionsViewModel`): if a load is in flight, a second request sets `reloadPending` and is replayed in the first load's `defer`.
- `GoalDetailViewModel.API` struct (goalsList, accountsList, postDeposit, goalsDelete) + `init(goalId:api:)` defaulting to `.live`.
- Dead `lastCreatedGoalId` + `clearLastCreatedGoalId()` removed (no view consumer; deferred from 67-05).

**Task 2 (P1-4 / QA-F1,F2) — behavioural tests** (`12e1e1e`)
- `SavingsViewModelTests`: deposit success (reload + sheet=.none + error=nil + hero update), deposit failure (fixed RU copy + false), deposit invalid-draft / submitting-guard (no 2nd call), createGoal success/failure/validation, deleteGoal success/failure, toggleRoundup/selectBase optimistic-revert → reload on failure, reloadPending coalesce replay.
- `GoalDetailViewModelTests`: deposit success (reload updates hero) / failure / submitting-guard, deleteGoal success/failure, load cross-tenant/missing → `.error("Цель не найдена")`, load found → `.ready`, load throw → load-error copy.
- All via stubbed `API` seam (closures recording calls / throwing on demand + an `AsyncGate` continuation for the submitting-guard re-entrancy assertion). No network.

**Task 3 (P1-7 / QA-F3,F4) — APIClient regression locks** (`678c01b`)
- `URLProtocolStub` injected via `URLSession(configuration:)` → `APIClient(baseURL:session:)` with a recording `onUnauthenticated` closure.
- `APIClientForbiddenTests`: 401 → onUnauthenticated fires once + `.unauthorized`; 403 (`!skipAuth`) → fires once + `.forbidden` (strict, post-67-03); 403 (`skipAuth`) → does NOT fire; 200 → does NOT fire.
- `APIClientDateDecodeTests`: bare `"2027-01-01"` decodes to Europe/Moscow midnight (cross-checked == 2026-12-31 21:00 UTC); ISO timestamps with `Z` / fractional seconds / no-zone all still parse. Exercises the private production decoder through a real `GoalDTO` request decode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `make test` target missing**
- **Found during:** Task 2 verification
- **Issue:** Plan's `<verify>` runs `make test`, but `ios/Makefile` has no `test` target (only build/run/format).
- **Fix:** Ran the full suite via `xcodebuild ... test` against `iPhone 17 Pro` directly. No source change.
- **Files modified:** none.

**2. [Rule 2 - Critical] Existing tests referenced removed dead code**
- **Found during:** Task 1/2
- **Issue:** `SavingsViewModelTests` asserted `lastCreatedGoalId` / `clearLastCreatedGoalId()` which Task 1 removed — would break the build.
- **Fix:** Dropped those two assertions when rewriting the test file in Task 2 (the dead property had no view consumer, so its test was orphaned).
- **Files modified:** `SavingsViewModelTests.swift`. **Commit:** `12e1e1e`.

## Verification

- `grep "struct API"` + `grep "reloadPending"` in `SavingsViewModel.swift` → present; `grep "struct API"` in `GoalDetailViewModel.swift` → present.
- `git diff HEAD -- ios/BudgetPlanner/Networking/APIClient.swift` → empty (APIClient source untouched, owned by 67-03).
- Full suite: **609 tests, 0 failures** (was 568 baseline → +41 new). New suites `SavingsViewModelTests`, `GoalDetailViewModelTests`, `APIClientForbiddenTests`, `APIClientDateDecodeTests` all green.
- `xcodegen generate` run before build (new test files picked up via whole-dir `BudgetPlannerTests` source); swift-format applied to all 7 touched files.

## Known Stubs

None — `URLProtocolStub` is intentional test infrastructure (not a product stub).

## Self-Check: PASSED

All created/modified files exist on disk; all 3 task commits (21f812f, 12e1e1e, 678c01b) present in git history.
