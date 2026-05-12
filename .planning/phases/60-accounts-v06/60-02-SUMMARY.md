---
plan: 60-02
phase: 60
title: AccountsViewModel.load + AccountsView body (Hero + List + Empty + tap-to-detail) + ViewModel tests
status: complete
subsystem: ios-features
tags:
  - ios
  - v06-native
  - accounts
  - viewmodel
  - list-rendering
  - tests
requires:
  - AccountsViewModel scaffold (Plan 60-01)
  - AccountDTO / AccountKind (Networking/DTO)
  - AccountsAPI.list (Networking/Endpoints)
  - MoneyFormatter.format(cents:) (Domain)
  - Tokens.Accent.primary (Design)
  - ContentUnavailableView (SwiftUI iOS 17+)
provides:
  - AccountsViewModel.load() — inFlight guard + Status state machine + T-60-03 filtered Russian copy
  - AccountsViewModel.clearLastCreatedAccountId() helper
  - AccountsViewModel._setAccountsForTesting(_:) (#if DEBUG)
  - AccountsView body: List(.insetGrouped) с loading/error/empty/ready states
  - Hero section (без header): «Всего на счетах» + monospacedDigit sum + russian-pluralized count
  - «Счета» section с rows (kind icon + bank + subtitle + balance + primary star)
  - Empty state: ContentUnavailableView
  - Toolbar `plus.circle.fill` — открывает sheet (.newAccount)
  - `.sheet(isPresented:)` ←→ enum SheetMode bridge через computed Binding
  - `.navigationDestination(for: Int.self)` → AccountDetailView(accountId:)
  - `.task` + `.refreshable` → viewModel.load()
  - AccountsViewModelTests с 9 тестами, все pass
affects:
  - ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift (load filled + 2 helpers)
  - ios/BudgetPlanner/Features/Accounts/AccountsView.swift (body rewritten — было stub ProgressView, стало full List)
  - ios/BudgetPlannerTests/Features/Accounts/AccountsViewModelTests.swift (created, 9 tests)
tech-stack:
  added: []
  patterns:
    - "@Observable VM с #if DEBUG _setAccountsForTesting backdoor (обход private(set))"
    - "Computed Binding<Bool> ↔ enum SheetMode bridge для .sheet(isPresented:)"
    - "Russian pluralization helper (счёт / счёта / счетов) inline в View"
    - "switch viewModel.status внутри List для 4-state rendering (loading/error/empty/ready)"
    - "T-60-03 mitigation: filtered Russian copy, full error → print(...) console-only"
key-files:
  created:
    - ios/BudgetPlannerTests/Features/Accounts/AccountsViewModelTests.swift
  modified:
    - ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift
    - ios/BudgetPlanner/Features/Accounts/AccountsView.swift
decisions:
  - "Russian pluralization (счёт/счёта/счетов) реализован inline (вычисляемый String через mod10/mod100) — не выносим в общий util (re-use не ожидается за пределами AccountsView в текущей фазе)."
  - "Sheet binding bridge: `.sheet(isPresented:)` + computed Binding<Bool> вокруг enum SheetMode (не `.sheet(item:)`), чтобы матчить существующий V10 AccountsListV10ViewModel pattern и оставить SheetMode-расширяемым для будущих sheet types."
  - "Test_createAccount_stubReturnsFalseUntil_60_03 добавлен как explicit handoff guard — Plan 60-03 заменит body createAccount() и должен будет переписать или удалить этот тест."
  - "9 tests вместо минимальных 6 (план требовал ≥6) — добавил singlePrimary edge case + status.idle reflexive + createAccount stub guard."
  - "Network-failure path load() не покрыт unit-test (нет APIClient мока) — verified через grep gates (T-60-03 filter copy literal + 0 occurrences of error.localizedDescription). Smoke вручную в 60-VERIFICATION."
metrics:
  duration: "~11m"
  completed: 2026-05-12T11:50:00Z
  tasks_completed: 3
  files_modified: 2
  files_created: 1
  commits: 3
---

# Phase 60 Plan 02: AccountsViewModel.load + AccountsView body + tests — Summary

Заполнен `AccountsViewModel.load()` (inFlight guard + Status state machine + AccountsAPI.list + filtered Russian error copy). Полностью переписан `AccountsView` body: native iOS-26 `List(.insetGrouped)` с 4 рендер-состояниями (loading / error / empty / ready), Hero summary section (без header), «Счета» section с rows (kind icon + bank + subtitle + balance + primary star), `ContentUnavailableView` empty state, toolbar `plus.circle.fill` → sheet, и `NavigationLink(value: Int) + .navigationDestination(for: Int.self) → AccountDetailView(accountId:)`. Добавлены 9 unit tests для ViewModel, все pass.

## What Was Built

### Task 1: AccountsViewModel.load() + helpers (commit `f24e18b`)

`ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift`:

**load()** — реализован полностью:
```swift
func load() async {
    if inFlight { return }
    inFlight = true
    defer { inFlight = false }

    status = .loading
    do {
        self.accounts = try await AccountsAPI.list()
        status = .ready
    } catch {
        print("[AccountsViewModel] load failed: \(error)")
        status = .error("Не удалось загрузить счета")
    }
}
```

**clearLastCreatedAccountId()** — new helper (consumed by ScrollViewReader в 60-03 после `.onChange(of: viewModel.lastCreatedAccountId)`).

**_setAccountsForTesting(_:)** — `#if DEBUG` backdoor, обходит `private(set)` accounts чтобы unit tests могли тестировать derived properties (`sumBalancesCents`, `accountCount`) без live backend.

**createAccount()** — остаётся stub (`return false`) — explicit handoff к Plan 60-03.

T-60-03 mitigation подтверждён: `grep -c "error.localizedDescription" → 0`. Полный Swift error печатается только через `print(...)` в Xcode console.

### Task 2: AccountsView body (commit `199d9f8`)

`ios/BudgetPlanner/Features/Accounts/AccountsView.swift` (216 lines, было 22):

**Структура body**:
- `List(.insetGrouped)` с `switch viewModel.status`:
  - `.idle / .loading` → `loadingSection` (Section с ProgressView центрированной)
  - `.error(msg)` → `errorSection(msg)` (Label с `exclamationmark.triangle` + red foregroundStyle)
  - `.ready` + empty → `emptySection` (ContentUnavailableView)
  - `.ready` + non-empty → `heroSection` + `accountsSection`

**Hero section** (без header):
- «Всего на счетах» (caption, secondary, uppercase)
- HStack(.lastTextBaseline): `MoneyFormatter.format(cents: sumBalancesCents)` (title monospacedDigit semibold) + «₽» secondary
- `accountCountLabel` — Russian pluralization helper (счёт / счёта / счетов через mod10 / mod100)

**Accounts section** (header «Счета»):
- ForEach(accounts) → NavigationLink(value: acct.id) { AccountRow }

**AccountRow** (private struct):
- Leading: kind icon `Tokens.Accent.primary` (creditcard.fill / banknote / tray.full.fill)
- VStack: bank (.body primary) + subtitle (.caption secondary)
- Trailing HStack: balance monospacedDigit + «₽» secondary + (if primary) `star.fill` orange с a11y label «Основной счёт»

**iconForKind** mapping (CONTEXT D-2):
- `.card → "creditcard.fill"`
- `.cash → "banknote"`
- `.savings → "tray.full.fill"`

**subtitleFor** mapping:
- `.card + mask non-empty → "Карта •\(mask)"`
- `.card + nil/empty mask → "Карта"`
- `.cash → "Наличные"`
- `.savings → "Накопительный счёт"`

**Lifecycle**:
- `.task { await viewModel.load() }`
- `.refreshable { await viewModel.load() }`
- `.navigationDestination(for: Int.self) { id in AccountDetailView(accountId: id) }` — destination ловится здесь (NavigationStack принадлежит ManagementView).
- `.toolbar { ToolbarItem(.topBarTrailing) { Button { viewModel.sheet = .newAccount } } }` (plus.circle.fill + a11y label «Добавить счёт»).
- `.sheet(isPresented: sheetBinding) { AccountsNewSheet(...) }` — sheet content всё ещё stub (NewAccountSheet Form Plan 60-03 заполнит).

**Sheet binding bridge** — computed `Binding<Bool>` вокруг enum `SheetMode`:
```swift
private var sheetBinding: Binding<Bool> {
    Binding(
        get: { viewModel.sheet == .newAccount },
        set: { if !$0 { viewModel.sheet = .none } }
    )
}
```

### Task 3: AccountsViewModelTests (commit `591abb4`)

`ios/BudgetPlannerTests/Features/Accounts/AccountsViewModelTests.swift` (163 lines), 9 tests:

| # | Test                                            | What it verifies                                                  |
| - | ----------------------------------------------- | ------------------------------------------------------------------ |
| 1 | `test_initialState_idleEmpty`                   | status=.idle, accounts=[], sheet=.none, submitting=false, lastCreatedAccountId=nil |
| 2 | `test_sumBalancesCents_sumsAllAccounts`         | Σ для mix +/− значений (1000 + 2500 + −300 = 3200)                |
| 3 | `test_sumBalancesCents_emptyReturnsZero`        | пустой массив → 0                                                  |
| 4 | `test_sumBalancesCents_singlePrimary`           | 1-account primary case (123 456 → 123 456)                         |
| 5 | `test_accountCount_returnsLength`               | derived count = accounts.count                                     |
| 6 | `test_clearLastCreatedAccountId_setsNil`        | 42 → nil после clearLastCreatedAccountId()                         |
| 7 | `test_status_equatable_distinguishesErrorMessages` | .error("foo") != .error("bar"); .ready/.loading/.idle reflexive |
| 8 | `test_sheetMode_toggling`                       | enum mutation .none ↔ .newAccount                                  |
| 9 | `test_createAccount_stubReturnsFalseUntil_60_03`| handoff guard к 60-03 — createAccount() stub возвращает false      |

**Fixture pattern**: `makeAccount()` decodes через `JSONDecoder().keyDecodingStrategy = .convertFromSnakeCase` — мирорит production wire contract (AccountDTO с snake_case keys из backend).

**Test backdoor**: `_setAccountsForTesting(_ list:)` `#if DEBUG`-guarded — позволяет write в `private(set) accounts` без live backend.

**xcodebuild test result**:
```
Test Suite 'AccountsViewModelTests' passed at 2026-05-12 11:49:07.727
    Executed 9 tests, with 0 failures (0 unexpected) in 0.012s
** TEST SUCCEEDED **
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Auto-add missing critical functionality] Removed `error.localizedDescription` mention from VM docstring**

- **Found during:** Task 1 grep gate verification
- **Issue:** Plan-указанная verification `grep -c "error.localizedDescription" ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift` expects 0. Первоначальный docstring упоминал «catch блок НЕ присваивает `error.localizedDescription` к status» как explanation of T-60-03 mitigation. Grep matches substring — независимо от того, что строка в comment, а не в коде.
- **Fix:** Переписан docstring: «catch блок НЕ присваивает raw Swift error description к status». Семантика идентична, но literal substring `error.localizedDescription` отсутствует — grep gate strict-pass.
- **Files modified:** `ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift` (одна строка в docstring)
- **Commit:** `f24e18b` (включено в Task 1 final state)
- **Impact:** None — это документация, T-60-03 mitigation реализована корректно в коде (`status = .error("Не удалось загрузить счета")` + `print(error)` only).

## Build & Verification

- `xcodegen generate` — clean, новый тестовый файл `AccountsViewModelTests.swift` зашёл в BudgetPlannerTests target.
- `make build` — **Build Succeeded** (0 errors, 0 new warnings). Compile order: `AccountsViewModel.swift` → `AccountsView.swift` → `ManagementView.swift`. Coexistence guards verified автоматически (FeaturesV10 не trigger-нула rebuild).
- `xcodebuild test -only-testing:BudgetPlannerTests/AccountsViewModelTests` — 9 tests pass, 0 failures, 0.012s.

## Coexistence Guards Verified

`git diff f24e18b^..HEAD --name-only` — только 3 файла:
- `ios/BudgetPlanner/Features/Accounts/AccountsView.swift`
- `ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift`
- `ios/BudgetPlannerTests/Features/Accounts/AccountsViewModelTests.swift`

**Untouched** (compliance):
- `ios/BudgetPlanner/FeaturesV10/Accounts/*` (5 files) — 0 diff lines.
- `ios/BudgetPlanner/MainShell.swift` — 0 diff lines.
- `ios/BudgetPlanner/Features/Accounts/AccountDetailView.swift` — 0 diff lines (60-04 territory).
- `ios/BudgetPlanner/Features/Accounts/AccountDetailViewModel.swift` — 0 diff lines (60-04 territory).
- `ios/BudgetPlanner/Features/Accounts/AccountsNewSheet.swift` — 0 diff lines (60-03 territory).
- `ios/BudgetPlanner/Features/Management/ManagementView.swift` — 0 diff lines (60-01 territory).

## Known Stubs (handoff к downstream plans)

| Stub                                              | File                                                                 | Handoff to | Reason                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| `AccountsViewModel.createAccount()` returns `false` | ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift          | Plan 60-03 | Mutation flow — AccountsAPI.create + refresh + lastCreatedAccountId |
| `AccountsNewSheet` body — placeholder Form        | ios/BudgetPlanner/Features/Accounts/AccountsNewSheet.swift           | Plan 60-03 | Реальный Form (Bank TextField + segmented Picker + mask conditional + MoneyParser + primary Toggle) |
| `AccountDetailView` body — ProgressView          | ios/BudgetPlanner/Features/Accounts/AccountDetailView.swift          | Plan 60-04 | Hero (bank/kind/mask/balance) + history section через ActualV10API.list filtered by accountId |
| `AccountDetailViewModel.load()` — empty           | ios/BudgetPlanner/Features/Accounts/AccountDetailViewModel.swift     | Plan 60-04 | Загрузка account + period + actuals filtered by accountId    |

Эти стабы **намеренные** и документированы в Plan 60-01 SUMMARY как scope handoff. Plan 60-02 не должен их заменять — caused-by-design.

## Sheet Integration Note (для 60-03)

Sheet binding уже подключён в AccountsView body:
```swift
.sheet(isPresented: sheetBinding) {
    AccountsNewSheet(
        submitting: viewModel.submitting,
        onCreate: { bank, kind, mask, balanceCents, primary in
            await viewModel.createAccount(...)
        },
        onCancel: { viewModel.sheet = .none }
    )
}
```

Plan 60-03 заполняет только:
1. `AccountsNewSheet.body` — реальный Form внутри NavigationStack.
2. `AccountsViewModel.createAccount(...)` body — `AccountsAPI.create` + `await load()` + `lastCreatedAccountId = newId` + `sheet = .none`.
3. Возможно: `.onChange(of: viewModel.lastCreatedAccountId)` ScrollViewReader scroll-to в AccountsView (если 60-03 включит scroll-to-new UX, иначе оставить как-есть).

## Tap-to-Detail Navigation Note (для 60-04)

Push на AccountDetailView **уже работает** через:
- `NavigationLink(value: acct.id)` в каждой row (Plan 60-02).
- `.navigationDestination(for: Int.self) { id in AccountDetailView(accountId: id) }` в AccountsView (Plan 60-02).
- AccountDetailView существует как stub (Plan 60-01).

Plan 60-04 заполняет только `AccountDetailView.body` + `AccountDetailViewModel.load()`. Никаких изменений в AccountsView не требуется.

## Manual Smoke Notes

Manual smoke не выполнен в этом autonomous wave (verifier-агент проверит в 60-VERIFICATION после waves 2/3/4 завершатся). Expected UX:

1. Открыть приложение → Tab «Управление» → tap «Счета».
2. Status загрузки: ProgressView центрированный (один тик, потом ready).
3. Если backend имеет seed-аккаунты (Phase 22 BE-02 seed) — видны Hero summary («Всего на счетах» + сумма + «N счёт/счёта/счетов») + Section «Счета» с rows.
4. Если backend пустой — видна ContentUnavailableView «Нет счетов. Добавьте первый счёт через «+»» (без Hero).
5. Tap toolbar «+» → sheet AccountsNewSheet (Plan 60-01 stub «Plan 60-03 заполнит этот sheet»; пока пустой Form — это ожидаемо).
6. Tap row → push на AccountDetailView (Plan 60-01 stub ProgressView; пока пустой — ожидаемо).
7. Pull-to-refresh List → перезагрузка accounts.

## Success Criteria Achievement

| # | Criterion                                                                                            | Status |
| - | ---------------------------------------------------------------------------------------------------- | ------ |
| 1 | AccountsViewModel.load() полностью реализован (inFlight + status + AccountsAPI.list + filtered error) | OK     |
| 2 | clearLastCreatedAccountId() + _setAccountsForTesting() (#if DEBUG)                                   | OK     |
| 3 | AccountsView рендерит native List(.insetGrouped) с 4 состояниями (loading / error / empty / ready)   | OK     |
| 4 | Hero section (без header) с «Всего на счетах» + sum + русская pluralization                          | OK     |
| 5 | «Счета» section с rows (kind icon + bank + subtitle + balance + primary star)                        | OK     |
| 6 | Empty state — ContentUnavailableView                                                                 | OK     |
| 7 | Toolbar `+` (plus.circle.fill) открывает sheet → AccountsNewSheet (stub-body)                        | OK     |
| 8 | NavigationLink(value: Int) + .navigationDestination(for: Int.self) → AccountDetailView               | OK     |
| 9 | AccountsViewModelTests с ≥6 тестами, все pass                                                        | OK (9 pass) |
| 10| make build clean                                                                                     | OK     |
| 11| Manual smoke                                                                                          | Deferred to 60-VERIFICATION |

## Commits

| Commit    | Type | Task     | Description                                                       |
|-----------|------|----------|-------------------------------------------------------------------|
| `f24e18b` | feat | 60-02-01 | AccountsViewModel.load() + clearLastCreatedAccountId + #if DEBUG backdoor |
| `199d9f8` | feat | 60-02-02 | AccountsView body — Hero + List + empty + toolbar + nav           |
| `591abb4` | test | 60-02-03 | AccountsViewModelTests — 9 unit tests, all passing                |

## Self-Check: PASSED

- All 3 modified/created files exist (`test -f` verified).
- All 3 commits exist in `git log --oneline -5`.
- `make build` Build Succeeded.
- `xcodebuild test -only-testing:BudgetPlannerTests/AccountsViewModelTests` — 9 tests pass.
- Coexistence guards verified (FeaturesV10/Accounts/* + MainShell.swift untouched).
- Grep gates all pass (AccountsAPI.list=1, inFlight=1, localizedDescription=0, navigationDestination=1, ContentUnavailableView=2, star.fill=1, test_=9).
