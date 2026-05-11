# Phase 57: Onboarding 4-step (v06 native) - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped per session-override skip_discuss=true)

<domain>
## Phase Boundary

Native iOS onboarding wizard для v06 шелла — 4 шага (income / accounts / plan
/ goals) через `NavigationStack` drill-down. Использует v1.0 `OnboardingV10API`
(`POST /onboarding/complete`) с расширенными полями (incomeCents, accounts[],
categoryPlans{}, goal?, savingsConfig?). Заменяет минимальный v06
`OnboardingView` (single-form: starting balance + cycle day + seed categories
toggle), который пишет в legacy `OnboardingAPI`.

См. ROADMAP.md секция "Phase 57: Onboarding 4-step (v06 native)".

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Discuss-phase skipped — следующие decisions делает планировщик с опорой на
существующую V10 реализацию и project conventions:

### Navigation Pattern
- `NavigationStack` с push-based drill-down (соответствует v06 паттерну в
  Phase 65 — `CategoryDetailScreen` тоже через `NavigationLink`).
- TabView page-style — НЕ используем (V10 уже использует, а v06 должен быть
  «нативным iOS», т.е. идиоматическим).

### Data Model
- **Переиспользовать** `OnboardingFlow` из `FeaturesV10/Onboarding/OnboardingFlow.swift`
  (`@Observable` class с `incomeCents`, `accounts`, `categoryPlans`, `goal`,
  `savingsConfig`). Это shared data model.
- **Переиспользовать** `OnboardingDraft` для UserDefaults persistence
  (обеспечивает сохранение между крашами / закрытиями).
- Wire body — `OnboardingFlow.toAPIBody()` уже существует, вызывает
  `OnboardingV10API.postOnboardingComplete()`.

### Step UI Style
- Каждый step — отдельная `View` в `ios/BudgetPlanner/Features/Onboarding/`.
- Layout: `Form` с `Section`'ами (native iOS).
- Inputs: `TextField` + `keyboardType(.decimalPad)` для денег;
  `Stepper` где уместно; `Toggle` для bool; `Picker` для enum (account kind).
- Money entry: ввод в рублях с авто-конверсией в cents (см. MoneyParser в
  существующем v06 `OnboardingView`).
- Bottom action: `Button(.borderedProminent)` в `.safeAreaInset(edge: .bottom)`
  с label «Дальше» / «Готово».
- Validation: per-step `canProceed` computed flag, кнопка disabled пока
  валидация не пройдена.

### Submit Logic
- Final step submit → `OnboardingV10API.postOnboardingComplete(body: flow.toAPIBody())`
  → `authStore.refreshUser()` → AppRouter переключит на HomeView.
- Ошибки 409 (already onboarded) → fallback: refresh user и выйти.
- Ошибки 422 → показать `ContentUnavailableView` с retry.

### Legacy Coexistence
- v06 `OnboardingView` (legacy) удалить **нельзя** пока AppRouter условно
  выбирает onboarding view по `ui.theme`. Для v06 используем новую
  `NativeOnboardingWizardView` (имя на усмотрение planner'а).
- Если AppRouter уже монтирует V10 OnboardingV10View для обоих шеллов —
  заменить на conditional рендеринг (v06 → новая native, v10 → V10).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `FeaturesV10/Onboarding/OnboardingFlow.swift` — `@Observable` data model.
- `FeaturesV10/Onboarding/OnboardingDraft.swift` — UserDefaults persistence.
- `FeaturesV10/Onboarding/DefaultCategories.swift` — default category list для
  step 3 (Plan).
- `FeaturesV10/Onboarding/RubleFormatter.swift` — currency formatting.
- `FeaturesV10/Onboarding/PluralRu.swift` — Russian plurals helper.
- `Networking/Endpoints/OnboardingAPI.swift` — `OnboardingV10API` enum + DTOs.
- `Networking/Endpoints/OnboardingAPI.swift` lines 96-130 —
  `OnboardingFlow.toAPIBody()` extension.

### Established Patterns

- v06 native screens: `Features/{Domain}/{Domain}View.swift` (см. existing
  `Home/HomeView.swift`, `Management/CategoriesView.swift`).
- ViewModel pattern: `@Observable final class {Native}{Domain}ViewModel`
  с `LoadState` enum (idle / loading / loaded / error).
- Sheet patterns: см. `CategoryDetailScreen.RenameCategoryInlineSheet` — `Form`
  inside `NavigationStack` с `.presentationDetents([.medium])`.
- Money input: см. existing `OnboardingView` lines 70-78 — `TextField` +
  `keyboardType(.numbersAndPunctuation)` + `monospacedDigit()`.

### Integration Points

- `App/AppRouter.swift` — conditional mounting onboarding view based on
  `themeRaw == "v06"` vs V10.
- `AuthStore.refreshUser()` — после successful submit нужно invalidate user
  state.
- Project file (`ios/BudgetPlanner.xcodeproj`) генерируется через `xcodegen`
  (см. `ios/Makefile` и memory ios-tooling.md) — после добавления новых
  файлов нужно `make project-generate`.

</code_context>

<specifics>
## Specific Ideas

- Названия файлов: planner определяет; рекомендация — namespace «Native»
  чтобы не конфликтовать с V10 (single Swift module = single namespace,
  см. Phase 65 retrospective).
- Reuse `OnboardingFlow` (НЕ копировать data model).
- 4 шага: Income → Accounts → Plan → Goals/Savings.
- Final view: может быть совмещён с Step 4 (submit на step 4) или отдельным
  шагом с summary — planner решает.

</specifics>

<deferred>
## Deferred Ideas

- Удаление legacy v06 `Features/Onboarding/OnboardingView.swift` — defer до
  closure-фазы (после удостоверения, что новая native работает).
- Удаление legacy `enum OnboardingAPI` в AuthAPI.swift — также defer.
- Animations / transitions между шагами — defer, native NavigationStack
  push-animation хватает.

</deferred>
