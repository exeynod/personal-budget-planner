---
phase: 62
plan: 01
subsystem: ios-savings-v06
tags: [ios, swiftui, savings, scaffold, navigation, management]
requires:
  - ManagementView (v06 native shell)
  - SavingsAPI / GoalsAPI / AccountsAPI (existing)
  - SavingsSummaryDTO / GoalDTO / AccountDTO (existing)
provides:
  - ManagementItem.savings registration (enum + all + destination dispatch)
  - Features/Savings/ scaffold (8 stub files, build-green)
  - SavingsRoute typed-route enum (case goal(id: Int))
  - SavingsViewModel / GoalDetailViewModel @Observable stubs
  - SavingsNewGoalSheet / SavingsDepositSheet view stubs
affects:
  - ios/BudgetPlanner/Features/Management/ManagementView.swift
tech-stack:
  added: []
  patterns:
    - typed-route enum (SavingsRoute) to avoid shared-NavigationStack Int.self collision
    - discriminated SheetMode enum (.none/.newGoal/.deposit(goalId:))
    - symbol + filename collision avoidance vs FeaturesV10/Savings
key-files:
  created:
    - ios/BudgetPlanner/Features/Savings/SavingsRoute.swift
    - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
    - ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift
    - ios/BudgetPlanner/Features/Savings/SavingsView.swift
    - ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift
    - ios/BudgetPlanner/Features/Savings/GoalDetailView.swift
    - ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift
    - ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift
  modified:
    - ios/BudgetPlanner/Features/Management/ManagementView.swift
decisions:
  - "SavingsData.swift renamed to SavingsViewData.swift — Xcode/Swift forbids two files with the same basename in one target (not just same type name)"
metrics:
  duration: 2min
  tasks: 2
  files: 9
  completed: 2026-05-20
---

# Phase 62 Plan 01: Savings Domain Scaffold (v06 native) Summary

Registered the new «Копилка» domain entry point in the v06 native ManagementView hub and scaffolded `Features/Savings/` with 8 compiling stub files; build stays green for downstream plans 62-02/62-03 to fill bodies independently.

## What Was Built

### Task 1 — ManagementItem.savings registration (commit 5e4043b)
Three edits to `ManagementView.swift`:
1. `ManagementItem.ID` enum extended with `savings` case.
2. `ManagementItem.all` gained a «Копилка» entry (`icon: banknote.fill`, `ownerOnly: false`) inserted before `.template` (per CONTEXT D-1).
3. `destination(for:)` switch now dispatches `case .savings: SavingsView()`.

### Task 2 — Features/Savings/ scaffold (commit 700f45b)
8 stub files, all compiling:
- `SavingsRoute.swift` — typed enum `SavingsRoute { case goal(id: Int) }` (Hashable). Avoids `Int.self` destination collision with AccountsView and `PlanEditorRoute` in the shared ManagementView NavigationStack.
- `SavingsViewData.swift` — `enum SavingsViewData` stub (renamed from SavingsData; file basename also renamed — see Deviations).
- `SavingsViewModel.swift` — `@MainActor @Observable` class with `Status`, discriminated `SheetMode` (`.none/.newGoal/.deposit(goalId: Int?)`), `snapshot`, `accounts`, `sheet`, `submitting`, `mutationError`, `lastCreatedGoalId`, and derived getters (totalCents/monthInCents/goals/roundupEnabled/roundupBase). Bodies are no-op stubs.
- `SavingsView.swift` — placeholder List body + `.navigationTitle("Копилка")` + `.task { load() }`.
- `GoalDetailViewModel.swift` — `@MainActor @Observable` class with `goalId` (let, init-injected), `Status`, `goal`, `accounts`, `submitting`, `mutationError`.
- `GoalDetailView.swift` — `GoalDetailView(goalId:)` placeholder.
- `SavingsNewGoalSheet.swift` — `struct SavingsNewGoalSheet` (renamed from V10 `NewGoalSheet`).
- `SavingsDepositSheet.swift` — `struct SavingsDepositSheet` (renamed from V10 `DepositSheet`).

`xcodegen generate` regenerated `.xcodeproj`; `make build` → **Build Succeeded**.

## Stub Interface Surface (for 62-02 / 62-03)
- 62-02 fills: `SavingsViewModel.load() / toggleRoundup / selectBase / createGoal / deleteGoal / deposit`, and `SavingsViewData` pure-compute helpers, plus the real `SavingsView` List body.
- 62-03 fills: `GoalDetailViewModel.load() / deleteGoal()`, `GoalDetailView` body, and the two sheet Form bodies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed SavingsData.swift → SavingsViewData.swift**
- **Found during:** Task 2 (first `make build`).
- **Issue:** The plan's `must_haves` asserted the file should keep basename `SavingsData.swift` (only the *type* renamed to `SavingsViewData`). But Xcode/Swift rejects two source files sharing the same basename in one target: `error: Filename "SavingsData.swift" used twice` (vs `FeaturesV10/Savings/SavingsData.swift`). Build failed. The plan's collision analysis covered type-name collision but missed filename-basename collision.
- **Fix:** Renamed the v06 file to `SavingsViewData.swift` (basename now unique). Type was already `SavingsViewData`. Updated the file's header comment to document the reason. No other file collided on basename (the other 7 names are already unique vs V10).
- **Files modified:** `ios/BudgetPlanner/Features/Savings/SavingsViewData.swift` (was `SavingsData.swift`).
- **Commit:** 700f45b
- **Impact on downstream:** Plan 62-02 references for SavingsData helpers should target `Features/Savings/SavingsViewData.swift`. Type name `SavingsViewData` is unchanged, so no code-symbol churn.

## Coexistence Guard Verification
- `git status --porcelain ios/BudgetPlanner/FeaturesV10/Savings/` → 0 lines (V10 untouched: SavingsV10View, SavingsV10ViewModel, SavingsData, NewGoalSheet, DepositSheet).
- `git status --porcelain ios/BudgetPlanner/MainShell.swift` → 0 lines (untouched).

## Verification Results
- All Task 1 grep gates: 1/1/1/1 pass.
- All Task 2 structural grep gates pass (8 files present; renamed types confirmed; no bare `enum SavingsData` / `struct NewGoalSheet` / `struct DepositSheet`).
- `xcodegen generate`: clean.
- `make build`: Build Succeeded (0 errors, 0 new warnings).

## Self-Check: PASSED
