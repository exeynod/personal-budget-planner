---
phase: 62-savings-goals-v06
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - ios/BudgetPlanner/Features/Savings/GoalDetailView.swift
  - ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift
  - ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift
  - ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift
  - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
  - ios/BudgetPlanner/Networking/DTO/GoalDTO.swift
  - ios/BudgetPlannerTests/Features/Savings/GoalDetailViewModelTests.swift
  - ios/BudgetPlannerTests/Features/Savings/SavingsViewDataTests.swift
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This is the gap-closure work that makes GoalDetailView / SavingsNewGoalSheet / SavingsDepositSheet functional and claims to fix WR-05 (accountId>0) and IN-04 (MSK due-date encoding).

Verdict on the targeted fixes:
- **WR-05 — CORRECTLY FIXED.** `SavingsViewData.isValidDepositDraft` now requires `accountId > 0` (line 99-102) and has dedicated tests for zero/negative account (SavingsViewDataTests lines 140-146).
- **IN-04 — CORRECTLY FIXED for the common case** (encoder formats `due` in `Europe/Moscow`, GoalDTO.swift lines 66-70). No UTC day-shift for MSK/eastward/midnight-UTC devices. One residual eastward edge case remains (WR-04) and there is **zero test coverage** for the encode path (WR-03).
- **Cross-tenant guard in `GoalDetailViewModel.load()` — CORRECT.** Missing/foreign goal collapses to a single non-leaking "Цель не найдена" message (lines 63-66).
- **WR-02 NOT repeated in the new sheets** — both sheets keep their input and delegate dismissal to the caller; they do not self-dismiss on error.

The one blocking defect: the GoalDetailView deposit path bypasses every concurrency guard the design claims (T-62-04), so the "Пополнить" CTA is double-submittable and the sheet is interactively dismissable mid-flight. The master SavingsView/SavingsViewModel WR-01..06 are out of scope and were not re-flagged.

## Critical Issues

### CR-01: GoalDetailView deposit path has no submitting guard — double-submit + dismiss-mid-flight

**File:** `ios/BudgetPlanner/Features/Savings/GoalDetailView.swift:87-109`
**Issue:** The deposit sheet is fed `submitting: viewModel.submitting`, and `onDeposit` calls `SavingsAPI.postDeposit` directly. But `GoalDetailViewModel.submitting` is **only ever set by `deleteGoal()`** — the deposit flow never sets it. During a deposit:

- `SavingsDepositSheet.canDeposit` (`... && !submitting`) stays `true`, so the "Пополнить" button is never disabled → a slow network lets the user tap it repeatedly, firing N concurrent `postDeposit` calls (each a real money mutation).
- `interactiveDismissDisabled(submitting)` stays `false`, so the user can swipe the sheet away while a deposit is in flight.
- The button label never switches to "Пополнение…".

This is exactly the T-62-04 concurrency threat the sheet header claims to defend (`SavingsDepositSheet.swift:18-20`). For a money-moving endpoint, duplicate submits are a data-integrity / financial-correctness risk.

**Fix:** Drive a real submitting flag for the deposit path. Add a deposit method on `GoalDetailViewModel` (mirroring `deleteGoal`'s `submitting` guard) and call it from the view instead of hitting `SavingsAPI` inline:

```swift
// GoalDetailViewModel.swift
@discardableResult
func deposit(amountCents: Int, accountId: Int, goalId: Int?) async -> Bool {
    guard !submitting else { return false }
    guard SavingsViewData.isValidDepositDraft(amountCents: amountCents, accountId: accountId)
    else { return false }
    submitting = true
    defer { submitting = false }
    do {
        _ = try await SavingsAPI.postDeposit(
            amountCents: amountCents, accountId: accountId, goalId: goalId)
        await load()
        return true
    } catch {
        print("[GoalDetailViewModel] deposit failed: \(error)")
        mutationError = "Не удалось пополнить"
        return false
    }
}
```

```swift
// GoalDetailView.swift — onDeposit
onDeposit: { amount, accountId, goalId in
    let ok = await viewModel.deposit(amountCents: amount, accountId: accountId, goalId: goalId)
    if ok { showDeposit = false }
    return ok
},
```

This also surfaces deposit failures in the mutation-error banner instead of swallowing them to `print` only (line 102-104).

## Warnings

### WR-01: Deposit failure in GoalDetailView is silently swallowed — user sees nothing

**File:** `ios/BudgetPlanner/Features/Savings/GoalDetailView.swift:101-105`
**Issue:** On deposit failure the inline `onDeposit` only does `print(...)` and returns `false`. The sheet stays open (good — input preserved), but there is **no user-visible error**: no banner, no alert, no toast. The "Пополнить" button just appears to do nothing. The view already has a `mutationError` banner mechanism (lines 54-55, 116-135) that is wired only to delete failures. A user whose deposit fails (network blip, 422) gets no feedback and may assume it succeeded.
**Fix:** Route the deposit through the view model (see CR-01) so the failure sets `viewModel.mutationError = "Не удалось пополнить"`, reusing the existing banner. The banner renders in the GoalDetailView body, not inside the sheet — acceptable, since on success the sheet closes and the error is visible behind it; or surface the error inside the sheet for immediate feedback.

### WR-02: SavingsDepositSheet ignores late-arriving accounts/goals — empty/wrong default selection

**File:** `ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift:33-51`
**Issue:** `selectedAccountId` and `selectedGoalId` are seeded from `init` arguments **once** via `State(initialValue:)`. SwiftUI does not re-run `init`'s `State` seeding when the parent passes new `accounts`/`goals`. In `GoalDetailView` the sheet is constructed inside the `.sheet { }` closure with `accounts: viewModel.accounts`, so if it is presented before `load()` finishes (it cannot today because the CTA only shows in `.ready`, but this is fragile), `accounts` would be empty and `selectedAccountId` would be `nil` with no way to recover — the account Picker would be empty and `canDeposit` permanently `false`. The current call-site happens to be safe, but the component is not robust to the documented "accounts arrive later" pattern.
**Fix:** Add an `.onChange(of: accounts)` / `.onAppear` reconciliation that picks a default account when `selectedAccountId == nil`, e.g.:
```swift
.onChange(of: accounts) { _, new in
    if selectedAccountId == nil {
        selectedAccountId = new.first(where: { $0.primary })?.id ?? new.first?.id
    }
}
```

### WR-03: IN-04 fix (MSK due-date encoding) has zero test coverage

**File:** `ios/BudgetPlanner/Networking/DTO/GoalDTO.swift:50-74`
**Issue:** The IN-04 fix is the load-bearing change of this gap-closure, yet there is no unit test asserting that `GoalCreateRequest.encode` emits the MSK-correct `yyyy-MM-dd` string and never an ISO timestamp. A future refactor (e.g., dropping the custom `encode(to:)` and relying on the default `.iso8601` strategy from APIClient line 59) would silently reintroduce the exact bug IN-04 fixed, and CI would stay green. The encode path is pure/synchronous and trivially testable with no network.
**Fix:** Add a test that encodes a `GoalCreateRequest` with a known `due` Date and asserts the JSON contains `"due":"2026-09-12"` (and `target_cents` snake_case), plus a nil-`due` case asserting `"due":null`. Use a fixed MSK-midnight Date built from `DateComponents` so the assertion is deterministic.

### WR-04: SavingsNewGoalSheet DatePicker uses Calendar.current while encoder uses MSK — residual day-shift for far-east devices

**File:** `ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift:34,50-52` and `ios/BudgetPlanner/Networking/DTO/GoalDTO.swift:66-70`
**Issue:** The picker builds `dueDate` / `minDueDate` with `Calendar.current` (device timezone), but `GoalCreateRequest.encode` formats the chosen instant in `Europe/Moscow`. For a device east of MSK, the user-picked local midnight can map to the *previous* calendar day in MSK — reintroducing an off-by-one in the opposite direction from IN-04. Example: device at UTC+12, user picks Sept 12 → local midnight = Sept 11 12:00 MSK → wire emits `"2026-09-11"`. IN-04's comment (GoalDTO.swift:62-65) only reasons about an MSK device. The two calendars should agree.
**Fix:** Make the picker calendar MSK too, so what the user sees equals what is encoded:
```swift
private static let mskCalendar: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
    return c
}()
@State private var dueDate: Date = SavingsNewGoalSheet.mskCalendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
private var minDueDate: Date { SavingsNewGoalSheet.mskCalendar.date(byAdding: .day, value: 1, to: Date()) ?? Date() }
```
(Also note the symmetric decode-side: `APIClient` parses `yyyy-MM-dd` with no `timeZone` set (device-local), and `formatDue` re-extracts in MSK — same far-east-device skew can shift the displayed due date. That decoder is out of scope here but worth a follow-up since it now feeds `formatDue`.)

## Info

### IN-01: `trimmedName` computed but partially redundant; `canCreate` validates untrimmed name

**File:** `ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift:42-48,97`
**Issue:** `canCreate` calls `isValidGoalDraft(name: name, ...)` with the raw `name`, while the submit handler sends `trimmedName`. `isValidGoalDraft` trims internally so the gate is correct, but having two name representations (`name` for the gate, `trimmedName` for submit) is mildly confusing and a foot-gun if someone later changes the gate to use `name.count`. Minor; behavior is currently correct.
**Fix:** Pass `trimmedName` to both for consistency, or drop `trimmedName` and trim once at submit.

### IN-02: `accountLabel` duplicated across deposit sheet and likely elsewhere

**File:** `ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift:64-66`
**Issue:** `bank + (mask.map { " ·\($0)" } ?? "")` is an account display-string convention that almost certainly recurs in other account pickers (AddSheet, AccountDetail). Duplicating the format risks divergence (e.g., the middle-dot separator).
**Fix:** Consider a shared `AccountDTO.displayLabel` computed property. Non-blocking.

### IN-03: GoalDetailViewModel deposit path is untested and explicitly undocumented in the test rationale

**File:** `ios/BudgetPlannerTests/Features/Savings/GoalDetailViewModelTests.swift:9-14`
**Issue:** The test file documents that `load()`/`deleteGoal()` are uncovered due to no injectable API seam, but says nothing about the deposit path — because (per CR-01) the deposit logic lives inline in the View, not the view model, so it is untestable at all. Moving deposit into the view model (CR-01 fix) makes it state-machine-testable via the existing `_setStateForTesting` backdoor pattern.
**Fix:** After CR-01, add a submitting-guard test for the new `deposit` method.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
