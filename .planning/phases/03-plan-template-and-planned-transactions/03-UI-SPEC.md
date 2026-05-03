# Phase 3: UI Spec

**Status:** Draft (auto mode, derived from sketch winners)
**Source sketches:** `005-plan-and-categories` (winner B — grouped + inline edit), `002-add-transaction` (winner B — bottom sheet, для BottomSheet-компонента)
**Design tokens:** `frontend/src/styles/tokens.css` (banking-premium dark, carry-over Phase 2)

---

## Scope

Phase 3 frontend = 2 новых экрана + 3 новых компонента + дополнения к App/HomeScreen:

1. **TemplateScreen** — CRUD строк шаблона (sketch 005-B group-by-category + inline-edit + BottomSheet).
2. **PlannedScreen** — CRUD план-строк текущего периода + actions «Применить шаблон», «Перенести план в шаблон» + 🔁 mock-marker для PLN-03.
3. **BottomSheet** (component, sketch 002-B стиль) — переиспользуемый модал; в Phase 4 повторно используется для add-actual.
4. **PlanItemEditor** (component внутри BottomSheet) — универсальная форма create/edit для template-item и planned-row.
5. **PlanRow** (component) — одна строка списка с inline-edit amount + tap-to-edit-full + read-only ветка для subscription_auto.

App.tsx модифицируется: добавляются экраны `'template'` и `'planned'` в Screen union, две nav-кнопки в HomeScreen.

---

## Design Tokens (carryover from Phase 2)

Импортируем `frontend/src/styles/tokens.css` как глобальный стиль. Используем те же CSS-переменные.

Новые токены добавляются по необходимости (например, для z-index BottomSheet — захардкоден `100`/`101`, можно вынести в token позже).

| Token | Use в Phase 3 |
|-------|----|
| `--color-surface` (#1c2230) | Card background, BottomSheet body |
| `--color-surface-2` (#232a3a) | Inline-edit input background |
| `--color-text-muted` | description, day-of-period badge |
| `--color-text-dim` | empty-state placeholder |
| `--color-primary` | apply-template button, MainButton fallback |
| `--color-warn` (#ffb547) | snapshot warning copy («перезапишет шаблон») |
| `--radius-md` (14px) | Cards, inputs |
| `--radius-lg` (20px) | BottomSheet top corners |
| `--safe-bottom` (28px) | BottomSheet bottom padding |

---

## Screen 1: TemplateScreen

### Layout (sketch 005-B winner — упрощённый)

```
┌────────────────────────────────────────┐
│  [← Назад]  Шаблон плана               │
├────────────────────────────────────────┤
│  Расходы                               │
│                                        │
│  ▸ Продукты                            │
│  ┌──────────────────────────────────┐  │
│  │  15 000 ₽   Закупка на месяц     │  │  ← tap = inline edit amount
│  │             [День 5]             │  │  ← tap-elsewhere = open BottomSheet
│  └──────────────────────────────────┘  │
│  + Добавить строку в Продукты          │  ← tap = open BottomSheet с pre-filled cat
│                                        │
│  ▸ Дом                                 │
│  ┌──────────────────────────────────┐  │
│  │  35 000 ₽   Аренда               │  │
│  │             [День 1]             │  │
│  └──────────────────────────────────┘  │
│  + Добавить строку в Дом               │
│                                        │
│  ...                                   │
│                                        │
│  Доходы                                │
│  ▸ Зарплата                            │
│  ┌──────────────────────────────────┐  │
│  │  120 000 ₽  Основная             │  │
│  │             [День 5]             │  │
│  └──────────────────────────────────┘  │
│  + Добавить строку в Зарплата          │
└────────────────────────────────────────┘
```

### Behaviour

- `GET /api/v1/template/items` на mount + после mutation. Sort by `(category.kind, category.sort_order, category.name, sort_order, id)` — выполняется на frontend (categories загружены отдельно через `useCategories(false)`, items группируются по `category_id`).
- Empty-state: «Шаблон пуст. Добавьте первую строку.» + кнопка `+ Добавить строку` → открывает BottomSheet с пустой категорией.
- Если категорий нет вообще: показываем link «Сначала создайте категории» → переход на CategoriesScreen.
- Sub-headers «Расходы» / «Доходы» (как в CategoriesScreen).
- Под каждой категорией — список её строк + кнопка `+ Добавить строку в <category>` (открывает BottomSheet с pre-filled `category_id`).

### PlanRow inline-edit (template mode)

- Tap на amount → input field (autofocus, type="text" inputmode="decimal", value pre-filled рублями).
- Enter → POST PATCH /template/items/{id} с `{amount_cents: parseRubles(input)}`.
- Esc → cancel.
- ✓/× кнопки рядом с input (как в CategoryRow).
- Loading: spinner вместо ✓.
- Tap на description / `[День N]` badge / non-amount zone → open BottomSheet (full editor).

### BottomSheet (full editor)

- Открывается при tap на non-amount zone строки ИЛИ при tap на «+ Добавить строку».
- Title: «Изменить строку шаблона» / «Новая строка шаблона».
- Поля:
  - **Категория** — `<select>` с `<optgroup label="Расходы">` / `<optgroup label="Доходы">`, only active. При смене kind строки меняется kind группы — это derived from category, не отдельное поле.
  - **Сумма** — text input inputmode="decimal", placeholder «1 500 ₽», парсится в копейки на save.
  - **Описание** — textarea, max 500 chars, optional.
  - **День периода** — numeric input 1..31, optional, helper text «Например, 5 = 5-й день периода».
  - **Sort order** — numeric input, optional (default = max+10).
- Footer:
  - При edit: кнопка «Удалить» (красная, слева) → window.confirm → DELETE /template/items/{id}.
  - Кнопка «Сохранить» (primary) — disabled если форма невалидна.
  - Кнопка «Отмена» (secondary).
- На сохранении: POST или PATCH; close sheet; refetch.

### Files

- `frontend/src/screens/TemplateScreen.tsx`
- `frontend/src/screens/TemplateScreen.module.css`
- `frontend/src/components/PlanRow.tsx` (общий с PlannedScreen)
- `frontend/src/components/PlanRow.module.css`
- `frontend/src/components/BottomSheet.tsx`
- `frontend/src/components/BottomSheet.module.css`
- `frontend/src/components/PlanItemEditor.tsx`
- `frontend/src/components/PlanItemEditor.module.css`
- `frontend/src/api/templates.ts`
- `frontend/src/hooks/useTemplate.ts`

### Acceptance.1 (manual checkpoint)

1. Открыть Mini App → Home → tap «Шаблон» → переход на TemplateScreen.
2. (Empty case) Если шаблон пуст: видим placeholder «Шаблон пуст. Добавьте первую строку.» + кнопка `+ Добавить строку`.
3. Создать строку:
   - Tap «+ Добавить строку» → открывается BottomSheet «Новая строка шаблона».
   - Выбрать категорию «Продукты», ввести сумму «15000», описание «Закупка», день «5» → tap «Сохранить».
   - Sheet закрывается, в группе «Расходы » → «Продукты» появляется строка с amount «15 000 ₽», description «Закупка», badge «[День 5]».
4. Inline-edit amount:
   - Tap на «15 000 ₽» → появляется input с pre-filled value, autofocus.
   - Изменить на «20000» → Enter.
   - Строка обновляется на «20 000 ₽».
   - Повторить с Esc → no-op (значение не меняется).
5. Полный редактор:
   - Tap на description / [День 5] badge → открывается BottomSheet «Изменить строку шаблона».
   - Изменить категорию на «Дом», описание на «Аренда» → tap «Сохранить».
   - Строка переезжает в группу «Дом».
6. Удаление:
   - Открыть BottomSheet edit → tap «Удалить» → window.confirm («Удалить строку?») → confirm.
   - Sheet закрывается, строка исчезает.
7. Telegram BackButton:
   - Открыть BottomSheet → tap Telegram BackButton (стрелка в header) → sheet закрывается.

---

## Screen 2: PlannedScreen

### Layout (sketch 005-B + actions row)

```
┌────────────────────────────────────────┐
│  [← Назад]  План текущего периода      │
│  Февраль 2026 · 5 фев — 4 мар          │  ← sub-header
├────────────────────────────────────────┤
│  [Применить шаблон]  [↻ В шаблон]      │  ← actions; Apply скрыта когда есть строки
├────────────────────────────────────────┤
│  Расходы                               │
│  ▸ Продукты                            │
│  ┌──────────────────────────────────┐  │
│  │  15 000 ₽   Закупка              │  │
│  │             [05 фев]             │  │  ← planned_date badge
│  └──────────────────────────────────┘  │
│  + Добавить строку в Продукты          │
│                                        │
│  ▸ Подписки                            │
│  ┌──────────────────────────────────┐  │
│  │  990 ₽  YouTube Premium          │  │
│  │  🔁 Подписка   [10 фев]          │  │  ← read-only mock (PLN-03)
│  └──────────────────────────────────┘  │
│                                        │
│  Доходы                                │
│  ▸ Зарплата                            │
│  ┌──────────────────────────────────┐  │
│  │  120 000 ₽  Основная             │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Behaviour

- На mount: `GET /api/v1/periods/current` (через `useCurrentPeriod` hook), затем `GET /api/v1/periods/{period.id}/planned`.
- Группировка такая же, как TemplateScreen.
- Sub-header: `<MonthName YYYY> · <period_start dd MMM> — <period_end dd MMM>`. Локаль ru.
- Actions row:
  - **«Применить шаблон»** (primary button) — показывается только когда `planned.length === 0`. На клик: POST `/api/v1/periods/{period.id}/apply-template` → toast «Применено N строк» (если N>0) или «Шаблон пуст — нечего применять» (если N==0) → refetch.
  - **«↻ В шаблон»** (secondary button) — показывается всегда. На клик: window.confirm («Перезаписать шаблон текущим планом? Существующий шаблон будет удалён.») → POST `/api/v1/template/snapshot-from-period/{period.id}` → toast «Шаблон обновлён: N строк» → no need refetch на planned (только template).

### PlanRow (planned mode)

- Tap на amount (если `source !== 'subscription_auto'`) → inline edit (как в template mode).
- Tap на non-amount zone (если `source !== 'subscription_auto'`) → open BottomSheet full editor.
- Если `source === 'subscription_auto'`:
  - Render badge `🔁 Подписка` (text-muted color) над/рядом с описанием.
  - Tooltip / placeholder при попытке tap: «Управляется подпиской — измените в разделе «Подписки»».
  - Cursor: not-allowed.
  - Без edit ✎/delete ⊟ кнопок.
- Если `source === 'template'` или `'manual'`: визуально идентичны (badge не показываем).
- planned_date отображается как badge «[05 фев]» (если задано); либо отсутствует.

### BottomSheet (planned mode)

- Title: «Новая строка плана» / «Изменить строку плана».
- Поля как в template mode, но вместо `day_of_period` → `<input type="date">` `planned_date` (optional, min=period_start, max=period_end).
- На сохранении: POST `/api/v1/periods/{period.id}/planned` (создаёт с source=manual) или PATCH `/api/v1/planned/{id}`.

### PLN-03 mock injection (dev-only)

- В DEV-режиме (`import.meta.env.DEV`) добавляется global helper `window.__injectMockPlanned__(row: PlannedRead)` в `App.tsx` или в сам `PlannedScreen.tsx`.
- Helper делает `setMockRows(prev => [...prev, row])`; `PlannedScreen` мержит mock-rows с реальными для отрисовки.
- В prod helper не существует (tree-shaken).
- Verification: открыть DevTools console → `window.__injectMockPlanned__({id: -1, period_id: 1, kind: 'expense', amount_cents: 99000, description: 'YouTube Premium', category_id: 10, planned_date: '2026-02-10', source: 'subscription_auto', subscription_id: 1})` → строка появляется в группе «Подписки» с badge «🔁 Подписка».

### Files

- `frontend/src/screens/PlannedScreen.tsx`
- `frontend/src/screens/PlannedScreen.module.css`
- `frontend/src/api/planned.ts`
- `frontend/src/hooks/usePlanned.ts`
- `frontend/src/hooks/useCurrentPeriod.ts`

### Acceptance.2 (manual checkpoint)

1. Открыть Mini App → Home → tap «План» → переход на PlannedScreen.
2. (Empty period case) Если планов нет: видим actions row с кнопкой «Применить шаблон» (active, если шаблон не пуст).
   - Если шаблон пуст: показываем placeholder «Шаблон пуст. Перейдите в «Шаблон» чтобы заполнить.» + link на TemplateScreen.
3. Apply-template:
   - Заранее (через TemplateScreen) создать 3 строки в шаблоне.
   - Tap «Применить шаблон» → toast «Применено 3 строки» → видим 3 строки на экране, кнопка «Применить шаблон» исчезла.
   - Tap «Применить шаблон» снова — кнопка не видна (по condition); если вручную дёрнуть POST через DevTools — server вернёт `created=0`.
4. Snapshot:
   - Изменить amount у одной строки inline-edit, добавить ещё одну manual через BottomSheet.
   - Tap «↻ В шаблон» → window.confirm «Перезаписать шаблон…» → confirm → toast «Шаблон обновлён: 4 строки».
   - Перейти в Шаблон → видим 4 строки с обновлёнными суммами.
5. PLN-03 mock:
   - Открыть DevTools console → выполнить `window.__injectMockPlanned__({id: -1, period_id: 1, kind: 'expense', amount_cents: 99000, description: 'YouTube Premium', category_id: 10, planned_date: '2026-02-10', source: 'subscription_auto', subscription_id: 1})`.
   - Видим в категории строки с badge «🔁 Подписка» серым цветом, без кнопок edit/delete; tap на amount/description не реагирует (или показывает tooltip).
6. Telegram BackButton: при открытом BottomSheet → tap BackButton → sheet закрывается, screen остаётся.

---

## Screen 3 (modify): HomeScreen

### Add navigation buttons

```
┌────────────────────────────────────────┐
│  TG Budget                             │
│                                        │
│  Дашборд будет в Phase 5.              │
│  Сейчас доступны только настройки и    │
│  категории.                            │
│                                        │
│  [Категории]  [Шаблон]  [План]  [Настройки]  │  ← 4 кнопки в строку или wrap
└────────────────────────────────────────┘
```

`HomeScreen.onNavigate` принимает один из `'categories' | 'template' | 'planned' | 'settings'`. App.tsx Screen union расширяется.

---

## Component: BottomSheet

### Props

```tsx
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}
```

### Behaviour

- При `open=true`:
  - Render backdrop (semi-transparent) + sheet (slide-up).
  - Подписаться на `tg.BackButton.onClick(onClose)` (если доступно).
  - Подписаться на `keydown` Escape → `onClose()`.
- При `open=false`:
  - Animate вниз (`transform: translateY(100%)`).
  - Отписаться от listeners.
- Backdrop tap → `onClose()`.
- `aria-modal="true"`, `role="dialog"`, `aria-label={title}`.
- Внутри sheet: handle bar (визуальная подсказка swipe; самих swipe-actions не делаем).

### Styles (key)

- Backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100;` + `transition: opacity 250ms ease-out`.
- Sheet: `position: fixed; bottom: 0; left: 0; right: 0; max-height: 85vh; overflow: auto; background: var(--color-surface); border-radius: var(--radius-lg) var(--radius-lg) 0 0; z-index: 101; transform: translateY(100%); transition: transform 250ms ease-out; padding-bottom: var(--safe-bottom);`.
- `.sheetOpen { transform: translateY(0); }`, `.backdropOpen { opacity: 1; pointer-events: auto; }`.

---

## Component: PlanItemEditor

### Props

```tsx
interface PlanItemEditorProps {
  mode: 'create-template' | 'edit-template' | 'create-planned' | 'edit-planned';
  initial?: Partial<{
    category_id: number;
    amount_cents: number;
    description: string | null;
    day_of_period: number | null;  // template only
    planned_date: string | null;    // planned only
  }>;
  categories: CategoryRead[];   // pre-fetched (active only)
  periodBounds?: { start: string; end: string };  // planned only — для min/max date
  onSave: (data: SaveData) => Promise<void>;
  onDelete?: () => Promise<void>;  // опц., только для edit modes
  onCancel: () => void;
}
```

### Form

- **Категория:** `<select>`:
  ```html
  <select>
    <optgroup label="Расходы">
      <option value="1">Продукты</option>
      ...
    </optgroup>
    <optgroup label="Доходы">
      <option value="13">Зарплата</option>
      ...
    </optgroup>
  </select>
  ```
- **Сумма (₽):** `<input type="text" inputmode="decimal">`. Парсится в копейки: `Math.round(parseFloat(v.replace(/\s/g, '').replace(',', '.')) * 100)`. Empty/NaN → форма невалидна.
- **Описание:** `<textarea maxlength="500">`. Optional.
- **День периода (template):** `<input type="number" min="1" max="31">`. Helper text «Например, 5 = 5-й день периода. Можно оставить пустым.».
- **Planned date (planned):** `<input type="date">` с `min={periodBounds.start}` и `max={periodBounds.end}`.
- **Sort order (template only):** `<input type="number" min="0">`. Default = «авто (в конец)». Скрыт за «Дополнительно ▾» (collapsible).

### Validation

- Категория обязательна.
- Сумма > 0 обязательна.
- Описание optional.
- День/дата optional.
- Submit button disabled пока обязательные не заполнены.

### Errors

- При API ошибке (400 archived category, 400 kind mismatch) — показываем error-message в footer формы, не закрываем sheet. Пользователь может исправить.

---

## Component: PlanRow

### Props

```tsx
type PlanRowItem =
  | { type: 'template'; row: TemplateItemRead; category: CategoryRead }
  | { type: 'planned'; row: PlannedRead; category: CategoryRead };

interface PlanRowProps {
  item: PlanRowItem;
  onAmountSave: (newAmountCents: number) => Promise<void>;
  onOpenEditor: () => void;
  // Если subscription_auto — onAmountSave/onOpenEditor не вызываются
}
```

### Visual

- 2-line row:
  - Line 1: amount (right-aligned, large, primary color) + description (left, multiline truncate).
  - Line 2: badges (`[День 5]` или `[05 фев]` или `🔁 Подписка`).
- Hover/active: subtle background change.
- Read-only (subscription_auto): opacity 0.7, no hover.

---

## Routing changes (App.tsx)

```tsx
type Screen = 'onboarding' | 'home' | 'categories' | 'template' | 'planned' | 'settings';
```

HomeScreen.props.onNavigate accepts `'categories' | 'template' | 'planned' | 'settings'`.

App.tsx renders TemplateScreen / PlannedScreen в соответствии с screen.

---

## Acceptance.3 (E2E manual checkpoint)

End-to-end flow, проверяющий ВСЕ Phase 3 success criteria:

1. **Setup:** Только что прошёл onboarding (Phase 2), активный период существует, категории засеяны (14), шаблон пуст, планов нет.
2. **Создать template:**
   - Home → Шаблон → tap «+ Добавить строку».
   - BottomSheet → выбрать «Продукты», сумма «15000», описание «Закупка», день «5» → Сохранить.
   - Повторить для «Дом» 35000 / «Аренда» / 1.
   - Повторить для «Зарплата» 120000 / «Основная» / 5 (income).
   - Видим 3 строки в шаблоне.
3. **Apply template к пустому периоду:**
   - Home → План → видим actions row с кнопкой «Применить шаблон» (active).
   - Tap → toast «Применено 3 строки».
   - Видим 3 строки на экране (сумма, описание, badge с planned_date — 5 фев / 1 фев / 5 фев).
   - Кнопка «Применить шаблон» исчезла.
4. **Idempotency check (через DevTools):**
   - Открыть DevTools console → `fetch('/api/v1/periods/<id>/apply-template', {method: 'POST', headers: {'X-Telegram-Init-Data': 'dev-mode-stub'}}).then(r => r.json()).then(console.log)`.
   - Response: `{period_id: <id>, created: 0, planned: [...3 items...]}`.
   - На экране ничего не изменилось (refetch может произойти, но строки те же).
5. **Edit planned inline:**
   - Tap на «15 000 ₽» (Продукты) → input → ввести «18000» → Enter.
   - Видим «18 000 ₽».
6. **Add manual planned via BottomSheet:**
   - В категории «Кафе и рестораны» tap «+ Добавить строку».
   - BottomSheet → Сумма 5000, описание «На месяц», planned_date 15 фев → Сохранить.
   - Видим строку в группе «Кафе и рестораны».
7. **Snapshot template from period:**
   - Tap «↻ В шаблон» → window.confirm → confirm.
   - Toast «Шаблон обновлён: 4 строки».
   - Home → Шаблон → видим 4 строки с обновлёнными значениями (Продукты 18 000 / Дом 35 000 / Зарплата 120 000 / Кафе 5 000).
8. **PLN-03 mock badge:**
   - Home → План → DevTools console → `window.__injectMockPlanned__({id: -1, period_id: <current_period_id>, kind: 'expense', amount_cents: 99000, description: 'YouTube Premium', category_id: 10, planned_date: '2026-02-10', source: 'subscription_auto', subscription_id: 1})`.
   - В группе категории «Подписки» (или соответствующей) появляется строка `990 ₽ · YouTube Premium · 🔁 Подписка · [10 фев]`.
   - Tap на amount — нет реакции (read-only); tap на description — нет open BottomSheet.
9. **Restore: refresh страницы → mock-строка исчезает (только real data из API).**

Если все 9 шагов проходят — Phase 3 считается принятой.

---

## Anti-Patterns to Avoid (UI)

- Не использовать `confirm` для destructive (delete row) при наличии Telegram BackButton — оставляем `window.confirm` для совместимости с browser dev (sketch 005-B).
- Не делать optimistic update для apply-template (можно уйти в неконсистентное состояние при ошибке) — refetch после API success.
- Не делать swipe-actions (delete/edit) — bottom-sheet и кнопки покрывают.
- Не использовать react-router (D-19 carryover).
- Не вводить state-management библиотеки (D-21 carryover).
- Не делать live-update / WebSocket — single-tenant, refetch после mutation достаточно.
