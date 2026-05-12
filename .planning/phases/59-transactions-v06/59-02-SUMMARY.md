---
plan_id: 59-02
phase: 59
status: complete
completed_at: 2026-05-12T11:05:00+03:00
commits:
  - db29828
human_smoke_status: approved
human_smoke_at: 2026-05-12T11:05:00+03:00
---

# Plan 59-02 SUMMARY — TransactionsView body rewrite (V10 UI)

## What changed

- `ios/BudgetPlanner/Features/Transactions/TransactionsView.swift` — полная замена body
  поверх Wave-1 stub. Реализовано:
  - Large title «Транзакции» + subtabs `Picker(.segmented)` в
    `.toolbar { ToolbarItem(.principal) }`.
  - Kind picker в header первой Section: 3-segment в `.history`
    (Расходы / Доходы / Сбережения), 2-segment в `.plan`
    (Расходы / Доходы). Synthetic 3-й сегмент через `Binding<Int>` поверх
    `savingsSegmentSelected` (без `@AppStorage` — D-03).
  - Subtab `.onChange` сбрасывает `savingsSegmentSelected = false` при переходе
    в `.plan` (D-02).
  - Category filter — `Menu` в `.toolbar(.topBarTrailing)` с иконкой
    `line.3.horizontal.decrease.circle` (filled при активном фильтре). Items:
    «Все категории» + `viewModel.visibleCategories` с `checkmark` на выбранной.
  - `ActualRow` — рендеринг `ActualV10DTO` с leading категория-иконкой
    (`Tokens.Categories.visual`), signed amount с `monospacedDigit`, mini-icon
    `arrow.up.forward` для `.roundup`. Цвета amount: expense=primary,
    income=green, roundup=orange, deposit=blue.
  - `PlannedRow` — рендеринг `PlannedDTO` (legacy 2-valued); группировка по
    `categoryId`, сортировка по `sortOrder`.
  - Tap-to-edit:
    - `.expense`/`.income` → bridge `legacyActualDTO(from:)` →
      `TransactionEditor` (editActual mode + bridged `legacyCategories`).
    - `.roundup`/`.deposit` → no-op (display-only, D-02 + scope guard).
    - planned row → `TransactionEditor` editPlanned mode.
  - Empty states (Russian copy для Savings / общего / Plan).
  - `deleteError` banner section готов под Plan 59-03 (заполняется в swipe-flow).
  - **No `@AppStorage`** — cold-launch defaults: subTab=История, kind=Расходы,
    categoryFilter=nil, savingsSegmentSelected=false (D-03).

- `ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift`
  — sync ViewModel `state` → `status` rename (deviation Rule 3, чтобы verify-gate
  `viewModel.status >= 2` не fail'нулся). 15/15 tests pass.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Large title «Транзакции» с subtabs в `.toolbar(.principal)` | ✓ |
| 3-segment kind picker в `.history`, 2-segment в `.plan` | ✓ |
| Roundup actuals в Расходы с `arrow.up.forward` mini-icon | ✓ |
| Deposit actuals в Сбережения с blue amount | ✓ |
| Category filter Menu в `.topBarTrailing` (filled при active) | ✓ |
| No persistence — defaults at cold launch | ✓ (no `@AppStorage`) |
| Bridge tap-to-edit `ActualV10DTO → ActualDTO` (expense/income only) | ✓ |
| Build clean (App + Tests) | ✓ (`make build`, `xcodebuild test`) |

## Verification

- `make build` (iPhone 17 Pro, Debug, CODE_SIGNING_ALLOWED=NO) — **Build Succeeded**, 0 errors, 0 new warnings.
- `xcodebuild test -only-testing:BudgetPlannerTests/TransactionsViewModelTests`
  — **TEST SUCCEEDED**, 15/15 passed.
- `swift-format lint --strict` on touched files — clean. (Project-wide
  `make format-check` fails on pre-existing issues in `Step02AccountsTests.swift`
  / `PosterAnimationsAuditTests.swift` — out of scope.)
- Manual smoke (user-approved 2026-05-12 11:05 MSK).

## Deviations from plan

- **Deviation #1 (Wave-1 carryover):** Plan 59-01 заменил View body на stub. Plan
  59-02 переписывает stub → реальный UI. Документировано в 59-01-SUMMARY.md.
- **Deviation #2 (ViewModel field rename):** `state: LoadState` → `status: Status`
  для соответствия V10 паттерну + `<verification>` grep gate `viewModel.status`.
  Тесты обновлены вместе с production code в том же commit (db29828).

## Out of scope (handed off)

- Swipe-to-delete + `.confirmationDialog` + delete banner → **Plan 59-03**.
- TransactionEditor migration на V10 API → **Phase 64** (AddSheet нативный).
- HomeView v06 на 4-valued CategoryKind → отдельный phase.

## Threat model

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-59-03 (info disclosure via error.localizedDescription) | `deleteError` banner использует user-friendly Russian copy; нет `.localizedDescription` в View | ✓ (validated via grep) |

T-59-01 / T-59-02 — реализуются в 59-03 (swipe-flow) и 59-01 (inFlight guard) соответственно.
