---
phase: 62
plan: 03
subsystem: ios-savings-v06
tags: [ios, swiftui, savings, goal-detail, sheets, gap-closure, review-fixes, tests]
requires:
  - GoalDetailViewModel (stub from 62-01)
  - GoalDetailView (placeholder spinner from 62-01)
  - SavingsNewGoalSheet / SavingsDepositSheet (placeholder bodies from 62-01)
  - SavingsView/SavingsViewModel master (closure signatures, from 62-02)
  - SavingsViewData helpers (from 62-02)
  - GoalsAPI / AccountsAPI / SavingsAPI (existing)
  - GoalDTO / AccountDTO (existing); MoneyFormatter / MoneyParser (existing)
provides:
  - GoalDetailViewModel.load() (parallel list+filter-by-id) + deleteGoal() (Bool) + DEBUG backdoor
  - GoalDetailView functional body (4-state, Hero+progress, delete Menu→confirmationDialog, Пополнить CTA→pre-filled DepositSheet)
  - SavingsNewGoalSheet functional Form (name + target + optional MSK-correct due)
  - SavingsDepositSheet functional Form (amount + required account Picker + optional goal Picker pre-filled)
  - WR-05 fix (isValidDepositDraft requires accountId>0)
  - IN-04 fix (GoalCreateRequest.due encodes in Europe/Moscow)
  - GoalDetailViewModelTests (4) + 2 new WR-05 deposit-validation tests
affects:
  - ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift
  - ios/BudgetPlanner/Features/Savings/GoalDetailView.swift
  - ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift
  - ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift
  - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
  - ios/BudgetPlanner/Networking/DTO/GoalDTO.swift
tech-stack:
  added: []
  patterns:
    - "list+filter-by-id in detail VM (no GET /{id}) with single-message cross-tenant guard (mirror AccountDetailViewModel)"
    - "Self-contained GoalDetail deposit: CTA→SavingsAPI.postDeposit + viewModel.load() (no SavingsViewModel coupling)"
    - "MSK DateFormatter for wire yyyy-MM-dd to avoid MSK→UTC day-shift (IN-04)"
key-files:
  created:
    - ios/BudgetPlannerTests/Features/Savings/GoalDetailViewModelTests.swift
  modified:
    - ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift
    - ios/BudgetPlanner/Features/Savings/GoalDetailView.swift
    - ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift
    - ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift
    - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
    - ios/BudgetPlanner/Networking/DTO/GoalDTO.swift
    - ios/BudgetPlannerTests/Features/Savings/SavingsViewDataTests.swift
decisions:
  - "GoalDetail deposit routed through SavingsAPI.postDeposit + viewModel.load() inline (GoalDetail self-contained; SavingsViewModel untouched per scope)"
  - "GoalDetailViewModel network paths lack injectable API seam (same constraint as WR-06) — only state-machine + backdoor unit-tested"
metrics:
  duration: 12min
  tasks: 3
  files: 7
  completed: 2026-05-20
---

# Phase 62 Plan 03: Savings Gap Closure (v06 native) Summary

Closed the 3 verified gaps from 62-VERIFICATION (2/4): the three 62-01 stubs — `GoalDetailViewModel`/`GoalDetailView` and the two Form sheets — are now functional, plus the two folded-in code-review fixes (WR-05 accountId>0 gate, IN-04 MSK due-date encoding). The master `SavingsView`/`SavingsViewModel` surface was left untouched (out of scope). Build green; full suite 488 tests pass (incl. 4 new GoalDetailViewModel tests + 2 new WR-05 validation cases).

## What Was Built

### Task 1 — GoalDetailViewModel load/delete + WR-05 + IN-04 (commit 64074b2)
- `load()`: `inFlight` re-entrancy guard + `async let` parallel `GoalsAPI.list()` + `AccountsAPI.list()`; no GET /goals/{id} → list + filter by `goalId`. Cross-tenant/missing → single `.error("Цель не найдена")` (T-62-03, no existence leak); outer catch → `.error("Не удалось загрузить цель")` with raw error via `print()` only. This finally USES `goalId` (IN-01: property now live).
- `deleteGoal() -> Bool`: `submitting` guard (T-62-04) + `GoalsAPI.delete`; returns true on success (caller dismisses), false + `mutationError = "Не удалось удалить цель"` on failure. No post-delete `load()` (goal is gone).
- `#if DEBUG _setStateForTesting(goal:accounts:status:)` backdoor (mirror AccountDetailViewModel/SavingsViewModel).
- **WR-05** `SavingsViewData.isValidDepositDraft`: now `guard let accountId else { return false }; return amountCents > 0 && accountId > 0` (was accepting `accountId == 0` / any non-nil). Doc comment notes gt=0 enforcement.
- **IN-04** `GoalCreateRequest.encode`: `due` formatter timeZone `UTC` → `Europe/Moscow` (UTC kept only as `??` fallback). MSK DatePicker midnight no longer day-shifts the wire `yyyy-MM-dd`.

### Task 2 — GoalDetailView body + two Form sheets (commit 39ce3b7)
- **GoalDetailView**: 4-state `List(.insetGrouped)` (idle/loading spinner, error Label, ready, defensive fallback). Ready renders optional mutationError banner + heroSection (name `.title2`, `ProgressView(value:total:).tint(.green)`, `current ₽ из target ₽ · N%`, MSK-formatted due, achievement seal when current≥target>0) + actionSection («Пополнить»). Toolbar `…` Menu → «Удалить цель» destructive → `confirmationDialog` (T-62-02) → `deleteGoal()` → `dismiss()` on true. «Пополнить» CTA opens pre-filled `SavingsDepositSheet` (single-goal list, `initialGoalId: goalId`); onDeposit calls `SavingsAPI.postDeposit` then `viewModel.load()` (T-62-05 refresh) — keeps GoalDetail self-contained. `.task`/`.refreshable` load.
- **SavingsNewGoalSheet**: Form — «Название» TextField (.sentences) + «Целевая сумма» .decimalPad via `MoneyParser.parseToCents` + Toggle «Добавить срок» → DatePicker (`tomorrow...`, .date). `canCreate = isValidGoalDraft && !submitting`. Toolbar «Отмена»(disabled submitting) + «Создать»/«Создание…» → `onCreate(trimmedName, targetCents, hasDue ? dueDate : nil)`. No local presented flag (WR-02 awareness — sheet binding driven by viewModel.sheet).
- **SavingsDepositSheet**: `init` seeds `selectedGoalId` from `initialGoalId` and `selectedAccountId` from primary-or-first account. Form — «Цель» Picker (nil = «Общая копилка» + goals) + «Сумма» .decimalPad + «Счёт списания» Picker (footer tooltip). `canDeposit = isValidDepositDraft(amount, selectedAccountId) && !submitting` (relies on Task-1 WR-05). Toolbar «Пополнить»/«Пополнение…» → `onDeposit(amountCents, acc, selectedGoalId)`.

### Task 3 — Unit tests + xcodegen + full suite (commit 3f43314)
- `GoalDetailViewModelTests.swift` (new, 4 tests): initial idle state, ready-render via backdoor, clearMutationError, Status equality. Documented network-seam gap (no injectable API stub — same as WR-06).
- `SavingsViewDataTests.swift`: +2 WR-05 cases (`accountId: 0` → false, `accountId: -3` → false); existing nil/positive cases unchanged.
- `xcodegen generate` ran (new test file added to project). Full `xcodebuild test` → **TEST SUCCEEDED**, 488 tests, 0 failures.

## Threat-Model Mitigations Verified
- **T-62-01** (Tampering): `isValidGoalDraft` (target>0) + `isValidDepositDraft` (amount>0 && accountId>0 after WR-05) gate the confirmation buttons.
- **T-62-02** (Repudiation): GoalDetail delete behind `.confirmationDialog "Удалить цель?"`.
- **T-62-03** (Info disclosure): cross-tenant/missing → «Цель не найдена»; outer/delete catch → fixed Russian copy; raw errors via `print()` only (0 `error.localizedDescription`).
- **T-62-04** (Double-submit): `submitting` guard on deleteGoal + `.disabled(submitting)` on toolbar buttons + `interactiveDismissDisabled(submitting)`.
- **T-62-05** (Stale state): `await viewModel.load()` after successful deposit refreshes hero/progress.
- **T-62-06** (Date drift): IN-04 MSK encoder so wire day == picked day.

## Deviations from Plan
None — plan executed as written. Used iPhone 17 Pro simulator (project Makefile default) rather than the plan's example `iPhone 16` destination string; both are simulator destinations.

## Open Review Warnings (intentionally OUT of this gap-closure scope)
These live in the already-shipped `SavingsViewModel` master-view mutation paths, which this plan did not touch (objective explicitly forbids editing `SavingsViewModel.swift` / `SavingsView.swift`):
- **WR-01 / WR-02 / WR-03 / WR-04 / WR-06** — remain OPEN. WR-02 (createGoal dismisses sheet on failure) was noted in NewGoalSheet but not fixed here (lives in SavingsViewModel). Defer to a separate polish pass.

## Known Constraints
- `GoalDetailViewModel.load()` / `deleteGoal()` call the concrete `GoalsAPI` / `AccountsAPI` / `SavingsAPI` enums directly — no injectable API seam exists (same constraint as 62-REVIEW WR-06). Only the state-machine + backdoor are unit-tested; success/failure network round-trips are deferred to the verifier's live-env smoke.

## Verification Results
- Task 1 grep gates: `accountId > 0` in SavingsViewData = 1; `Europe/Moscow` in GoalDTO = 3 (UTC only as fallback); `GoalsAPI.list|delete` in VM = 4 — pass.
- Task 2 grep gates: both sheet placeholders gone (grep -L lists both files); `ProgressView("Загрузка…")` = 0; `ProgressView(value:` = 1; `onCreate(` = 1; `onDeposit(` = 1 — pass.
- Task 3: `xcodegen generate` ran; full `xcodebuild test` (iPhone 17 Pro) → **TEST SUCCEEDED**, 488 tests, 0 failures; 7 new/affected Savings test cases passed.
- `xcodebuild build` → **BUILD SUCCEEDED** after each task.
- swift-format applied to all touched source + test files (exit 0); rebuilt + retested green post-format.
- No file deletions in the 3 task commits.

## Self-Check: PASSED
