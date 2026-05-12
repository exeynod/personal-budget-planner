---
plan: 60-01
phase: 60
title: ManagementItem.accounts registration + scaffold files for Features/Accounts
status: complete
subsystem: ios-features
tags:
  - ios
  - v06-native
  - accounts
  - scaffolding
  - management-hub
requires:
  - ManagementItem registration pattern (Features/Management/ManagementView.swift)
  - AccountDTO / AccountKind / AccountCreateRequest (Networking/DTO)
  - AccountsAPI.list / .create (Networking/Endpoints)
  - ActualV10DTO / CategoryV10DTO / PeriodDTO (для downstream 60-04)
provides:
  - ManagementItem.ID.accounts case (between .template and .categories)
  - ManagementItem.all entry «Счета» (creditcard.fill, ownerOnly: false)
  - destination(for:.accounts) → AccountsView() dispatch
  - Stub: struct AccountsView (Features/Accounts/AccountsView.swift)
  - Stub: @MainActor @Observable AccountsViewModel with Status / SheetMode / accounts / submitting / sumBalancesCents / accountCount / lastCreatedAccountId
  - Stub: struct AccountDetailView(accountId:) (Features/Accounts/AccountDetailView.swift)
  - Stub: @MainActor @Observable AccountDetailViewModel(accountId:) with Status / account / actuals / categories / period / Europe/Moscow calendar
  - Stub: struct AccountsNewSheet(submitting:onCreate:onCancel:) (Features/Accounts/AccountsNewSheet.swift)
affects:
  - ios/BudgetPlanner/Features/Management/ManagementView.swift (3 правки)
  - ios/BudgetPlanner/Features/Accounts/ (new directory, 5 files)
tech-stack:
  added: []
  patterns:
    - "@MainActor @Observable VM with Status enum (parallel to AccountsListV10ViewModel)"
    - "Symbol & filename collision avoidance via dual rename (struct + file)"
key-files:
  created:
    - ios/BudgetPlanner/Features/Accounts/AccountsView.swift
    - ios/BudgetPlanner/Features/Accounts/AccountsViewModel.swift
    - ios/BudgetPlanner/Features/Accounts/AccountDetailView.swift
    - ios/BudgetPlanner/Features/Accounts/AccountDetailViewModel.swift
    - ios/BudgetPlanner/Features/Accounts/AccountsNewSheet.swift
  modified:
    - ios/BudgetPlanner/Features/Management/ManagementView.swift
decisions:
  - "File renamed: NewAccountSheet.swift → AccountsNewSheet.swift (Rule 3 deviation; filename collision in Swift target with FeaturesV10 sibling)"
  - "Struct name: AccountsNewSheet (NOT NewAccountSheet) — matches plan instruction"
  - "ManagementItem.ID enum: .accounts inserted between .template and .categories (CONTEXT D-1)"
metrics:
  duration: "2m 43s"
  completed: 2026-05-12T08:43:48Z
  tasks_completed: 2
  files_modified: 1
  files_created: 5
  commits: 2
---

# Phase 60 Plan 01: ManagementItem.accounts registration + Accounts feature scaffolding — Summary

Регистрация нового домена «Счета» в v06 native shell через extension `ManagementItem.ID` + entry в `ManagementItem.all` + dispatch в `ManagementView.destination(for:)`. Создан каталог `ios/BudgetPlanner/Features/Accounts/` с 5 stub-файлами (AccountsView / AccountsViewModel / AccountDetailView / AccountDetailViewModel / AccountsNewSheet), готовыми к заполнению body в downstream plans 60-02 / 60-03 / 60-04. Build clean (xcodegen + make build SUCCEEDED).

## What Was Built

### Task 1: ManagementItem registration (commit `2b097d7`)

Три правки в `ios/BudgetPlanner/Features/Management/ManagementView.swift`:

1. **Enum `ManagementItem.ID`** — добавлен case `accounts` между `.template` и `.categories`:
   ```swift
   enum ID: String, Hashable {
       case analytics, subscriptions, template, accounts, categories, settings, access
   }
   ```

2. **Массив `ManagementItem.all`** — новая entry «Счета» (index 3, между «Шаблон бюджета» и «Категории»):
   ```swift
   .init(id: .accounts, label: "Счета",
         description: "Карты и наличные, основной счёт",
         icon: "creditcard.fill", ownerOnly: false),
   ```

3. **Метод `destination(for:)`** — case `.accounts` dispatched на `AccountsView()`:
   ```swift
   case .accounts: AccountsView()
   ```

### Task 2: Stub files в Features/Accounts/ (commit `00eaa98`)

Создан каталог `ios/BudgetPlanner/Features/Accounts/` + 5 stub-файлов. Все типы определены полностью, body заполняется downstream plans.

**File-by-file**:

- **AccountsView.swift** — `struct AccountsView: View` с placeholder body (List + ProgressView). `@State viewModel = AccountsViewModel()`. `.task { await viewModel.load() }`. Реальный List + Hero + rows — Plan 60-02.

- **AccountsViewModel.swift** — `@MainActor @Observable final class AccountsViewModel` с полным surface:
  - Status enum (.idle / .loading / .ready / .error(String))
  - SheetMode enum (.none / .newAccount)
  - `private(set) var accounts: [AccountDTO]`
  - `var sheet: SheetMode`
  - `private(set) var submitting: Bool`
  - `var lastCreatedAccountId: Int?` (для ScrollViewReader.scrollTo)
  - `var sumBalancesCents: Int` (computed)
  - `var accountCount: Int` (computed)
  - `func load()` stub (Plan 60-02 заполнит)
  - `func createAccount(...)` stub (Plan 60-03 заполнит, returns Bool)

- **AccountDetailView.swift** — `struct AccountDetailView: View` с `let accountId: Int`. `init(accountId:)` создаёт `@State viewModel: AccountDetailViewModel`. Placeholder body — реальные Hero + history в Plan 60-04.

- **AccountDetailViewModel.swift** — `@MainActor @Observable final class AccountDetailViewModel(accountId: Int)` с полным surface:
  - Status enum
  - `let accountId: Int`
  - `private(set) var account: AccountDTO?`
  - `private(set) var actuals: [ActualV10DTO]`
  - `private(set) var categories: [CategoryV10DTO]`
  - `private(set) var period: PeriodDTO?`
  - `@ObservationIgnored var calendar: Calendar` (Europe/Moscow gregorian)
  - `func load()` stub (Plan 60-04 заполнит)

- **AccountsNewSheet.swift** — `struct AccountsNewSheet: View` с callbacks:
  - `let submitting: Bool`
  - `let onCreate: (bank, kind, mask, balanceCents, primary) async -> Bool`
  - `let onCancel: () -> Void`
  - Placeholder body — реальный Form (Bank / kind Picker / mask conditional / MoneyParser balance / primary Toggle) в Plan 60-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed NewAccountSheet.swift → AccountsNewSheet.swift**

- **Found during:** Task 2 (после первой попытки `make build`)
- **Issue:** Original plan specified filename `NewAccountSheet.swift` containing `struct AccountsNewSheet` (только struct rename для избежания type-collision). Однако Swift compiler в Xcode требует уникальные **filenames** в пределах target — не только type names. FeaturesV10/Accounts/NewAccountSheet.swift уже существует, поэтому build failed:
  ```
  error: filename "NewAccountSheet.swift" used twice:
  '/.../Features/Accounts/NewAccountSheet.swift' and
  '/.../FeaturesV10/Accounts/NewAccountSheet.swift'
  note: filenames are used to distinguish private declarations with the same name
  ```
- **Fix:** Переименован файл `Features/Accounts/NewAccountSheet.swift` → `Features/Accounts/AccountsNewSheet.swift` (matches struct name). Struct symbol уже был `AccountsNewSheet` per plan. Обновлён docstring внутри файла для отражения двойного rename (filename + type).
- **Files modified:** ios/BudgetPlanner/Features/Accounts/AccountsNewSheet.swift (renamed from NewAccountSheet.swift)
- **Commit:** 00eaa98 (rename atomic part of Task 2 commit)
- **Impact on downstream:** Plan 60-03 must reference `AccountsNewSheet.swift` (not NewAccountSheet.swift) when filling Form body. Struct name `AccountsNewSheet` остаётся как и планировалось.
- **Plan correction note:** Plan 60-01-PLAN.md sections `<files_modified>` и task acceptance criteria упоминают `NewAccountSheet.swift` — это устарело. Plan 60-02 / 60-03 / 60-04 должны использовать `AccountsNewSheet.swift`.

## Build & Verification

- `xcodegen generate` — clean, новые файлы попали в `BudgetPlanner.xcodeproj` (verified через grep по pbxproj).
- `make build` (xcodebuild + xcbeautify) — **Build Succeeded** (0 errors, 0 new warnings). Compile order подтверждает что Features/Accounts/* и обновлённый ManagementView.swift собрались успешно вместе с FeaturesV10/Accounts/NewAccountSheet.swift.

## Coexistence Guards Verified

- `git status --porcelain ios/BudgetPlanner/FeaturesV10/Accounts/` → 0 lines (untouched).
- `git status --porcelain ios/BudgetPlanner/MainShell.swift` → 0 lines (untouched).
- `git status` overall diff scope: только `ios/BudgetPlanner/Features/Accounts/*` + `ios/BudgetPlanner/Features/Management/ManagementView.swift`.

## Symbol & Filename Collision Resolution

| Aspect    | V10 (untouched)                                    | v06 (new)                                              |
|-----------|----------------------------------------------------|--------------------------------------------------------|
| Filename  | `FeaturesV10/Accounts/NewAccountSheet.swift`       | `Features/Accounts/AccountsNewSheet.swift`             |
| Struct    | `struct NewAccountSheet: View` (poster-styled)     | `struct AccountsNewSheet: View` (native, stub)         |
| Caller    | `PosterRouter` / V10 shell                         | `AccountsView` (через Plan 60-03 sheet integration)    |

Оба type и оба filename различаются — Swift compiler принимает.

## Stub Interface Surface для Downstream Plans

### Plan 60-02 (load list + Hero + rows)
- `AccountsView.body` → реальный List(.insetGrouped) с hero summary + rows section
- `AccountsViewModel.load()` → AccountsAPI.list() + state machine (.loading / .ready / .error)
- Может использовать существующие `accounts`, `sumBalancesCents`, `accountCount`

### Plan 60-03 (NewAccountSheet Form + create flow)
- `AccountsNewSheet.body` → реальный NavigationStack + Form (Bank TextField + segmented Picker + mask conditional + MoneyParser + primary Toggle)
- `AccountsViewModel.createAccount(...)` → AccountsAPI.create() + post-success refresh + lastCreatedAccountId
- `AccountsViewModel.sheet = .newAccount` — toggle через toolbar `+` button в AccountsView

### Plan 60-04 (AccountDetailView Hero + history)
- `AccountDetailView.body` → Hero section + history section
- `AccountDetailViewModel.load()` → AccountsAPI.list() filter by id + PeriodsAPI + ActualV10API.list() filter by accountId
- Day grouping через `calendar` (Europe/Moscow) — паттерн Phase 59

## Success Criteria Achievement

| # | Criterion                                                          | Status |
|---|--------------------------------------------------------------------|--------|
| 1 | ManagementItem.ID enum extended with `.accounts` case              | OK     |
| 2 | ManagementItem.all has «Счета» entry at index 3                    | OK     |
| 3 | destination(for:) handles `.accounts → AccountsView()`             | OK     |
| 4 | 5 stub files in `ios/BudgetPlanner/Features/Accounts/`             | OK     |
| 5 | AccountsViewModel surface (Status / SheetMode / properties)        | OK     |
| 6 | AccountDetailViewModel surface (accountId / Status / Europe/Moscow)| OK     |
| 7 | `struct AccountsNewSheet` in AccountsNewSheet.swift (renamed file) | OK*    |
| 8 | `xcodegen generate` + `make build` clean                           | OK     |
| 9 | FeaturesV10/Accounts/* and MainShell.swift untouched               | OK     |
| 10| Manual sim run: tap → push AccountsView with ProgressView          | N/A**  |

\* SC-7 met with deviation: filename also renamed (NewAccountSheet.swift → AccountsNewSheet.swift) per Rule 3 blocking fix above.

\** Manual sim run deferred (autonomous wave 1 — visual verification in 60-VERIFICATION sweep after waves 2+ deliver real UI).

## Commits

| Commit    | Type | Task   | Description                                                       |
|-----------|------|--------|-------------------------------------------------------------------|
| `2b097d7` | feat | 60-01-01 | register ManagementItem.accounts in ManagementView (3 правки)   |
| `00eaa98` | feat | 60-01-02 | scaffold native Accounts feature stubs (5 files)                |

## Self-Check: PASSED

- All 5 created files exist (test -f verified)
- Both commits exist in git log
- Build verified twice (after rename, after final state)
- Coexistence guards passed (FeaturesV10/Accounts/* + MainShell.swift untouched)
