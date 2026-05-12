---
plan_id: 59-03
phase: 59
status: complete
completed_at: 2026-05-12T11:25:00+03:00
commits:
  - d09244e
human_smoke_status: approved
human_smoke_at: 2026-05-12T11:25:00+03:00
---

# Plan 59-03 SUMMARY — Swipe-to-delete + confirmationDialog + banner

## What changed

- `ios/BudgetPlanner/Features/Transactions/TransactionsView.swift` (+98/-25, commit `d09244e`):
  - `@State private var pendingDeleteActual: ActualV10DTO?` — two-step delete flow state.
  - `.swipeActions(edge: .trailing)` на `ActualRow` в `historySections` — destructive `Button("Удалить", systemImage: "trash")`. Применяется ко всем kinds (`.expense`/`.income`/`.roundup`/`.deposit`) per D-04 (swipe gated by subtab, not kind).
  - `.confirmationDialog("Удалить операцию?", isPresented: $showDeleteConfirm)` на `NavigationStack` с destructive «Удалить» (→ `await viewModel.deleteActual(id:)`) + cancel «Отмена».
  - `ZStack(alignment: .top)` обертывает `content`; `deleteErrorBanner(_:)` overlay появляется когда `viewModel.deleteError != nil`. Banner: красный `Color.red.opacity(0.92)` rounded card + иконка `exclamationmark.triangle.fill` + текст + dismiss `xmark.circle.fill` → `viewModel.clearDeleteError()`.
  - Старая in-List banner section (Wave-1 stub) удалена — overlay её замещает.
  - `plannedSections` — без swipe (D-04 subtab-only).

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Swipe-left на row в `.history` reveals destructive «Удалить» | ✓ |
| `.confirmationDialog` с destructive + cancel перед DELETE | ✓ |
| Confirm → `deleteActual(id:)` + reload | ✓ |
| Cancel → no state change | ✓ |
| Failed DELETE → inline banner (НЕ заменяет list) | ✓ (ZStack overlay) |
| Banner dismiss × → `clearDeleteError()` | ✓ |
| Swipe в `.plan` — НЕТ destructive action | ✓ (только historySections имеют swipeActions) |
| Build clean | ✓ (`make build`, 0 errors, 0 warnings) |
| ViewModel tests 15/15 pass | ✓ |
| swift-format lint strict on touched file | ✓ |

## Verification

- `make build` (iPhone 17 Pro, Debug) — **Build Succeeded**.
- `xcodebuild test -only-testing:BudgetPlannerTests/TransactionsViewModelTests` — **15/15 passed**.
- `swift-format lint --strict ios/BudgetPlanner/Features/Transactions/TransactionsView.swift` — clean.
- Manual smoke approved 2026-05-12 11:25 MSK (final Phase 59 acceptance — see 59-VERIFICATION.md).

## Threat model

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-59-01 (Repudiation — accidental delete) | `.confirmationDialog` с destructive «Удалить» + cancel «Отмена» перед DELETE | ✓ |
| T-59-02 (Concurrency — re-entrant load/delete) | `inFlight: Bool` guard в ViewModel (Plan 59-01) | ✓ (inherited) |
| T-59-03 (Info disclosure via .localizedDescription) | Banner использует filtered Russian copy из ViewModel; нет `error.localizedDescription` в View | ✓ |

## Deviations from plan

- Tasks 1-3 закоммичены атомарно одним коммитом `d09244e` (логически единое изменение swipe-flow). Plan допускал per-logical-chunk commits.

## Phase 59 closure

После Plan 59-03 Phase 59 готова. См. `59-VERIFICATION.md` для финальной приёмки.
