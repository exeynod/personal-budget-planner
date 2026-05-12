---
phase: 61
plan: 02
subsystem: ios/Features/PlanEditor
tags: [ios, plan-editor, master-list, navigation-stack, v06-native, mvvm]
requires: [61-01]
provides:
  - PlanEditorData.computeSurplus(incomeCents:categories:)
  - PlanEditorData.sortCategoriesForDisplay(_:)
  - PlanEditorData.factCentsByCategory(_:categoryId:)
  - PlanEditorData.computeRolloverAggregates(categories:actuals:)
  - PlanEditorData.applyOptimisticUpdate(_:updated:)
  - PlanEditorViewModel.load (parallel categories+me, sequential period+actuals, graceful 404)
  - PlanEditorViewModel.applyOptimisticUpdate (delegates to PlanEditorData)
  - PlanEditorView body (Hero + Aggregates + Расходы/Доходы Sections)
  - PlanEditorView .navigationDestination(for: PlanEditorRoute.self) → PlanRowEditorView with onSaved closure
affects: []
tech-stack:
  added: []
  patterns:
    - Pure-compute helper enum (5 stateless static methods, no SwiftUI imports)
    - @Observable @MainActor ViewModel with private(set) state + inFlight guard
    - async let parallel fetch (categories + me) с sequential graceful (period + actuals)
    - T-61-03 mitigation: filtered Russian copy + print() raw, никаких error.localizedDescription leak
    - Typed NavigationStack routing (enum PlanEditorRoute) для multi-destination shared stack
    - onSaved closure injection в child editor для optimistic master-refresh
key-files:
  created:
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorDataTests.swift
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorViewModelTests.swift
  modified:
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorData.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorViewModel.swift
    - ios/BudgetPlanner/Features/PlanEditor/PlanEditorView.swift
decisions:
  - PlanEditorData как distinct namespace (не reuse PlanData из FeaturesV10/Plan) — separate RolloverAggregates struct устраняет name-collision на module level; logic ported и adapted (planCents читается прямо из CategoryV10DTO, без explicit plans: parameter).
  - PlanEditorViewModel.actuals fetch failure → silent fallback []; Aggregates collapse до 0 trailing без banner (T-61-03 strategy — bandwidth on Hero/Aggregates оптимистичны, мастер-list главный).
  - Period 404 mid-onboarding tolerated → period = nil, actuals = []; status = .ready (НЕ .error) — Hero отображает surplus без period context.
  - PlanEditorView сначала Hero, потом Aggregates, потом Расходы Section, потом Доходы Section — выявил «scan from top» pattern из v06 reference (master-detail).
metrics:
  duration: 25min
  completed: 2026-05-12
---

# Phase 61 Plan 02: PlanEditorData helpers + PlanEditorViewModel.load + PlanEditorView (master) + tests Summary

**One-liner:** Native iOS master list editor of monthly plan: pure-compute helpers (5), MVVM with parallel-fetch + graceful 404 + filtered error copy (T-61-03), List(.insetGrouped) body (Hero/Aggregates/Sections) с typed NavigationStack routing (PlanEditorRoute) → PlanRowEditorView с onSaved closure для optimistic refresh; 25 unit tests pass; full suite 443/443.

## Что сделано

### 1. `PlanEditorData.swift` — 5 pure-compute helpers (143 lines)

**`computeSurplus(incomeCents:, categories:) -> Int`**
- Formula: `incomeCents − Σ(planCents)` over `!isArchived && !paused && kind == .expense`.
- Income категории НЕ вычитаются — они приносят дополнительный план-доход поверх monthly income (separate flow).
- Может быть отрицательной → over-budget signal на Hero plate.

**`sortCategoriesForDisplay(_:) -> (expense:, income:)`**
- Sort within kind:
  1. `paused == false` first, `paused == true` at end.
  2. `ord ?? "99"` ASC (CHAR(2) zero-padded — lexicographic == numeric).
  3. tie-break by `name` ASC.
- Archived excluded полностью.

**`factCentsByCategory(_:categoryId:) -> Int`**
- Σ `abs(amountCents)` по всем actuals где `categoryId == categoryId`.
- Все kinds учитываются (.expense / .income / .roundup / .deposit) — row subtitle показывает общую активность.

**`computeRolloverAggregates(categories:, actuals:) -> RolloverAggregates`**
- Partition (`plan − fact`) leftover по `category.rollover` (.misc / .savings).
- Considers только `.expense` kind (income не имеют rollover semantics).
- Excludes: archived, paused, `code == "savings"` (системная sink).
- Over-budget rows clamped: `remainder = max(0, plan − fact)`.

**`applyOptimisticUpdate(_:updated:) -> [CategoryV10DTO]`**
- Заменяет CategoryV10DTO в списке по `id`. Если id не найден — returns input без изменений (no append — это не upsert).
- Immutable: input array не мутируется (Swift value-type + explicit copy).

### 2. `PlanEditorViewModel.swift` — load() + applyOptimisticUpdate (125 lines)

**Control flow `load()`:**
1. `async let catsTask = CategoriesV10API.list()` + `async let meTask = MeV10API.shared.fetchMeV10()` — параллельно через `async let`.
2. Если оба success — `self.categories = cats`, `self.incomeCents = me.incomeCents ?? 0` (nil-tolerant mid-onboarding).
3. Sequentially `do { per = try await PeriodsAPI.current() } catch { per = nil }` — graceful 404.
4. Если `per?.id` есть — `try await ActualV10API.list(periodId: pid)`; на failure → `self.actuals = []` (T-61-03 silent fallback).
5. `status = .ready` на success-path.
6. Top-level `catch` → `print("[PlanEditorViewModel] load failed: \(error)")` + `status = .error("Не удалось загрузить план месяца")`.

**T-61-03 mitigation:**
- Filtered Russian copy на failure.
- Raw error → `print(...)` only (Xcode console для debugging).
- **0 occurrences** of `error.localizedDescription` в файле (grep-verified).

**`applyOptimisticUpdate(_:)`:**
- Делегирует в `PlanEditorData.applyOptimisticUpdate(self.categories, updated:)` (pure helper).
- Called by `PlanRowEditorView` onSaved closure после successful PATCH в child editor.

**Pattern reuse:** parallels `AccountsViewModel` + `AccountDetailViewModel` (60-02 / 60-04) — same status enum, inFlight guard, Europe/Moscow Calendar, filtered copy strategy.

### 3. `PlanEditorView.swift` — body (243 lines)

**4 рендер-состояния через `switch viewModel.status`:**

1. **`.idle` / `.loading`** → `loadingSection`: ProgressView centered.
2. **`.error(msg)`** → `errorSection(msg)`: Label с filtered copy.
3. **`.ready` + empty categories** → `emptySection`: ContentUnavailableView «Категорий нет».
4. **`.ready` + categories** → composition:
   - **Hero Section** (без header): «Остаток к распределению» — surplus с +/− signed prefix, green/red foregroundStyle, monospacedDigit, explanatory subtitle "<income> ₽ − <sumPlan> ₽".
   - **Aggregates Section** («Rollover»): «→ Прочее» (icon tray.fill) / «→ Накопления» (icon tray.full.fill) с MoneyFormatter trailing.
   - **Section «Расходы»** (если `split.expense.isEmpty == false`): `ForEach` over expense cats → `NavigationLink(value: PlanEditorRoute.row(categoryId: c.id))` + `PlanCategoryRow`.
   - **Section «Доходы»** (если `split.income.isEmpty == false`): same pattern.

**`.navigationDestination(for: PlanEditorRoute.self)`:**
```swift
switch route {
case .row(let categoryId):
    PlanRowEditorView(categoryId: categoryId) { updated in
        viewModel.applyOptimisticUpdate(updated)
    }
}
```

**PlanCategoryRow row layout:**
- rollover-based icon (.savings → arrow.up.circle.fill orange; .misc → circle.dotted secondary).
- name (.body)
- subtitle: «приостановлено» italic если paused, иначе «факт: <X> ₽» monospacedDigit.
- trailing: planCents monospacedDigit + «₽».

**PlanEditorRoute disambiguation:** typed enum избегает collision с AccountsView's `Int.self` destination в shared ManagementView NavigationStack (когда user на /accounts, Int-binding занят AccountDetailView push'ем).

**onSaved closure callback chain:**

```
PlanRowEditorView (detail)
  → user taps Save
  → PlanRowEditorViewModel.save() PATCH /categories/{id}
  → success → calls onSaved(updatedCategory)
  → onSaved closure (injected from PlanEditorView)
  → viewModel.applyOptimisticUpdate(updated)
  → PlanEditorData.applyOptimisticUpdate(categories, updated:)
  → self.categories = newArray
  → @Observable triggers PlanEditorView re-render
  → master list row показывает new planCents без full reload
```

### 4. Tests (18 + 7 = 25 cases)

**`PlanEditorDataTests.swift` (289 lines, 18 cases):**

| Suite | Test | Verifies |
|-------|------|----------|
| computeSurplus | `_emptyCategoriesReturnsIncome` | 100k income, []  → 100k |
|  | `_sumsExpensePlans` | 100k − (30k+20k) = 50k |
|  | `_excludesPausedAndIncome` | paused/income не учитываются |
|  | `_negativeWhenOver` | 10k − 15k = −5k |
| sortCategoriesForDisplay | `_splitsByKind` | 3 expense + 2 income → правильный tuple |
|  | `_excludesArchived` | archived вырезаются |
|  | `_sortsByOrd` | ["03","01","02"] → [01,02,03] |
|  | `_pausedToEnd` | active first, paused at end |
|  | `_tieBreakByName` | same ord → name ASC |
| factCentsByCategory | `_sumsAbsAmounts` | 1k+2.5k=3.5k |
|  | `_filtersByCategoryId` | only categoryId match |
|  | `_includesAllKinds` | income+expense kinds summed |
| computeRolloverAggregates | `_partitions` | misc=6k, savings=13k |
|  | `_excludesPausedSavingsArchived` | только active eligible cat |
|  | `_overBudgetClampedZero` | 10k plan − 15k fact → 0 |
| applyOptimisticUpdate | `_replacesById` | replace [c1,c2,c3]→c2' |
|  | `_unknownIdNoChange` | id=99 не в списке → unchanged |
|  | `_immutable` | input не мутируется |

**`PlanEditorViewModelTests.swift` (146 lines, 7 cases):**

| Test | Verifies |
|------|----------|
| `_initialState_idleEmpty` | status=.idle, все коллекции пустые |
| `_calendar_isEuropeMoscow` | calendar.timeZone.identifier == "Europe/Moscow" |
| `_applyOptimisticUpdate_replacesCategory` | seed [c1,c2] → update c2' → state[1]=c2' |
| `_applyOptimisticUpdate_unknownIdNoChange` | unknown id → no-op |
| `_surplus_throughHelper` | integration: state ↔ PlanEditorData.computeSurplus = 50k |
| `_sortedCategories_throughHelper` | integration с sortCategoriesForDisplay split |
| `_setStateForTesting_doesNotFlipStatus` | backdoor — status остаётся .idle (orthogonal) |

**Results:** 25/25 PlanEditor tests pass; full suite 443/443 pass; build clean.

## Build / Test status

- `xcodegen generate` — clean.
- `xcodebuild build -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO` → **Build Succeeded**.
- `xcodebuild test -only-testing:BudgetPlannerTests/PlanEditorDataTests` → 18/18 pass.
- `xcodebuild test -only-testing:BudgetPlannerTests/PlanEditorViewModelTests` → 7/7 pass.
- Full test suite → 443/443 pass (no regression).

## Grep gates verification

| File | Gate | Required | Actual |
|------|------|----------|--------|
| PlanEditorData.swift | `kind == .expense` | ≥2 | 4 |
| PlanEditorData.swift | `code != "savings"` | =1 | 1 |
| PlanEditorData.swift | `import SwiftUI` | =0 | 0 |
| PlanEditorData.swift | `RolloverAggregates` | ≥1 | 4 |
| PlanEditorDataTests.swift | `func test_` | ≥18 | 18 |
| PlanEditorViewModel.swift | `CategoriesV10API.list` | ≥1 | 2 |
| PlanEditorViewModel.swift | `MeV10API.shared.fetchMeV10` | ≥1 | 2 |
| PlanEditorViewModel.swift | `ActualV10API.list(periodId:` | ≥1 | 2 |
| PlanEditorViewModel.swift | `Не удалось загрузить план месяца` | ≥1 | 2 |
| PlanEditorViewModel.swift | `error.localizedDescription` | =0 (T-61-03) | **0 PASS** |
| PlanEditorViewModel.swift | `PlanEditorData.applyOptimisticUpdate` | ≥1 | 2 |
| PlanEditorViewModelTests.swift | `func test_` | ≥7 | 7 |
| PlanEditorView.swift | `navigationDestination(for: PlanEditorRoute.self)` | ≥1 | 2 |
| PlanEditorView.swift | `NavigationLink(value: PlanEditorRoute.row(categoryId:` | ≥1 | 2 |
| PlanEditorView.swift | `PlanRowEditorView(categoryId: categoryId)` | =1 | 1 |
| PlanEditorView.swift | `viewModel.applyOptimisticUpdate` | ≥1 | 2 |
| PlanEditorView.swift | `Остаток к распределению\|Расходы\|Доходы` | ≥3 | 6 |
| PlanEditorView.swift | `→ Прочее\|→ Накопления` | ≥2 | 3 |
| PlanEditorView.swift | `ContentUnavailableView` | =1 | 1 |
| PlanEditorView.swift | All 4 PlanEditorData helpers consumed | =4 | 4 |

## Deviations from Plan

### Wave-2 parallel race: 61-03 executor захватил мои Task 1 + Task 2 файлы в свои commits

**[Rule 3 — Blocking issue / Wave parallel race]**

- **Found during:** Task 1 staging (после прохождения PlanEditorDataTests 18/18).
- **Issue:** Параллельный executor wave-2 (Plan 61-03 — PlanRowEditorView + ViewModel) сделал коммиты, которые включили мои изменения как побочный груз:
  - Commit `010f0d2 feat(61-03-02): implement PlanRowEditorView Form body` — захватил `PlanEditorData.swift` (127 line diff = моя реализация) + `PlanEditorDataTests.swift` (289 lines = my tests file). Скорее всего использовал `git add .` или `git add -A` вместо file-specific staging.
  - Commit `55eb28a docs(61-03): complete Phase 61 Plan 03 — PlanRowEditorView + VM` — захватил `PlanEditorViewModel.swift` (мою реализацию load + applyOptimisticUpdate) + `PlanEditorViewModelTests.swift` (146 lines, my new test file).
- **Fix:** Содержимое файлов корректное (моё). Commits с правильным naming `feat(61-02-NN): ...` не могут быть сделаны для этих файлов (working tree clean — нет diff). Документирую race для трассируемости. PlanEditorView body — мой третий task — закоммитил с правильным naming: `a0ba9f4 feat(61-02-02): PlanEditorView body — Hero + Aggregates + Categories Sections`.
- **Files captured by 61-03 commits:**
  - `010f0d2` → PlanEditorData.swift, PlanEditorDataTests.swift
  - `55eb28a` → PlanEditorViewModel.swift, PlanEditorViewModelTests.swift
- **Plan 61-02 own commits:**
  - `a0ba9f4` → PlanEditorView.swift (Task 3)
- **Impact:** Verifier увидит correct file contents и passing tests, но commit-message attribution будет split: 2/3 tasks under 61-03 messages, 1/3 task under 61-02 message. Содержимое и behavior соответствуют 61-02-PLAN.md 1:1.
- **Future prevention:** Wave-2 parallel executors should use git worktrees или file-specific `git add` to avoid cross-plan capture.

### No other deviations

All other functionality reализована exactly по плану — semantic helpers, control flow, threat-mitigation strategy, UI composition, NavigationLink wiring, onSaved closure callback chain.

## Authentication gates

None — все API calls (`CategoriesV10API.list`, `MeV10API.shared.fetchMeV10`, `PeriodsAPI.current`, `ActualV10API.list`) проксируют через `APIClient.shared`, который уже handle auth headers через `AuthAPI.token`. Тесты используют DEBUG backdoor `_setStateForTesting`, что обходит сеть полностью.

## Self-Check: PASSED

- [x] `ios/BudgetPlanner/Features/PlanEditor/PlanEditorData.swift` — 143 lines (req ≥80).
- [x] `ios/BudgetPlanner/Features/PlanEditor/PlanEditorViewModel.swift` — 125 lines.
- [x] `ios/BudgetPlanner/Features/PlanEditor/PlanEditorView.swift` — 243 lines (req ≥130).
- [x] `ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorDataTests.swift` — 289 lines (req ≥120).
- [x] `ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorViewModelTests.swift` — 146 lines (req ≥80).
- [x] Commit `a0ba9f4` exists (PlanEditorView).
- [x] Commit `010f0d2` includes PlanEditorData + tests (deviation Rule 3 — wave-2 race).
- [x] Commit `55eb28a` includes PlanEditorViewModel + tests (deviation Rule 3 — wave-2 race).
- [x] All grep gates pass (table above).
- [x] T-61-03 verified: `error.localizedDescription` count = 0.
- [x] Build SUCCEEDED.
- [x] 25 PlanEditor tests pass (18 + 7).
- [x] Full suite 443/443 pass.
- [x] FeaturesV10/Plan/* untouched (PlanEditorData uses distinct namespace + struct).
- [x] MainShell.swift untouched.
- [x] Accounts/* untouched.
- [x] Onboarding/* untouched.
