---
phase: 4
slug: actual-transactions-and-bot-commands
sketches: [002-add-transaction-B]
status: draft
created: 2026-05-02
---

# Phase 4 — UI Specification

> Какой UI будет создан в Phase 4. Используется как референс для checkpoint:human-verify в Plans 04-05/04-06/04-07.

---

## Overview

Phase 4 создаёт **один новый экран** (`ActualScreen`) и **один новый компонент-форму** (`ActualEditor`), плюс расширяет `HomeScreen` floating-action-button'ом «+ Трата» и навигацией.

Использует **переиспользуемый `BottomSheet`** (готов из Phase 3, D-40) — никаких изменений в компоненте.

Дизайн-референс: `.planning/sketches/002-add-transaction/index.html` (winner B — bottom sheet).

---

## Component Inventory

### NEW Components

| Component | File | Purpose |
|-----------|------|---------|
| `ActualEditor` | `frontend/src/components/ActualEditor.tsx` (+ `.module.css`) | Form внутри BottomSheet: kind toggle, amount, category, description, tx_date |
| `Fab` | `frontend/src/components/Fab.tsx` (+ `.module.css`) | Floating action button «＋» (re-used in HomeScreen + ActualScreen) |
| `ActualRow` | `frontend/src/components/ActualRow.tsx` (+ `.module.css`) ИЛИ inline в ActualScreen | Одна строка факт-траты в списке (amount + category-chip + description + edit/delete) |

### NEW Screens

| Screen | File | Purpose |
|--------|------|---------|
| `ActualScreen` | `frontend/src/screens/ActualScreen.tsx` (+ `.module.css`) | Список факт-трат текущего периода, group-by-date desc, FAB |

### EXTENDED Files

| File | Change |
|------|--------|
| `frontend/src/screens/HomeScreen.tsx` | + FAB «+ Трата» + nav-кнопка «Факт» |
| `frontend/src/App.tsx` | + `'actual'` в Screen union + routing |
| `frontend/src/api/types.ts` | + ActualSource, ActualRead, ActualCreatePayload, ActualUpdatePayload, BalanceResponse, BalanceCategoryRow |

### NEW API/Hook Files

| File | Purpose |
|------|---------|
| `frontend/src/api/actual.ts` | listActual, createActual, updateActual, deleteActual, getBalance |
| `frontend/src/hooks/useActual.ts` | Fetch актуалов периода, refetch, busy/error state |

---

## Layouts

### 1. ActualEditor (внутри BottomSheet, sketch 002-B)

```
┌─────────────────────────────────────┐
│  ━━━ (handle)                        │
│                                      │
│  Новая трата                    [×] │
├─────────────────────────────────────┤
│                                      │
│  [Расход] [Доход]                    │  ← Kind toggle (segmented)
│                                      │
│  Сумма (₽)                           │
│  ┌──────────────────────────────┐   │
│  │ 1500                         │   │  ← inputmode="decimal"
│  └──────────────────────────────┘   │
│                                      │
│  Категория                           │
│  ┌──────────────────────────────┐   │
│  │ Продукты                  ▾  │   │  ← <select> filtered by kind
│  └──────────────────────────────┘   │
│                                      │
│  Описание                            │
│  ┌──────────────────────────────┐   │
│  │ пятёрочка                    │   │  ← textarea max 500
│  └──────────────────────────────┘   │
│                                      │
│  Дата                                │
│  ┌──────────────────────────────┐   │
│  │ 2026-05-02              📅   │   │  ← <input type="date">, default = today
│  └──────────────────────────────┘   │
│                                      │
│  [Удалить]    [Отмена] [Сохранить]   │  ← delete only in edit mode
│                                      │
└─────────────────────────────────────┘
```

**Behavior:**
- Kind toggle: меняет фильтр категорий в select. Если выбранная категория — другого kind, сбрасывается на пустую.
- Сумма: parse через `parseRublesToKopecks` (copy-paste из PlanItemEditor для MVP).
- Tx_date: `new Date().toISOString().slice(0, 10)` default; max — `today + 7 days` (D-58).
- Save disabled пока: amount > 0, category выбрана, kind выбран.
- Submit: spinner состояние + ошибки выводятся ниже формы.

### 2. ActualScreen (group-by-date)

```
┌─────────────────────────────────────┐
│ ←  Факт периода                      │  ← header + back button
│    Май 2026 · 5 май — 3 июн          │  ← period subtitle
├─────────────────────────────────────┤
│                                      │
│  Сегодня                             │  ← date group header
│  ──────────                          │
│   1 500 ₽   Продукты                 │  ← actual row (tap → edit sheet)
│             пятёрочка                │
│                                      │
│     850 ₽   Кафе                     │
│             обед                     │
│                                      │
│  Вчера                               │
│  ──────                              │
│   3 200 ₽   Продукты                 │
│             перекрёсток              │
│                                      │
│  30 апреля                           │
│  ──────────                          │
│   1 990 ₽   Подписки                 │
│             Spotify                  │
│                                      │
│                                      │
│                                      │
│                              ┌───┐   │
│                              │ ＋ │  │  ← FAB
│                              └───┘   │
└─────────────────────────────────────┘
```

**Behavior:**
- Header sticky сверху (как в PlannedScreen).
- Date group header: «Сегодня», «Вчера», или «N месяца» (русский локаль).
- Внутри даты — строки отсортированы `id desc` (новые сверху).
- Доходы (`kind='income'`) — визуально такие же, но amount с зелёным akcentом (опц., discretion).
- Tap на строку → BottomSheet edit-mode (ActualEditor с initial values).
- Empty-state: «Пока нет факт-трат. Нажмите ＋ чтобы добавить.» (центрирована).
- FAB фиксированная внизу-справа (`position: fixed; bottom: 24px; right: 24px; z-index: 50`).

### 3. HomeScreen (extended)

```
┌─────────────────────────────────────┐
│  TG Budget                           │
│                                      │
│  Дашборд будет в Phase 5.            │
│  Сейчас: категории, шаблон, план,    │
│  факт, настройки.                    │
│                                      │
│  [Категории]                         │
│  [Шаблон]                            │
│  [План]                              │
│  [Факт]              ← НОВАЯ кнопка  │
│  [Настройки]                         │
│                                      │
│                              ┌───┐   │
│                              │ ＋ │  │  ← FAB (новая)
│                              └───┘   │
└─────────────────────────────────────┘
```

**Behavior:**
- Nav-кнопка «Факт» → `onNavigate('actual')`.
- FAB → открывает BottomSheet с ActualEditor (create-mode) поверх HomeScreen. После save — toast + sheet закрывается; пользователь остаётся на HomeScreen (не переходит на ActualScreen — преднамеренный «quick-add» UX).

---

## Acceptance Criteria

### Acceptance.1 — ActualEditor (Plan 04-05)

1. **Open Mini App** — bypass onboarding (если нужен — пропустить через DEV).
2. **Открыть ActualScreen** через nav «Факт» (когда Plan 04-06 готов; иначе через FAB на HomeScreen).
3. **Tap FAB** — BottomSheet выезжает снизу.
4. **Form поля видны:** kind toggle (Расход/Доход), сумма, категория, описание, дата.
5. **Toggle kind «Доход»:**
   - Категория-select обновляется: показывает только income-категории («Зарплата», «Прочие доходы»).
   - Если до этого была выбрана expense-категория — она сбрасывается до пустой.
6. **Заполнить:** сумма=1500, категория=Продукты, описание=тест, tx_date=сегодня.
7. **Tap «Сохранить»** — sheet закрывается, появляется toast «Записано».
8. **Verify в БД** (через psql или DevTools network):
   ```sql
   SELECT * FROM actual_transaction ORDER BY id DESC LIMIT 1;
   -- Ожидаем: amount_cents=150000, category_id=<Продукты>, source='mini_app', period_id=<active>
   ```

### Acceptance.2 — ActualScreen (Plan 04-06)

1. **Tap FAB на HomeScreen** → ActualEditor → save 1500₽ Продукты → закрывается.
2. **Tap «Факт» на HomeScreen** → переход на ActualScreen.
3. **Verify list:**
   - Заголовок «Факт периода», под ним «Май 2026 · 5 май — 3 июн».
   - Группа «Сегодня» с одной строкой «1 500 ₽ Продукты тест».
   - FAB видна.
4. **Tap на строку** → BottomSheet edit-mode с pre-filled полями.
5. **Изменить tx_date на вчерашнее** (например, 2026-05-01) → Save:
   - Toast «Сохранено».
   - Строка перемещается в группу «Вчера» (тот же период если в границах).
   - Если tx_date в другом периоде — строка пропадает из списка (т.к. фильтр period_id).
6. **Проверить delete:**
   - Tap row → Sheet → tap «Удалить» → confirm → строка пропадает из списка.
7. **Empty state:** удалить все факт-трат периода → видно «Пока нет факт-трат. Нажмите ＋ чтобы добавить.»

### Acceptance.3 — Bot commands (Plan 04-04)

Предусловие: bot контейнер запущен; OWNER_TG_ID правильно настроен; Mini App имеет хотя бы 14 категорий из seed (Phase 2).

1. **`/add 1500 продукты пятёрочка`:**
   - Bot отвечает:
     ```
     ✓ Записано: 1 500 ₽ — Продукты (пятёрочка)
     Остаток по категории: <X> ₽ (план <Y> ₽)
     ```
   - В БД создан actual с `source='bot'`.
2. **`/add 1500 транс`:**
   - Если совпадает только «Транспорт» — created.
   - Если совпадает «Транспорт» + «Транспортная карта» (предположим есть) — bot отвечает:
     ```
     Уточните категорию:
     [Транспорт (expense)]
     [Транспортная карта (expense)]
     ```
   - Tap на «Транспорт» → bot отвечает подтверждением (см. п.1).
3. **`/balance`:**
   - Bot отвечает (D-60):
     ```
     💰 Баланс: 23 450 ₽
     Δ периода: +5 200 ₽
     
     Топ-5 категорий:
     ✓ Продукты: 8 500 / 10 000 ₽ (Δ +1 500)
     ⚠️ Кафе: 4 200 / 5 000 ₽ (Δ +800, 84%)
     🔴 Развлечения: 6 500 / 5 000 ₽ (Δ -1 500, 130%)
     ✓ Транспорт: 1 200 / 3 000 ₽ (Δ +1 800)
     ✓ Подписки: 1 990 / 2 000 ₽ (Δ +10)
     
     Период: 5 май — 3 июн
     ```
4. **`/today`:**
   - Bot отвечает (D-61):
     ```
     Сегодня (2 мая 2026):
     • Продукты: 1 500 ₽ — пятёрочка
     • Кафе: 850 ₽ — обед
     Итого расходов: 2 350 ₽
     ```
   - Если транзакций нет: «Сегодня нет факт-трат.»
5. **`/app`:**
   - Bot отвечает: «Откройте Mini App для управления бюджетом:» + InlineKeyboardButton с WebApp.
   - Tap на кнопку → открывается Mini App.
6. **`/income 50000 зарплата аванс`:**
   - Bot создаёт income actual + ответ с «Доходы периода: X / Y план».
7. **`/add abc xyz`** (невалидная сумма):
   - Bot отвечает usage-помощью «Использование: /add <сумма> <категория>».
8. **Не-OWNER пользователь** шлёт `/add 100 cat`:
   - Bot НЕ отвечает (silent ignore — D-anti-spam).

### Acceptance.4 — E2E flow (Plan 04-07)

1. **Mini App add:** Tap FAB → save 1500₽ Кафе → toast.
2. **Bot /balance** → видим: «Кафе: 1 500 / <plan> ₽».
3. **Bot /add 850 кафе обед** → ✓ Записано.
4. **Bot /today** → видим обе строки (Mini App-добавленная + Bot-добавленная), Итого = 2 350 ₽.
5. **Mini App: tap «Факт»** → видим обе строки в группе «Сегодня».
6. **Edit Bot-добавленную строку** через Mini App: изменить amount на 900 → save.
7. **Bot /balance снова** → reflect новый total.

---

## Visual References

- Sketch 002-B (`.planning/sketches/002-add-transaction/index.html`) — основной reference для bottom-sheet ActualEditor.
- Phase 3 PlannedScreen для group-by-... паттерна (но мы используем by-date вместо by-category).
- `.planning/sketches/themes/default.css` — design tokens (carryover).

---

## Out of Scope (UI-wise)

- Inline-edit amount на ActualRow (как в PlanRow) — отложено в `<deferred>` CONTEXT.md.
- Source indicator (mini_app/bot) на строке — отложено.
- Dashboard hero-card с balance — Phase 5 (DSH-01).
- Period switcher — Phase 5 (DSH-06).
- ActualScreen group-by-category alternate view — отложено.
- Animations beyond BottomSheet slide — out of scope.
