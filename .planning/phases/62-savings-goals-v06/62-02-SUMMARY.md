---
phase: 62
plan: 02
subsystem: ios-savings-v06
tags: [ios, swiftui, savings, viewmodel, helpers, tests, roundup]
requires:
  - SavingsViewData (enum stub from 62-01)
  - SavingsViewModel (@Observable stub from 62-01)
  - SavingsView (placeholder stub from 62-01)
  - SavingsRoute (typed-route enum from 62-01)
  - SavingsAPI / GoalsAPI / AccountsAPI (existing)
  - SavingsSummaryDTO / SavingsConfigDTO / GoalDTO / AccountDTO (existing)
  - MoneyFormatter (existing)
provides:
  - SavingsViewData 5 pure helpers (progressPercentage, formatDue, sortGoalsForDisplay, isValidGoalDraft, isValidDepositDraft) + MONTHS_RU_GEN
  - SavingsViewModel full impl (load + toggleRoundup + selectBase + createGoal + deleteGoal + deposit + clear helpers + DEBUG backdoor)
  - SavingsView master body (Hero / Roundup / Goals sections + Menu toolbar + swipe-to-delete + confirmationDialog + 2 sheet bindings + navigationDestination)
  - 32 unit tests (21 helpers + 11 VM)
affects:
  - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
  - ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift
  - ios/BudgetPlanner/Features/Savings/SavingsView.swift
tech-stack:
  added: []
  patterns:
    - "@Observable VM with discriminated SheetMode + optimistic snapshot rebuild + filtered Russian copy"
    - "Foundation-only pure helpers (no SwiftUI) for cheap unit-testability"
    - "DEBUG _setStateForTesting backdoor for VM state-machine tests without network"
    - "submitting guard (T-62-04) + full reload after mutation (T-62-05)"
key-files:
  created:
    - ios/BudgetPlannerTests/Features/Savings/SavingsViewDataTests.swift
    - ios/BudgetPlannerTests/Features/Savings/SavingsViewModelTests.swift
  modified:
    - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
    - ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift
    - ios/BudgetPlanner/Features/Savings/SavingsView.swift
decisions:
  - "Plan references SavingsData.swift but real file is SavingsViewData.swift (62-01 deviation); edited existing file, no rename/recreate"
  - "Per-task commits combine RED test + GREEN impl per file pair (TDD inside single commit) since plan defined helpers+tests as one task unit"
metrics:
  duration: 5min
  tasks: 3
  files: 5
  completed: 2026-05-20
---

# Phase 62 Plan 02: Savings Core Logic (v06 native) Summary

Filled the v06 «Копилка» core: 5 Foundation-only pure helpers in `SavingsViewData`, the complete `SavingsViewModel` (parallel load + 5 mutations with submitting guard, optimistic config updates and filtered Russian-copy error handling) and the master `SavingsView` body (Hero / Roundup / Goals sections, Menu toolbar, swipe-to-delete with confirmation, two sheet bindings). 32 unit tests pass; app build green; `FeaturesV10/Savings/*` untouched.

## What Was Built

### Task 1 — SavingsViewData (5 helpers) + 21 tests (commit 4d511fc)
- `progressPercentage(currentCents:targetCents:)` → clamped 0..100 with divide-by-zero + negative guards.
- `formatDue(_:calendar:)` → "до D <месяц_genitive> YYYY" via injectable Europe/Moscow calendar; nil-safe.
- `sortGoalsForDisplay(_:)` → due ASC (nil-last) with createdAt DESC tie-break.
- `isValidGoalDraft(name:targetCents:)` / `isValidDepositDraft(amountCents:accountId:)` validation gates.
- `MONTHS_RU_GEN` self-contained genitive month array. Foundation only — 0 SwiftUI imports.
- 21 unit tests (exceeds plan's ≥10): progressPercentage edge/rounding, formatDue MSK genitive, sort ordering incl. both-nil tie-break, validation matrix.

### Task 2 — SavingsViewModel + 11 tests (commit 2ea301e)
- `load()`: `inFlight` re-entrancy guard + `async let` parallel `SavingsAPI.summary()` + `AccountsAPI.list()`; error → filtered copy «Не удалось загрузить копилку».
- `toggleRoundup` / `selectBase`: optimistic snapshot rebuild + PATCH; on failure → mutationError + `await load()` (T-62-05).
- `createGoal` / `deleteGoal` / `deposit`: `guard !submitting` (T-62-04) + validate + request + reload; failures set filtered Russian copy and reset sheet.
- `clearMutationError()` / `clearLastCreatedGoalId()`, 5 derived getters, `#if DEBUG _setStateForTesting` backdoor.
- 11 unit tests (exceeds ≥10): initial state, derived getters (nil + populated), Status/SheetMode equatable, sheet toggling, clear helpers, backdoor, submitting flag, goals-from-snapshot.

### Task 3 — SavingsView master body (commit 14d8dc0)
- `List(.insetGrouped)` switch over 4 render states (idle/loading, error, ready+empty, ready+content).
- Mutation-error banner Section (T-62-03), Hero Section (monospacedDigit total + monthIn), Roundup Section (Toggle + conditional segmented Picker 10/50/100 ₽ + footer).
- Goals Section: `SavingsViewData.sortGoalsForDisplay` → `NavigationLink(value: SavingsRoute.goal(id:))` rows with `ProgressView` bar, percentage, due, achievement seal; swipe-to-delete → `confirmationDialog "Удалить цель?"` (T-62-02).
- Empty: `ContentUnavailableView "Нет целей"`. Menu toolbar («Новая цель» / «Пополнить»). Two sheet bindings + `.navigationDestination(for: SavingsRoute.self)` → `GoalDetailView`. `.refreshable`.

## Threat-Model Mitigations Verified
- **T-62-02** (Repudiation): `.confirmationDialog` before `deleteGoal`.
- **T-62-03** (Information Disclosure): 0 occurrences of `error.localizedDescription` in VM + View; 6 filtered Russian-copy strings; raw errors via `print()` only.
- **T-62-04** (Concurrency): `guard !submitting` on createGoal / deleteGoal / deposit (3 guards).
- **T-62-05** (Stale-state): `await load()` on every mutation success/optimistic-failure path (5 occurrences).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan referenced SavingsData.swift; real file is SavingsViewData.swift**
- **Found during:** Task 1 (before first edit).
- **Issue:** Plan 62-02 `files_modified` + artifact paths reference `ios/BudgetPlanner/Features/Savings/SavingsData.swift`, but Wave 1 (62-01) renamed the file to `SavingsViewData.swift` because Swift forbids duplicate file basenames in one target (vs `FeaturesV10/Savings/SavingsData.swift`). Type symbol `SavingsViewData` was already unchanged.
- **Fix:** Edited the existing `SavingsViewData.swift`; did not recreate or rename a `SavingsData.swift`. No code-symbol churn (type name unchanged).
- **Files modified:** `ios/BudgetPlanner/Features/Savings/SavingsViewData.swift`.
- **Commit:** 4d511fc.

### Notes (not deviations)
- **Test count:** Wrote 21 SavingsViewData tests (plan asked ≥10) and 11 SavingsViewModel tests (≥10) — added a both-nil-due tie-break case for completeness.
- **Simulator:** Used iPhone 17 Pro (Makefile default) for build/test rather than the plan's example `iPhone 15` destination string; both are simulator destinations, iPhone 17 Pro is the project's configured default.
- **Commit typing:** Task 1's combined RED+GREEN commit is labelled `test(...)`; Tasks 2/3 are `feat(...)`. Each commit pairs failing-test + implementation per the plan's single-task-unit structure (TDD cycle collapsed into one atomic commit per task).

## Verification Results
- Task 1 grep gates: import SwiftUI=0, 5 helper signatures present, ≥10 test funcs (21) — pass.
- Task 2 grep gates: load/toggleRoundup/selectBase/createGoal/deleteGoal/deposit each present; error.localizedDescription=0; «Не удалось»=6 (≥5); guard !submitting=3 (≥3); await load()=5 (≥5); #if DEBUG=1; test funcs=11 (≥10) — pass.
- Task 3 grep gates: confirmationDialog/swipeActions/ContentUnavailableView/navigationDestination/sheets/Menu present; error.localizedDescription=0 — pass.
- `xcodebuild build` (iPhone 17 Pro) → **BUILD SUCCEEDED**.
- `xcodebuild test` SavingsViewDataTests + SavingsViewModelTests → **TEST SUCCEEDED** (32 executed, 0 failures).
- swift-format applied to all 5 files (exit 0); rebuild + retest re-confirmed green post-format.
- `git status --porcelain ios/BudgetPlanner/FeaturesV10/Savings/` → 0 lines (V10 untouched).
- No file deletions in the 3 task commits.

## Stub Interface Surface (for 62-03)
- `GoalDetailView` / `GoalDetailViewModel` bodies (load + deleteGoal).
- `SavingsNewGoalSheet` Form body (name + targetCents via MoneyParser + optional DatePicker due).
- `SavingsDepositSheet` Form body (optional goal Picker pre-filled + amount + account Picker required).
- These stubs already expose the closure-based signatures `SavingsView` wires (`onCreate`/`onDeposit`/`onCancel`), so 62-03 only fills bodies.

## Known Stubs
The two sheets and `GoalDetailView` remain 62-01 placeholders by design (62-03 scope). `SavingsView` already wires their final closure signatures, so no stub blocks this plan's goal (master view is fully functional: load, roundup config, goal list, swipe-delete, navigation). Documented for the verifier.

## Self-Check: PASSED
- All 5 source/test files + SUMMARY.md present on disk.
- All 3 task commits (4d511fc, 2ea301e, 14d8dc0) found in git log.
