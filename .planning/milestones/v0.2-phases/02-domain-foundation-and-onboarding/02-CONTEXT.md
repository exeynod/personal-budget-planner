# Phase 2: Domain Foundation & Onboarding — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Auto (decisions made on behalf of user; revisable in revision mode)

<domain>
## Phase Boundary

Доменное ядро + onboarding flow. После этой фазы:
- В БД существует первый `budget_period` со стартовым балансом, активный, покрывающий «сегодня».
- В БД существуют 14 seed-категорий из исходной xlsx (CAT-03).
- `app_user.cycle_start_day` установлен (по умолчанию 5, редактируется).
- `app_user.tg_chat_id` привязан после `/start` в боте — push-уведомления Phase 5/6 могут отправляться.
- `app_user.onboarded_at` заполнен — Mini App знает, что onboarding завершён, и сразу открывает «дашборд» (заглушка-плейсхолдер до Phase 5).
- Frontend: scrollable single-page onboarding (sketch 006-B) + экраны «Категории» и «Settings».
- Backend: REST API под `/api/v1/` для onboarding/categories/periods/settings + internal endpoint для bot chat-bind.

**Не входит в Phase 2:**
- PlanTemplate, planned/actual transactions (Phase 3, 4)
- Дашборд с tabs «Расходы/Доходы», прогресс-барами и edge-states (Phase 5)
- Worker-job `close_period` (Phase 5, PER-04 — не в этой фазе)
- Подписки (Phase 6)
- Bot-команды кроме `/start` (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Storage & Schema

- **D-01:** `cycle_start_day` хранится в `app_user.cycle_start_day` (уже есть с Phase 1, default=5). Нет отдельной таблицы settings — для single-tenant pet это избыточно. Если в будущем появятся per-user-настройки сложнее простого int, тогда добавим `app_setting` (key/value/user_id). В Phase 2 — `GET /settings` и `PATCH /settings` читают/пишут именно `app_user.cycle_start_day`.
  - **Отказ от ранее предложенной отдельной таблицы `app_setting`:** в плане-промпте это упоминалось, но колонка в `app_user` уже существует и покрывает SET-01 без миграции. Добавим таблицу только если потребуется хранить нечто, что не помещается в `app_user` (сейчас не требуется).

- **D-02:** Migration `0002_period_first_seed.py` НЕ требуется для Phase 2. Миграция нужна только когда схема меняется. Категории засеваются через API endpoint (POST `/onboarding/seed-categories`), не через alembic data-migration — это согласуется с D-10 Phase 1 («никакого seed в миграции»).

### API Layout

- **D-03:** Сервисный слой явно отделён: `app/services/categories.py`, `app/services/periods.py`, `app/services/onboarding.py`, `app/services/settings.py`. Routers (`app/api/routes/*.py`) тонкие, дёргают сервисы. Это упрощает повторное использование (например, onboarding-сервис вызывает categories-сервис для seed) и тесты (сервис тестируется без HTTP).

- **D-04:** Все новые роуты идут через `app.api.routes.{module}` и регистрируются в `app/api/router.py` через `include_router`. Существующий `public_router` остаётся для `/me`. Каждый под-роутер: `categories_router`, `periods_router`, `onboarding_router`, `settings_router`, `internal_telegram_router`.

- **D-05:** Pydantic-схемы в `app/api/schemas/{module}.py` (request/response модели). Имена: `CategoryCreate`, `CategoryRead`, `CategoryUpdate`, `PeriodRead`, `OnboardingCompleteRequest`, `SettingsRead`, `SettingsUpdate`. Снаружи всегда rubles? **Нет**: согласно HLD §4 и CLAUDE.md «суммы в копейках». Snake_case для backend; конверсию в рубли делает frontend.

### Period Engine (`period_for`)

- **D-06:** `app/core/period.py::period_for(date, cycle_start_day) -> tuple[date, date]` — чистая функция. Алгоритм по HLD §3:
  - Если `date.day >= cycle_start_day` → `period_start = date.replace(day=min(cycle_start_day, last_day_of(date.year, date.month)))`, `period_end = (period_start + 1 month).replace(day=cycle_start_day) - 1 day`.
  - Если `date.day < cycle_start_day` → `period_start = (date - 1 month).replace(day=min(cycle_start_day, last_day_of(prev_month)))`, `period_end = date.replace(day=cycle_start_day) - 1 day`.
  - Edge: если в нужном месяце нет дня `cycle_start_day` (например, 31 в феврале) → берём последний день месяца.
- **D-07:** Reference implementation использует `dateutil.relativedelta` (надёжный month-arithmetic). Добавляем `python-dateutil` в `pyproject.toml`. Альтернатива (без зависимости) — ручной `calendar.monthrange` — допустимо, но менее читаемо. **Используем dateutil.**

### Onboarding Flow

- **D-08:** Onboarding — single-page scrollable (sketch 006-B winner). Не wizard, не welcome-экран. 4 секции: (1) Bot bind, (2) Стартовый баланс, (3) cycle_start_day, (4) Seed-категории.
  - Секции 2-4 не блокируются секцией 1 на уровне UI (пользователь может ввести значения, но кнопка «Готово» проверяет, что все 4 заполнены).
  - Кнопка «Готово» (Telegram `MainButton`) активна только когда все 4 секции имеют валидные значения.
  - После клика — POST `/onboarding/complete` с body, бэкенд atomically: создаёт seed-категории (если выбрано) → создаёт первый `budget_period` → выставляет `app_user.cycle_start_day` → проставляет `app_user.onboarded_at = now()`.

- **D-09:** Порядок проверок при «Готово»:
  1. `tg_chat_id` известен (бот написал) — иначе кнопка disabled с подсказкой «Сначала привяжите бота».
  2. `starting_balance_cents >= 0` — может быть 0 (новый пользователь без накоплений), отрицательные значения — debt, тоже разрешены (BIGINT signed).
  3. `cycle_start_day` ∈ [1, 28].
  4. `seed_default_categories` — bool. Если true, бэк создаёт 14 seed (только если категорий ещё нет — idempotent).

- **D-10:** Repeat-protection: если `app_user.onboarded_at IS NOT NULL`, POST `/onboarding/complete` возвращает 409 Conflict. Это защищает от случайного двойного клика и от дублирования первого периода.

### Bot-bind (ONB-03)

- **D-11:** Бот при `/start` от OWNER_TG_ID вызывает internal endpoint `POST /api/v1/internal/telegram/chat-bind` с body `{"tg_user_id": <id>, "tg_chat_id": <id>}` и заголовком `X-Internal-Token`. API делает upsert: если `app_user` с этим `tg_user_id` уже есть — обновляет `tg_chat_id`; если нет — создаёт строку (нужно, потому что ONB-03 может сработать до открытия Mini App).
- **D-12:** Бот в ответ присылает Mini App-кнопку через `InlineKeyboardButton(text="Открыть бюджет", web_app=WebAppInfo(url=settings.MINI_APP_URL))`. Также добавляем поддержку `start payload`: `https://t.me/<bot>?start=onboard` → бот отвечает «Готово, push включены. Открой Mini App для настройки». Параметр `start` парсится через `CommandObject` (`message.text` после `/start `).

- **D-13:** Settings: добавляем `MINI_APP_URL` в `app/core/settings.py` (default `"http://localhost:5173"` для dev, в prod из `.env`).

### Categories CRUD (CAT-01..03)

- **D-14:** Soft-archive через `is_archived=true` (CAT-02). API: `DELETE /categories/{id}` фактически делает `PATCH is_archived=true` (поведение явно задокументировано в OpenAPI). Альтернатива — отказаться от `DELETE` и оставить только `PATCH` — но `DELETE` интуитивен; поведение «архивирует» документируется в response (`{"archived": true}`).

- **D-15:** `GET /categories?include_archived=false` — параметр опциональный, default `false`. При `true` возвращает все, при `false` — только активные (для select-выпадашек в UI).

- **D-16:** Seed-categories список (точный список из исходной xlsx, 14 штук) — фиксированная константа в `app/services/categories.py`:
  ```python
  SEED_CATEGORIES = [
      # expense (12)
      ("Продукты", "expense", 10),
      ("Дом", "expense", 20),
      ("Машина", "expense", 30),
      ("Кафе и рестораны", "expense", 40),
      ("Здоровье", "expense", 50),
      ("Подарки", "expense", 60),
      ("Развлечения", "expense", 70),
      ("Одежда", "expense", 80),
      ("Транспорт", "expense", 90),
      ("Подписки", "expense", 100),
      ("Связь и интернет", "expense", 110),
      ("Прочее", "expense", 120),
      # income (2)
      ("Зарплата", "income", 10),
      ("Прочие доходы", "income", 20),
  ]
  ```
  - **Точный набор согласуется на этапе Plan 02-02 при чтении исходного xlsx-маппинга.** Если данные xlsx показывают другие имена/количество — корректируем константу. Если несовпадение — фиксируем в SUMMARY.

### Settings (SET-01)

- **D-17:** `PATCH /settings { cycle_start_day: int }` валидирует `1 <= cycle_start_day <= 28` (Pydantic `Field(ge=1, le=28)`) и обновляет `app_user.cycle_start_day`. **Не пересчитывает** существующие периоды (PER-01 + business rule). UI показывает дисклеймер: «Изменение применится со следующего периода». Прошлые/текущие периоды остаются с их `period_start`/`period_end`, посчитанными по cycle_start_day на момент создания.

### UI Layer

- **D-18:** UI-kit decision: **plain CSS** (CSS modules или просто отдельные `.css`-файлы) + кастомные минимальные компоненты. Не используем `@telegram-apps/telegram-ui` (тяжёлая зависимость, hard-coded styles), не используем shadcn (нужен Tailwind setup). Темы и переменные — переносим из `.planning/sketches/themes/default.css` (уже готовый banking-premium dark theme). Это закрывает Q-7 из HLD.

- **D-19:** Routing внутри SPA — самый простой `useState` для текущего экрана (`'onboarding' | 'home' | 'categories' | 'settings'`). React Router избыточен для 4 экранов. Если в Phase 3+ появится 7+ экранов и нужны URLs — переходим на `react-router-dom`. Не сейчас.

- **D-20:** API client: тонкая обёртка `frontend/src/api/client.ts` с функцией `apiFetch(path, init)`, которая добавляет `X-Telegram-Init-Data: <initDataRaw>` (берётся из `@telegram-apps/sdk-react`'s `retrieveLaunchParams` или `initData()` сигнала). В DEV-режиме (когда `import.meta.env.DEV` или `window.Telegram.WebApp` отсутствует) — отправляет фиктивный header `dev-mode-stub`, бэкенд с `DEV_MODE=true` его игнорирует.

- **D-21:** State management: `useState` + custom hooks (`useUser()`, `useCategories()`). Не вводим Redux/Zustand. Если в Phase 5 (дашборд с переключателем периодов) понадобится глобальный store — добавим Zustand.

### Testing

- **D-22:** Wave 0 RED тесты для Phase 2: `tests/test_period_engine.py` (unit, чистая функция), `tests/test_categories.py` (CRUD + soft-archive), `tests/test_onboarding.py` (POST onboarding/complete + idempotency), `tests/test_settings.py` (cycle_start_day update), `tests/test_telegram_chat_bind.py` (internal endpoint upsert). Frontend — без unit-тестов в MVP (single-screen-ish, проще проверять через checkpoint:human-verify).

### Claude's Discretion

- Точные имена React-компонентов (`OnboardingPage`, `CategoryList`, `SettingsPanel`).
- Структура pydantic-схем (один файл vs модуль schemas/).
- Конкретный визуальный layout категорий и settings (используем sketch 005-B как референс для CRUD-паттерна).
- Имя internal endpoint: `/internal/telegram/chat-bind` vs `/internal/bot/chat-bound` — выбираем первый (REST-стиль: ресурс `telegram`, действие `chat-bind`).

</decisions>

<canonical_refs>
## Canonical References

### Архитектура и API
- `docs/HLD.md` §2 — ERD, существующие таблицы (схема не меняется в Phase 2)
- `docs/HLD.md` §3 — алгоритм `period_for(date, cycle_start_day)`
- `docs/HLD.md` §4.1 — Auth/Onboarding endpoints (`/me`, `/onboarding/complete`)
- `docs/HLD.md` §4.2 — Categories endpoints (GET/POST/PATCH `/categories`)
- `docs/HLD.md` §4.4 — Periods endpoints (GET `/periods`, GET `/periods/current`)
- `docs/HLD.md` §4.9 — Settings (GET/PATCH `/settings`)
- `docs/HLD.md` §4.10 — Internal endpoints (`/internal/bot/chat-bound`)
- `docs/HLD.md` §5 — Bot `/start` поведение

### Бизнес-правила
- `docs/BRD.md` §4.1 — Category и мягкая архивация
- `docs/BRD.md` §4.3 — Month/Period семантика
- `docs/BRD.md` §6 — period расчёт и cycle_start_day
- `docs/BRD.md` UC-10 — Onboarding flow

### Дизайн-референсы
- `.planning/sketches/006-onboarding/index.html` — winner B (scrollable single page)
- `.planning/sketches/005-plan-and-categories/` — winner B (grouped + inline edit) для CRUD-паттерна категорий
- `.planning/sketches/themes/default.css` — token-based design system (cv-vars)

### Существующий код Phase 1
- `app/db/models.py` — все 8 ORM-моделей готовы
- `app/api/router.py` — существующий public_router (`/me`)
- `app/api/dependencies.py` — `get_current_user`, `verify_internal_token`, `get_db`
- `app/core/auth.py` — `validate_init_data`
- `app/core/settings.py` — pydantic-settings (нужно добавить `MINI_APP_URL`)
- `main_bot.py` — текущий `/start` stub (заменяется в Phase 2)
- `frontend/src/App.tsx` — placeholder (заменяется на полноценный SPA)

### Требования Phase 2
- `.planning/REQUIREMENTS.md` — CAT-01, CAT-02, CAT-03, PER-01, PER-02, PER-03, PER-05, ONB-01, ONB-02, ONB-03, SET-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 1)
- `AppUser` ORM-модель: `id`, `tg_user_id`, `tg_chat_id`, `cycle_start_day=5`, `onboarded_at`. **Покрывает все нужды Phase 2 без миграции.**
- `Category`, `BudgetPeriod` ORM — готовы, никаких изменений в схеме.
- `get_current_user` уже делает upsert AppUser (D-11 Phase 1) — используем это для гарантии существования user-row до `PATCH /settings`.
- `verify_internal_token` готов — используем для `/internal/telegram/chat-bind`.
- `validate_init_data` готов — Mini App'у нужно только корректно слать заголовок.
- `tests/conftest.py::async_client` fixture готов — переиспользуем для всех новых тестов.
- `make_init_data()` helper — генерирует валидный initData для тестов.
- Frontend scaffold: Vite + React 18 + TS + `@telegram-apps/sdk-react` уже установлены.

### Established Patterns
- Async SQLAlchemy session-per-request через `Depends(get_db)`.
- Pydantic v2 response_model на каждом эндпоинте.
- structlog для логирования (JSON в prod, console в dev).
- BIGINT копейки для всех денежных полей.
- Snake_case в БД и API; camelCase только во frontend (если нужно — конвертим в схеме).

### Integration Points
- `bot` ↔ `api`: `bot` вызывает `POST /api/v1/internal/telegram/chat-bind` через `httpx.AsyncClient` с `X-Internal-Token` (env: `INTERNAL_TOKEN`, `API_BASE_URL=http://api:8000`).
- `frontend` ↔ `api`: REST через Caddy (`/api/v1/*` проксируется на `api:8000`); заголовок `X-Telegram-Init-Data` берётся из `tg.initDataRaw`.
- `worker` Phase 2 не задействован.

### New Modules to Create
- `app/services/` — новый пакет (categories, periods, onboarding, settings).
- `app/core/period.py` — period_for utility.
- `app/api/routes/` — пакет под-роутеров.
- `app/api/schemas/` — Pydantic схемы.
- `app/bot/` — наполняется (bot client для api, /start handler).
- `frontend/src/api/`, `frontend/src/screens/`, `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/styles/`.

</code_context>

<specifics>
## Specific Ideas

- `period_for` — pure function, легко покрывается параметризованными pytest-тестами на 8-12 кейсов (включая edge: feb с cycle_start_day=31, январь→декабрь rollover, day == cycle_start_day, day == cycle_start_day-1).
- Bot `/start`: использовать `aiogram.types.WebAppInfo` для inline-кнопки, чтобы из чата открывался Mini App в один тап.
- POST `/onboarding/complete` — оборачиваем в `async with db.begin()` для atomicity (либо все три действия выполняются, либо ничего).
- Frontend: использовать `@telegram-apps/sdk-react`'s `mainButton` signal для активации/деактивации MainButton в зависимости от валидности формы.
- Telegram theme: применить `tg.themeParams` к CSS-переменным root (но default-set из `default.css` уже соответствует banking-premium dark — Telegram theme использовать как fallback для светлой темы).

</specifics>

<deferred>
## Deferred Ideas

- **Графический wizard для onboarding** (variant A из sketch 006) — отброшен в пользу winner B.
- **Welcome-экран** (variant C) — отброшен.
- **`app_setting` отдельная таблица** — отложено до возникновения нужды; `cycle_start_day` хранится в `app_user`.
- **Per-period override `cycle_start_day`** — Q-10 HLD, не делаем.
- **Reorder категорий через drag-n-drop** — UI-фича для Phase 3 или post-MVP, в Phase 2 редактируется только `name` и `is_archived`. `sort_order` устанавливается seed-ом и через PATCH (numeric input).
- **Bulk-create категорий через UI** — в Phase 2 только onboarding seed (один POST) + ручной POST по одной.
- **Импорт категорий из xlsx** — out of scope MVP (REQUIREMENTS.md).
- **Bot webhook режим** — повторно отложено (D-04 Phase 1).

</deferred>

---

*Phase: 02-domain-foundation-and-onboarding*
*Context gathered: 2026-05-02 (auto mode)*
