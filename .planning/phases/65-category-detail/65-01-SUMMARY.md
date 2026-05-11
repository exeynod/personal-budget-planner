---
phase: 65-category-detail
plan: 01
requirements: []
status: complete
commit: cb86886
---

# Phase 65-01 Summary — CategoryDetail drill-down (v06 native)

## What shipped

- **New** `ios/BudgetPlanner/Features/Management/CategoryDetailScreen.swift`:
  - `NativeCategoryDetailViewModel` (`@Observable`) — LoadState (idle / loading /
    loaded(period, transactions) / noActivePeriod / error); грузит period через
    `PeriodsAPI.current()` + транзакции через `ActualAPI.list(periodId:,
    categoryId:)`.
  - `CategoryDetailScreen` — `List(.insetGrouped)`; hero (icon + kind label +
    total cents за период); history (`ForEach` транзакций отсортирован date desc).
  - `TransactionDetailRow` — компактный ряд: description + дата + amount
    (monospacedDigit).
  - `RenameCategoryInlineSheet` — `NavigationStack` + `Form` + `TextField` +
    Cancel/Save toolbar; `.presentationDetents([.medium])`.
  - Toolbar Menu (`ellipsis.circle`): «Переименовать» → sheet; «Архивировать»
    (destructive) → `confirmationDialog` → `parentViewModel.archive(id:)`;
    «Восстановить» если `is_archived`.

- **Modified** `ios/BudgetPlanner/Features/Management/CategoriesView.swift`:
  - Удалён `@State renamingCategory: CategoryDTO?` (Detail обрабатывает сам).
  - Удалён `.sheet(item: $renamingCategory)`.
  - Удалён `private struct RenameCategorySheet` (dead-code).
  - `.onTapGesture { renamingCategory = cat }` → `NavigationLink {
    CategoryDetailScreen(category: cat, parentViewModel: viewModel) } label: {
    CategoryListRow(category: cat) }`.

- **Project regenerate**: `xcodegen generate` — добавляет
  `CategoryDetailScreen.swift` в target.

- **Hotfix (separate commit)** `6599c65` — `fix(categories): auto-generate
  code+ord placeholders in create_category` — `CategoryCreateRequest` без `code`
  падал 500 на v1.0 backend (NOT-NULL `code`); добавлен server-side fallback,
  пока не сделана полная migration на v1.0 API в Phase 59.

## Verification

Manual smoke (iPhone 17 Pro, ui.theme=v06):

1. ✅ Категории отрисовываются с chevron (NavigationLink visible).
2. ✅ Tap «Кафе» → CategoryDetailScreen с hero (иконка чашки, «РАСХОД»).
3. ✅ Empty state «Нет активного периода» (правильно, периода нет в БД).
4. ✅ Toolbar `ellipsis.circle` Menu: «Переименовать» (карандаш) +
   «Архивировать» (красный destructive).
5. ✅ Build SUCCEEDED — после переименования (file → `CategoryDetailScreen.swift`,
   struct → `CategoryDetailScreen`, VM → `NativeCategoryDetailViewModel`) и
   regenerate xcodeproj.

Backend seed (через owner role `budget` в обход RLS):

```sql
INSERT INTO category (name, kind, user_id, code, ord) VALUES
  ('Продукты', 'expense', 1, 'food', '01'),
  ('Кафе', 'expense', 1, 'cafe', '02'),
  ('Зарплата', 'income', 1, 'salary', '03');
```

## Strategy notes

- Namespace конфликт solved: single Swift module = single namespace, поэтому
  `CategoryDetailView` дублировался с `FeaturesV10/CategoryDetail/`. Переименован
  в `CategoryDetailScreen` (struct + filename) и `NativeCategoryDetailViewModel`.
- Кнопка «увеличить лимит» (PlanMonthAPI) — DEFERRED → Phase 61.
- Migration на v1.0 `ActualV10API` (4-valued kind) — DEFERRED → Phase 59.

## Deferred

- Phase 59: ActualV10API migration (для CategoryDetail history list).
- Phase 61: «Увеличить лимит» action (PlanMonthAPI integration).
