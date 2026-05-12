---
plan_id: 59-01
phase: 59
title: TransactionsViewModel migration to ActualV10DTO + tests
status: complete
completed_at: 2026-05-12T07:46:57Z
commits:
  - 44e8961
  - c34f54e
files_modified:
  - ios/BudgetPlanner/Features/Transactions/TransactionsView.swift
files_created:
  - ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift
requirements_completed:
  - v1.1.2-59-CONTEXT-area-1-data-layer
  - v1.1.2-59-CONTEXT-area-5-coexistence
threats_mitigated:
  - T-59-02
  - T-59-03
duration_minutes: ~25
---

# Phase 59 Plan 01: TransactionsViewModel migration to ActualV10DTO + tests Summary

One-liner: переписал `TransactionsViewModel` в `Features/Transactions/TransactionsView.swift` с legacy data layer (ActualAPI / CategoriesAPI / 2-valued kind) на v1.0 surface (ActualV10API / CategoriesV10API / ActualKindV10 4-valued), добавил Europe/Moscow Calendar для day-grouping, `inFlight` concurrency guard, `deleteError` banner-state, `Notification.Name.txnCreated` observer (DEBT-02 pattern), и 15 unit tests с JSON-fixture pattern.

## ViewModel state machine (final)

```
state: LoadState = .idle | .loading | .loaded | .error(String)
```

`.idle` — initial state (allows `inFlight` guard to no-op the first concurrent
`load()` call). `.loading` — fetch in flight. `.loaded` — registry populated.
`.error(String)` — fixed Russian copy only ("не удалось загрузить транзакции");
raw error text never assigned to user-visible state (T-59-03).

### Storage

| Property                  | Type                  | Source                         |
| ------------------------- | --------------------- | ------------------------------ |
| `period`                  | `PeriodDTO?`          | `PeriodsAPI.current()`         |
| `actuals`                 | `[ActualV10DTO]`      | `ActualV10API.list(periodId:)` |
| `planned`                 | `[PlannedDTO]`        | `PlannedAPI.list(periodId:)` (legacy per D-01) |
| `categories`              | `[CategoryV10DTO]`    | `CategoriesV10API.list()`      |
| `subTab`                  | `TxSubTab`            | UI (.history / .plan)          |
| `kind`                    | `CategoryKind`        | UI segment (.expense / .income) |
| `savingsSegmentSelected`  | `Bool`                | UI synthetic 3rd segment       |
| `categoryFilter`          | `Int?`                | UI category filter Menu        |
| `deleteError`             | `String?`             | Delete failure banner          |
| `inFlight`                | `Bool` (@ObsIgnored)  | T-59-02 concurrency guard      |
| `calendar`                | `Calendar` (@ObsIgn)  | Europe/Moscow gregorian        |
| `txnCreatedObserver`      | `NSObjectProtocol?` (@ObsIgn) | Notification token       |

### New computed property surface

| Property            | Returns                | Behaviour                                                                    |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `filteredActuals`   | `[ActualV10DTO]`       | Savings: `.roundup`+`.deposit`; else `bucketKind == kind` ∧ deposit excluded |
| `filteredPlanned`   | `[PlannedDTO]`         | `[]` when `.plan` + Savings; else `kind`-matched + filter intersect          |
| `visibleCategories` | `[CategoryV10DTO]`     | Used-in-current-bucket ∧ category.kind == self.kind (or savings bucket)      |
| `dayGroups`         | `[TxDayGroup]`         | Delegates to `TransactionsData.groupByDay` with Moscow Calendar              |

`bucketKind(_:)` helper maps `ActualKindV10 → CategoryKind`:
- `.expense, .roundup → .expense` (roundup visible in Расходы per D-02)
- `.income, .deposit → .income` (deposit fenced off by separate guard — only visible under Savings)

## Namespace resolution

**Plan-phase question: «CategoryKind 4-valued — UX» (CONTEXT.md line 38) — does the V10 enum collide with legacy?**

**Investigation finding: NO collision exists at the code level.**

- `CommonDTO.swift` defines `enum CategoryKind { expense, income }` — 2-valued.
- `CategoryV10DTO.kind: CategoryKind` references the SAME `CommonDTO.CategoryKind` (lines 17, 36 of CategoryV10DTO.swift). Backend `CategoryRead` schema has not yet been widened to emit `savings` / `other` (Phase 22 schema gap documented in CategoryV10DTO.swift docstring).
- The only 4-valued enum is `ActualKindV10` in `TransactionDTO.swift` — and it applies ONLY to actual transactions, not categories.

**Conclusion:** no typealias / qualified usage needed. The ViewModel uses
`CategoryKind` (2-valued) for `kind` and `ActualKindV10` (4-valued) for
actual rows — they are distinct types with non-overlapping names. The
"namespace collision" mentioned in CONTEXT.md D-06 was a planner concern,
not a code reality. Plan-phase verified this and proceeded with bare
`CategoryKind` + `ActualKindV10` references.

CONTEXT.md statement «CategoriesV10API.list() → [CategoryV10DTO] (4-valued CategoryKind: expense / income / savings / other)» is **inaccurate** — schema gap means CategoryV10DTO.kind is 2-valued today. UI layer in 59-02 will need separate provisioning if/when backend widens it.

## Threat mitigations

| ID      | Category                | Mitigation                                                                                         |
| ------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| T-59-02 | Tampering / Concurrency | `inFlight: Bool` guard at top of `load()`, `deleteActual()`, `deletePlanned()` — re-entrant calls become no-ops. Mirrors `TransactionsV10ViewModel.inFlight` (Phase 25-09 T-25-09-03). |
| T-59-03 | Information Disclosure  | Catch blocks emit fixed Russian copy ("не удалось загрузить транзакции" / "не удалось удалить операцию"). Raw error printed to console via `print(...)` only — never assigned to user-visible `state` or `deleteError`. Verified: `grep -c "error.localizedDescription" → 0`. |

## Test coverage matrix

| Test function                                                       | Behaviour from Task 1 `<behavior>`                  |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| `test_initialState_idleLoadingEmpty`                                | 1 (initial state)                                   |
| `test_filteredActuals_kindExpense_returnsExpenseAndRoundupRows`     | 2 (kind=expense → expense+roundup, no income/deposit) |
| `test_filteredActuals_kindIncome_returnsIncomeOnlyExcludesDeposit`  | 2 (kind=income → income only)                       |
| `test_filteredActuals_savingsSegment_returnsRoundupAndDeposit`      | 2 (savingsSegmentSelected → roundup+deposit)        |
| `test_filteredActuals_categoryFilter_intersectsWithKind`            | 3 (categoryFilter intersect kind)                   |
| `test_filteredPlanned_savingsSegmentInPlanSubtab_returnsEmpty`      | 4 (D-02 Savings in .plan → empty)                   |
| `test_filteredPlanned_normalKindFiltersByKind`                      | 4 (filteredPlanned base case)                       |
| `test_visibleCategories_history_returnsOnlyUsedKindMatch`           | 5 (visibleCategories in .history)                   |
| `test_visibleCategories_history_savingsSegment_returnsRoundupDepositCats` | 5 (visibleCategories with Savings)            |
| `test_visibleCategories_plan_returnsOnlyUsedKindMatch`              | 5 (visibleCategories in .plan)                      |
| `test_dayGroups_threeDaysInMoscowTZ_returnsSortedDesc`              | 6 (dayGroups DESC sort)                             |
| `test_dayGroups_sumsAbsoluteAmountsPerGroup`                        | 6 (sumCents Σ\|amount\|)                            |
| `test_clearDeleteError_setsErrorToNil`                              | 11 (deleteError bookkeeping)                        |
| `test_initial_deleteError_isNil`                                    | 11 (deleteError initial)                            |
| `test_notificationTxnCreated_triggersLoad`                          | 7 (.txnCreated → load state transitions off .idle)  |

15 tests / required ≥10. All tests `@MainActor`, mirror `TransactionsDataTests.swift` JSON-fixture pattern.

## Build verification

- `xcodegen generate` regenerated `BudgetPlanner.xcodeproj` to pick up new test file.
- `make build` (xcodebuild build, iPhone 17 Pro simulator, Debug, CODE_SIGNING_ALLOWED=NO) — **App target builds clean**.
- `xcodebuild ... build-for-testing` — **Tests target builds clean** (TransactionsViewModelTests.swift compiles with no errors/warnings; pre-existing warnings in `FinalSubmitTests.swift` are out of scope).
- Test execution deferred to 59-03 final verification (per plan `<done>` — running tests requires booted simulator, which the plan acknowledges is deferred to 59-03).

## Deviations from plan

- **View body — deviation from the plan's "leave-broken" stance.** The plan
  (`<action>` step 11 + closing comment block) anticipated that the View body
  lines 96+ would FAIL to compile until 59-02 fixes them, citing that "build
  broken on main is acceptable WITHIN this plan's commit boundary." However,
  the plan's own `<verification>` grep gate
  `grep -v '//' | grep -c 'actuals: \[ActualDTO\]' → 0` required removing the
  remaining `historyGroups(actuals: [ActualDTO])` and similar helpers from
  the View body. To satisfy both the grep gate AND keep the file parseable
  Swift (avoiding a compile-broken `main`), the View body was replaced with
  a minimal placeholder that:
    - Renders progress / error / loaded states against the new VM API
      (`viewModel.state` includes new `.idle` case; `viewModel.dayGroups`,
      `viewModel.filteredPlanned`, `viewModel.category(:)` consumed).
    - Surfaces `viewModel.deleteError` as a banner section with «Скрыть»
      dismiss button.
    - Iterates `dayGroups` / `filteredPlanned` with plain `Text` rows.
  Full 3-segment kind Picker / per-day Section / swipe-to-delete /
  confirmationDialog / category-filter Menu / editor sheets remain
  the explicit deliverable of Plan 59-02. Rationale: keeping the build
  green on `main` between 59-01 and 59-02 is strictly safer than relying
  on the "atomic immediate next wave" assumption — if 59-02 stalls for any
  reason, `main` still ships. The placeholder is functionally inferior to
  the legacy UI but compiles, runs, and exercises every new VM surface
  property so 59-02 can rebuild on top without re-investigation.
- **Removed `private struct ActualRow`, `PlannedRow`, `historyGroups()`,
  `plannedGroups()`, `headerTitle()`, `emptySection()`, `categoryFilterMenu`,
  `editingActual`, `editingPlanned` state — all of these referenced the
  legacy `ActualDTO` / `CategoryDTO` / `MoneyFormatter.formatWithSymbol`
  / `TransactionEditor` API. They will be rebuilt against
  `ActualV10DTO` / `CategoryV10DTO` / new editor surface in 59-02. The plan
  noted `TransactionEditor.swift` is out of scope (Phase 64 will rewrite),
  so 59-02 will keep editor sheets stubbed unless it explicitly bridges them.

No other deviations. No auth gates encountered (unit tests run offline; network calls intentional in the Notification observer test fail to .error per the plan's expected behaviour).

## Known acceptance: View body status

Per plan `<acceptance_criteria>`: «View body below is acknowledged broken
(commented TODO marker present) — explicit acceptance of plan-boundary
compile break.» — softened by the deviation above. View body is **not**
broken; it is a stub. Compile state of `main` after 59-01 commit: **clean**.
File-top comment (lines 1–6) marks the stub and points to 59-02 for the UI
rebuild.

## Self-Check

**Files claimed:**

- `ios/BudgetPlanner/Features/Transactions/TransactionsView.swift` — FOUND
- `ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift` — FOUND

**Commits claimed:**

- `44e8961` (`feat(59-01-01): migrate TransactionsViewModel to V10 data layer`) — FOUND
- `c34f54e` (`test(59-01-02): unit tests for TransactionsViewModel filter/grouping/observer`) — FOUND

**Plan `<verification>` grep gates** — all match:

- `grep -c "ActualV10DTO" ...` → 6 (≥3)
- `grep -v '//' | grep -c 'actuals: \[ActualDTO\]'` → 0 (==0)
- `grep -c "CategoriesV10API.list" ...` → 2 (≥1)
- `grep -cE "Notification.Name.txnCreated|\.txnCreated," ...` → 1 (≥1)
- `grep -c "deleteError:" ...` → 1 (≥1)
- `grep -c "error.localizedDescription" ...` → 0 (==0)
- `test -f BudgetPlannerTests/.../TransactionsViewModelTests.swift` → exists
- `grep -c "func test_" ...` → 15 (≥10)
- `grep -c '@testable import BudgetPlanner' ...` → 1 (==1)
- `grep -c 'TimeZone(identifier: "Europe/Moscow")' tests` → 2 (≥1)
- `grep -c "savingsSegmentSelected" tests` → 12 (≥2)

**Build verification:** `make build` clean; `xcodebuild build-for-testing` clean.

## Self-Check: PASSED
