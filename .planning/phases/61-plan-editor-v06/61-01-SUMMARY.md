---
plan: 61-01
phase: 61
title: Scaffold ManagementItem.planEditor + 6 files in Features/PlanEditor/
status: complete
subsystem: ios-features
tags:
  - ios
  - v06-native
  - plan-editor
  - scaffolding
  - management-hub
requires:
  - ManagementItem registration pattern (Features/Management/ManagementView.swift)
  - CategoryV10DTO / CategoryV10UpdateRequest / CategoryRollover (Networking/DTO)
  - ActualV10DTO / PeriodDTO (Networking/DTO — для downstream 61-02)
  - CategoriesV10API.list / .update (Networking/Endpoints — для downstream 61-02 / 61-03)
provides:
  - ManagementItem.ID.planEditor case (added at end of enum, inserted перед .subscriptions в .all per CONTEXT D-1)
  - ManagementItem.all entry «План месяца» (slider.horizontal.3, ownerOnly: false)
  - destination(for:.planEditor) → PlanEditorView() dispatch
  - PlanEditorRoute typed-route enum (case row(categoryId: Int)) — disambiguates shared NavigationStack от AccountsView's Int.self binding
  - PlanEditorData pure-compute enum surface (5 helper signatures — bodies в 61-02)
  - Stub: struct PlanEditorView (Features/PlanEditor/PlanEditorView.swift)
  - Stub: @MainActor @Observable PlanEditorViewModel with Status / categories / actuals / period / incomeCents / Europe/Moscow calendar / inFlight / applyOptimisticUpdate / DEBUG backdoor
  - Stub: struct PlanRowEditorView(categoryId:, onSaved:) (Features/PlanEditor/PlanRowEditorView.swift)
  - Stub: @MainActor @Observable PlanRowEditorViewModel(categoryId:) with Status / category / editing state (planCents/rollover/paused) / submitting / saveError / onSaved closure (var) / inFlight / isDirty / DEBUG backdoor
  - Interface contract: PlanRowEditorViewModel.onSaved: ((CategoryV10DTO) -> Void)? — для 61-03 wiring в save() success branch + 61-02 для PlanEditorView push closure injection
affects:
  - ios/BudgetPlanner/Features/Management/ManagementView.swift (3 правки: ID enum, .all array insert, destination switch)
  - ios/BudgetPlanner/Features/PlanEditor/ (new directory, 6 files)
tech-stack:
  added: []
  patterns:
    - "@MainActor @Observable VM with Status enum (parallel to AccountsViewModel / AccountDetailViewModel from Phase 60)"
    - "Typed-route enum для NavigationStack disambiguation (избегает Int.self collision)"
    - "onSaved closure contract как stable interface для parallel wave 2 plans (61-02 + 61-03)"
key-files:
  created:
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorRoute.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorData.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorView.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorViewModel.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanRowEditorView.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanRowEditorViewModel.swift
  modified:
    - ios/BudgetPlanner/Features/Management/ManagementView.swift
decisions:
  - "PlanEditorRoute typed enum (case row(categoryId: Int)) — avoid collision с AccountsView.navigationDestination(for: Int.self) в shared ManagementView NavigationStack. 61-02 будет использовать .navigationDestination(for: PlanEditorRoute.self) в PlanEditorView body."
  - "ManagementItem.planEditor inserted перед .subscriptions (CONTEXT D-1 ordering: Аналитика → План месяца → Подписки → Шаблон → Счета → ...)."
  - "PlanRowEditorViewModel.onSaved declared as `var onSaved: ((CategoryV10DTO) -> Void)?` (var, not let) — injected родителем view через .onAppear hook, что даёт View access к onSaved closure до того как VM начнёт save flow."
  - "PlanEditorData mirrors FeaturesV10/Plan/PlanData.swift pattern (Foundation only, no SwiftUI) — позволяет cheap unit-testing в 61-04 без View tree."
  - "RolloverAggregates struct nested внутри PlanEditorData (а не top-level) — namespace isolation от V10 Plan namespace на случай future name collision."
metrics:
  duration: "~17 минут"
  completed: 2026-05-12T09:37:44Z
  tasks_completed: 5
  files_modified: 1
  files_created: 6
  commits: 4
---

# Phase 61 Plan 01: Plan Editor Scaffold — Summary

Регистрация нового домена «План месяца» в v06 native shell через extension `ManagementItem.ID` + entry в `ManagementItem.all` (перед `.subscriptions` per CONTEXT D-1) + dispatch в `ManagementView.destination(for:)`. Создан каталог `ios/BudgetPlanner/Features/PlanEditor/` с 6 stub-файлами (PlanEditorRoute, PlanEditorData, PlanEditorView, PlanEditorViewModel, PlanRowEditorView, PlanRowEditorViewModel), готовыми к заполнению body/реализации в downstream plans 61-02 (master view + load + Hero/Aggregates/Categories sections + optimistic update bodies) и 61-03 (detail view Form + save → CategoriesV10API.update + onSaved callback wiring). Build clean (xcodegen + make build → Build Succeeded).

## Tasks Completed

| Task | Name                                                                     | Commit  |
| ---- | ------------------------------------------------------------------------ | ------- |
| 1    | Register ManagementItem.planEditor в ManagementView                      | db95e16 |
| 2    | Scaffold PlanEditorRoute + PlanEditorData                                | f3642fd |
| 3    | Scaffold PlanEditorView + PlanEditorViewModel                            | 0a8c014 |
| 4    | Scaffold PlanRowEditorView + PlanRowEditorViewModel                      | b480aa9 |
| 5    | xcodegen generate + make build verification + coexistence grep gate     | (verification only — included в final SUMMARY commit) |

## Key Decisions

### D-1: ManagementItem.planEditor placement
Position в `.all` array — перед `.subscriptions` (CONTEXT D-1). Финальный порядок rows в Management list:
1. Аналитика
2. **План месяца** (новый)
3. Подписки
4. Шаблон бюджета
5. Счета
6. Категории
7. Настройки
8. Доступ (owner)

### D-2: PlanEditorRoute typed enum (disambiguation rationale)
В Phase 60 AccountsView регистрирует `.navigationDestination(for: Int.self) { id in AccountDetailView(accountId: id) }` в shared ManagementView NavigationStack. Когда user находится на /accounts, Int-binding занят. Если PlanEditor также использовал бы `Int.self` для NavigationLink(value: categoryId), это создало бы ambiguous push (две конкурирующие destinations для Int в одном stack).

**Решение:** PlanEditor использует `enum PlanEditorRoute: Hashable { case row(categoryId: Int) }` — distinct тип, который 61-02 регистрирует через `.navigationDestination(for: PlanEditorRoute.self) { route in PlanRowEditorView(...) }`. Никакой collision.

### D-3: onSaved closure contract зафиксирован
`PlanRowEditorViewModel.onSaved: ((CategoryV10DTO) -> Void)?` declared как `var` (не `let`) — это позволяет родительскому view (PlanEditorView) injецировать closure через `.onAppear { viewModel.onSaved = onSaved }` после того как VM создан в `init(categoryId:)` (init не имеет доступа к parent VM до View body run). Контракт стабилен для parallel work:
- **61-02:** PlanEditorView будет push'ить `PlanRowEditorView(categoryId: id, onSaved: { updated in viewModel.applyOptimisticUpdate(updated) })`.
- **61-03:** PlanRowEditorViewModel.save() после successful CategoriesV10API.update вызовет `self.onSaved?(updated)` перед dismiss.

### D-4: PlanEditorData pattern (pure-compute enum)
Mirrors `FeaturesV10/Plan/PlanData.swift`: `enum PlanEditorData` с `static func` helpers, only Foundation imports. Это позволяет:
- Unit-test без View tree / async stub (61-04).
- Reuse в SwiftUI Previews без VM mocking.
- `RolloverAggregates` struct nested внутри namespace (избегает collision с потенциальным V10 type).

5 helpers (signatures only — bodies в 61-02):
- `computeSurplus(incomeCents:, categories:) -> Int`
- `sortCategoriesForDisplay(_:) -> (expense:, income:)`
- `factCentsByCategory(_:, categoryId:) -> Int`
- `computeRolloverAggregates(categories:, actuals:) -> RolloverAggregates`
- `applyOptimisticUpdate(_:, updated:) -> [CategoryV10DTO]`

## Threat-Model References

Все 3 threats из плана (T-61-01, T-61-02, T-61-03) — disposition `mitigate` в 61-03 (где реализуются load/save bodies). 61-01 scaffold устанавливает structural слот для mitigation:
- **T-61-01** (Tampering planCents): `var planCents: Int = 0` (default ≥ 0); UI Stepper bounds + MoneyParser TextField parsing — в 61-03.
- **T-61-02** (Concurrency multiple saves): `@ObservationIgnored private var inFlight: Bool = false` + `private(set) var submitting: Bool = false` — guard logic в 61-03 save().
- **T-61-03** (Info disclosure): `var saveError: String? = nil` + documentation для catch blocks с filtered Russian copy. NO `error.localizedDescription` policy verify через grep в 61-03.

## Coexistence Verified

Negative-grep gate confirms zero modifications в smoke-critical файлах:
- `FeaturesV10/Plan/PlanView.swift` — untouched
- `FeaturesV10/Plan/PlanViewModel.swift` — untouched
- `FeaturesV10/Plan/PlanData.swift` — untouched
- `Features/Onboarding/` — untouched
- `Features/Management/TemplateView.swift` — untouched
- `Features/Accounts/AccountsView.swift` — untouched
- `Features/Accounts/AccountDetailView.swift` — untouched

`MainShell.swift` также не изменялся (новый раздел открывается через Management → tap row, как Phase 60 Accounts).

## Build Status

- `cd ios && xcodegen generate` → OK (auto-picked up 6 new .swift files via file-system globs).
- `cd ios && make build` → **Build Succeeded** (все 6 файлов compiled, linked, app validated).

## Deviations from Plan

None — план выполнен exactly as written.

**Note on grep gate semantics (Task 1):**
План expected `grep -c "case planEditor"` returning 2. Реальный count = 0 потому что строки в файле:
- `case analytics, subscriptions, template, accounts, categories, settings, access, planEditor` (последний enum case в multi-case decl — нет подстроки `case planEditor`)
- `case .planEditor: PlanEditorView()` (destination switch — подстрока `case .planEditor`, не `case planEditor`)

Acceptance criteria выполнены semantically (3 references к `planEditor` присутствуют — enum case, .all entry, destination switch). Не deviation — gate definition мог бы быть точнее (e.g., `grep -cE "planEditor"`); по факту все 3 ссылки на месте.

## Known Stubs

Все 6 файлов — by-design stubs Phase 61-01 (scaffold-only plan). Bodies/реализация — в 61-02 (master view + VM load + 5 helper bodies + optimistic update) и 61-03 (detail Form body + load + save + isDirty + onSaved callback). Это **не** stubs в смысле hidden-empty-UI: PlanEditorView body показывает explicit placeholder text «PlanEditorView — body в 61-02», что transparent для verifier и не сможет быть mistaken для production-ready UI.

## Self-Check: PASSED

**Created files:**
- FOUND: ios/BudgetPlanner/Features/PlanEditor/PlanEditorRoute.swift
- FOUND: ios/BudgetPlanner/Features/PlanEditor/PlanEditorData.swift
- FOUND: ios/BudgetPlanner/Features/PlanEditor/PlanEditorView.swift
- FOUND: ios/BudgetPlanner/Features/PlanEditor/PlanEditorViewModel.swift
- FOUND: ios/BudgetPlanner/Features/PlanEditor/PlanRowEditorView.swift
- FOUND: ios/BudgetPlanner/Features/PlanEditor/PlanRowEditorViewModel.swift

**Commits exist:**
- FOUND: db95e16 — feat(61-01-01)
- FOUND: f3642fd — feat(61-01-02)
- FOUND: 0a8c014 — feat(61-01-03)
- FOUND: b480aa9 — feat(61-01-04)

**Build:** Build Succeeded (xcodegen OK, make build OK).
