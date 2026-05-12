# Phase 62: Savings & Goals (v06 native, новый домен) — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Smart discuss — auto-decided (per user override)

<domain>
## Phase Boundary

Новый домен «Копилка» в v06 native шелле. Сейчас в `ManagementView` нет пункта Savings/Goals. Добавляем:

1. `ManagementItem.savings` в Управление меню (icon `banknote.fill` или `target`, label «Копилка»).
2. `SavingsView` (master) — Hero (total + monthIn) + Roundup config Section + Goals List с прогресс-бар + `+` toolbar (newGoal / deposit).
3. `GoalDetailView` (detail) — push, hero + progress + delete (через GoalsAPI.delete) + «Пополнить» CTA → DepositSheet pre-filled goalId.
4. `NewGoalSheet` (Form) — name + targetCents + due (optional Date).
5. `DepositSheet` (Form) — amount + accountId + optional goalId. accountId через Picker (AccountsAPI.list — нужны savings/cash accounts).

**В скоупе:**
- ManagementItem registration.
- 4 файла view + 4 viewModel + helpers + tests.
- API: `SavingsAPI.summary/patchConfig/postDeposit` + `GoalsAPI.list/create/delete`.
- Roundup toggle (Toggle для on/off + segmented Picker base [10/50/100]).
- Goal progress bar (`ProgressView(value:total:)` native).
- Goal delete via swipe-to-delete + `.confirmationDialog`.
- Pre-filled DepositSheet flow (tap «Пополнить» на goal → sheet с goalId).
- ViewModel tests для всех 4 экранов.

**ВНЕ скоупа:**
- AccountsAPI.list для DepositSheet account picker — уже доступен из Phase 60.
- HomeView v06 Savings widget — отдельный future phase.
- Goal edit (rename / re-target) — backend не поддерживает PATCH /goals/{id}, только POST/DELETE; OOS.
- Goal subgoals / shared goals — OOS.
- Multi-currency goals — OOS.
- AI «Подсказать сколько откладывать» — OOS.
- V10 shell (`FeaturesV10/Savings/*`) — untouched.

</domain>

<decisions>
## Implementation Decisions

### Navigation & Placement
- `ManagementItem.savings` (id `.savings`, label «Копилка», description «Цели и накопления», icon `banknote.fill`, NOT owner-only). Вставляется перед `.template`.
- Shared NavigationStack с ManagementView. Push на GoalDetailView через `.navigationDestination(for: GoalDetailRoute.self)` typed enum (чтобы избежать Int.self collision с Accounts/PlanEditor).

### SavingsView (master)
- `List` с секциями:
  - **Hero section (без header):** «Всего отложено» большой `monospacedDigit.bold()`. Sub «За месяц: +\(monthIn) ₽».
  - **«Округление трат»** Section header: Toggle «Включить округление». Если enabled → Picker(.segmented) base (10/50/100 ₽). PATCH `/savings/config` через `SavingsAPI.patchConfig` на изменение.
  - **«Цели» Section header (или «Цели · N»):** ForEach(goals) row:
    - `VStack(alignment: .leading)`: name (`.body.bold()`), progress bar `ProgressView(value: Double(currentCents), total: Double(targetCents))` tinted `.green`, sub `«\(currentCents) ₽ из \(targetCents) ₽ — \(percentage)%»`, due date `«до \(due)»` если есть.
    - Trailing chevron via NavigationLink.
    - Swipe-to-delete с `.confirmationDialog("Удалить цель?")` → `GoalsAPI.delete(id:)`.
  - Empty (без целей): `ContentUnavailableView("Нет целей", systemImage: "target", description: Text("Поставьте первую цель через «+»"))`.
- Toolbar trailing: `Menu` с двумя пунктами:
  - «Новая цель» → `viewModel.sheet = .newGoal`
  - «Пополнить» → `viewModel.sheet = .deposit(goalId: nil)`
- `.task { await viewModel.load() }`.

### GoalDetailView (detail)
- Push'нут через `NavigationLink(value: GoalDetailRoute.goal(id:))`.
- `Form`:
  - **Hero:** name `.largeTitle`, progress `ProgressView` большой, «\(currentCents)/\(targetCents) ₽ — \(percentage)%», due «до \(due)» если есть.
  - **Action:** «Пополнить» Button → opens DepositSheet pre-filled `goalId = goal.id`.
- Toolbar trailing: Menu `...` с пунктом «Удалить цель» destructive → confirmationDialog → delete + dismiss.
- Loading / error state.

### NewGoalSheet (Form)
- `Form`:
  - «Название» `TextField` (trim, ≥1 char).
  - «Целевая сумма» `TextField .decimalPad` через MoneyParser → cents (≥1 ₽).
  - «Срок (необязательно)» `Toggle` «Добавить срок» → если on → `DatePicker(.date)` с `in: tomorrow...`.
- Toolbar: «Создать» в `.confirmationAction` disabled `!canCreate || submitting`. Cancel «Отмена».
- На success: dismiss + parent VM reload.
- На failure: inline banner (filtered Russian copy «Не удалось создать цель»).

### DepositSheet (Form)
- `Form`:
  - «Цель (необязательно)» `Picker` с `[nil («Общая копилка»)] + goals.map(\.name)` — selection: `goalId: Int?`. По умолчанию pre-filled из state init.
  - «Сумма» `TextField .decimalPad` через MoneyParser → cents (>0).
  - «Счёт списания» `Picker` со всеми пользовательскими accounts (loaded по `AccountsAPI.list()`). Required (≥1 пользователь должен иметь account).
- Toolbar: «Пополнить» в `.confirmationAction` disabled `!canDeposit`. Cancel.
- На success: dismiss + parent reload (refresh totals + monthIn).
- На failure: inline banner («Не удалось пополнить»).

### Coexistence
- `FeaturesV10/Savings/*` (SavingsV10View/ViewModel/Data, NewGoalSheet poster-styled) — untouched.
- `MainShell.swift` untouched.
- Новый каталог `ios/BudgetPlanner/Features/Savings/`.
- **Naming collision:** V10 имеет `NewGoalSheet.swift` → v06 переименовать в `SavingsNewGoalSheet.swift` (struct `SavingsNewGoalSheet`). Аналогично для DepositSheet (если V10 имеет одноимённый — TBD по audit) — `SavingsDepositSheet`.

### Threat Model
- **T-62-01 (Tampering — goal targetCents arbitrary)**: UI gate (≥1 ₽), backend Pydantic validation.
- **T-62-02 (Repudiation — accidental delete goal)**: `.confirmationDialog` перед DELETE (как Phase 59).
- **T-62-03 (Information disclosure)**: filtered Russian copy banner, no `error.localizedDescription` в UI.
- **T-62-04 (Concurrency — multiple deposits/saves)**: `inFlight` / `submitting` guard.
- **T-62-05 (Stale-state after mutation)**: full reload after createGoal/deposit/patchConfig — UI re-renders с свежими totalCents и goals.

### Claude's Discretion
- Точный icon ManagementItem (`banknote.fill` recommended).
- Progress bar color: green для всех goals, или color-coded по % progress (red <33% / orange <66% / green ≥66%) — TBD plan-phase.
- Empty state copy.
- Pluralization для «N целей».

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SavingsAPI.summary()` → `SavingsSummaryDTO { totalCents, monthInCents, config: SavingsConfigDTO, goals: [GoalDTO] }`.
- `SavingsAPI.patchConfig(roundupEnabled:, roundupBase:)` → SavingsConfigDTO.
- `SavingsAPI.postDeposit(amountCents:, accountId:, goalId:)` → DepositResponseDTO.
- `GoalsAPI.list()`, `GoalsAPI.create(_:)`, `GoalsAPI.delete(id:)`.
- `GoalDTO { id, name, targetCents, currentCents, due: Date?, createdAt: Date }`.
- `SavingsConfigDTO { roundupEnabled, roundupBase ∈ {10,50,100} }`.
- `AccountsAPI.list()` — для DepositSheet.
- `MoneyParser` — reusable из Phase 57 onboarding.
- Phase 60-61 patterns: master-detail with typed route enum, Form sheets, filtered Russian copy banner, `inFlight` guard, optimistic update.

### Established Patterns
- `@MainActor @Observable VM` с Status enum.
- Parallel async let для multi-API loads.
- `SheetMode` discriminated enum (как V10 SavingsV10ViewModel: `.none / .newGoal / .deposit(goalId: Int?)`).
- Filtered Russian copy banner.
- `.confirmationDialog` перед DELETE.
- Per-Plan SUMMARY + Phase VERIFICATION pattern.

### Integration Points
- `ManagementView.swift` — add `.savings` to enum + items + destination.
- Routing: typed route enum `SavingsRoute { case goal(id: Int) }` — избегаем collision с PlanEditor Route и Accounts Int.self.

</code_context>

<specifics>
## Specific Ideas

- Hero «Всего отложено: 123 456 ₽» font `.system(.largeTitle, weight: .bold).monospacedDigit()`.
- Progress bar: ProgressView native style, tint `.green`. Если currentCents >= targetCents → показать `Image("checkmark.seal.fill")` рядом с progress bar.
- Roundup base segmented options: «×10 ₽» / «×50 ₽» / «×100 ₽».
- Due date format: `formatted(date: .abbreviated, time: .omitted)` (например «12 сент 2026»).
- DepositSheet pre-fill: если открыт из goal-row tap, goalId уже выбран в Picker.
- AccountsAPI.list для Deposit — фильтровать только non-archived savings/cash accounts? **Решение:** показывать ВСЕ accounts (юзер сам решит откуда списать). Tooltip: «Списание со счёта; на счёт-копилку — будет приход».

</specifics>

<deferred>
## Deferred Ideas

- Goal edit/rename — backend не поддерживает PATCH /goals/{id}.
- Goal subgoals / shared goals.
- Multi-currency.
- AI suggestions.
- HomeView v06 Savings widget.
- V10 Savings → v06 интеграция HomeView.
- Withdraw from goal (отрицательный deposit) — backend сейчас только positive amount.

</deferred>
