---
plan_id: 260508-fgq
title: Унифицировать редактор транзакций (план/факт) и карточку плана
status: complete
date: 2026-05-08
---

# Quick Task 260508-fgq — Summary

## What changed

### 1. Единый редактор `TransactionEditor`
- **Создан** `frontend/src/components/TransactionEditor.tsx` + `.module.css`.
- **Удалены** `ActualEditor.tsx`/`.module.css` и `PlanItemEditor.tsx`/`.module.css`.
- Discriminator `entity: 'actual' | 'template' | 'planned'`. Поля включаются по entity:
  - actual: kind toggle (если `kind` проп не задан), `tx_date`, payload включает `kind` и `tx_date`.
  - template: `day_of_period`, опц. `sort_order` пробрасывается из initial.
  - planned: `planned_date`, опц. `periodBounds`.
- Опциональный `kind?: CategoryKind` фиксирует фильтр селекта и (для actual) скрывает kind toggle.
- Без `kind` (только template) селект показывает optgroup «Расходы»/«Доходы».
- Inline delete-confirm для всех режимов (заменяет `window.confirm` из старого PlanItemEditor).
- AI-suggestion с уважением к kind-ограничению.

### 2. Замена импортов
- `HomeScreen.tsx`, `HistoryView.tsx` → `<TransactionEditor entity="actual" …>`.
- `PlannedView.tsx` → `<TransactionEditor entity="planned" kind={…} …>`. Kind берётся из активной вкладки `Транзакции > План` (Расходы/Доходы), для edit — из категории редактируемой строки.
- `TemplateScreen.tsx` → `<TransactionEditor entity="template" kind={presetCategoryKind ?? undefined} …>`. Без preset показывает обе группы — экран шаблона не имеет вкладок kind.
- `AiProposalSheet.tsx` → новый компонент с явным kind для planned предложений.

### 3. Раскладка `PlanRow` ≡ `HistoryView` row
- `frontend/src/components/PlanRow.tsx` — горизонтальный flex с baseline-выравниванием.
- `.amount` слева (моно, tabular-nums, min-width: 90px), `.description` справа (muted, ellipsis), бейджи (`День N` / planned date / `🔁 Подписка`) — после описания, без переноса. Категория не дублируется (есть в group title).
- Корневой узел теперь `<button type="button">` для лучшей семантики (а не `<div role="button">`).

### 4. Фикс бага с категориями на «Доходы»
- В `PlannedView` теперь `kind={activeKind ...}` прокидывается в редактор → селект показывает только income категории на вкладке «Доходы» и только expense на «Расходы».

## Files

| Status | Path |
|--------|------|
| added | frontend/src/components/TransactionEditor.tsx |
| added | frontend/src/components/TransactionEditor.module.css |
| deleted | frontend/src/components/ActualEditor.tsx |
| deleted | frontend/src/components/ActualEditor.module.css |
| deleted | frontend/src/components/PlanItemEditor.tsx |
| deleted | frontend/src/components/PlanItemEditor.module.css |
| modified | frontend/src/components/AiProposalSheet.tsx |
| modified | frontend/src/components/PlanRow.tsx |
| modified | frontend/src/components/PlanRow.module.css |
| modified | frontend/src/screens/HistoryView.tsx |
| modified | frontend/src/screens/HomeScreen.tsx |
| modified | frontend/src/screens/PlannedView.tsx |
| modified | frontend/src/screens/TemplateScreen.tsx |
| modified | frontend/src/utils/format.ts (комментарий) |
| modified | frontend/tests/e2e/money-parser-parity.spec.ts (комментарии) |

Diff: −1002 / +134 (4 файла удалены, 2 добавлены).

## Verification

- `npm run build` (`tsc -b && vite build`) — exit 0, без ошибок типизации.
- `npx vitest run` — 38/38 passed (3 файла).
- e2e селекторы (`input[inputMode="decimal"]`, `select`, `button:has-text("Сохранить")`) сохранены — спека `money-parser-parity.spec.ts` совместима без изменений в логике.

## Out of scope

- Backend API.
- Логика AI-suggestion (без изменений).
- Поведение `PlanRow` (только раскладка/семантика — никаких новых обработчиков).

## Notes

- В `PlanRow` корневой узел теперь `<button>` — гарантия `text-align: left` через CSS-сброс уже была добавлена (`text-align: left` в `.row`). Если по тестам нужен `role="button"` на `<div>`, селекторы по `aria-disabled` всё равно продолжают работать.
- `TemplateScreen` без preset категории по-прежнему показывает optgroup (kind не зафиксирован) — единственный place, где user может в шаблоне выбрать любую категорию. PlannedView всегда фиксирует kind.
