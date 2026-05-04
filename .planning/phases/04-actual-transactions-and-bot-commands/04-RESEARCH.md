# Phase 4: Actual Transactions & Bot Commands — Research

**Researched:** 2026-05-02
**Domain:** aiogram 3 inline keyboards + callback handlers, bot↔api internal pattern (carry-over), period auto-resolve, balance aggregation SQL, in-memory state TTL.
**Confidence:** HIGH (большинство паттернов уже проверены в Phase 1-3; новые элементы — aiogram inline kbd + callback_query handlers — стандартные).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-45..D-46:** Bot↔API через internal endpoints `/api/v1/internal/bot/*` с X-Internal-Token; 3 endpoint'а (actual / balance / today).
- **D-47..D-48:** In-memory disambiguation cache по chat_id с TTL 5 мин; callback_data формат `act:<token>:<category_id>`.
- **D-49..D-50:** Парсер сумм поддерживает `1500`, `1500.50`, `1 500`, `1500р`, `1500₽`; парсер команды `/add <amount> <category_query> [description]`.
- **D-51:** Category search — case-insensitive substring (ILIKE), alphabetical sort, archived excluded.
- **D-52:** Period resolve — lookup-or-create через `period_for(tx_date, cycle_start_day)`; PATCH с новым tx_date пересчитывает period_id (ACT-05).
- **D-53:** `source='mini_app'` vs `source='bot'` server-side (не пользователь выставляет).
- **D-54..D-57:** API layout (actual_router public + internal_bot_router); service-слой pure (без FastAPI imports).
- **D-58:** Domain validation — archived cat 400, kind mismatch 400, amount > 0 (Pydantic), tx_date <= today+7d (server-side).
- **D-59..D-62:** Bot reply formats (`/add`, `/balance`, `/today`, `/app`).
- **D-63..D-67:** Frontend — новый ActualEditor (НЕ overload PlanItemEditor), ActualScreen group-by-date, FAB на HomeScreen и ActualScreen.
- **D-68:** Reuse Phase 2-3 (BottomSheet, apiFetch, useCategories, useCurrentPeriod, parseRublesToKopecks).
- **D-69..D-70:** Wave 0 RED tests; нет frontend unit-тестов.

### Claude's Discretion

- Точные имена React-компонентов (`ActualEditor`, `ActualRow`, `Fab`).
- Структура: один ActualEditor с props vs два отдельных компонента.
- Имена exception-классов.
- Текст empty-state, toast и helper-сообщений на русском.
- Inline-keyboard layout (1 кнопка/row vs grid).
- Способ передачи tg_user_id из bot-handlers.

### Deferred Ideas (OUT OF SCOPE)

- Search by description, bot edit/delete commands, frequency-based category sorting, money-helper refactor, webhook mode, push notifications, per-actual undo, ActualScreen group-by-category alternate view, inline-edit amount on ActualRow, CSV export.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACT-01 | Bottom-sheet форма добавления через Mini App (sketch 002-B) | Reuse `BottomSheet` (D-40 ready) + новый `ActualEditor` |
| ACT-02 | period_id вычисляется по tx_date + cycle_start_day | D-52: `_resolve_period_for_date`; lookup-or-create через существующий `period_for` |
| ACT-03 | Bot-команды `/add`, `/income` создают факт-транзакции | D-46 internal endpoint + aiogram Command handlers + парсеры (D-49/D-50) |
| ACT-04 | `/balance`, `/today`, `/app` — корректные данные | D-46 + D-60..62 reply formats; `compute_balance` pattern (по аналогии с future Phase 5 DSH agg) |
| ACT-05 | PATCH tx_date → пересчёт period_id | D-52 — тот же `_resolve_period_for_date` вызывается в `update_actual` если tx_date в патче |

</phase_requirements>

---

## Summary

Phase 4 — продолжение доменной работы из Phase 2/3 + первый раз когда bot становится «активным» участником (вне `/start`). Новые паттерны:

1. **`_resolve_period_for_date` (D-52)** — критическая точка: автосоздание исторических периодов при ретро-вводе. Это снимает блокер UX «нельзя добавить вчерашнюю трату, если предыдущий период не был автосоздан».
2. **aiogram callback_query handlers** — новый паттерн (Phase 1-3 использовали только `Message`). Стандартный `@router.callback_query(...)` decorator + `CallbackQuery.data` parsing.
3. **In-memory state с TTL** — простое dict вместо aiogram FSM или Redis. Достаточно для single-tenant.
4. **Internal bot endpoints как «команды-сообщения»** — POST с body, не GET. Возвращают discriminated unions через `status` поле (created/ambiguous/not_found).

Большая часть кода backend — стандартные FastAPI CRUD + агрегационные SQL (GROUP BY). Frontend — новый экран + reuse existing BottomSheet pattern.

**Primary recommendations:**
- Использовать `aiogram.F` filter и `@router.callback_query(F.data.startswith("act:"))` для disambiguation callback (стандартный паттерн aiogram 3.x).
- Использовать `func.sum` + `group_by` для balance агрегации; не city write loop в Python (одна query на planned + одна на actual).
- `parse_amount` — простая функция через regex + try/except, без `decimal.Decimal` (overkill для рублей; round(float * 100) безопасен до ~10^14 копеек, мы ограничиваем 10^12).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Actual CRUD (HTTP) | `app/services/actual.py` | `app/api/routes/actual.py` | Pure service + thin route + Pydantic |
| Period resolve for tx_date | `app/services/actual.py::_resolve_period_for_date` | `app/core/period.py::period_for` | D-52: lookup BudgetPeriod, fallback create через pure period_for |
| Balance aggregation | `app/services/actual.py::compute_balance` | `app/api/routes/actual.py::get_balance` | GROUP BY planned + actual, single-query agg на категорию |
| Bot internal dispatcher | `app/services/internal_bot.py` | `app/api/routes/internal_bot.py` | Бот не знает о category lookup / disambiguation logic — это в сервисе |
| Bot command parsing | `app/bot/parsers.py` | `app/bot/commands.py` | Pure functions, unit-testable; handler — оркестрация I/O |
| Bot disambiguation state | `app/bot/disambiguation.py` | `app/bot/commands.py` | In-memory dict + TTL; chat_id-keyed token |
| Bot↔API HTTP client | `app/bot/api_client.py` (extend) | `app/bot/commands.py` | Расширяем существующий client (D-45) — три новых функции |
| Mini App ActualEditor (form) | `frontend/src/components/ActualEditor.tsx` | category select, amount input, kind toggle, tx_date input | НЕ overload PlanItemEditor (D-63); discriminated на `kind` field |
| Mini App ActualScreen | `frontend/src/screens/ActualScreen.tsx` | `BottomSheet`, `ActualEditor`, `useActual`, `useCurrentPeriod` | Group-by-date layout (D-65) |
| Mini App FAB | `frontend/src/components/Fab.tsx` (new) или inline | — | Single component, переиспользуется в HomeScreen + ActualScreen |
| HomeScreen extension | `frontend/src/screens/HomeScreen.tsx` (extend) | `Fab`, `BottomSheet`, `ActualEditor` | FAB + nav-кнопка «Факт» |
| App routing | `frontend/src/App.tsx` (extend) | useState | Добавить `'actual'` в Screen union |
| API clients | `frontend/src/api/actual.ts` | `apiFetch` (Phase 2) | Тонкие обёртки |
| Hooks | `frontend/src/hooks/useActual.ts` | `apiFetch` | Pattern Phase 2 (state + refetch + cancel guard) |

---

## Standard Stack

### New Backend Dependencies

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none) | — | — | aiogram 3.22.0 уже включает всё нужное (Router, F, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup); httpx уже в use |

### New Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| (none) | — | ActualEditor — copy parseRublesToKopecks helpers; FAB — CSS-only |

### Carryover from Phase 1-3

Все Phase 1-3 зависимости — без изменений (aiogram, httpx, FastAPI, SQLAlchemy, Pydantic, Vite, React, @telegram-apps/sdk-react).

---

## Architecture Patterns

### Pattern 1: aiogram 3 Command handler с argument parsing

**What:** Регистрируем handler через `@router.message(Command("add"))`, получаем args через `CommandObject`.

```python
# app/bot/commands.py
from aiogram import Router, F
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from app.bot.parsers import parse_add_command
from app.bot.api_client import bot_create_actual

router = Router()

@router.message(Command("add"))
async def cmd_add(message: Message, command: CommandObject) -> None:
    """`/add <amount> <category_query> [description]` → create expense."""
    if message.from_user is None or message.from_user.id != settings.OWNER_TG_ID:
        return  # owner-only — silent ignore for non-owner

    parsed = parse_add_command(command.args)
    if parsed is None:
        await message.answer(
            "Использование: /add <сумма> <категория> [описание]\n"
            "Например: /add 1500 продукты пятёрочка"
        )
        return

    amount_cents, category_query, description = parsed
    try:
        result = await bot_create_actual(
            tg_user_id=message.from_user.id,
            kind="expense",
            amount_cents=amount_cents,
            category_query=category_query,
            description=description,
        )
    except InternalApiError as exc:
        logger.warning("bot.add.api_failed", error=str(exc))
        await message.answer("Не удалось связаться с сервером. Попробуйте позже.")
        return

    await _handle_actual_result(message, result, kind="expense", ...)
```

`/income` handler — clone с `kind="income"`. Можно фактором извлечь в общий handler с параметром.

[VERIFIED: aiogram 3.22 docs — Command filter + CommandObject.args]

### Pattern 2: aiogram 3 inline-keyboard for disambiguation

**What:** При `status='ambiguous'` — строим keyboard с одной кнопкой на категорию, callback_data = `"act:<token>:<category_id>"`.

```python
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

def build_disambiguation_kbd(token: str, candidates: list[dict]) -> InlineKeyboardMarkup:
    """One button per candidate, 1-per-row layout."""
    rows = [
        [InlineKeyboardButton(
            text=f"{c['name']} ({c['kind']})",
            callback_data=f"act:{token}:{c['id']}",
        )]
        for c in candidates
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)
```

```python
@router.callback_query(F.data.startswith("act:"))
async def cb_disambiguation(callback: CallbackQuery) -> None:
    parts = (callback.data or "").split(":", 2)
    if len(parts) != 3 or parts[0] != "act":
        await callback.answer("Некорректный формат.", show_alert=False)
        return
    _, token, category_id_str = parts
    try:
        category_id = int(category_id_str)
    except ValueError:
        await callback.answer("Некорректный id категории.", show_alert=False)
        return

    pending = pop_pending(token)
    if pending is None:
        await callback.answer("Время ожидания истекло.", show_alert=True)
        if callback.message:
            await callback.message.edit_reply_markup(reply_markup=None)
        return

    # Re-call internal API with explicit category_id (no disambiguation needed)
    try:
        result = await bot_create_actual(
            tg_user_id=callback.from_user.id,
            kind=pending.kind,
            amount_cents=pending.amount_cents,
            category_id=category_id,  # explicit — bypass disambiguation
            description=pending.description,
            tx_date=pending.tx_date,
        )
    except InternalApiError as exc:
        await callback.answer("Сервер недоступен.", show_alert=True)
        return

    if callback.message:
        await callback.message.edit_text(
            _format_actual_reply(result),  # reuses /add reply formatter
        )
    await callback.answer()
```

[VERIFIED: aiogram 3.22 docs — F.data.startswith filter, CallbackQuery.answer/edit_text]

### Pattern 3: BotInternalApiClient extensions (D-45)

**What:** Расширяем `app/bot/api_client.py` тремя новыми функциями.

```python
async def bot_create_actual(
    *, tg_user_id: int, kind: str, amount_cents: int,
    category_query: str | None = None, category_id: int | None = None,
    description: str | None = None, tx_date: str | None = None,
) -> dict:
    """POST /api/v1/internal/bot/actual — returns dict with `status` field.

    `status` ∈ {'created', 'ambiguous', 'not_found'}.
    Pass either category_query (for fuzzy lookup) OR category_id (explicit).
    """
    payload = {
        "tg_user_id": tg_user_id,
        "kind": kind,
        "amount_cents": amount_cents,
        "description": description,
        "tx_date": tx_date,
    }
    if category_query is not None:
        payload["category_query"] = category_query
    if category_id is not None:
        payload["category_id"] = category_id

    headers = {"X-Internal-Token": settings.INTERNAL_TOKEN}
    async with httpx.AsyncClient(base_url=settings.API_BASE_URL, timeout=5.0) as client:
        response = await client.post("/api/v1/internal/bot/actual", json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
```

`bot_get_balance(tg_user_id)` и `bot_get_today(tg_user_id)` — аналогично.

[VERIFIED: pattern matches existing `bind_chat_id` in api_client.py]

### Pattern 4: Period resolve (lookup-or-create)

**What:** D-52: для каждого POST/PATCH actual гарантируем существование BudgetPeriod, покрывающего `tx_date`.

См. `<specifics>` в CONTEXT.md для полного кода `_resolve_period_for_date`.

**Edge case (concurrency):** Два POST с одинаковым историческим tx_date одновременно → оба видят «нет периода» → оба создают → второй падает на `period_start UNIQUE` constraint. Mitigation: ловим `IntegrityError` на flush, делаем повторный SELECT — гарантированно найдём созданный другим request'ом период. **Для MVP single-tenant** это нерелевантно (один пользователь); защиту можно отложить.

[VERIFIED: PostgreSQL UNIQUE constraint + SQLAlchemy IntegrityError handling]

### Pattern 5: Balance aggregation (single-query GROUP BY)

**What:** Считаем `planned_cents` и `actual_cents` per (category_id, kind) одной query на planned + одной на actual, потом merge в Python.

См. `<specifics>` в CONTEXT.md для полного кода `compute_balance`.

**Альтернатива (отвергнута):** одна большая UNION query с COALESCE — работает, но менее читаема и склеивает enum'ы. Для single-tenant с ≤14 категорий «два SELECT + Python merge» оптимальный по readability/perf trade-off.

[VERIFIED: SQLAlchemy 2.0 — `func.sum`, `group_by` async pattern]

### Pattern 6: ActualEditor (form) — kind toggle + date input

**What:** Новый form-component с structurally нового от PlanItemEditor — `kind` toggle вместо derived-from-category.

```tsx
// frontend/src/components/ActualEditor.tsx (skeleton)
export interface ActualEditorProps {
  initial?: { kind?: CategoryKind; amount_cents?: number; description?: string | null;
              category_id?: number; tx_date?: string };
  categories: CategoryRead[];
  onSave: (data: ActualSavePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

export function ActualEditor({ initial, categories, onSave, onDelete, onCancel }: ActualEditorProps) {
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'expense');
  const [amountStr, setAmountStr] = useState(formatKopecksToRubles(initial?.amount_cents));
  const [categoryId, setCategoryId] = useState<number | ''>(initial?.category_id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [txDate, setTxDate] = useState(initial?.tx_date ?? new Date().toISOString().slice(0, 10));
  // ... validation, handlers
  // Filter categories by kind:
  const filtered = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.is_archived),
    [categories, kind],
  );
  // Reset categoryId if user switches kind (selected cat is wrong kind)
  useEffect(() => {
    if (categoryId !== '' && !filtered.some((c) => c.id === categoryId)) {
      setCategoryId('');
    }
  }, [kind, filtered, categoryId]);
  // ...
}
```

Kind toggle UI: два-кнопочный segmented control (CSS `[data-active=true]` styling). Default tx_date — `new Date().toISOString().slice(0, 10)` (browser local timezone — приемлемо для single-user, для production-perfection можно использовать APP_TZ через `toLocaleString` + parsing — но для UX достаточно).

[VERIFIED: React 18 controlled inputs pattern]

### Pattern 7: ActualScreen — group-by-date

**What:** Список факт-трат текущего периода, группировка по `tx_date desc` (свежие сверху). Каждая дата — header (`Сегодня`, `Вчера`, или `2 марта`), под ним строки.

```tsx
function groupByDate(rows: ActualRead[], today: string, yesterday: string): {date: string; label: string; rows: ActualRead[]}[] {
  const map = new Map<string, ActualRead[]>();
  for (const r of rows) {
    const arr = map.get(r.tx_date) ?? [];
    arr.push(r);
    map.set(r.tx_date, arr);
  }
  const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  return sorted.map(([date, rs]) => ({
    date,
    label: date === today ? 'Сегодня' : date === yesterday ? 'Вчера' : new Date(date).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'}),
    rows: rs.sort((a, b) => b.id - a.id),  // newest first within day
  }));
}
```

### Pattern 8: FAB (floating action button)

**What:** CSS-only floating button, `position: fixed; bottom: 24px; right: 24px; z-index: 50` (ниже sheet z-index 100/101).

```tsx
// frontend/src/components/Fab.tsx
import styles from './Fab.module.css';

export interface FabProps {
  onClick: () => void;
  label?: string;  // default "+"
  ariaLabel: string;
}

export function Fab({ onClick, label = '+', ariaLabel }: FabProps) {
  return (
    <button type="button" onClick={onClick} className={styles.fab} aria-label={ariaLabel}>
      {label}
    </button>
  );
}
```

```css
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  border: 0;
  box-shadow: var(--shadow-lg);
  font-size: 28px;
  cursor: pointer;
  z-index: 50;
}
```

### Anti-Patterns to Avoid

- **Не использовать aiogram FSM для disambiguation** — over-engineering для single-tenant + 5 мин TTL (D-47).
- **Не хранить INTERNAL_TOKEN в логах** — `api_client` уже соблюдает (`bind_chat_id` лог не включает token).
- **Не вызывать API endpoints из bot напрямую через AsyncSessionLocal** — нарушит контейнерное разделение.
- **Не overload PlanItemEditor для actual** — D-63: новый компонент. PlanItemEditor уже имеет 4 mode, добавление 5го = combinatorial complexity.
- **Не использовать `decimal.Decimal` для amount** — int копейки достаточны.
- **Не хранить tx_date как string в БД** — `Date` колонка, `tx_date: date` в Pydantic.
- **Не делать GET с body** для internal endpoints — все POST (HLD §4.10).
- **Не закрывать httpx client между вызовами** — но каждый bot-handler создаёт свой `AsyncClient` с timeout=5s; reuse только если очень частые вызовы. Для single-user reuse не нужен.
- **Не блокировать создание actual'a при отсутствии периода** — D-52 автосоздаёт. Альтернатива (404) ломает UX.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bot command parsing | full argparse | `CommandObject.args` + `.split()` | aiogram уже даёт args; команда простая |
| In-memory state TTL | Redis/sqlite cache | `dict[str, dataclass]` + `_gc()` | Single-tenant; 5 мин TTL приемлемо |
| Inline-keyboard | Custom layout engine | `InlineKeyboardMarkup(inline_keyboard=[[btn]])` | aiogram стандарт |
| Period algebra | `dateutil.rrule` или кастомные функции | Existing `period_for` (Phase 2) | Уже верифицирован |
| Balance aggregation | Multiple round-trips | `func.sum + group_by` (single async query each) | SQL-side aggregation |
| HTTP client | Кастомный wrapper | Existing `httpx.AsyncClient` pattern из `bind_chat_id` | Минимум новой code |
| Date formatter | moment.js | `Date.toLocaleDateString('ru-RU')` | Native, no deps |
| Bottom sheet | Modal library | Existing `BottomSheet` (D-40) | Готов, переиспользуется |
| Money parser | money.js / dinero.js | `parseFloat(s) * 100 + Math.round` | Простая функция, уже в PlanItemEditor |

---

## Common Pitfalls

### Pitfall 1: aiogram callback_query без `await callback.answer()`

**What goes wrong:** Telegram показывает «loading…» бесконечно у пользователя; кнопка остаётся «нажатой».
**How to avoid:** Всегда вызываем `await callback.answer()` (с пустым text — это просто dismiss). Если хотим показать toast, передаём `text="..."` и опционально `show_alert=True` для модального alert.

### Pitfall 2: callback_data exceeds 64 bytes

**What goes wrong:** Telegram отвергает кнопки с callback_data > 64 байт.
**How to avoid:** D-48 формат `act:<8-hex-token>:<int>` укладывается даже для category_id=999999999 (act:abcdef12:999999999 = 26 chars). Не передавать описания/имена в callback_data.

### Pitfall 3: tx_date in browser local TZ vs server TZ

**What goes wrong:** Пользователь в Europe/Moscow выбирает 2 марта в `<input type="date">`, frontend отправляет `"2026-03-02"`, но если браузер был в UTC, новый Date(...) в `tx_date_default` мог показать 1 марта.
**How to avoid:** `new Date().toISOString().slice(0, 10)` — браузерное локальное время; для single-user с очевидно правильным TZ — приемлемо. Server тоже не корректирует — `tx_date` хранится как DATE «как пришло». Periodic refresh tested in Phase 2 — же самый pattern.

### Pitfall 4: `_resolve_period_for_date` race condition

**What goes wrong:** Два запроса одновременно создают периоды для одной date → IntegrityError на UNIQUE(period_start).
**How to avoid:** Ловим IntegrityError, retry SELECT (см. Pattern 4 note). Для MVP single-tenant — defer.

### Pitfall 5: GROUP BY agg returns no rows для пустой категории

**What goes wrong:** Категория есть, но без planned/actual → она не появится в `by_category` списке.
**How to avoid:** Для balance — это OK (нечего показывать). Для dashboard (Phase 5) — будет full join с категориями, в Phase 4 не нужно.

### Pitfall 6: `find_categories_by_query` matches archived

**What goes wrong:** ILIKE без `is_archived=false` фильтра → бот предлагает выбрать архивную категорию → 400 на create.
**How to avoid:** D-51 — фильтр `is_archived=false` обязателен. Тест: `test_internal_bot.py::test_query_excludes_archived`.

### Pitfall 7: `update_actual` с PATCH без tx_date — пересчёт period_id всё равно?

**What goes wrong:** Если в патче нет tx_date, не нужно пересчитывать period_id (excessive DB ops + edge cases).
**How to avoid:** D-52: «if 'tx_date' in data and data['tx_date'] != row.tx_date: pересчёт». Mirror PlannedUpdate handling в `app/services/planned.py::update_planned`.

### Pitfall 8: `tx_date` далеко в будущем

**What goes wrong:** Пользователь печатает `tx_date=2099-12-31` → создаётся «теневой» период за 2099. Выглядит как загрязнение БД.
**How to avoid:** D-58 future-date check (today + 7 days). Тест: `test_actual_period.py::test_future_date_400`.

### Pitfall 9: Bot reply длиннее Telegram message limit (4096 chars)

**What goes wrong:** `/balance` с 50 категориями → text exceeds 4096.
**How to avoid:** D-60 — топ 5 only (single-tenant с ≤14 категориями — нет реального риска, но guard через `[:5]` slice в bot формате).

### Pitfall 10: Category select в ActualEditor показывает категории с wrong kind

**What goes wrong:** Пользователь выбрал «Расход», категории income отображаются.
**How to avoid:** Pattern 6 — `useMemo` фильтр + reset categoryId on kind change через useEffect.

### Pitfall 11: Disambiguation cache memory leak

**What goes wrong:** Бот рестартует с pending state; новые pending добавляются, но GC не происходит при отсутствии новых /add.
**How to avoid:** D-47 — `_gc()` вызывается при `store_pending`; +периодически можно добавить background task, но для single-tenant с TTL 5 мин — нет смысла.

### Pitfall 12: parse_amount принимает «1500.555» (3 decimal digits)

**What goes wrong:** `round(1500.555 * 100)` = 150056 копеек — потеря точности.
**How to avoid:** D-49 regex `[.,](\d{1,2})` — максимум 2 знака после запятой; иначе None. Test: `test_bot_parsers.py::test_three_decimals_rejected`.

---

## Code Examples (additional)

### Pydantic schemas (actual + internal_bot)

```python
# app/api/schemas/actual.py
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

KindStr = Literal["expense", "income"]
ActualSourceStr = Literal["mini_app", "bot"]


class ActualCreate(BaseModel):
    """POST /api/v1/actual — Mini App creation (source='mini_app' overridden by service)."""
    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: int = Field(gt=0)
    tx_date: date


class ActualUpdate(BaseModel):
    """PATCH /api/v1/actual/{id}."""
    kind: Optional[KindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = Field(default=None, gt=0)
    tx_date: Optional[date] = None


class ActualRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    kind: KindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    tx_date: date
    source: ActualSourceStr
    created_at: datetime


class BalanceCategoryRow(BaseModel):
    category_id: int
    name: str
    kind: KindStr
    planned_cents: int
    actual_cents: int
    delta_cents: int


class BalanceResponse(BaseModel):
    period_id: int
    period_start: date
    period_end: date
    starting_balance_cents: int
    planned_total_expense_cents: int
    actual_total_expense_cents: int
    planned_total_income_cents: int
    actual_total_income_cents: int
    balance_now_cents: int
    delta_total_cents: int
    by_category: list[BalanceCategoryRow]
```

```python
# app/api/schemas/internal_bot.py
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator

from app.api.schemas.actual import ActualRead, BalanceCategoryRow, KindStr


class BotActualRequest(BaseModel):
    tg_user_id: int
    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    tx_date: Optional[date] = None  # default = today server-side
    category_query: Optional[str] = Field(default=None, max_length=200)
    category_id: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _check_either_query_or_id(self) -> "BotActualRequest":
        if not self.category_query and not self.category_id:
            raise ValueError("Either category_query or category_id required")
        return self


class CategoryCandidate(BaseModel):
    id: int
    name: str
    kind: KindStr


class BotActualResponse(BaseModel):
    """Discriminated by `status`. created → actual+balance fields populated."""
    status: Literal["created", "ambiguous", "not_found"]
    actual: Optional[ActualRead] = None
    category: Optional[CategoryCandidate] = None
    category_balance_cents: Optional[int] = None  # remaining_cents для категории (planned - actual для expense)
    candidates: Optional[list[CategoryCandidate]] = None


class BotBalanceRequest(BaseModel):
    tg_user_id: int


class BotBalanceResponse(BaseModel):
    period_id: int
    period_start: date
    period_end: date
    balance_now_cents: int
    delta_total_cents: int
    planned_total_expense_cents: int
    actual_total_expense_cents: int
    planned_total_income_cents: int
    actual_total_income_cents: int
    by_category: list[BalanceCategoryRow]


class BotTodayActualRow(BaseModel):
    id: int
    kind: KindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    category_name: str  # nested for bot text


class BotTodayRequest(BaseModel):
    tg_user_id: int


class BotTodayResponse(BaseModel):
    actuals: list[BotTodayActualRow]
    total_expense_cents: int
    total_income_cents: int
```

---

## Open Questions

1. **Должен ли `_resolve_period_for_date` для tx_date в ОЧЕНЬ далёком прошлом (>2 года) отказывать?**
   - Что знаем: D-58 покрывает только future-guard. Прошлое не ограничено.
   - Решение: В MVP — без guard (single-tenant, доверяем пользователю). Если станет проблемой — добавить `tx_date > today - 365*2 days`.

2. **`/balance` — учитывать subscription_auto rows как planned?**
   - Что знаем: planned table includes source=subscription_auto. `compute_balance` SUM-ит все planned без фильтра по source.
   - Решение: Да, включаем. Подписка — это часть плана; пользователь хочет видеть полный «планируемый расход».

3. **Concurrent POST /actual для одного пользователя (двойной tap на «Сохранить»):**
   - Что знаем: Frontend `busy` guard защищает (mirror PlannedScreen pattern). Server — нет специальной защиты.
   - Решение: Frontend-side disable Save button во время submit (D-63 implies через `submitting` state). Server — без защиты, single-tenant.

4. **Bot: что делать с `/add` от не-OWNER?**
   - Что знаем: `cmd_start` уже отвечает «Бот приватный». Для других команд — silent ignore (`return`)?
   - Решение: Silent ignore (`return` без ответа) — стандарт для bot-команд после `/start`. Альтернатива (echo «Бот приватный») — спам потенциальным attacker'ам, не нужно.

5. **`source='mini_app'` vs `source='bot'` в ActualScreen UI — нужно ли индицировать?**
   - Что знаем: Поле есть в модели, frontend получает.
   - Решение: В MVP не показываем (визуально однородно). В будущем (если станет важно) можно добавить мелкий значок.

6. **`tx_date` ввод в Mini App: `<input type="date">` vs кастомный picker?**
   - Что знаем: Native `<input type="date">` поддерживается в Telegram Mini App (Phase 3 уже использует для planned_date — pitfall A4).
   - Решение: Native input. Если в каком-то клиенте проблема — fallback в Phase 5/6.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| (none new) | — | ✓ | — | — |
| Postgres | DB-backed tests | docker compose up -d db | 16-alpine | self-skip pattern |
| Telegram bot (long-poll) | Bot тесты | Mock через mocked aiogram or httpx-mock | aiogram 3.22 | Unit-тесты parsers без bot |

---

## Validation Architecture

### Test Framework (carryover from Phase 1-3)

| Property | Value |
|----------|-------|
| Framework | pytest 8.4.2 + pytest-asyncio 1.2.0 |
| Quick run | `uv run pytest tests/test_actual_crud.py tests/test_actual_period.py tests/test_balance.py tests/test_bot_parsers.py -x -q` |
| Full suite | `uv run pytest tests/ -v` |
| DB-backed integration tests | требуют DATABASE_URL; self-skip без него |
| Bot handler tests | `respx` или ручной mock httpx — стандартный подход |
| Frontend tests | None automated (D-70; carryover D-22 Phase 2) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| ACT-01 | POST /actual создаёт строку с правильными полями | integration | `uv run pytest tests/test_actual_crud.py::test_create_basic -x` |
| ACT-02 | period_id вычисляется по tx_date + cycle_start_day | integration | `uv run pytest tests/test_actual_period.py::test_period_resolved -x` |
| ACT-03 | Bot /add создаёт actual через internal API | integration + unit | `uv run pytest tests/test_internal_bot.py::test_create_via_query -x` + `tests/test_bot_handlers_phase4.py::test_cmd_add_creates -x` |
| ACT-04 | /balance, /today, /app возвращают корректные данные | integration | `uv run pytest tests/test_internal_bot.py tests/test_balance.py tests/test_bot_handlers_phase4.py -x` |
| ACT-05 | PATCH tx_date пересчитывает period_id | integration | `uv run pytest tests/test_actual_period.py::test_patch_recomputes -x` |
| ACT-05 disambiguation | ≥2 совпадений → ambiguous status + bot inline-kbd | integration + unit | `uv run pytest tests/test_internal_bot.py::test_ambiguous_status -x` + `tests/test_bot_handlers_phase4.py::test_disambiguation_flow -x` |

### Sampling Rate

- **Per task commit:** Quick suite (~5s)
- **Per wave merge:** Full backend suite (~30-60s)
- **Phase gate:** Full suite зелёный + manual UI checkpoint pass

### Wave 0 Gaps

- [ ] `tests/test_actual_crud.py` — CRUD /actual + filters + auth + Pydantic 422 + archived/kind 400
- [ ] `tests/test_actual_period.py` — ACT-02 + ACT-05 + future-date guard + auto-create historic period
- [ ] `tests/test_balance.py` — `compute_balance` aggregation + empty period
- [ ] `tests/test_internal_bot.py` — bot/actual (created/ambiguous/not_found), bot/balance, bot/today + X-Internal-Token auth
- [ ] `tests/test_bot_parsers.py` — `parse_amount` formats + `parse_add_command` split
- [ ] `tests/test_bot_handlers_phase4.py` — cmd_add/income/balance/today/app + disambiguation callback

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (наследуется из Phase 1+2).

### Applicable ASVS Categories (Phase 4 deltas)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (carry-over) | initData HMAC + OWNER whitelist для public; X-Internal-Token для internal |
| V4 Access Control | yes | Public routes под `Depends(get_current_user)`; Internal routes под `verify_internal_token` parent dep |
| V5 Input Validation | yes | Pydantic v2 на bodies; `Field(gt=0)` amount; archived/kind server-side; future-date guard; description max 500 |
| V8 Data Protection | n/a | Только суммы и описания. Никакой PII |
| V14 Configuration | yes | INTERNAL_TOKEN из env (Phase 1); не логируется в api_client (carry-over) |

### Known Threat Patterns for Phase 4

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Internal endpoint reachable из internet | Spoofing / Elevation | Caddy блокирует `/api/v1/internal/*` (Phase 1 INF-04) + verify_internal_token (server-side defence-in-depth) |
| Bot отправляет actuals от имени любого user_id | Spoofing | tg_user_id в payload, но single-tenant — service игнорирует значение или validate == OWNER_TG_ID |
| Negative или zero amount | Input Validation | Pydantic Field(gt=0) + parse_amount возвращает None |
| Archived/wrong-kind category | Tampering | Service-side check 400 (carryover D-36) |
| Future tx_date (опечатка) | Input Validation | D-58 future-guard 400 |
| callback_data tampering (e.g. inject SQL via category_id) | Tampering | int parse + FK constraint; Pydantic int validation |
| Disambiguation token reuse / brute force | Tampering | UUID4 8-hex (32 bits entropy); TTL 5 min; single-use (popped) |
| `tx_date` создаёт BudgetPeriod в далёком прошлом → загрязнение | Resource Exhaustion | Open Q1 — defer guard до feedback |
| amount_cents overflow JSON int | Input Validation | Pydantic int — Python big int OK; parse_amount cap 10^12 |
| description с XSS-payload | XSS | React escape (no dangerouslySetInnerHTML); bot text — Telegram чистит на своей стороне |
| /add без OWNER_TG_ID matching | Spoofing | Bot handler check `message.from_user.id == OWNER_TG_ID`; silent ignore |

---

## Project Constraints (from CLAUDE.md — Phase 4 deltas)

| Directive | Impact на Phase 4 |
|-----------|------------------|
| Деньги BIGINT копейки | `amount_cents: int`, `Field(gt=0)`; bot `parse_amount` → kopecks |
| Бизнес-даты DATE | `tx_date: date`, `period_start/end: date` |
| Soft delete только category | Actual — hard delete |
| Single-tenant без user_id FK | tg_user_id в bot payload — formal/optional check, не FK |
| Знак дельты — D-02 правило | `compute_balance`: expense delta = plan-act, income delta = act-plan |
| Period расчёт `Europe/Moscow` | `_today_in_app_tz()` для default tx_date и `/today` |
| TZ DB UTC | `created_at` TIMESTAMPTZ; `tx_date` DATE — без TZ (бизнес-дата) |
| initData HMAC | Public actual routes под `Depends(get_current_user)` |
| Internal endpoints `X-Internal-Token` | internal_bot_router под parent internal_router |
| structlog | info на actual create (id, period_id), warning на bot api errors, info на disambiguation choice |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | aiogram 3.22 `F.data.startswith("act:")` filter работает в callback_query | Pattern 2 | Низкий — стандартный паттерн docs |
| A2 | `httpx.AsyncClient(timeout=5.0)` достаточно для localhost api call | Pattern 3 | Низкий — DOCKER NETWORK <1ms latency |
| A3 | `period_for(date, cycle_start_day)` корректен для исторических tx_date (e.g. 2024) | Pattern 4 | Низкий — pure function, тестировано в Phase 2 |
| A4 | `<input type="date">` работает в TG Mini App webview | Pattern 6 | Mid — Phase 3 проверил для planned_date; повторно тестируем в checkpoint |
| A5 | In-memory dict переживает обычные restart-cycles бота (не нужно persistence) | D-47 | Низкий — TTL 5 мин; user перепошлёт команду |
| A6 | `_resolve_period_for_date` без race-protection приемлем для single-tenant | Pattern 4 | Низкий — один пользователь, нет конкурентных POST |
| A7 | Disambiguation token 8 hex chars (32 bits) хватит entropy для 5-минутного окна | D-48 | Низкий — collision вероятность < 10^-9 для одного пользователя |
| A8 | Telegram сохраняет порядок tokens в `CommandObject.args` (no reordering) | Pattern 1 | Очень низкий — стандартное поведение |
| A9 | `compute_balance` работает за <50ms на ≤1000 transactions/период | Pattern 5 | Низкий — два простых GROUP BY с индексом `(period_id, kind)` |

---

## Sources

### Primary (HIGH confidence)

- `docs/HLD.md` §4.6, §4.10, §5 — единый источник API/bot контракта
- `docs/BRD.md` UC-2, UC-3 — добавление актуалов
- `.planning/sketches/002-add-transaction/` — winner B (bottom sheet)
- aiogram 3.22 docs — Router, Command, F.data, CallbackQuery
- SQLAlchemy 2.0.49 docs — async session, GROUP BY, func.sum
- Pydantic 2.13.3 docs — Field, model_validator, Literal

### Secondary (MEDIUM confidence)

- Telegram WebApp BackButton API (carry-over)
- React 18 controlled inputs (carry-over)
- httpx async docs — AsyncClient pattern (carry-over)

### Tertiary

- CSS FAB pattern — стандартный design-system паттерн
- ILIKE Cyrillic collation — PostgreSQL default обрабатывает корректно

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — никаких новых зависимостей
- Architecture: HIGH — прямо задано HLD + CONTEXT
- aiogram callback_query: HIGH — стандартный паттерн
- In-memory disambiguation: HIGH — простая структура, хорошо тестируется
- `_resolve_period_for_date` lookup-or-create: MEDIUM — race condition теоретическая, single-tenant минимизирует риск
- Balance aggregation: HIGH — стандарт SQL GROUP BY
- ActualScreen UI: MEDIUM — group-by-date новый паттерн, но тривиальный
- Bot disambiguation flow end-to-end: MEDIUM — multi-step (parse → ambiguous → keyboard → callback → second call) — нужны интеграционные тесты

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (стек стабильный, 30 дней)
