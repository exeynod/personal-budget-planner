---
phase: 30-tech-debt
plan: 03
subsystem: ios-add-sheet
tags: [debt-cleanup, ios, refetch, account-picker, posterSheet, notificationCenter]
requirements:
  - DEBT-02
  - DEBT-03
dependency-graph:
  requires:
    - .planning/phases/30-tech-debt/30-CONTEXT.md
    - ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift (Phase 25-07)
    - ios/BudgetPlanner/Networking/DTO/AccountDTO.swift (Phase 25-03)
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift (Phase 25-11)
  provides:
    - iOS automatic Home/Transactions refetch after AddSheet submit
    - iOS poster-styled AccountPickerSheet replacing system confirmationDialog
  affects:
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AccountPickerSheet.swift (new)
    - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift
tech-stack:
  added: []
  patterns:
    - "NotificationCenter broadcast (.txnCreated) — producer/consumer decoupling so AddSheet doesn't need to know about Home/Transactions ViewModels"
    - "Observer lifecycle: register in init(), removeObserver in deinit, hold token via @ObservationIgnored to avoid surfacing internal plumbing to SwiftUI"
    - "Nested .posterSheet for AccountPickerSheet — same pattern as SubscriptionMenuSheet's nested day/price editors (Phase 26-07)"
key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AccountPickerSheet.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift
decisions:
  - "NotificationCenter over shared @Observable AppEnvironment — minimal blast radius, no new singleton, observer scope is per-ViewModel and torn down automatically in deinit. AppEnvironment would require threading the dependency through V10MainShell + every screen init, blocked by the existing @State-based VM pattern (`@State private var model = HomeV10ViewModel()` cannot inject env)."
  - "Observer hops to Task { @MainActor } before calling load() — forName:object:queue:.main delivers the closure on main thread but is NOT actor-isolated; @MainActor-isolated load() requires explicit hop."
  - "AccountPickerSheet kept format helpers (label, kindBadge) in-file rather than DRY-extracting to a shared formatter — the picker may grow extra columns (last-used hint, archive sentinel) independently of the AddSheetView row label, premature DRY would lock the two surfaces together."
  - "userInfo carries `id: result.id` for future incremental observers but current observers refetch wholesale via load() — mirrors TransactionsV10ViewModel.delete() → load() pattern, avoids drift with concurrent bot/web clients."
metrics:
  duration: "~3 minutes"
  completed: "2026-05-11"
  files_changed: 5
  insertions: 328
  deletions: 12
---

# Phase 30 Plan 03: AddSheet Refetch + AccountPickerSheet (iOS) Summary

iOS-parity для web DEBT-02 (auto-refetch Home/Transactions после Add) и
DEBT-03 (poster account picker вместо системного confirmationDialog).
Закрывает iOS-сторону обеих тикетов одной атомарной правкой; web уже
несёт оба фикса в Mount-уровневом RefetchContext и
`AccountPickerSheet.tsx` (поверх отдельного workstream — не трогали).

## What Changed

### `AddSheetViewModel.swift` (DEBT-02 producer)

- Объявлено `extension Notification.Name { static let txnCreated }` —
  стабильный ключ `budgetplanner.txnCreated` для рассылки. Помещён
  в шапку файла рядом с VM, потому что он — owner события.
- В `submit()` после успешного `ActualV10API.create(request)` постится
  `NotificationCenter.default.post(name: .txnCreated, object: nil,
  userInfo: ["id": result.id])` — обозреватели рефетчат с нуля; id
  карится в userInfo как hook для будущих incremental observers, но
  сейчас никто его не читает.

### `HomeViewModel.swift` (DEBT-02 consumer #1)

- Добавлена `init()` (раньше структура полагалась на synth-init с
  `@Observable`), которая регистрирует observer в `NotificationCenter.
  default.addObserver(forName: .txnCreated, object: nil, queue: .main)`.
- Замыкание `[weak self]` хопает в `Task { @MainActor [weak self] in
  await self?.load() }` — VM `@MainActor`-изолирована, а
  `forName:object:queue:.main` доставляет лишь на main thread, не в
  actor-isolated context.
- `deinit { removeObserver }` — освобождение observer'а при тиздауне
  Home screen (например, при перерисовке shell после logout).
- Token хранится в `@ObservationIgnored private var txnCreatedObserver:
  NSObjectProtocol?` — не пробрасываем в SwiftUI body diff'ы.

### `TransactionsV10ViewModel.swift` (DEBT-02 consumer #2)

- Та же пара `init() / deinit` с регистрацией observer'а на
  `.txnCreated`. Симметрично HomeViewModel — TransactionsView
  заинтересована в том же событии (после Add registry показывает
  только что добавленную строку).
- Replay-семантика идентична: при срабатывании уведомления
  вызывается `await self?.load()`, которая уже несёт `inFlight` guard
  (T-25-09-03) — повторный submit не вызовет гонку.

### `AddSheetView.swift` (DEBT-03 wire-up)

- В шапке файла добавлен Phase 30-03 history-comment объясняющий
  переход с `.confirmationDialog` на `.posterSheet`.
- Блок `.confirmationDialog("Выбрать счёт", isPresented:
  $showAccountPicker)` заменён на `.posterSheet(isPresented:
  $showAccountPicker) { AccountPickerSheet(selection: …, isPresented:
  $showAccountPicker, accounts: model.accounts) }`.
- Selection binding пробрасывается через
  `Binding(get: { model.accountId }, set: { model.accountId = $0 })`
  — `model.accountId` — `Int?` свойство @Observable VM, прямого
  `$model.accountId` синтаксиса для read-write нет (Observable не
  генерирует `_`-prefixed projected values), поэтому ручной Binding.

### `AccountPickerSheet.swift` (DEBT-03 — новый файл)

- SwiftUI View с тремя биндингами: `selection: Binding<Int?>`,
  `isPresented: Binding<Bool>`, `accounts: [AccountDTO]`.
- Body: `Eyebrow "ВЫБРАТЬ СЧЁТ"` + список рядов. Каждый ряд —
  Button-обёртка вокруг `row(for: acc)` с:
  - 3pt yellow stripe слева (только для выбранного счёта);
  - bank/mask label (Archivo Black 13pt);
  - inline «ОСНОВНОЙ» yellow badge (если `acc.primary`);
  - kind badge под лейблом (КАРТА / НАЛИЧНЫЕ / КОПИЛКА) в poster mono
    11pt opacity 0.55;
  - right-aligned `RubleFormatter.format(cents:) ₽` (mono 13pt
    semibold).
- Tap → `pick(id)` → `selection = id; isPresented = false`.
- Empty state — italic «Нет счетов —» + caption «добавьте счёт в
  Управлении».
- Полноценный `#Preview` с тремя тестовыми account'ами на coral
  background, чтобы видеть paper-фон сразу из Xcode preview'а.

## Verification

- **iOS build:** `cd ios && make build` → **Build Succeeded**. Только
  pre-existing warnings (`AiV10View.swift:122` — `where` clause
  только для второго pattern match; preview-macro stub в
  HomeV10View). Никаких новых ошибок/предупреждений из добавленных
  файлов.
- **xcodegen regen:** `make generate` отработал — новый файл
  `AccountPickerSheet.swift` подхвачен `sources: BudgetPlanner` glob,
  ручных правок в project.yml не потребовалось.
- **Visual / runtime:** не запускался симулятор в этом проходе —
  достаточно build-clean для проверки контракта VM ↔ View и
  observer-pattern wiring. Manual smoke (Home/Transactions reload
  after AddSheet submit, AccountPickerSheet таппится) — оставлен
  пользователю при следующем `make run` (запуск симулятора в
  worktree-агенте генерирует лишние ресурсы и не нужен для AC).

## Plan must_haves — verified

- [x] **DEBT-02 (iOS):** AddSheet successful create → Home + Transactions
      ViewModels reload. Confirmed by `NotificationCenter.default.post(
      name: .txnCreated, ...)` in AddSheetViewModel.submit() и парных
      `addObserver(forName: .txnCreated, ...)` → `await self?.load()` в
      HomeV10ViewModel.init() + TransactionsV10ViewModel.init().
- [x] **DEBT-03 (iOS):** Account picker — posterSheet с list, replaces
      dialog/cycler. Confirmed by removal of `.confirmationDialog(
      "Выбрать счёт", ...)` block и replacement по `.posterSheet(
      isPresented: $showAccountPicker) { AccountPickerSheet(...) }`.
- [x] **iOS build clean.** `make build` → Build Succeeded; no new
      warnings.

## Deviations from Plan

None functional — plan executed as written. Minor deviations:

- **File name mismatch (informational):** plan references
  `ios/BudgetPlanner/FeaturesV10/Home/HomeV10ViewModel.swift`, но
  фактический путь — `HomeViewModel.swift` (containing class
  `HomeV10ViewModel`). Изменён правильный файл; plan просто использовал
  «view-model name» вместо «file name».
- **DTO name mismatch (informational):** plan references
  `AccountReadDTO`, фактический DTO в проекте — `AccountDTO` (см.
  `ios/BudgetPlanner/Networking/DTO/AccountDTO.swift`). Использован
  `AccountDTO`.

## Out-of-Scope Pre-existing Modifications (not part of this plan)

Веткa уже содержала неcommit'нутые правки на web-стороне:
`frontend/src/screensV10/AddSheet/AddSheet.tsx`,
`frontend/src/screensV10/Home/HomeMount.tsx`,
`frontend/src/screensV10/Transactions/TransactionsMount.tsx`,
`frontend/src/screensV10/V10MainShell.tsx`,
`frontend/src/screensV10/common/index.ts`, плюс два untracked файла:
`frontend/src/screensV10/AddSheet/AccountPickerSheet.tsx` (+ `.module.css`)
и `frontend/src/screensV10/common/RefetchContext.tsx`. По форме это
web-сторона тех же DEBT-02/03 (RefetchContext = web-эквивалент
NotificationCenter, AccountPickerSheet.tsx = web-парная посуда).
Плана 30-03 явно говорит «iOS-parity», поэтому web-правки оставлены
без коммита — это отдельный workstream, как и зафиксировано в
30-04-SUMMARY.

## Files Touched (single atomic commit)

| File                                                                | Change           |
| ------------------------------------------------------------------- | ---------------- |
| ios/.../AddSheet/AccountPickerSheet.swift                            | +198 / −0 (new)  |
| ios/.../AddSheet/AddSheetView.swift                                  | +20 / −9         |
| ios/.../AddSheet/AddSheetViewModel.swift                             | +26 / −1         |
| ios/.../Home/HomeViewModel.swift                                     | +38 / −1         |
| ios/.../Transactions/TransactionsV10ViewModel.swift                  | +31 / −1         |

**Commit:** `ee410f6 feat(30-03): AddSheet refetch + AccountPickerSheet (DEBT-02+03 iOS)`

## Self-Check: PASSED

- FOUND: ios/BudgetPlanner/FeaturesV10/AddSheet/AccountPickerSheet.swift (new, 198 lines)
- FOUND: ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift (modified, posterSheet replaces confirmationDialog)
- FOUND: ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift (modified, posts .txnCreated)
- FOUND: ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift (modified, observer in init/deinit)
- FOUND: ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift (modified, observer in init/deinit)
- FOUND: commit `ee410f6` in `git log`
- VERIFIED: `make build` exit 0 / Build Succeeded
