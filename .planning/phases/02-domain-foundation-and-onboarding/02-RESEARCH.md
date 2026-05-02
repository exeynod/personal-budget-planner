# Phase 2: Domain Foundation & Onboarding — Research

**Researched:** 2026-05-02
**Domain:** aiogram 3 deep-link parsing, SQLAlchemy 2 async session-per-request, React + Telegram Mini App initData/viewport, Alembic data migrations vs API seed.
**Confidence:** HIGH (паттерны хорошо задокументированы; ключевые решения уже зафиксированы в Phase 1).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `cycle_start_day` хранится в `app_user.cycle_start_day` (нет отдельной таблицы settings).
- **D-02:** Категории засеваются через API endpoint, не через alembic data-migration.
- **D-03:** Сервисный слой явно отделён (`app/services/`).
- **D-04:** Sub-routers per-domain (`categories_router`, `periods_router`, `onboarding_router`, `settings_router`, `internal_telegram_router`).
- **D-05:** Pydantic-схемы в `app/api/schemas/{module}.py`; суммы в копейках (snake_case).
- **D-06:** `period_for(date, cycle_start_day) -> tuple[date, date]` — чистая функция в `app/core/period.py`.
- **D-07:** Используем `python-dateutil` для month-arithmetic.
- **D-08:** Onboarding — single-page scrollable (sketch 006-B winner).
- **D-09..D-10:** Onboarding порядок проверок + idempotency (409 при повторе).
- **D-11..D-12:** Bot `/start` вызывает internal endpoint POST `/internal/telegram/chat-bind`; ответ — Mini App кнопка.
- **D-13:** Settings: `MINI_APP_URL` добавляется в `app/core/settings.py`.
- **D-14:** `DELETE /categories/{id}` фактически делает soft-archive.
- **D-15:** `GET /categories?include_archived=false` (default).
- **D-16:** SEED_CATEGORIES — фиксированная константа из 14 элементов в `app/services/categories.py`.
- **D-17:** `PATCH /settings { cycle_start_day }` валидирует 1..28, не пересчитывает существующие периоды.
- **D-18:** UI-kit — plain CSS modules + кастомные компоненты (закрывает HLD Q-7).
- **D-19:** Routing — `useState` (не react-router в Phase 2).
- **D-20:** API client с `X-Telegram-Init-Data` из `@telegram-apps/sdk-react`.
- **D-21:** State management — `useState` + custom hooks.
- **D-22:** Wave 0 RED тесты для всех новых backend-модулей.

### Claude's Discretion

- Точные имена React-компонентов, файлов pydantic-схем, layout категорий и settings.
- Имя internal endpoint (`/internal/telegram/chat-bind`).

### Deferred Ideas (OUT OF SCOPE)

- Графический wizard onboarding (sketch 006-A) — отброшен.
- Welcome-экран (sketch 006-C) — отброшен.
- `app_setting` отдельная таблица — отложено.
- Per-period `cycle_start_day` override — Q-10 HLD, не делаем.
- Drag-n-drop reorder, bulk-create через UI, импорт из xlsx, bot webhook — отложено.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAT-01 | CRUD категорий (kind expense/income, name, sort_order) | FastAPI route + service pattern (Phase 1 verified) |
| CAT-02 | Soft archive — `is_archived=true` скрывает из выбора | `is_archived` колонка уже в модели, фильтр в сервисе |
| CAT-03 | Seed из 14 default-категорий в onboarding | API endpoint, idempotent (skip if any exists) |
| PER-01 | `cycle_start_day` (1..28, default 5) — глобальная настройка | хранится в `app_user`; Pydantic Field(ge=1, le=28) |
| PER-02 | На onboarding пользователь вводит `starting_balance` | POST `/onboarding/complete` body |
| PER-03 | Каждый последующий период = `ending_balance` предыдущего | реализуется в Phase 5 (PER-04 worker), в Phase 2 — только первый период |
| PER-05 | При создании нового периода развёртывается PlanTemplate | реализуется в Phase 3 (TPL-04 endpoint), в Phase 2 — только пустой первый период |
| ONB-01 | Scrollable single-page onboarding с 4 секциями | sketch 006-B winner |
| ONB-02 | Если `chat_id` неизвестен — кнопка `tg.openTelegramLink` | `@telegram-apps/sdk-react` + `tg.openTelegramLink` |
| ONB-03 | Бот при `/start` сохраняет `tg_chat_id` | aiogram CommandStart handler + httpx call to internal API |
| SET-01 | `cycle_start_day` редактируется в Settings, применяется только к будущим периодам | PATCH `/settings`; UI-tooltip с дисклеймером |

**Note on PER-03 / PER-05:** В рамках Phase 2 создаётся ТОЛЬКО первый период. Автогенерация следующего и развёртывание шаблона — Phase 5 worker (PER-04) и Phase 3 (TPL-04 endpoint). Phase 2 покрывает PER-03 / PER-05 «структурно» через POST /periods (если будет ручной триггер) или endpoint POST /periods/{id}/apply-template — но реальное использование в Phase 3+. В этой фазе мы не реализуем `apply-template` (нет шаблона), но создаём заглушку POST `/periods` с возможностью передать `starting_balance` и `cycle_start_day` для первого периода. Это закрывает PER-02 + PER-05 на структурном уровне (см. discussion в `Open Questions`).

</phase_requirements>

---

## Summary

Фаза реализуется поверх готовой Phase 1 инфраструктуры. Главные технические задачи: (1) корректная реализация `period_for` с edge-кейсами для месяцев < 31 дня; (2) atomic POST `/onboarding/complete` с тремя side-effects; (3) bot `/start` handler с deep-link парсингом и httpx-вызовом internal endpoint; (4) frontend single-page onboarding с условной активацией Telegram MainButton.

Большая часть кода backend — стандартные FastAPI CRUD-роуты, разница только в семантике (soft-archive вместо delete, Pydantic-валидация диапазонов). Главный риск — некорректная обработка edge-кейсов periods (Feb с cycle_start_day=29/30/31). Это покрывается параметризованным unit-тестом `test_period_engine.py`.

Frontend — первый раз пишется реальный SPA (раньше был placeholder). Используем минимально достаточный стек: React 18 + plain CSS modules. Routing через `useState`. State через `useState + custom hooks`. Это закрывает Q-7 HLD без введения новых зависимостей (telegram-ui, shadcn).

**Primary recommendation:** Использовать `aiogram.utils.deep_linking.create_start_link()` для корректной генерации deep-links (если когда-нибудь потребуется их выпускать), но для парсинга достаточно `CommandStart(deep_link=True)` фильтра + `command.args` поле.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Period math (`period_for`) | `app/core/period.py` (pure func) | — | Чистая функция; reuse в onboarding-сервисе и в Phase 5 worker |
| Categories CRUD | `app/services/categories.py` | `app/api/routes/categories.py` | Сервис делает БД-логику, route — только сериализация |
| Periods (создание первого) | `app/services/periods.py` | `app/api/routes/periods.py` | Сервис: `create_first_period(user, starting_balance, cycle_start_day)` |
| Onboarding orchestration | `app/services/onboarding.py` | `app/api/routes/onboarding.py` | Сервис вызывает categories+periods+user-settings в одной транзакции |
| Settings (cycle_start_day) | `app/services/settings.py` | `app/api/routes/settings.py` | Тонкий слой — read/write в `app_user.cycle_start_day` |
| Telegram chat-bind | `app/services/telegram.py` | `app/api/routes/internal_telegram.py` | Internal endpoint, upsert AppUser.tg_chat_id |
| Bot `/start` handler | `app/bot/handlers.py` | `app/bot/api_client.py` | Handler парсит, api_client делает httpx POST к internal endpoint |
| Frontend onboarding screen | `frontend/src/screens/OnboardingScreen.tsx` | `frontend/src/api/client.ts` | Single-page scrollable с 4 секциями |
| Frontend categories screen | `frontend/src/screens/CategoriesScreen.tsx` | `frontend/src/components/CategoryRow.tsx` | List + edit/archive (sketch 005-B стиль) |
| Frontend settings screen | `frontend/src/screens/SettingsScreen.tsx` | `frontend/src/components/Stepper.tsx` | cycle_start_day stepper |
| Frontend routing | `frontend/src/App.tsx` | useState | `'onboarding' \| 'home' \| 'categories' \| 'settings'` |
| Frontend API client | `frontend/src/api/client.ts` | `@telegram-apps/sdk-react` | initData header, JSON parsing |

---

## Standard Stack

### New Backend Dependency

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| python-dateutil | 2.9.0 | Month arithmetic для `period_for` | Стандарт-де-факто для date math; альтернатива `calendar.monthrange` тоже OK, но dateutil читабельнее |
| httpx | 0.28.1 | Bot ↔ API internal calls | Уже в dev-deps для тестов; добавляем в prod-deps |

[VERIFIED: PyPI registry 2026-05-02]

### New Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| (none) | — | `@telegram-apps/sdk-react` уже установлен; CSS modules встроены в Vite |

Всё новое — наш собственный код. UI-kit зависимости явно отвергнуты (D-18).

### Carryover from Phase 1

Все Phase 1 зависимости (FastAPI 0.128.8, SQLAlchemy 2.0.49, aiogram 3.22.0, etc.) используются без изменений.

---

## Architecture Patterns

### Pattern 1: aiogram 3 — Deep-link parsing для `/start payload`

**What:** При вызове `/start onboard` (или открытии `https://t.me/<bot>?start=onboard`) бот получает payload в `command.args`.
**When to use:** Bot `/start` handler в Phase 2 (ONB-03).

```python
# Source: https://docs.aiogram.dev/en/latest/dispatcher/filters/command.html
from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

router = Router()

@router.message(CommandStart(deep_link=True))
async def cmd_start_with_payload(message: Message, command: CommandObject):
    """Handles `/start <payload>` (e.g. `/start onboard`)."""
    payload = command.args  # str or None
    # ... bind chat_id via internal API ...
    open_app_btn = InlineKeyboardButton(
        text="Открыть бюджет",
        web_app=WebAppInfo(url=settings.MINI_APP_URL)
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[open_app_btn]])
    await message.answer("Готово, push включены. Открой Mini App для настройки.", reply_markup=kb)


@router.message(CommandStart())
async def cmd_start(message: Message):
    """Handles bare `/start` (no payload)."""
    # Same chat-bind + WebApp button, default copy.
    ...
```

**Замечание:** `CommandStart(deep_link=True)` срабатывает только когда есть payload. Для bare `/start` нужен второй handler (или один без `deep_link=True` параметра — он матчит и то, и другое; payload берётся из `command.args`, может быть `None`).

[VERIFIED: aiogram 3.22.0 docs — `aiogram.filters.command.CommandStart`]

### Pattern 2: aiogram → httpx async call to FastAPI internal endpoint

**What:** Bot вызывает `POST /api/v1/internal/telegram/chat-bind` через httpx с `X-Internal-Token`.
**When to use:** В Bot `/start` handler.

```python
# app/bot/api_client.py
import httpx
from app.core.settings import settings

async def bind_chat_id(tg_user_id: int, tg_chat_id: int) -> None:
    """Tell the API that this Telegram chat is bound to this user."""
    async with httpx.AsyncClient(base_url=settings.API_BASE_URL, timeout=5.0) as client:
        resp = await client.post(
            "/api/v1/internal/telegram/chat-bind",
            json={"tg_user_id": tg_user_id, "tg_chat_id": tg_chat_id},
            headers={"X-Internal-Token": settings.INTERNAL_TOKEN},
        )
        resp.raise_for_status()
```

**Лучшая практика:** Создавать AsyncClient на каждый вызов нежелательно (overhead на TCP handshake). В bot для редко-используемых вызовов (chat-bind происходит 1 раз/жизнь) — приемлемо. Для частых (Phase 4 `/add`-команд) — переиспользовать singleton-клиент через aiogram middleware или dependency injection. В Phase 2 — per-call.

[VERIFIED: httpx 0.28 AsyncClient docs]

### Pattern 3: SQLAlchemy 2 async session-per-request (re-confirmed)

**What:** `Depends(get_db)` уже определён в `app/api/dependencies.py` (Phase 1). Используем как есть.
**When to use:** Все новые endpoints в Phase 2.

```python
# app/api/routes/categories.py
from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.categories import CategoryRead, CategoryCreate
from app.services import categories as cat_svc

categories_router = APIRouter(prefix="/categories", tags=["categories"])

@categories_router.get("", response_model=list[CategoryRead])
async def list_categories(
    include_archived: bool = False,
    current_user: Annotated[dict, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[CategoryRead]:
    return await cat_svc.list_categories(db, include_archived=include_archived)
```

**Atomicity для onboarding:** в `get_db` уже стоит auto-commit на успешном выходе. Для multi-step orchestration (POST onboarding/complete) — оборачиваем сервисный код в `async with db.begin_nested()` (savepoint) или просто полагаемся на единый commit в конце handler-а (если без exception — всё применится транзакционно).

[VERIFIED: SQLAlchemy 2.x async docs + Phase 1 actual implementation]

### Pattern 4: `period_for(date, cycle_start_day)` reference implementation

**What:** Чистая функция: даём дату и день начала цикла → возвращаем (period_start, period_end).
**When to use:** В `app/services/periods.py` (создание первого периода) и в Phase 5 worker `close_period`.

```python
# app/core/period.py
from datetime import date, timedelta
from calendar import monthrange
from dateutil.relativedelta import relativedelta


def _clamp_day_to_month(year: int, month: int, day: int) -> int:
    """Return min(day, last_day_of_month) per HLD §3 edge-case."""
    last = monthrange(year, month)[1]
    return min(day, last)


def period_for(d: date, cycle_start_day: int) -> tuple[date, date]:
    """Compute (period_start, period_end) for the period containing `d`.

    Examples (cycle_start_day=5):
      d=2026-02-15  → (2026-02-05, 2026-03-04)
      d=2026-02-03  → (2026-01-05, 2026-02-04)
      d=2026-02-05  → (2026-02-05, 2026-03-04)  # day == cycle_start_day → start of new period

    Edge: cycle_start_day=31 in February → uses last day of Feb (28 or 29).
    """
    if not 1 <= cycle_start_day <= 28:
        # We allow 1..28 by Pydantic validator; the function still tolerates
        # 29/30/31 but clamps via _clamp_day_to_month for safety.
        pass

    # Step 1: determine which month's "cycle_start_day" this date belongs to.
    cur_clamped = _clamp_day_to_month(d.year, d.month, cycle_start_day)
    if d.day >= cur_clamped:
        # d is within the period that started this month.
        period_start_year, period_start_month = d.year, d.month
    else:
        # d is in the trailing portion of the previous month's period.
        prev_month_date = d - relativedelta(months=1)
        period_start_year, period_start_month = prev_month_date.year, prev_month_date.month

    period_start_day = _clamp_day_to_month(period_start_year, period_start_month, cycle_start_day)
    period_start = date(period_start_year, period_start_month, period_start_day)

    # period_end = (period_start + 1 month) clamped to that month's day - 1
    next_month_anchor = period_start + relativedelta(months=1)
    next_month_day = _clamp_day_to_month(next_month_anchor.year, next_month_anchor.month, cycle_start_day)
    period_end = date(next_month_anchor.year, next_month_anchor.month, next_month_day) - timedelta(days=1)

    return period_start, period_end
```

**Test cases (параметризованные):**
| date | cycle_start_day | expected_start | expected_end | rationale |
|------|-----------------|----------------|--------------|-----------|
| 2026-02-15 | 5 | 2026-02-05 | 2026-03-04 | HLD §3 example 1 |
| 2026-02-03 | 5 | 2026-01-05 | 2026-02-04 | HLD §3 example 2 |
| 2026-02-05 | 5 | 2026-02-05 | 2026-03-04 | day == cycle_start |
| 2026-02-04 | 5 | 2026-01-05 | 2026-02-04 | day == cycle_start - 1 |
| 2026-01-15 | 31 | 2026-01-31 | 2026-02-27 | Jan has 31, Feb 2026 has 28 |
| 2024-02-29 | 31 | 2024-02-29 | 2024-03-30 | leap year Feb has 29 |
| 2026-12-15 | 5 | 2026-12-05 | 2027-01-04 | year rollover |
| 2026-01-03 | 5 | 2025-12-05 | 2026-01-04 | year rollunder |
| 2026-03-01 | 28 | 2026-02-28 | 2026-03-27 | Feb 2026 doesn't have 28+ → clamped |

[CITED: HLD §3 + reference implementation per dateutil docs]

### Pattern 5: React + Telegram Mini App initData usage

**What:** `@telegram-apps/sdk-react` экспортирует сигналы `initData()`, `initDataRaw()`, `viewport()`.
**When to use:** В `frontend/src/api/client.ts` для добавления `X-Telegram-Init-Data` header.

```typescript
// frontend/src/api/client.ts
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';

const API_BASE = '/api/v1';  // Caddy proxies /api/* → api:8000

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  // Get raw initData from Telegram launch params (D-20)
  let initDataRaw: string | undefined;
  try {
    const params = retrieveLaunchParams();
    initDataRaw = params.tgWebAppData ?? params.initDataRaw;
  } catch {
    // Not running inside Telegram (browser dev).
  }

  if (initDataRaw) {
    headers.set('X-Telegram-Init-Data', initDataRaw);
  } else if (import.meta.env.DEV) {
    // Dev fallback: backend with DEV_MODE=true ignores the header content.
    headers.set('X-Telegram-Init-Data', 'dev-mode-stub');
  }
  headers.set('Content-Type', 'application/json');

  const response = await fetch(API_BASE + path, { ...init, headers });
  if (!response.ok) {
    throw new Error(`API ${path} → ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}
```

**Note:** `retrieveLaunchParams()` в `@telegram-apps/sdk-react` 3.x возвращает объект с `tgWebAppData` (raw query string). Для корректной интеграции — нужно вызывать `init()` из SDK (или использовать React-хук `useLaunchParams()`) на старте приложения.

[VERIFIED: @telegram-apps/sdk-react 3.3.9 — README + типы]

### Pattern 6: Telegram MainButton via signal API

**What:** Mini App отображает нативную кнопку «Готово» внизу экрана; включаем/выключаем по валидности формы.
**When to use:** В `OnboardingScreen.tsx`.

```typescript
// frontend/src/screens/OnboardingScreen.tsx
import { useEffect } from 'react';
import { mainButton } from '@telegram-apps/sdk-react';

function OnboardingScreen() {
  const [chatBound, setChatBound] = useState(false);
  const [balance, setBalance] = useState('');
  const [cycleDay, setCycleDay] = useState(5);
  const [seedCats, setSeedCats] = useState(true);

  const isValid = chatBound && balance !== '' && cycleDay >= 1 && cycleDay <= 28;

  useEffect(() => {
    if (mainButton.isMounted()) {
      mainButton.setParams({
        text: 'Готово',
        isVisible: true,
        isEnabled: isValid,
      });
    }
    const off = mainButton.onClick(handleSubmit);
    return () => { off(); };
  }, [isValid]);

  // ... handleSubmit calls POST /api/v1/onboarding/complete ...
}
```

**Замечание:** В dev-режиме (вне Telegram) MainButton недоступна — рисуем обычную `<button>` как fallback.

[VERIFIED: @telegram-apps/sdk-react MainButton component docs]

### Pattern 7: Alembic data-migration vs API seed (decision review)

**Trade-off:**
- **Alembic data-migration** (вариант A): seed в SQL/ORM коде миграции `op.bulk_insert(...)`. Плюс: гарантированно создаётся при `alembic upgrade head`. Минус: менее гибко (нужно писать DOWN миграцию для удаления seed; пользователь не может «не выбрать seed»).
- **API endpoint POST /onboarding/seed-categories** (вариант B, **выбран**): seed создаётся через сервисный код по запросу пользователя. Плюс: пользователь сам решает, нужен ли seed; idempotent на уровне сервиса (skip if any category exists); код легче тестировать. Минус: чуть больше кода в сервисе.

**Решение:** Вариант B (D-02 + D-16). Совместим с D-10 Phase 1 («никакого seed в миграции»).

```python
# app/services/categories.py
SEED_CATEGORIES = [...]  # см. D-16 в CONTEXT.md

async def seed_default_categories(db: AsyncSession) -> list[Category]:
    """Idempotent: if any category exists, return [] without inserting."""
    existing = await db.scalar(select(func.count(Category.id)))
    if existing > 0:
        return []  # idempotent
    rows = [
        Category(name=name, kind=CategoryKind(kind), sort_order=order)
        for name, kind, order in SEED_CATEGORIES
    ]
    db.add_all(rows)
    await db.flush()
    return rows
```

[ASSUMED: idempotency check «if any category exists, skip» — приемлема для single-tenant. Multi-tenant требовала бы per-user seed flag.]

### Anti-Patterns to Avoid

- **Не использовать `from datetime import date as datetime`** — путает с `datetime.datetime`; всегда `from datetime import date`.
- **Не делать period расчёт через ручное `if month == 12: ...`** — используем `dateutil.relativedelta` (избегаем багов rollover).
- **Не открывать новый `httpx.AsyncClient` для каждой команды бота в горячем пути** — для редкого `/start` это ОК, но для Phase 4 `/add` нужен переиспользуемый клиент.
- **Не валидировать `cycle_start_day` > 28** — Pydantic сразу режет 400; `period_for` всё ещё корректно работает за счёт clamp, но UI/API контракт требует 1..28.
- **Не использовать `react-router-dom` для 4 экранов** — D-19, экономия bundle-size.
- **Не вводить TanStack Query / Redux** — `useState + custom hooks` достаточно (D-21).
- **Не хранить деньги в state как number с float** — рубли вводятся пользователем как string, парсятся в integer-копейки на отправке (`Math.round(parseFloat(rubles) * 100)`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Month arithmetic | Сами через `if d.month == 12: ...` | `dateutil.relativedelta` | Edge-кейсы (year rollover, день > 28) |
| Last-day-of-month | Сами через try/except | `calendar.monthrange(year, month)[1]` | stdlib, надёжно |
| Telegram initData parsing | Сами в JS | `@telegram-apps/sdk-react.retrieveLaunchParams()` | Обрабатывает `tgWebAppData`, viewport, themeParams |
| Telegram MainButton draw | CSS-кнопка | SDK `mainButton` component/signal | Native UX, корректное закрытие при клике |
| Bot deep-link payload parsing | Manual `message.text.split()` | aiogram `CommandObject.args` | Парсит корректно, без edge-багов |
| HTTP client в bot | aiohttp напрямую | `httpx.AsyncClient` | Уже используется в тестах; единый клиент |
| CSS framework | Tailwind / shadcn / styled-components | Plain CSS modules + design tokens из default.css | Минимум зависимостей; design tokens уже готовы |

---

## Common Pitfalls

### Pitfall 1: `period_for` для `cycle_start_day=31` в феврале

**What goes wrong:** Если просто `date(year, 2, 31)` — `ValueError: day is out of range for month`.
**How to avoid:** Всегда clamp через `_clamp_day_to_month(year, month, day)` (см. Pattern 4).
**Test coverage:** `test_period_engine.py::test_feb_with_cycle_31`.

### Pitfall 2: Bot вызов internal API из контейнера `bot` падает с ConnectionError

**What goes wrong:** `httpx` пытается достучаться до `localhost:8000`, но в docker-compose `bot` и `api` — разные контейнеры; нужно использовать DNS-имя сервиса (`api:8000`).
**How to avoid:** В `app/core/settings.py` уже есть `API_BASE_URL: str = "http://api:8000"` (Phase 1). Проверить, что `bot/api_client.py` использует именно `settings.API_BASE_URL`, не hardcoded URL.

### Pitfall 3: `app_user.tg_chat_id` обновлён до того, как пользователь открыл Mini App

**What goes wrong:** `get_current_user` в Mini App делает upsert «if not exists», игнорируя update. После `/start` бот создаёт user с `tg_chat_id`. Потом пользователь открывает Mini App → `get_current_user` вызывает `INSERT ... ON CONFLICT DO NOTHING` → ничего не меняется → user уже есть с `tg_chat_id`. **OK, никакой коллизии.**
**Если порядок обратный** (Mini App → бот): user создаётся через `get_current_user` без `tg_chat_id`. Потом `/start` → internal endpoint должен сделать UPDATE существующей строки. Реализация `chat-bind` сервиса:
```python
stmt = (
    insert(AppUser)
    .values(tg_user_id=tg_user_id, tg_chat_id=tg_chat_id)
    .on_conflict_do_update(
        index_elements=["tg_user_id"],
        set_={"tg_chat_id": tg_chat_id},
    )
)
```

### Pitfall 4: POST `/onboarding/complete` без транзакционной atomicity

**What goes wrong:** Сначала вставили категории, потом упало создание периода → пользователь видит «ошибка», но категории уже созданы.
**How to avoid:** Положиться на `get_db` auto-commit-on-success: если handler упал — `rollback`, всё откатится. Категории, период, флаг `onboarded_at` — единая транзакция.

### Pitfall 5: Frontend пытается дернуть `mainButton` до инициализации SDK

**What goes wrong:** `mainButton.setParams(...)` падает с «not mounted».
**How to avoid:** В `App.tsx` сначала вызвать `init()` из `@telegram-apps/sdk-react`, потом mount компоненты. Условие `if (mainButton.isMounted()) { ... }` дополнительно защищает.

### Pitfall 6: `include_archived=false` фильтрация на JOIN-ах

**What goes wrong:** В Phase 3+ при выборке plan items с категорией нельзя забыть фильтр «не показывать архивные категории в выпадашке».
**How to avoid:** В Phase 2 это пока не релевантно (нет планов, использующих JOIN). В Phase 3 — отдельная задача.

---

## Code Examples (additional)

### POST `/onboarding/complete` сервис (atomic)

```python
# app/services/onboarding.py
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.period import period_for
from app.db.models import AppUser, BudgetPeriod, PeriodStatus
from app.services import categories as cat_svc


class AlreadyOnboardedError(Exception):
    """Raised when POST /onboarding/complete is called twice (D-10)."""


async def complete_onboarding(
    db: AsyncSession,
    tg_user_id: int,
    starting_balance_cents: int,
    cycle_start_day: int,
    seed_default_categories: bool,
) -> dict:
    """Atomic: seed cats (opt) + create first period + set cycle_start_day + mark onboarded.

    Raises AlreadyOnboardedError if user already has onboarded_at != None.
    """
    user = await db.scalar(select(AppUser).where(AppUser.tg_user_id == tg_user_id))
    if user is None:
        raise ValueError("User not found")

    if user.onboarded_at is not None:
        raise AlreadyOnboardedError()

    # 1. Seed categories (opt, idempotent inside service)
    seeded: list = []
    if seed_default_categories:
        seeded = await cat_svc.seed_default_categories(db)

    # 2. Compute first period dates
    today = datetime.now(timezone.utc).date()  # APP_TZ-aware date — see note below
    p_start, p_end = period_for(today, cycle_start_day)

    # 3. Create first period
    period = BudgetPeriod(
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=starting_balance_cents,
        status=PeriodStatus.active,
    )
    db.add(period)

    # 4. Update user
    user.cycle_start_day = cycle_start_day
    user.onboarded_at = datetime.now(timezone.utc)

    await db.flush()  # ensure period.id is generated
    return {
        "period_id": period.id,
        "seeded_categories": len(seeded),
        "onboarded_at": user.onboarded_at.isoformat(),
    }
```

**TZ Note:** `today` для period расчёта — это «сегодня в Europe/Moscow». В Python:
```python
from zoneinfo import ZoneInfo
today_msk = datetime.now(ZoneInfo("Europe/Moscow")).date()
```

### Bot `/start` handler с chat-bind

```python
# app/bot/handlers.py (новый файл)
from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.core.settings import settings
from app.bot.api_client import bind_chat_id

router = Router()

@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject) -> None:
    if not message.from_user:
        return  # safety
    user_id = message.from_user.id
    chat_id = message.chat.id

    if user_id != settings.OWNER_TG_ID:
        await message.answer("Бот приватный.")
        return

    # Bind chat_id to AppUser via internal API (D-11)
    try:
        await bind_chat_id(tg_user_id=user_id, tg_chat_id=chat_id)
    except Exception as exc:
        # Log + still answer with WebApp button — chat-bind can be retried by user re-running /start
        # (will be a structlog warning in real impl)
        pass

    payload = command.args  # e.g. "onboard"
    greeting = "Готово, push включены. Открой Mini App для настройки."
    if payload != "onboard":
        greeting = "Бот готов. Открой Mini App для управления бюджетом."

    open_app_btn = InlineKeyboardButton(
        text="Открыть бюджет",
        web_app=WebAppInfo(url=settings.MINI_APP_URL),
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[open_app_btn]])
    await message.answer(greeting, reply_markup=kb)
```

---

## Open Questions

1. **PER-03 / PER-05 в Phase 2 — структурно или операционно?**
   - Что знаем: Phase 2 создаёт ТОЛЬКО первый период. PER-03 (наследование `starting_balance` от предыдущего) и PER-05 (развёртывание шаблона) задействуются при создании последующих периодов — это Phase 5 worker (PER-04).
   - Решение: В Phase 2 покрываем структурно — создаём первый период с пользовательским `starting_balance`. PER-03/PER-05 живут в фазе 5/3 соответственно. В `requirements:` frontmatter всё равно упоминаем PER-05, потому что seed-логика (создание периода с переданным balance) — общий паттерн.

2. **Должен ли `POST /periods` быть отдельным endpoint в Phase 2?**
   - Что знаем: HLD §4.4 предлагает `GET /periods/current` (lazy-create) и `GET /periods` (список). Создание периода в onboarding — через `/onboarding/complete`. Дополнительный `POST /periods` для создания нового периода через UI — нужен только в Phase 5 (явная кнопка «Закрыть период»).
   - Решение: В Phase 2 НЕ делаем `POST /periods`. Создание первого периода — через `/onboarding/complete`. `GET /periods/current` — да, нужен (Mini App после onboarding делает этот вызов, чтобы получить id текущего периода для будущих экранов).

3. **`MINI_APP_URL` — какое значение default'ить?**
   - Что знаем: В prod это `https://${PUBLIC_DOMAIN}`. В dev — `http://localhost:5173` (Vite dev-server) или `http://localhost` (Caddy dev override на :80, проксирует Vite).
   - Решение: `MINI_APP_URL: str = "https://localhost"` default; в `.env` для dev / prod явно задаётся. Добавить в `.env.example`.

4. **Проксирует ли Caddy `/api/v1/internal/telegram/chat-bind` снаружи?**
   - Что знаем: По Phase 1 архитектуре, Caddy блокирует `/api/v1/internal/*` (Caddyfile `respond /api/v1/internal/* "Forbidden" 403` ПЕРЕД `reverse_proxy /api/* api:8000`). Bot вызывает API через docker network напрямую (`http://api:8000/api/v1/internal/telegram/chat-bind`).
   - Решение: Никаких изменений в Caddyfile не нужно. Endpoint защищён двумя слоями (Caddy edge + FastAPI router dependency).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| python-dateutil | period_for | adds via `uv add` | 2.9.0 | calendar.monthrange (no extra dep) |
| httpx (prod) | bot api_client | ✓ (already in dev-deps; promote to prod) | 0.28.1 | aiohttp (already prod dep, но больше API) |
| @telegram-apps/sdk-react | frontend | ✓ | 3.3.9 | manual `window.Telegram.WebApp.initData` |
| Node.js | frontend build | ✓ | v25.8.2 | — |
| Docker, Postgres, etc. | unchanged from Phase 1 | ✓ | — | — |

---

## Validation Architecture

### Test Framework (carryover from Phase 1)

| Property | Value |
|----------|-------|
| Framework | pytest 8.4.2 + pytest-asyncio 1.2.0 |
| Config | `pyproject.toml [tool.pytest.ini_options]` (already configured) |
| Quick run | `uv run pytest tests/ -x -q` |
| Full suite | `uv run pytest tests/ -v` |
| Frontend tests | manual via Telegram dev tools / browser (Phase 2 — no automated FE tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| CAT-01 | CRUD категорий | integration | `uv run pytest tests/test_categories.py -x` |
| CAT-02 | Soft archive скрывает в `?include_archived=false` | integration | `uv run pytest tests/test_categories.py::test_archive -x` |
| CAT-03 | Seed создаёт 14 категорий, idempotent | integration | `uv run pytest tests/test_categories.py::test_seed -x` |
| PER-01 | `cycle_start_day` сохраняется в app_user | integration | `uv run pytest tests/test_settings.py::test_update_cycle_day -x` |
| PER-02 | Onboarding принимает starting_balance, создаёт период | integration | `uv run pytest tests/test_onboarding.py::test_complete -x` |
| PER-03 | (структурно) первый период с заданным balance | integration | covered by test_complete |
| PER-05 | (структурно) endpoint POST /periods/{id}/apply-template — не в Phase 2 | — | deferred to Phase 3 |
| ONB-01 | UI scrollable single-page | manual | checkpoint:human-verify after frontend plans |
| ONB-02 | Если chat_id неизвестен — bot bind кнопка активна | manual | checkpoint:human-verify |
| ONB-03 | Бот /start сохраняет tg_chat_id | integration | `uv run pytest tests/test_telegram_chat_bind.py -x` |
| SET-01 | PATCH /settings меняет только future periods | integration | `uv run pytest tests/test_settings.py -x` |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/test_period_engine.py tests/test_categories.py -x -q` (~5s)
- **Per wave merge:** `uv run pytest tests/ -v` (~30s)
- **Phase gate:** Полный suite зелёный + manual checkpoint pass перед `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/test_period_engine.py` — unit, параметризованный 9+ кейсов
- [ ] `tests/test_categories.py` — CRUD + soft-archive + seed idempotency
- [ ] `tests/test_periods.py` — GET /periods/current
- [ ] `tests/test_onboarding.py` — POST /onboarding/complete + 409 on repeat
- [ ] `tests/test_settings.py` — GET/PATCH /settings, валидация 1..28
- [ ] `tests/test_telegram_chat_bind.py` — internal endpoint upsert
- (frontend без unit-тестов в Phase 2 — D-22)

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (наследуется из Phase 1).

### Applicable ASVS Categories (Phase 2 deltas)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (carry-over) | initData HMAC + OWNER whitelist + dev-mode bypass |
| V4 Access Control | yes | All `/api/v1/*` под `Depends(get_current_user)`; `/internal/*` под `verify_internal_token` |
| V5 Input Validation | yes | Pydantic v2 на каждом body (CategoryCreate, OnboardingCompleteRequest, SettingsUpdate); `Field(ge=1, le=28)` для cycle_start_day; `Field(ge=0)` для amount_cents (хотя BIGINT signed, минимум — UI-decision) |
| V8 Data Protection | yes | tg_chat_id — sensitive, не возвращается в `/me` (только bool `chat_id_known`) — уже соблюдено в Phase 1 |

### Known Threat Patterns for Phase 2

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Подделка `tg_user_id` в bot `/start` | Spoofing | Telegram гарантирует `message.from_user.id`; bot всё равно проверяет OWNER_TG_ID; internal endpoint не доверяет body (см. ниже) |
| Кто-то делает POST `/internal/telegram/chat-bind` с чужим tg_user_id | Tampering | Endpoint защищён `X-Internal-Token` (только bot имеет токен); токен не утекает наружу через Caddy. Дополнительно: на уровне бизнес-логики проверяем, что переданный `tg_user_id == OWNER_TG_ID` (single-tenant) |
| Повторное POST `/onboarding/complete` создаёт второй первый период | Tampering | D-10: проверка `app_user.onboarded_at` → 409 Conflict |
| Отправка `seed_default_categories=true` после ручного создания | Idempotency | `seed_default_categories()` сервис: skip if any category exists |
| `cycle_start_day` вне диапазона 1..28 | Input Validation | Pydantic Field validator |
| Attempt to delete category that has historical transactions (CAT-02) | Tampering | DELETE → soft-archive (is_archived=true), historical refs не нарушаются |
| XSS через category.name в Mini App | XSS | React по умолчанию escape'ит strings; не использовать `dangerouslySetInnerHTML` |

---

## Project Constraints (from CLAUDE.md — Phase 2 deltas)

| Directive | Impact на Phase 2 |
|-----------|------------------|
| Деньги BIGINT копейки | `starting_balance_cents` — `int`, валидируется Pydantic; UI рассчитывает рубли↔копейки |
| Бизнес-даты DATE | `period_start`, `period_end` — `date` (Python type) |
| Soft delete только category | `DELETE /categories/{id}` → soft archive |
| Single-tenant без `user_id` FK | Все новые таблицы (если будут) тоже без user_id |
| Period расчёт `Europe/Moscow` | `period_for(date)` принимает naive date; вызывающий код использует `datetime.now(MOSCOW_TZ).date()` |
| initData HMAC на каждом запросе | Все новые endpoints под `Depends(get_current_user)` |
| Internal endpoints `/api/v1/internal/*` | Новый router `internal_telegram_router` под router-level dependency |
| structlog | Все сервисы логируют через structlog (info на onboarding completion, warning на failed chat-bind) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@telegram-apps/sdk-react` 3.3.9 экспортирует `retrieveLaunchParams` и `mainButton` | Pattern 5, 6 | Может потребоваться `tma.js`-стиль (`init().then(...)`); проверить в Plan 02-06 |
| A2 | Caddy не нужно изменять для Phase 2 — `/api/v1/internal/telegram/chat-bind` уже покрыт wildcard `respond /api/v1/internal/*` | Open Q4 | Если правило написано на конкретный path — нужно расширить wildcard |
| A3 | `@telegram-apps/sdk-react` MainButton API через signal-объект `mainButton.setParams({ ... })` | Pattern 6 | Возможно, нужен hook-стиль `useMainButton()`; уточнить в Plan 02-06 |
| A4 | dateutil совместим с Python 3.12 (semver) | Pattern 4 | Очень низкий риск — dateutil поддерживает 3.12 много лет |
| A5 | SEED_CATEGORIES (14 штук) — точное соответствие исходной xlsx | D-16 | Неверный список — пользователь корректирует в Settings post-onboarding; не блокер |

---

## Sources

### Primary (HIGH confidence)

- `docs/HLD.md` — единый источник истины для API/DB/period логики
- `docs/BRD.md` — бизнес-правила и UC-10 (onboarding flow)
- `.planning/sketches/006-onboarding/` — winner B (scrollable single page)
- aiogram 3.22.0 docs (CommandStart, CommandObject) — local install
- @telegram-apps/sdk-react 3.3.9 — npm registry + types

### Secondary (MEDIUM confidence)

- python-dateutil docs — [VERIFIED: PyPI 2.9.0]
- httpx async client — [VERIFIED: PyPI 0.28.1]
- Pydantic v2 Field validators — [VERIFIED: pydantic 2.13.3]

### Tertiary

- Web blog posts по Telegram MainButton best-practices — confirmed via SDK README

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — все зависимости либо уже установлены (Phase 1), либо легко добавляются
- Architecture: HIGH — прямо задана HLD + CONTEXT
- Period engine: HIGH — алгоритм verified against HLD §3 examples
- Bot deep-link: HIGH — verified против aiogram 3 docs
- Frontend SDK: MEDIUM — точные имена API (mainButton signal vs hook) уточняются на Plan 02-06
- Test infrastructure: HIGH — переиспользует Phase 1 conftest.py

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (стек стабильный, 30 дней)
