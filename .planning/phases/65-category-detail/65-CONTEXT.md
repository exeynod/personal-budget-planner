# Phase 65: CategoryDetail drill-down (v06 native) — Context

**Gathered:** 2026-05-11
**Status:** Shipped
**Mode:** Autonomous extension of milestone v1.1.2.

## Phase Boundary

До этой фазы v06 `CategoriesView` отвечал на tap по ряду inline-rename-sheet — что не давало пользователю drill-down на историю транзакций по категории. Phase 65 заменяет tap на `NavigationLink` → новый `CategoryDetailScreen`, и переносит rename + archive в toolbar Detail-экрана.

**В скоупе:**
- Новый файл `Features/Management/CategoryDetailScreen.swift` со struct `CategoryDetailScreen` и `NativeCategoryDetailViewModel` (имя выбрано чтобы не коллизировать с V10 `CategoryDetailView` / `CategoryDetailViewModel` — single-module Swift namespace).
- Hero section: icon (Tokens.Categories.visual) + kind label + total cents за активный период + count операций.
- History section: List транзакций отсортирован date desc, через `ActualAPI.list(periodId:, categoryId:)` (legacy 2-valued kind API — совместим).
- Toolbar Menu (ellipsis.circle): Переименовать (sheet) / Архивировать (destructive confirmationDialog) / Восстановить (если archived).
- Rename переехал из inline-`.sheet(item:)` на CategoriesView в Detail toolbar.
- Удалён dead-code `RenameCategorySheet` из CategoriesView (теперь только private `RenameCategoryInlineSheet` в Detail).

**ВНЕ скоупа:**
- Кнопка «увеличить лимит» (PlanMonthAPI integration) — Phase 61.
- Migration на v1.0 `ActualV10API` (4-valued ActualKind) — Phase 59.
- Per-category trend chart — отложено.
- Categories CRUD fix (creation падает 500 на v1.0 backend из-за NOT-NULL `code` колонки) — outside Phase 65, фикс в Phase 59 или separate hotfix.

## Verified

Manual smoke (iPhone 17 Pro, ui.theme=v06, seeded 3 категории через SQL обходным путём из-за CRUD bug):
1. ✅ Категории показываются с chevron (NavigationLink).
2. ✅ Tap на «Кафе» открывает CategoryDetailScreen с hero (иконка чашки, «РАСХОД») и empty state «Нет активного периода» (правильно, периода нет).
3. ✅ Toolbar Menu (ellipsis.circle): «Переименовать» + красная «Архивировать» — отображаются корректно.
4. ✅ Build: 0 errors, 0 new warnings (после переименования имени файла и struct).

## Known Issues (discovered)

1. **CategoriesView создание новой категории падает 500** на v1.0 backend — `INSERT INTO category` не передаёт NOT-NULL колонку `code`. v06 `CategoryCreateRequest` имеет только `name` + `kind`; backend требует `code`. **Hotfix-кандидат:** обновить `CategoryCreateRequest` + auto-derive code из name (или backend default). Не в этой фазе.

## Naming notes

Struct `CategoryDetailScreen` и VM `NativeCategoryDetailViewModel` — это явный отказ от имени V10. Альтернативный путь — namespace через nested types, но Swift namespace через `enum FeaturesV06 { ... }` ломает file-based ergonomics. Простое суффиксное переименование чище.
