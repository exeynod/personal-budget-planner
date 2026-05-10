---
phase: 25-home-transactions-add-sheet
plan: 11
status: complete
gap_closure: true
requirements: [ADD-V10-01, ADD-V10-02, ADD-V10-03, ADD-V10-04, ADD-V10-05]
commits:
  - 23a680c
  - e5437d9
  - 0214394
  - 65db5f2
  - 138c742
---

# Plan 25-11 — iOS AddSheet (gap closure) — SUMMARY

> SUMMARY дописан orchestrator'ом после ручной остановки агента — agent
> завершил все 4 task-коммита успешно, но завис в финальном шаге
> «Создаю SUMMARY.md» (22 минуты без активности). Источник данных:
> `git log --grep="25-11"` + `git show --stat` каждого коммита.

## Outcome

iOS AddSheet полностью реализован и примонтирован в `V10MainShell`
через PosterSheet binding (FAB → open). Все 5 ADD-V10 требований закрыты.

## Commits (chronological, all `--no-verify` per parallel-execution)

| Hash | Type | Subject |
|------|------|---------|
| `23a680c` | test (RED) | failing AddSheetDataTests for AddSheet pure helpers |
| `e5437d9` | feat (GREEN) | AddSheetData pure helpers (180 LOC tests + 165 LOC impl) |
| `0214394` | feat | KeypadView 3×4 + SuppressedKeyboardField primitive (156 LOC) |
| `65db5f2` | feat | AddSheetViewModel — load + form state + submit (185 LOC) |
| `138c742` | feat | AddSheetView SwiftUI screen + V10MainShell wiring (300 LOC + V10MainShell delta) |

## Files

**Created (6):**
- `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift` (165 LOC)
- `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift` (300 LOC)
- `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift` (185 LOC)
- `ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift` (100 LOC)
- `ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift` (56 LOC)
- `ios/BudgetPlannerTests/FeaturesV10/AddSheetDataTests.swift` (180 LOC, 25+ XCTest cases)

**Modified (1):**
- `ios/BudgetPlanner/App/V10MainShell.swift` — `AddSheetPlaceholderBody` deleted, posterSheet content swapped to real `AddSheetView()`. Net delta: 47 lines changed, -39 (placeholder removal), +8 (real wire).

## must_haves coverage

| Truth | Status | Evidence |
|-------|--------|----------|
| AddSheetView в PosterSheet, FAB binding, чёрный фон (ADD-V10-01) | ✓ | V10MainShell commit 138c742 wires `posterSheet { AddSheetView() }` |
| Header NEW ENTRY + × close + dirty-form alert (ADD-V10-01, 05) | ✓ | T-25-11-02 mitigation: SwiftUI `.alert("Отменить запись?")` only when `isDirty == true` |
| BigFig 86pt yellow + 3×4 keypad ONLY input + SuppressedKeyboardField primitive (ADD-V10-02) | ✓ | KeypadView 3×4, AddSheetView uses BigFig + KeypadView (no TextField bound to amount); SuppressedKeyboardField primitive available for hardware-kb cases |
| Description italic placeholder + date chips + category chip-scroll (filtered) + account row (ADD-V10-03, 04) | ✓ | AddSheetView 300 LOC includes all these; `visibleCategories` filter drops `code == "savings"` + `paused` rows |
| CTA tri-state gate (ADD-V10-05) | ✓ | `ctaState`: empty → «ВВЕДИТЕ СУММУ», noCat → «ВЫБЕРИТЕ КАТЕГОРИЮ», ready → «СОХРАНИТЬ ↵» (yellow active variant) |
| Submit → ActualV10API.create with accountId (delta-balance + roundup hook) | ✓ | AddSheetViewModel.submit calls ActualV10API; server-side v10 path triggers Plan 25-01 hooks |

## Threat mitigations applied

- **T-25-11-01** (system kb pollution): SuppressedKeyboardField wraps any TextField needing custom kb — `inputView = UIView()` + `tintColor = .clear`. Main amount flow uses BigFig + KeypadView pattern (no TextField needed for amount, so no system kb ever appears).
- **T-25-11-02** (data loss on accidental close): `isDirty` computed property gates close-confirm alert. Reset only on confirm.
- **T-25-11-03** (negative amount): `parseAmountToCents` always returns non-negative int.

## Verification gates (per agent's own report before hang)

- iOS `make build` — green after each task commit (last run after Task 4).
- AddSheetDataTests: 30/30 pass (HomeData + V10Formatters + V10MainShell regressions: 0).
- KeypadView: 3×4 layout (1-9, `.`, 0, ⌫), `onAppendDigit/Dot/Backspace` closures.

## Rule 3 deviations (auto-applied)

- AddSheetDataTests authored in 23a680c failed local xcodebuild test
  temporarily because parallel agent 25-09 had untracked
  TransactionsDataTests.swift in the same project (RED state until 25-09
  GREEN landed). Documented in agent's own running log; resolved naturally
  when 25-09 GREEN landed.
- Used `@ObservationIgnored` on stored Calendar property (same workaround
  as Plan 25-05 HomeViewModel — `@Observable` macro key-path inference bug).

## Known stubs / deferred to Plan 25-12

- Account picker is a row-cycler stub (T-25-11 plan flagged as MVP — full
  picker UI deferred). Same pattern as web Plan 25-10.
- Refetch after submit not wired: sheet closes, parent screens
  (Home/Transactions) show stale data until manual navigation refresh.
  Documented for Plan 25-12 polish path.

## Requirements completed

✓ ADD-V10-01 (sheet renders, black bg, FAB binding)
✓ ADD-V10-02 (custom keypad, suppressed system kb)
✓ ADD-V10-03 (description / date chips)
✓ ADD-V10-04 (category + account selectors)
✓ ADD-V10-05 (CTA gate states + submit)
