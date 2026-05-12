# Phase 61: Plan Editor (v06 native, новый домен) — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Smart discuss — auto-decided (4 areas, no checkpoints per user override)

<domain>
## Phase Boundary

Новый домен «Редактор плана» в v06 native шелле. Сейчас `ManagementView.swift` имеет пункт `template` (TemplateView), но НЕТ редактора текущего месячного плана с per-row editing. Добавляем:

1. `ManagementItem.planEditor` в меню Управления — новый row «План месяца» с иконкой `slider.horizontal.3`.
2. `PlanEditorView` (master) — List категорий с inline plan/fact/прогрессом + rollover-aggregate сводки + общий «остаток дохода» hero.
3. `PlanRowEditorView` (detail) — push через NavigationLink. Form с:
   - Plan cents (Stepper +/- 500₽ step + TextField `.decimalPad` для precise input)
   - Rollover Picker (misc / savings)
   - Paused Toggle
   - Inline rollover info (`prev_period.remaining`) если есть
4. Save strategy: **immediate per-row save** через `CategoriesV10API.update(id:, payload:)`. Atomic batch `PlanMonthAPI.patch` оставляем как «Сохранить все» fallback (если несколько правок — но в master-detail flow это редкость).

**В скоупе:**
- Новый `ManagementItem.planEditor` в `ManagementItem.all` и `destination(for:)`.
- `Features/PlanEditor/` каталог с:
  - `PlanEditorView.swift` (master)
  - `PlanRowEditorView.swift` (detail)
  - `PlanEditorViewModel.swift` (loads categories + current period actuals + income)
  - `PlanRowEditorViewModel.swift` (single category mutation)
- API: `CategoriesV10API.list()`, `CategoriesV10API.update(id:, payload:)`, `ActualV10API.list(periodId:)`, `PeriodsAPI.current()`, `OnboardingV10API` (income).
- Тесты для compute helpers (sum plan, surplus, rollover aggregates) + ViewModel.
- В PlanEditorView показать:
  - Hero: «Остаток к распределению» = `income - Σplan` (positive green, negative red).
  - Aggregates: «→ Прочее: X ₽» / «→ Накопления: Y ₽» (вычисляется через `PlanData.computeRolloverAggregates` если можем reuse, иначе локально).
  - List categories grouped by kind (expense first, income second): row показывает name + plan / fact + delta + rollover badge.

**ВНЕ скоупа:**
- TemplateView (Phase 26 / отдельная фаза) — `template` остаётся untouched.
- Subscriptions post/unpost в PlanEditor — Phase 63 расширяет subscriptions.
- Reordering категорий (drag-to-reorder с sortOrder) — отдельный phase.
- Creating new categories из PlanEditor — это CategoriesView (existing).
- Multi-period planning (planning месяц вперёд) — отдельный phase.
- V10 PlanView untouched (poster-styled), `FeaturesV10/Plan/*` НЕ модифицируем.
- HomeView v06 интеграция (показать «Распределить остаток» CTA) — отдельный phase.

</domain>

<decisions>
## Implementation Decisions

### Navigation & Placement (Area 1 — auto-decided)
- Новый `ManagementItem.planEditor` (id `.planEditor`, label «План месяца», description «Лимиты категорий и rollover», icon `slider.horizontal.3`, `ownerOnly: false`).
- Вставляется в `ManagementItem.all` **перед** `.subscriptions` (логично: План → Подписки → Шаблон).
- Shared NavigationStack с ManagementView — push на PlanRowEditorView через `.navigationDestination(for: Int.self)` (categoryId).
- Если ManagementView уже имеет `.navigationDestination(for: Int.self)` от Phase 60 Accounts — добавить распознавание по контексту: использовать enum `PlanEditorRoute` для disambiguation, либо использовать routing-помощник.

### Master List Structure (Area 2 — auto-decided)
- `List` в `PlanEditorView`:
  - **Hero section (без header):** ContentUnavailableView-style:
    - title: «Остаток к распределению»
    - value: `formatCents(surplus)` `.monospacedDigit.bold()` (color: `.green` если ≥0, `.red` иначе)
    - subtitle: «\(formatCents(incomeCents)) − \(formatCents(sumPlanCents)) = …»
  - **Aggregates section** («ROLLOVER» header):
    - 2 rows: «→ Прочее» с суммой; «→ Накопления» с суммой. Иконки `tray.fill` / `tray.full.fill`.
  - **Categories section** («КАТЕГОРИИ · N» header):
    - Group expense first then income via 2 sub-sections, или один list с `kindBadge` per row.
    - **Решение:** 2 separate Section («Расходы» / «Доходы») с `ForEach(expenseCategories)` / `ForEach(incomeCategories)`.
    - Row layout:
      - `HStack`: leading category icon (через `Tokens.Categories.visual` если есть, иначе category.name initial)
      - `VStack` left: `name` (`.body`) + sub `paused` indicator («приостановлено» secondary) если `paused == true`
      - `Spacer`
      - `VStack` right: `«plan_cents ₽»` (`.body.monospacedDigit`) + sub «факт: \(factCents) ₽» (`.caption` secondary)
      - rollover badge: `Image(systemName: "arrow.up.circle.fill")` orange если rollover == .savings else gray для .misc; trailing к amount.
    - Tap row → push `PlanRowEditorView(categoryId: ...)`.
- Empty state: `ContentUnavailableView("Категорий нет", systemImage: "list.bullet", description: Text("Создайте категории в «Категории»"))`.
- Toolbar: только `EditButton` (для editMode reordering — но reorder is OOS; убираем) или ничего. **Решение:** без toolbar в master view.

### PlanRowEditorView (Area 3 — auto-decided)
- Native `Form` с секциями:
  - **«Лимит»**:
    - `Stepper("Лимит: \(formatCents(planCents)) ₽", value: $planCentsInRubles, in: 0...10_000_000, step: 500)` (шаг 500 ₽).
    - Под Stepper — `TextField` `.decimalPad` для precise input (parse через MoneyParser). Real-time sync со Stepper.
  - **«Перенос остатка» (rollover)**:
    - `Picker("Куда переносить", selection: $rollover)` с 2 опциями: «В прочее» (.misc) / «В накопления» (.savings).
    - Footer: «Остаток `план − факт` переходит в выбранный буфер при закрытии периода.»
    - Inline info: «За прошлый период перенесено: \(formatCents(prevCarry)) ₽» если есть.
  - **«Статус»**:
    - `Toggle("Приостановлено", isOn: $paused)`.
    - Footer: «Приостановленные категории не учитываются в распределении бюджета.»
- Toolbar `Сохранить` в `.confirmationAction` — disabled пока `!isDirty`. Tap → `CategoriesV10API.update` → on success: dismiss (router.pop) + parent reload. On failure: inline banner («Не удалось сохранить — попробуйте ещё раз»).
- Cancel via system back button — confirmation dialog «Отменить изменения?» если dirty.
- Loading на initial fetch (если PlanRowEditor открывается с lazy load), но default — категория уже в parent VM, передаём через init.
- **Save strategy: immediate per-row** — не batch PlanMonthAPI. Каждый Save в Editor = 1 PATCH /categories/:id.

### Save Strategy & API (Area 4 — auto-decided)
- **Primary: `CategoriesV10API.update(id:, payload: CategoryV10UpdateRequest(planCents:, rollover:, paused:))`**. Per-row immediate save.
- **PlanMonthAPI.patch — НЕ используется в Phase 61.** Atomic batch остаётся для будущего «применить шаблон» / «сбросить все» UI. Не блокируем dependency, просто другое use-case.
- **Σplan validation:** UI guardrails в Editor — disable Save если `surplus_after_change < 0` (после применения локально). Backend ALSO валидирует через CategoryV10UpdateRequest, но мы делаем preview client-side.
- **Optimistic update vs full reload:**
  - Optimistic: parent VM получает updated CategoryV10DTO и заменяет в массиве по id (быстрый refresh без full list reload).
  - Fallback: на failure — revert + show error + suggest retry.

### Coexistence
- `FeaturesV10/Plan/*` (PlanView, PlanViewModel, PlanData) — **untouched**.
- `MainShell.swift` — untouched (новый раздел в Management).
- `TemplateView.swift` — untouched (отдельный домен — шаблон бюджета).
- v06 Features: новый каталог `ios/BudgetPlanner/Features/PlanEditor/`.

### Claude's Discretion
- Reuse `PlanData.computeRolloverAggregates` если можно вызвать из v06 namespace (нет collision). Иначе — локальный helper.
- Icon for ManagementItem: `slider.horizontal.3` (default) — open to override.
- Stepper step value: 500 ₽ (50_000 cents). Можно изменить на 100 ₽ если plan-phase решит.
- Empty state copy.
- Day-1 PR: показывать только `expense` categories в Master List (income — отдельный flow редактирования если нужен). **Решение:** показываем оба, но в separate Sections.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PlanMonthAPI.patch(plans:)` — atomic batch (OOS этой фазы, но готов).
- `CategoriesV10API.update(id:, payload: CategoryV10UpdateRequest)` — `planCents`, `rollover`, `paused`, `parentId`, `name`, `sortOrder`, `isArchived`.
- `CategoryV10DTO` со всеми полями — `planCents`, `rollover`, `paused`, `parentId`, `code`, `ord`.
- `CategoryRollover` enum (`.misc`, `.savings`).
- `ActualV10API.list(periodId:)` → for fact computation.
- `PeriodsAPI.current()` → current period id.
- `OnboardingV10API` → user.incomeCents (если на одном route, иначе `MeAPI`).
- `MoneyParser` reusable из NativeOnboarding step views.
- `Tokens.Accent.primary` etc.
- `formatCents(_:)` (common util — TBD where lives).
- `FeaturesV10/Plan/PlanData.swift` — pure helpers `computeSurplus`, `computeIsOverflow`, `computeRolloverAggregates`, `computeRegularsList`, `applyPlanEdit`, `plansFromCategories`. **Можем reuse static call из v06.**

### Established Patterns
- Phase 60 Accounts: master-detail с push via `.navigationDestination(for: Int.self)` + shared NavigationStack с ManagementView.
- Phase 59 Transactions: filtered Russian copy banner, inFlight guard, async let load.
- Onboarding NativeOnboardingStep3PlanView (Phase 57) — уже имеет ввод plan_cents для категорий, MoneyParser usage.

### Integration Points
- `ManagementView.swift` — `ManagementItem.all` array + `ManagementItem.ID` enum + `destination(for:)`.
- `CategoriesView.swift` (existing) — отдельный route, не пересекаемся.

</code_context>

<specifics>
## Specific Ideas

- Stepper step: 500 ₽ = 50_000 cents (соответствует V10 PosterSlider step).
- Hero «Остаток к распределению» — color: green ≥0, red <0. Format: «+12 345 ₽» или «−12 345 ₽».
- Rollover badge цвет: orange для `.savings`, gray для `.misc` (visual hint что «savings» = special/desired).
- Paused indicator: «приостановлено» italic secondary под name.
- Pluralization для «N категорий».
- Inline rollover info на детали: «Перенесено из прошлого: \(prev_carry) ₽» если PeriodsAPI отдаёт previous period data (TBD в plan-phase).

</specifics>

<deferred>
## Deferred Ideas

- TemplateView migration на v1.0 backend — отдельный phase.
- Reordering категорий (drag-to-reorder) — отдельный phase.
- Atomic batch save UI («Сохранить все», «Сбросить план») — отдельный future feature, PlanMonthAPI.patch уже готов.
- Multi-period planning (план на следующий месяц) — DSH-06 family.
- AI «Распределить остаток» CTA — отдельный AI feature.
- HomeView v06 «План мая» entry point — отдельный phase.

</deferred>
