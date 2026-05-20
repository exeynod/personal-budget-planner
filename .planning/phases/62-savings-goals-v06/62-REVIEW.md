---
phase: 62-savings-goals-v06
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - ios/BudgetPlanner/Features/Management/ManagementView.swift
  - ios/BudgetPlanner/Features/Savings/GoalDetailView.swift
  - ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift
  - ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift
  - ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift
  - ios/BudgetPlanner/Features/Savings/SavingsRoute.swift
  - ios/BudgetPlanner/Features/Savings/SavingsView.swift
  - ios/BudgetPlanner/Features/Savings/SavingsViewData.swift
  - ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift
  - ios/BudgetPlannerTests/Features/Savings/SavingsViewDataTests.swift
  - ios/BudgetPlannerTests/Features/Savings/SavingsViewModelTests.swift
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 62 delivers the v06 native Savings (Копилка) master screen: `SavingsView`, `SavingsViewModel`, pure-compute `SavingsViewData`, the `SavingsRoute` typed enum, plus intentional stubs for `GoalDetailView`/`GoalDetailViewModel` and the two Form sheets (scoped to Plan 62-03). The `ManagementView` change wires the new `.savings` menu entry.

No critical defects (no injection, no secrets, no crash-on-launch). The money/cents and sign conventions are respected, and `progressPercentage` correctly guards divide-by-zero. However there are several behavioral defects in the ViewModel/View that will produce visible wrong behavior at runtime:

- A stale `mutationError` banner survives a successful reload and stays visible (state-leak).
- The mutation methods dismiss the sheet on failure, hiding the form before the user can read/retry, and discarding their unsaved input.
- The `load()` `inFlight` guard silently no-ops the post-mutation reload because the mutation already holds no `inFlight` lock — actually the reverse: concurrent `.task` + `.refreshable` + mutation reload can drop a refresh. Detailed below.
- The roundup Toggle/Picker `set:` closures fire a `Task` even when SwiftUI re-applies the same value, causing redundant PATCH calls.

The stubs are correctly scoped and not flagged for being stubs; one real wiring concern in the stubs is noted.

## Warnings

### WR-01: Stale `mutationError` banner persists across a successful reload

**File:** `ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift:64-81`
**Issue:** `load()` never clears `mutationError`. The banner is rendered whenever `status == .ready && mutationError != nil` (`SavingsView.swift:44-46`). After a failed mutation sets `mutationError` (e.g. `deleteGoal` failure at line 170), a subsequent successful pull-to-refresh (`.refreshable { await viewModel.load() }`) repopulates the snapshot and returns to `.ready`, but the now-irrelevant error banner remains pinned at the top of the list. The user sees "Не удалось удалить цель" sitting above a freshly-loaded, correct list.
**Fix:** Clear the error at the start of a successful load path:
```swift
func load() async {
    if inFlight { return }
    inFlight = true
    defer { inFlight = false }
    status = .loading
    do {
        async let snapTask = SavingsAPI.summary()
        async let accsTask = AccountsAPI.list()
        let (snap, accs) = try await (snapTask, accsTask)
        self.snapshot = snap
        self.accounts = accs
        self.mutationError = nil   // drop stale mutation error on fresh data
        status = .ready
    } catch { ... }
}
```

### WR-02: Mutations dismiss the sheet on failure, destroying user input

**File:** `ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift:151-156` (createGoal), `182-194` (deposit)
**Issue:** Both `createGoal` and `deposit` set `sheet = .none` in the `catch` branch in addition to setting `mutationError`. When the network call fails, the sheet is force-dismissed and the user's typed name / target / amount / selected account are lost. They must reopen the sheet and re-enter everything. The success branch closing the sheet is correct; the failure branch should keep the sheet open so the user can retry. The error copy is also shown in the master banner behind the sheet, which the user cannot see while the sheet is presented — so on failure they get neither the form nor a visible error.
**Fix:** Remove `sheet = .none` from the `catch` blocks (keep it only on success), and surface the failure inside the sheet (e.g. via the returned `Bool` the sheet already receives from `onCreate`/`onDeposit`):
```swift
} catch {
    print("[SavingsViewModel] createGoal failed: \(error)")
    mutationError = "Не удалось создать цель"
    return false   // keep sheet open; caller shows inline error
}
```

### WR-03: `load()` `inFlight` guard can silently drop a reload, leaving stale UI

**File:** `ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift:65-67`, `104`, `128`, `147`, `167`, `186`
**Issue:** `load()` early-returns when `inFlight` is true. Mutation paths call `await load()` after a successful POST/DELETE/PATCH to refresh (T-62-05). If a `load()` is already running — e.g. the user pulls-to-refresh (`.refreshable`) or the initial `.task` load is still in flight while a mutation completes — the mutation's reload is silently skipped. The result: the just-created/deleted goal or the just-applied deposit is NOT reflected, defeating the stated stale-state mitigation. Because `submitting` is released by `defer` before any retry, there is no recovery path; the list stays stale until the next manual refresh.
**Fix:** Either await/coalesce the in-flight load instead of dropping it, or have mutations bypass the guard with a forced reload. Minimal approach — track a "reload requested" flag and re-run after the current load finishes, or restructure so the post-mutation reload does not race the guard. At minimum, document and test the concurrent-refresh-during-mutation case (currently untested — see WR-06).

### WR-04: Roundup Toggle/Picker `set:` closures fire redundant PATCH requests

**File:** `ios/BudgetPlanner/Features/Savings/SavingsView.swift:170-192`
**Issue:** The Toggle and segmented Picker use manual `Binding(get:set:)` whose `set:` unconditionally spawns `Task { await viewModel.toggleRoundup(newValue) }` / `selectBase(newValue)`. SwiftUI may invoke a binding `set:` with the same value it already holds (re-render, state restoration, optimistic snapshot rebuild re-emitting the value). Each such call issues another `PATCH /savings/config`. There is no equality check, so flipping the toggle or re-selecting the current base can produce duplicate network writes. `toggleRoundup`/`selectBase` also have no `submitting` guard (unlike the other mutations), so concurrent PATCHes can interleave and the later `await load()` on failure can clobber a successful optimistic state.
**Fix:** Guard against no-op writes:
```swift
set: { newValue in
    guard newValue != viewModel.roundupEnabled else { return }
    Task { await viewModel.toggleRoundup(newValue) }
}
```
and similarly for `selectBase`. Consider extending the `submitting`/in-flight guard to the config-PATCH paths.

### WR-05: `deposit(accountId:)` validation accepts `accountId == 0` while backend requires `gt=0`

**File:** `ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift:176-179`, `ios/BudgetPlanner/Features/Savings/SavingsViewData.swift:97-99`
**Issue:** `deposit` takes a non-optional `accountId: Int`, then validates via `isValidDepositDraft(amountCents:accountId:)`, which only checks `accountId != nil`. Since `accountId` is already non-optional `Int`, the nil check is always true and `accountId == 0` (or negative) passes the gate. The backend contract is `account_id = Field(gt=0)` (per `SavingsDTO.swift:22-24` / `GoalsAPI`/`SavingsAPI` comments), so a `0` account id will round-trip to the server and be rejected with a 422 that the user sees only as the generic "Не удалось пополнить". The client-side gate that is supposed to prevent this is ineffective for the non-optional call site.
**Fix:** Tighten the validator to require a positive id and reflect that the deposit call site passes a concrete Int:
```swift
static func isValidDepositDraft(amountCents: Int, accountId: Int?) -> Bool {
    guard let accountId else { return false }
    return amountCents > 0 && accountId > 0
}
```
Add a unit test for `accountId: 0` (currently `SavingsViewDataTests` only covers nil and a valid positive id).

### WR-06: Mutation paths (createGoal / deposit / deleteGoal / toggleRoundup) have zero test coverage

**File:** `ios/BudgetPlannerTests/Features/Savings/SavingsViewModelTests.swift:1-156`
**Issue:** The VM test file exercises only initial state, derived getters, `Status`/`SheetMode` equality, clear helpers, and the `_setStateForTesting` backdoor. None of the actual behavior introduced in Plan 62-02 — the `submitting` guard preventing double-submit (T-62-04), optimistic snapshot rebuild + revert-on-failure for roundup (T-62-05), sheet dismissal on success vs failure (WR-02), or `inFlight` reload coalescing (WR-03) — is tested. The header comment defers this to "62-04", but the riskiest logic in the phase ships unverified. The `submitting` "test" (`test_submitting_initialFalse`) only asserts the initial value, not the guard. This is a quality/robustness gap that lets WR-01..WR-04 ship undetected.
**Fix:** Add VM tests against an injectable API seam (the APIs are `@MainActor enum`s with `static` methods, so this likely requires introducing a protocol/closure seam). At minimum, assert: re-entrant `createGoal`/`deposit` while `submitting` returns `false` without a second network attempt; failed mutation keeps `sheet` open (after WR-02 fix); successful mutation clears `mutationError`.

## Info

### IN-01: Dead `goalId` stored property in `GoalDetailView`

**File:** `ios/BudgetPlanner/Features/Savings/GoalDetailView.swift:9-16`
**Issue:** `GoalDetailView` stores `let goalId: Int` and also passes it into `GoalDetailViewModel(goalId:)`. The view-level `goalId` property is never read in `body` (the VM owns it). This is a harmless duplicate now but is dead state. Acceptable for a stub; flag for cleanup when 62-03 fills the body if it remains unused.
**Fix:** Drop the view-level `goalId` and read `viewModel.goalId` if needed, or keep only if 62-03 will reference it directly.

### IN-02: `ManagementView` profile row is hardcoded, ignores the resolved `user`

**File:** `ios/BudgetPlanner/Features/Management/ManagementView.swift:47-73`
**Issue:** `profileRow` always renders the avatar initial "У" and the name "Пользователь" regardless of the authenticated `UserDTO`. Only `roleSubtitle` reads `user?.role`. The `user` computed property is otherwise used solely for `isOwner`. If real user display is intended, this is a placeholder; if intentional for single-tenant, the `Text("Пользователь")` literal is a magic string. Low impact (single-tenant app).
**Fix:** Either bind to `user` fields or add a comment noting the single-tenant placeholder is deliberate.

### IN-03: `Section("Цели · \(count)")` count uses re-sorted array; cheap but recomputed each render

**File:** `ios/BudgetPlanner/Features/Savings/SavingsView.swift:206-218`
**Issue:** `goalsSection` calls `SavingsViewData.sortGoalsForDisplay(viewModel.goals)` on every body evaluation. Correctness is fine (pure function, returns a new array). Noted only as a maintainability/readability item — the sort is duplicated conceptually with any future sorting and is recomputed on each render. Out of scope to fix for v1 (performance excluded), no action required.
**Fix:** None required for v1. If sorting becomes expensive, memoize in the VM.

### IN-04: `due` date encoded in UTC may shift the calendar day (latent, surfaces in 62-03)

**File:** `ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift:13` (consumer) — root cause in `GoalDTO.swift:60-64` (out of review scope)
**Issue:** `SavingsNewGoalSheet.onCreate` forwards a `Date?` `due` straight into `GoalCreateRequest`, which formats it with a UTC `DateFormatter` ("yyyy-MM-dd"). A DatePicker in an Europe/Moscow context produces a `Date` at MSK-midnight (= previous-day 21:00 UTC), so the encoded `yyyy-MM-dd` can be one day earlier than the user selected. The project convention is MSK for period/date math. The sheet is a stub (body lands in 62-03), so this is latent, and the encoder lives in `GoalDTO.swift` (not in the reviewed file set) — flagged here so the 62-03 implementer encodes `due` with an MSK calendar.
**Fix:** When 62-03 wires the DatePicker, format `due` using a Europe/Moscow `TimeZone` in the encoder (or extract day/month/year via the MSK calendar) so the wire date matches the picked calendar day.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
