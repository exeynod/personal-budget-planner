---
plan_id: 260508-fgq
title: Унифицировать редактор транзакций (план/факт) и карточку плана
date: 2026-05-08
status: in_progress
must_haves:
  truths:
    - Единый компонент TransactionEditor — единственный bottom-sheet редактор для actual/template/planned. Старые ActualEditor и PlanItemEditor удалены.
    - PlanRow визуально совпадает с HistoryView row: сумма слева, описание справа, без дублирования имени категории. Бейджи (День N / дата / подписка) сохранены.
    - Селект категорий в редакторе плана (PlannedView) фильтруется по активной вкладке kind (Расходы/Доходы); на «Доходы» расходные категории не показываются.
  artifacts:
    - frontend/src/components/TransactionEditor.tsx
    - frontend/src/components/TransactionEditor.module.css
    - frontend/src/components/PlanRow.module.css (раскладка)
  key_links:
    - frontend/src/components/PlanRow.tsx
    - frontend/src/screens/HistoryView.tsx
    - frontend/src/screens/PlannedView.tsx
    - frontend/src/screens/TemplateScreen.tsx
    - frontend/src/screens/HomeScreen.tsx
    - frontend/src/components/AiProposalSheet.tsx
---

# Quick Task 260508-fgq — Plan

## Goal
Frontend-только: один редактор транзакций для всех режимов (actual/template/planned), карточка PlanRow визуально как карточка истории, и фильтр категорий по kind активной вкладки плана.

## Tasks

### 1. Создать `TransactionEditor`
**files:** `frontend/src/components/TransactionEditor.tsx`, `frontend/src/components/TransactionEditor.module.css`

**action:**
- Discriminator `entity: 'actual' | 'template' | 'planned'`.
- Общие поля: amount, description, category (select c фильтром), AI-suggestion, error/submit/delete.
- entity=actual: kind toggle (если `kind` проп НЕ задан), tx_date input, payload включает `kind` и `tx_date`.
- entity=template: day_of_period input, payload `day_of_period?` + опц. `sort_order`.
- entity=planned: planned_date input, payload `planned_date?`.
- Если `kind` проп задан — он фиксирует фильтр категорий и (для actual) скрывает kind toggle.
- Если `kind` проп НЕ задан и entity=template/planned — селект показывает optgroup «Расходы»/«Доходы» (как раньше в TemplateScreen).
- delete-confirm через inline-confirm (как в ActualEditor) для всех режимов — заменяет `window.confirm` из PlanItemEditor.
- AI-suggestion работает в actual и planned/template (как раньше).
- Стили — смерджить ActualEditor.module.css + PlanItemEditor.module.css (они почти идентичны; добавить kindToggle).

**verify:**
- TypeScript `tsc --noEmit` чистый.
- Все экраны используют новый компонент, поведение каждого режима сохранено (kind toggle на actual, day_of_period на template, planned_date на planned).

**done:**
- Файл создан, экспортирует `TransactionEditor` + типы.

### 2. Заменить вызовы в screens/components
**files:** `frontend/src/screens/HomeScreen.tsx`, `frontend/src/screens/HistoryView.tsx`, `frontend/src/screens/PlannedView.tsx`, `frontend/src/screens/TemplateScreen.tsx`, `frontend/src/components/AiProposalSheet.tsx`

**action:**
- HomeScreen / HistoryView → `<TransactionEditor entity="actual" ...>`.
- PlannedView → `<TransactionEditor entity="planned" kind={activeKind ?? presetKind} ...>` (kind из активной вкладки или категории пресета).
- TemplateScreen → `<TransactionEditor entity="template" kind={presetKind} ...>` (preset из выбранной категории; без preset — без kind, optgroup).
- AiProposalSheet → актуальная/planned ветка использует новый компонент.
- Удалить `ActualEditor.tsx`/`.module.css` и `PlanItemEditor.tsx`/`.module.css`.

**verify:**
- `grep -r "ActualEditor\|PlanItemEditor" frontend/src` — не находит ничего, кроме упоминаний в комментариях, которые тоже подчищаем.

**done:**
- Все импорты ведут на TransactionEditor; старые файлы удалены.

### 3. Раскладка PlanRow по образцу HistoryView
**files:** `frontend/src/components/PlanRow.tsx`, `frontend/src/components/PlanRow.module.css`

**action:**
- `.row` → `display: flex; align-items: baseline; gap`. Без вертикальных секций.
- `.amount` → слева, `min-width: 90px`, моно-шрифт, tabular-nums.
- `.description` → `flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` (как `.desc` в HistoryView).
- Бейджи (День N / дата / 🔁 Подписка) — справа, после description, `flex-shrink: 0`.
- Категория не отображается в строке (parent group title уже содержит её) — без изменений (текущая логика тоже её не показывает).

**verify:**
- Визуально: на скрине плана сумма слева, описание справа.

**done:**
- Стили обновлены, JSX подстроен под новую раскладку.

### 4. Тесты
**files:** `frontend/tests/e2e/money-parser-parity.spec.ts` (комментарии)

**action:**
- Прогнать `npm run typecheck` и `npm run lint` (если есть) в frontend.
- Селекторы в e2e (input[inputMode="decimal"], select, button:has-text("Сохранить")) после унификации продолжают работать — менять не нужно. Обновить ссылки в комментариях с ActualEditor/PlanItemEditor → TransactionEditor.

**verify:**
- typecheck зелёный, lint без новых ошибок.

**done:**
- Чисто.

## Out of scope
- API/backend.
- Изменения PlanRow поведения (кроме раскладки).
- Изменения логики AI-suggestion.
