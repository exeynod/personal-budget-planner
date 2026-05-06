# Phase 4: Actual Transactions & Bot Commands — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Auto (decisions made on behalf of user; revisable in revision mode)

<domain>
## Phase Boundary

Доменное ядро «Факт». После этой фазы:
- В БД активно используется таблица `actual_transaction` (схема Phase 1, без миграций).
- Backend: `/api/v1/actual` (POST), `/api/v1/actual/{id}` (PATCH/DELETE), `/api/v1/periods/{period_id}/actual` (GET), `/api/v1/actual/balance` (GET, для UI и `/balance` бот-команды); internal `/api/v1/internal/bot/*` (actual / balance / today) для бота с `X-Internal-Token`.
- Bot: 5 команд — `/add <amount> <category_query> [description]`, `/income <amount> <category_query> [description]`, `/balance`, `/today`, `/app`. Disambiguation через inline-кнопки при ≥2 совпадений. Парсер сумм поддерживает `1500`, `1500.50`, `1 500`, `1500р`, `1500₽` (HLD §5).
- Frontend: новый экран **ActualScreen** (список факт-трат текущего периода) + переиспользуемый `BottomSheet` с новым `ActualEditor` (form: amount, kind, category, description, tx_date) — паттерн sketch 002-B. На HomeScreen — FAB «+ Трата».
- Период факт-транзакции вычисляется server-side по `tx_date + cycle_start_day` (ACT-02). При изменении `tx_date` через PATCH период автоматически пересчитывается (ACT-05).

**Не входит в Phase 4:**
- Dashboard / Summary с агрегацией факт-vs-план (Phase 5, DSH-01..06). В Phase 4 `/balance` — простая бот-команда без UI-карточек.
- Worker `close_period` (Phase 5, PER-04).
- Subscriptions / Phase 6.
- Search/full-text по описаниям (HLD §4.6 упоминает `?q=`, но мы реализуем только `kind` и `category_id` фильтры — `q` deferred).
- Bot-команды редактирования/удаления факт-трат (`/edit`, `/delete`) — только Mini App для управления.
- Bot-команды для plan/template — out of scope MVP (карта в `03-CONTEXT.md`).
- Webhook режим бота — long-poll сохраняем (D-04 Phase 1).

</domain>

<decisions>
## Implementation Decisions

### Bot ↔ API Integration

- **D-45:** **Bot вызывает internal endpoints** через `app/bot/api_client.py` (расширяем существующий модуль, который уже умеет `bind_chat_id`). Все bot→api запросы идут с заголовком `X-Internal-Token` на путях `/api/v1/internal/bot/*`. Альтернатива — прямой импорт сервиса в bot через AsyncSessionLocal — отвергнута: ломает разделение API/bot контейнеров (D-04 Phase 1 «aiogram + FastAPI в одном процессе возможны, но для надёжности оставляем разные контейнеры»). Internal endpoints не выставляются наружу Caddy (`/api/v1/internal/*` блокируется на edge — Phase 1 INF-04).

- **D-46:** **Три новых internal endpoint'а** (HLD §4.10):
  - `POST /api/v1/internal/bot/actual` — body `{tg_user_id, kind, amount_cents, category_query, description?, tx_date?}`. Сервис ищет категории по `category_query`, если 1 совпадение — создаёт actual + возвращает `{status: 'created', actual: ActualRead, category: CategoryRead, balance_after: int}`. Если ≥2 совпадений — возвращает `{status: 'ambiguous', candidates: [{id, name, kind}, ...]}`. Если 0 — `{status: 'not_found'}`. Бот мапит в текстовый ответ + inline-кнопки.
  - `POST /api/v1/internal/bot/balance` — body `{tg_user_id}`. Возвращает `{period_id, period_start, period_end, starting_balance_cents, planned_total_expense_cents, actual_total_expense_cents, planned_total_income_cents, actual_total_income_cents, balance_now_cents, delta_total_cents, by_category: [{category_id, name, kind, planned_cents, actual_cents, delta_cents}]}` (топ 5 по abs(delta) или все — решает service; для бота отдадим все, бот возьмёт топ 5).
  - `POST /api/v1/internal/bot/today` — body `{tg_user_id}`. Возвращает `{actuals: [ActualRead, ...]}` за сегодня (TZ Europe/Moscow), + nested category name/kind для отображения.
  - **Зачем POST с body, а не GET с query:** соответствует HLD §4.10; `tg_user_id` в body избегает попадания id в логи URL (хотя single-tenant — это формальность); семантически — не «чтение ресурса по id», а «команда от бота».
  - **Ответ для disambiguation: `{status: 'ambiguous', candidates: [...]}` + второй вызов** — после нажатия кнопки бот шлёт `POST /api/v1/internal/bot/actual` повторно, но уже с конкретным `category_id` вместо `category_query`. Сервис принимает либо `category_query` (string), либо `category_id` (int) — explicit selection минует disambiguation.

### Bot State (Disambiguation FSM)

- **D-47:** **In-memory disambiguation cache** по `chat_id` с TTL 5 минут — НЕ aiogram FSM, НЕ БД. Хранится в `app/bot/disambiguation.py`:
  ```python
  # chat_id -> {kind, amount_cents, description, tx_date, candidates, expires_at}
  _PENDING: dict[int, PendingActual] = {}
  ```
  - При получении `{status: 'ambiguous', candidates: [...]}` бот сохраняет pending state + строит inline-keyboard из кандидатов с callback_data `"act:<pending_id>:<category_id>"`.
  - При callback бот достаёт pending state, шлёт `POST /internal/bot/actual` с `category_id` явно, чистит state, отвечает в чат.
  - Если callback пришёл после TTL — отвечаем `"Время ожидания истекло, пришлите команду снова"`.
  - **Зачем не aiogram FSM:** aiogram FSM требует storage backend (memory/redis); в single-tenant с 1 пользователем простой dict с TTL проще, не требует доп. зависимостей, не выживает при рестарте бота — что приемлемо (пользователь повторит команду).
  - **Зачем не Redis:** избыточно для single-tenant; контейнеров и так 5 (caddy/api/bot/worker/db).

- **D-48:** **Callback data format:** `"act:<pending_token>:<category_id>"`, где `pending_token` — короткий UUID4 (8 hex chars). Limit Telegram callback_data — 64 байта; формат укладывается. Если `pending_token` отсутствует в `_PENDING` (TTL истёк или бот рестартнул) — graceful degradation с подсказкой повторить команду.

### Bot Argument Parsing

- **D-49:** **Парсер сумм** в `app/bot/parsers.py::parse_amount(s: str) -> int | None` (возвращает копейки или None при ошибке). Поддерживает: `1500`, `1500.50`, `1500,50`, `1 500`, `1 500.50`, `1500р`, `1500₽`, `1500руб`. Алгоритм: strip whitespace, drop trailing `р`/`₽`/`руб`, replace `,` → `.`, parse float, multiply 100, round to int. Negative/zero → None (бот ответит «Сумма должна быть > 0»). Overflow > 10^12 копеек (10 млрд рублей) → None.

- **D-50:** **Парсер команды** `/add 1500 продукты пятёрочка` → `(amount_str, category_query, description)`:
  - Splits args by whitespace; first token = amount.
  - Если 1 token после amount → `category_query=token, description=None`.
  - Если ≥2 tokens после amount → `category_query=token2, description=" ".join(rest)`. Это поведение **«первое слово после суммы — категория»** соответствует HLD §5 («/add <amount> <category_query> [description]»).
  - Если args пусты или только сумма → отвечает usage-помощью.

### Category Search

- **D-51:** **`category_query` matching** в `app/services/actual.py::find_categories_by_query(query: str) -> list[Category]`:
  - Case-insensitive substring match через `Category.name ILIKE '%' || query || '%'`.
  - Только `is_archived=false`.
  - Sort: alphabetical (Cyrillic-friendly через PostgreSQL collation, default `database_default`). **«Sort by usage frequency»** (был в scope_to_plan) — отложено в `<deferred>` (требует JOIN на actual_transaction с COUNT, преждевременная оптимизация для single-tenant с ≤14 категорий).
  - Если `category_query` числовой и совпадает с `Category.id` (через `try int + ILIKE`) — добавляем точное совпадение в начало (эта вырожденная ветка покрывает D-46 fallback при явном `category_id`).
  - Limit 10 — больше не нужно для inline-keyboard (Telegram limit ~8 кнопок в строке, мы делаем 1 кнопка/строка).

### Period Recompute on tx_date Change (ACT-05)

- **D-52:** При POST `/actual` или PATCH `/actual/{id}` сервис всегда вычисляет `period_id = period_for(tx_date, cycle_start_day)` через query `BudgetPeriod WHERE period_start <= tx_date <= period_end`. Алгоритм:
  1. Находим существующий BudgetPeriod, чьи `period_start <= tx_date <= period_end`. Если найден — используем его id.
  2. Если не найден (например, исторический tx_date в архивный период, который ещё не был создан, или в будущий период) — расчёт через `period_for(tx_date, cycle_start_day)` и **создание нового BudgetPeriod** с `status='active'` (если он покрывает today) или с `status='closed'` (если в прошлом, без `closed_at`/`ending_balance` — будет «teneвой» период).
  3. **Trade-off:** автосоздание периодов для исторических дат может «загрязнить» таблицу `budget_period` сиротскими записями. Но альтернатива — отказывать пользователю при вводе исторической транзакции — хуже UX. В MVP single-tenant приемлемо. В Phase 5 worker `close_period` будет нормализовать историю.
  4. **PATCH `/actual/{id}` с новым tx_date:** сервис пересчитывает `period_id` тем же алгоритмом, обновляет колонку. Это и есть ACT-05.
  5. Edge: если `tx_date` совпадает с `period_start`/`period_end` нескольких overlapping периодов (не должно быть в норме — `period_start UNIQUE`, периоды непересекающиеся), берём первый по `period_start desc`.

- **D-53:** **`source='mini_app'` vs `source='bot'` на actual_transaction:**
  - POST `/api/v1/actual` (Mini App, под `Depends(get_current_user)`) → `source='mini_app'`.
  - POST `/api/v1/internal/bot/actual` → `source='bot'`.
  - Mini App **не может** создать строку с `source='bot'` (server-side overrides).
  - PATCH сохраняет `source` (не меняется при редактировании tx_date / amount).

### API Layout

- **D-54:** **Новые routers** (паттерн D-33 Phase 3):
  - `app/api/routes/actual.py` → `actual_router` (без префикса, `tags=["actual"]`, `dependencies=[Depends(get_current_user)]`):
    - `GET /periods/{period_id}/actual?kind=&category_id=` — список факт-трат периода
    - `POST /actual` — создать (source='mini_app')
    - `PATCH /actual/{id}` — обновить, при изменении tx_date — пересчёт period_id (ACT-05)
    - `DELETE /actual/{id}` — удалить (hard delete)
    - `GET /actual/balance` — текущий баланс активного периода (для UI и косвенно для /balance бота)
  - `app/api/routes/internal_bot.py` → `internal_bot_router` (prefix=`/bot`, монтируется под `internal_router` который уже даёт `verify_internal_token`):
    - `POST /actual` — main create (handles `category_query` OR `category_id`)
    - `POST /balance` — для `/balance` команды
    - `POST /today` — для `/today` команды
  - **Все public routes под router-level `Depends(get_current_user)`** (как Phase 2/3).
  - **Все internal routes под parent-level `Depends(verify_internal_token)`** (как `internal_telegram_router`).

- **D-55:** **Pydantic-схемы** — два новых файла:
  - `app/api/schemas/actual.py`: `ActualCreate`, `ActualUpdate`, `ActualRead`, `BalanceResponse`, `BalanceCategoryRow`.
  - `app/api/schemas/internal_bot.py`: `BotActualRequest`, `BotActualResponse` (discriminated по `status`: created/ambiguous/not_found), `BotBalanceRequest`, `BotBalanceResponse`, `BotTodayRequest`, `BotTodayResponse`, `CategoryCandidate`.
  - Все суммы в копейках (`*_cents: int`), snake_case, `kind: Literal["expense", "income"]`, `tx_date: date`, `source: Literal["mini_app", "bot"]`.

- **D-56:** **Service-слой** (паттерн D-35 Phase 3 — pure, без FastAPI imports):
  - `app/services/actual.py`:
    - `list_actual_for_period(period_id, *, kind=None, category_id=None) -> list[ActualTransaction]`
    - `create_actual(*, kind, amount_cents, description, category_id, tx_date, source) -> ActualTransaction` — внутри: `_resolve_period_for_date(tx_date)`, валидация category active, kind=category.kind
    - `update_actual(actual_id, patch) -> ActualTransaction` — при изменении tx_date пересчитывает period_id (ACT-05)
    - `delete_actual(actual_id) -> ActualTransaction`
    - `compute_balance(period_id) -> dict` — агрегация per-category + total для активного периода
    - `actuals_for_today() -> list[ActualTransaction]` — сегодняшние транзакции (TZ MSK)
    - `find_categories_by_query(query) -> list[Category]` — поиск по подстроке (D-51)
    - `_resolve_period_for_date(tx_date, *, cycle_start_day) -> int` — D-52: lookup или create
  - Domain exceptions: `ActualNotFoundError`, повторно используем `InvalidCategoryError`, `KindMismatchError`, `CategoryNotFoundError` из `app.services.planned`/`categories` (re-export не делаем; route ловит из обоих модулей).
  - Сервисы НЕ импортируют FastAPI; route-layer мапит exceptions в HTTPException.

- **D-57:** **Internal bot service:** `app/services/internal_bot.py`:
  - `process_bot_actual(*, kind, amount_cents, category_query=None, category_id=None, description, tx_date) -> dict` — основной dispatcher: ищет category (через `find_categories_by_query` или прямой `get_or_404`), если 1 — создаёт actual + считает «остаток по категории», если ≥2 — возвращает `ambiguous`.
  - `format_balance_for_bot() -> dict` — обёртка над `compute_balance` для активного периода + добавляет «топ N» агрегацию.
  - `format_today_for_bot() -> dict` — обёртка над `actuals_for_today` + nested category data.

### Domain Validation

- **D-58:** При создании/обновлении actual:
  - `category_id` существует и `is_archived=false` → `InvalidCategoryError` 400 (повторяем pattern D-36).
  - `kind` совпадает с `category.kind` → `KindMismatchError` 400.
  - `amount_cents`: `Field(gt=0)` Pydantic.
  - `tx_date`: `Field(le=today + 7 days)` — нельзя создавать транзакции далеко в будущем (защита от опечаток). Прошлые даты разрешены (D-52 покроет автосозданием периода). 7 дней forgiveness — пользователь может ошибиться на день/неделю при ретро-вводе подписки/планируемой покупки. **Решение:** soft check — Pydantic `Field` не покрывает динамику, делаем server-side в сервисе с явной ошибкой `FutureDateError` 400.
  - `description`: max_length 500 (как у planned).

### Bot Response Format

- **D-59:** **`/add` reply text:**
  ```
  ✓ Записано: 1 500 ₽ — Продукты (пятёрочка)
  Остаток по категории: 8 500 ₽ (план 10 000 ₽)
  ```
  Или для income:
  ```
  ✓ Доход: 50 000 ₽ — Зарплата (аванс)
  Доходы периода: 60 000 ₽ из 120 000 ₽ план
  ```
  «Остаток по категории» = `planned_cents - actual_cents` (для expense) или `actual_cents - planned_cents` (для income — D-02 «положительная = хорошо», в income «остаток» интерпретируется как «осталось получить»).

- **D-60:** **`/balance` reply text:**
  ```
  💰 Баланс: 23 450 ₽
  Δ периода: +5 200 ₽ (хорошо)
  
  Топ-5 категорий:
  ✓ Продукты: 8 500 / 10 000 ₽ (Δ +1 500)
  ⚠️ Кафе: 4 200 / 5 000 ₽ (Δ +800, 84%)
  🔴 Развлечения: 6 500 / 5 000 ₽ (Δ -1 500, 130%)
  ✓ Транспорт: 1 200 / 3 000 ₽ (Δ +1 800)
  ✓ Подписки: 1 990 / 2 000 ₽ (Δ +10)
  
  Период: 5 фев — 4 мар
  ```
  - Эмодзи logic (mirror DSH-03): ≥80% = ⚠️, >100% = 🔴, иначе ✓.
  - Топ-5 — по `abs(delta_cents)` desc (наиболее «горячие» категории).

- **D-61:** **`/today` reply text:**
  ```
  Сегодня (2 мая 2026):
  • Продукты: 1 500 ₽ — пятёрочка
  • Кафе: 850 ₽ — обед
  • Транспорт: 65 ₽
  Итого расходов: 2 415 ₽
  ```
  Если транзакций нет: `"Сегодня нет факт-трат."`. Никаких inline-кнопок (только текст).

- **D-62:** **`/app` reply:**
  ```
  Откройте Mini App для управления бюджетом:
  ```
  + InlineKeyboardMarkup с одной WebApp-кнопкой (как в существующем `_open_app_keyboard()` в `app/bot/handlers.py`).

### Frontend UI

- **D-63:** **`ActualEditor.tsx`** — НОВЫЙ компонент (D-43 Phase 3 carryover: НЕ overload `PlanItemEditor`, у него уже 4 mode):
  - Файл `frontend/src/components/ActualEditor.tsx`.
  - Props: `{ initial?: { kind?, amount_cents?, description?, category_id?, tx_date? }, categories, onSave, onDelete?, onCancel }` — структурно похоже на `PlanItemEditor`, но:
    - **Kind toggle** (segmented control «Расход / Доход») вместо derived-from-category. Меняет фильтр категорий в select.
    - **`tx_date`** обязательно (default = today в `Europe/Moscow`).
    - НЕТ `day_of_period` / `planned_date` — заменено на `tx_date`.
  - Парсер сумм — переиспользуем `parseRublesToKopecks` / `formatKopecksToRubles` из `PlanItemEditor.tsx` (вынести в `frontend/src/lib/money.ts` для shared use; рефактор минимальный — copy сначала, refactor когда понадобится в третий раз).
  - **Сначала copy функций money** в новом файле `actualEditor.ts` ИЛИ inline в `ActualEditor.tsx` — discretion executor'а; принципиально НЕ блокировать Phase 4 на refactor PlanItemEditor.

- **D-64:** **`ActualSheet`** — НЕ новый компонент. Используем `BottomSheet` (D-40 Phase 3) + `ActualEditor` внутри children, как в `PlannedScreen`. Заголовок sheet: «Новая трата» / «Изменить трату».

- **D-65:** **`ActualScreen.tsx`** — новый экран:
  - Файл `frontend/src/screens/ActualScreen.tsx`.
  - Header: «Факт текущего периода», back button (→ home), period label (как в PlannedScreen).
  - Группировка: by `tx_date desc` (свежие сверху), внутри — по категории. **НЕ группируем по категории на верхнем уровне** (отличие от PlannedScreen) — для факта приоритет «когда», т.к. факт-трата событийная.
  - Каждая строка: [время не показываем, `tx_date` есть в группировке header'а] amount + категория + описание + edit/delete actions.
  - Tap на строку → открывает BottomSheet edit-режим.
  - FAB «+ Трата» (внизу справа `position: fixed`).
  - Empty-state: «Пока нет факт-трат. Нажмите ＋ чтобы добавить.»

- **D-66:** **HomeScreen FAB:** На `frontend/src/screens/HomeScreen.tsx` добавляем FAB «+ Трата» (`position: fixed; bottom: 24px; right: 24px`) — открывает BottomSheet с ActualEditor напрямую (ActualSheet поверх HomeScreen). После сохранения — toast + обновление счётчика на FAB опционально (deferred). Также в `nav` добавляем кнопку «Факт» → ActualScreen.

- **D-67:** **App.tsx routing:** Добавляем `'actual'` в Screen union; HomeScreen `onNavigate` поддерживает `'actual'`.

### Reuse from Phase 2-3

- **D-68:** Без изменений переиспользуем:
  - `frontend/src/api/client.ts` (apiFetch + ApiError + initData injection).
  - `frontend/src/components/BottomSheet.tsx` (D-40 готов и закрыт, lifecycle `tg.BackButton` работает).
  - `frontend/src/hooks/useCategories.ts` — для category select.
  - `frontend/src/hooks/useCurrentPeriod.ts` — period_id для list/save.
  - `frontend/src/components/SectionCard.tsx` — empty-state.
  - Pattern «мутация → refetch + toast» из `PlannedScreen.tsx` копируем в `ActualScreen.tsx` (toast, busy guard, mutationError).
  - Стили: `frontend/src/styles/tokens.css` (D-18 Phase 2). FAB-стили — добавляем в `App.module.css` или новый `Fab.module.css` (на усмотрение executor'а).

### Testing

- **D-69:** Wave 0 RED тесты (паттерн D-44 Phase 3):
  - `tests/test_actual_crud.py` — CRUD `/actual` + filter by kind/category + auth 403 + Pydantic 422 + archived-cat 400 + kind-mismatch 400.
  - `tests/test_actual_period.py` — ACT-02 (POST вычисляет period_id) + ACT-05 (PATCH tx_date → новый period_id) + автосоздание периода для исторической даты (D-52) + future-date guard (D-58).
  - `tests/test_balance.py` — `GET /actual/balance` агрегирует planned/actual/delta per category + total; пустой период → нули.
  - `tests/test_internal_bot.py` — `POST /internal/bot/actual` (1 совпадение → created, ≥2 → ambiguous, 0 → not_found, явный category_id минует disambiguation); `POST /internal/bot/balance`; `POST /internal/bot/today`. Auth via X-Internal-Token (без → 403).
  - `tests/test_bot_parsers.py` — unit-тесты `parse_amount` (форматы 1500, 1500.50, "1 500", 1500р, ₽, edge: 0, -100, "", "abc", overflow) + `parse_add_command` (split args).
  - `tests/test_bot_handlers_phase4.py` — мокаем internal API через `respx` или `httpx_mock`, проверяем cmd_add → `bind_chat_id` НЕ вызывается, internal_bot/actual вызывается с правильным payload, ответ форматируется по D-59. Disambiguation flow: ambiguous response → inline kbd с N кнопок, callback → second internal call.
  - Все DB-backed тесты следуют `_require_db` self-skip pattern.

- **D-70:** **Frontend тестов нет** в Phase 4 (carryover D-44/D-22). UI verification — checkpoint:human-verify в Wave 4 (Plan 04-07).

### Claude's Discretion

- Точные имена React-компонентов (`ActualEditor`, `ActualRow`, `Fab`).
- Структура: один `ActualEditor` с props vs два отдельных компонента «create/edit» — на усмотрение executor'а в Plan 04-05.
- Имена exception-классов (`ActualNotFoundError` vs `ActualTransactionNotFoundError` — единый стиль с Phase 3).
- Текст empty-state, toast и helper-сообщений на русском.
- Точная разметка inline-keyboard для disambiguation (1 кнопка/row vs grid 2x2).
- Способ передачи `tg_user_id` в bot-handlers до внутренних вызовов: `message.from_user.id` (из aiogram) — стандарт.

</decisions>

<canonical_refs>
## Canonical References

### Архитектура и API
- `docs/HLD.md` §2 — ERD (`actual_transaction`)
- `docs/HLD.md` §2.2 — `ActualSource` enum (mini_app/bot)
- `docs/HLD.md` §3 — `period_for(date, cycle_start_day)` (используется через `app/core/period.py`)
- `docs/HLD.md` §4.6 — Actual Transactions endpoints
- `docs/HLD.md` §4.10 — Internal endpoints (бот → api)
- `docs/HLD.md` §5 — TG-бот команды
- `docs/HLD.md` §7.3 — Internal token enforcement

### Бизнес-правила
- `docs/BRD.md` UC-2, UC-3 — добавление факт-трат через Mini App / бот
- `.planning/REQUIREMENTS.md` — ACT-01..05

### Дизайн-референсы
- `.planning/sketches/002-add-transaction/index.html` — winner B (bottom sheet) — паттерн ActualSheet
- `.planning/sketches/002-add-transaction/README.md` — implementation notes
- `.planning/sketches/themes/default.css` — design tokens (carry-over)

### Существующий код Phase 1-3
- `app/db/models.py:193-218` — `ActualTransaction`, `ActualSource` enum
- `app/core/period.py` — `period_for(date, cycle_start_day)`
- `app/core/settings.py` — `INTERNAL_TOKEN`, `MINI_APP_URL`, `OWNER_TG_ID`, `API_BASE_URL`, `APP_TZ`
- `app/services/categories.py` — `get_or_404`, `CategoryNotFoundError`, list pattern
- `app/services/planned.py` — domain exceptions reuse: `InvalidCategoryError`, `KindMismatchError`, `PeriodNotFoundError`
- `app/services/periods.py:14-32` — `_today_in_app_tz()`, `get_current_active_period`
- `app/services/settings.py` — `get_cycle_start_day(db, tg_user_id)`
- `app/api/routes/planned.py` — паттерн thin route + Pydantic + exception mapping
- `app/api/routes/internal_telegram.py` — паттерн internal sub-router (без своих deps, наследует от parent)
- `app/api/router.py:80-117` — где регистрировать новые sub-routers (public + internal)
- `app/api/dependencies.py` — `get_current_user`, `get_db`, `verify_internal_token`
- `app/api/schemas/planned.py` — паттерн Pydantic schemas (KindStr, gt=0, from_attributes)
- `app/bot/handlers.py` — паттерн Router + Command handlers + InlineKeyboardMarkup
- `app/bot/api_client.py` — `bind_chat_id` шаблон httpx + `InternalApiError`; расширяем
- `main_bot.py` — точка входа, `dp.include_router(router)` уже подключён
- `frontend/src/components/BottomSheet.tsx` — D-40 готов, переиспользуется
- `frontend/src/components/PlanItemEditor.tsx` — паттерн editor + parseRublesToKopecks helpers
- `frontend/src/screens/PlannedScreen.tsx` — паттерн mutation + refetch + toast
- `frontend/src/screens/HomeScreen.tsx` — место для FAB и nav-кнопки
- `frontend/src/App.tsx` — Screen union union + routing
- `frontend/src/hooks/useCurrentPeriod.ts`, `useCategories.ts` — hooks pattern
- `frontend/src/api/client.ts` — apiFetch
- `frontend/src/api/types.ts` — место для новых TS-типов

### Требования Phase 4
- `.planning/REQUIREMENTS.md` — ACT-01, ACT-02, ACT-03, ACT-04, ACT-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 1-3)
- `ActualTransaction` ORM-модель + `ActualSource` enum + индексы `(period_id, kind)`, `(category_id, tx_date)` — ГОТОВЫ. Никаких изменений в схеме.
- `period_for(date, cycle_start_day)` pure function — ready для D-52 lookup-or-create.
- `get_current_active_period(db)` — нужен для `compute_balance` (default — активный период).
- `_today_in_app_tz()` (в `app/services/periods.py`) — TZ-correct today, для default tx_date и `/today` команды.
- `get_cycle_start_day(db, tg_user_id)` — нужен в D-52 при resolve period для нового tx_date.
- Domain exception pattern (raise → route maps) — установлен в Phase 2/3.
- Bot `api_client.bind_chat_id` — шаблон httpx-вызовов с X-Internal-Token; расширяем 3 новых метода.
- BottomSheet + parseRublesToKopecks/formatKopecksToRubles + apiFetch + useCurrentPeriod + useCategories — full reuse.
- Pattern «mutation → refetch + toast + busy guard + mutationError» из `PlannedScreen` — копируем.

### Established Patterns
- Async SQLAlchemy session-per-request через `Depends(get_db)`.
- Pydantic v2 response_model на каждом эндпоинте.
- structlog для логирования.
- BIGINT копейки.
- Snake_case в API/DB; mirror types.ts для frontend.
- Inline-edit Enter/Esc — НЕ применяется в actual (нет inline-edit, only sheet) — упрощение.
- Group-by-kind визуально: для actual — group-by-date (отличие, см. D-65).
- `_require_db` self-skip pattern в integration-тестах.
- Internal endpoints НЕ выставляются Caddy наружу; X-Internal-Token обязателен.

### Integration Points
- `bot` ↔ `api`: 3 новых internal endpoint'а (D-46). Бот вызывает их через httpx с `X-Internal-Token`.
- `worker`: НЕ задействован в Phase 4.
- `frontend` ↔ `api`: новый префикс `/api/v1/actual/*` + `/api/v1/periods/{id}/actual` + `/api/v1/actual/balance`. Все через apiFetch + initData header.

### New Modules to Create

**Backend:**
- `app/services/actual.py` — CRUD + balance + period resolve.
- `app/services/internal_bot.py` — bot-specific orchestration (dispatcher + formatters).
- `app/api/schemas/actual.py` — Pydantic schemas (ActualCreate/Update/Read + BalanceResponse + BalanceCategoryRow).
- `app/api/schemas/internal_bot.py` — Pydantic schemas (BotActualRequest/Response, BotBalanceRequest/Response, BotTodayRequest/Response, CategoryCandidate).
- `app/api/routes/actual.py` — actual_router (public).
- `app/api/routes/internal_bot.py` — internal_bot_router (под internal_router).

**Bot:**
- `app/bot/parsers.py` — `parse_amount`, `parse_add_command`.
- `app/bot/disambiguation.py` — in-memory pending state + TTL cleanup.
- `app/bot/commands.py` — новые command handlers (`cmd_add`, `cmd_income`, `cmd_balance`, `cmd_today`, `cmd_app`, `cb_disambiguation`). Регистрируется через `router` (новый Router в этом модуле или extend existing).
- `app/bot/api_client.py` — РАСШИРИТЬ: `bot_create_actual`, `bot_get_balance`, `bot_get_today`.

**Frontend:**
- `frontend/src/components/ActualEditor.tsx` (+ `.module.css`).
- `frontend/src/screens/ActualScreen.tsx` (+ `.module.css`).
- `frontend/src/components/Fab.tsx` (+ `.module.css`) — FAB-кнопка для HomeScreen и ActualScreen (опционально один компонент или inline).
- `frontend/src/api/actual.ts` — apiFetch wrappers (listActual, createActual, updateActual, deleteActual, getBalance).
- `frontend/src/hooks/useActual.ts` — fetch актуалов периода.
- `frontend/src/hooks/useBalance.ts` — fetch баланса (опционально, можно inline).
- `frontend/src/api/types.ts` — РАСШИРИТЬ: `ActualSource`, `ActualRead`, `ActualCreatePayload`, `ActualUpdatePayload`, `BalanceResponse`, `BalanceCategoryRow`.
- `frontend/src/screens/HomeScreen.tsx` — РАСШИРИТЬ: FAB + nav «Факт».
- `frontend/src/App.tsx` — РАСШИРИТЬ: добавить `'actual'` в Screen union.

### Files Modified Across Plans (для wave-распределения)

| File | Plan(s) |
|------|---------|
| `tests/test_actual_*.py` (4 file) | 04-01 |
| `app/api/schemas/actual.py` | 04-02 |
| `app/api/schemas/internal_bot.py` | 04-02 |
| `app/services/actual.py` | 04-02 |
| `app/services/internal_bot.py` | 04-02 |
| `app/api/routes/actual.py` | 04-03 |
| `app/api/routes/internal_bot.py` | 04-03 |
| `app/api/router.py` | 04-03 (register new sub-routers) |
| `app/bot/parsers.py` | 04-04 |
| `app/bot/disambiguation.py` | 04-04 |
| `app/bot/commands.py` | 04-04 |
| `app/bot/api_client.py` | 04-04 (extend) |
| `main_bot.py` | 04-04 (include new router) |
| `frontend/src/components/ActualEditor.tsx` | 04-05 |
| `frontend/src/components/Fab.tsx` | 04-05 |
| `frontend/src/api/actual.ts` | 04-05 |
| `frontend/src/api/types.ts` | 04-05 (extend) |
| `frontend/src/hooks/useActual.ts` | 04-05 |
| `frontend/src/screens/ActualScreen.tsx` | 04-06 |
| `frontend/src/screens/HomeScreen.tsx` | 04-06 (extend) |
| `frontend/src/App.tsx` | 04-06 (extend) |
| (final integration verification only) | 04-07 |

**Wave-3 parallelism:** Plans 04-04 (bot), 04-05 (frontend components/api/hooks/types), 04-06 (frontend screens/wiring) пересекаются в `frontend/src/api/types.ts` (04-05 и 04-06 оба могут читать, но РАСШИРЯЕТ только 04-05). 04-06 импортирует из 04-05. Поэтому **04-04 || (04-05 → 04-06)** — два потока. Чтобы избежать ожидания, разделяем строго: 04-05 = «реквизиты» (api/hooks/types/components), 04-06 = «экраны и навигация» — 04-06 depends on 04-05. Bot план 04-04 работает параллельно обоим backend артефактам Wave 1+2 уже завершены, frontend ему не нужен.

</code_context>

<specifics>
## Specific Ideas

### `_resolve_period_for_date` algorithm (D-52)

```python
async def _resolve_period_for_date(
    db: AsyncSession, tx_date: date, *, cycle_start_day: int
) -> int:
    """Lookup BudgetPeriod containing tx_date, or create one if missing.

    1. SELECT id FROM budget_period WHERE period_start <= tx_date <= period_end
       ORDER BY period_start DESC LIMIT 1.
    2. If found — return id.
    3. Else: compute (period_start, period_end) = period_for(tx_date, cycle_start_day).
       Insert BudgetPeriod with status='active' if today within bounds, else 'closed'
       (closed_at=NULL because never user-closed; ending_balance_cents=NULL).
       Return new id.
    """
    stmt = (
        select(BudgetPeriod.id)
        .where(
            BudgetPeriod.period_start <= tx_date,
            BudgetPeriod.period_end >= tx_date,
        )
        .order_by(BudgetPeriod.period_start.desc())
        .limit(1)
    )
    existing = await db.scalar(stmt)
    if existing is not None:
        return existing

    p_start, p_end = period_for(tx_date, cycle_start_day)
    today = _today_in_app_tz()
    status = (
        PeriodStatus.active if p_start <= today <= p_end else PeriodStatus.closed
    )
    period = BudgetPeriod(
        period_start=p_start,
        period_end=p_end,
        starting_balance_cents=0,  # unknown for retroactive periods
        ending_balance_cents=None,
        status=status,
    )
    db.add(period)
    await db.flush()
    return period.id
```

### `compute_balance` algorithm (D-46 / D-60)

```python
async def compute_balance(db: AsyncSession, period_id: int) -> dict:
    """Aggregate planned/actual per category + totals for a period.

    Returns:
        {
            "period_id": int,
            "period_start": date,
            "period_end": date,
            "starting_balance_cents": int,
            "planned_total_expense_cents": int,
            "actual_total_expense_cents": int,
            "planned_total_income_cents": int,
            "actual_total_income_cents": int,
            "balance_now_cents": int,  # starting + actual_income - actual_expense
            "delta_total_cents": int,  # (plan_exp - act_exp) + (act_inc - plan_inc) — D-02 sign rule
            "by_category": [
                {category_id, name, kind, planned_cents, actual_cents, delta_cents}, ...
            ],
        }
    """
    period = await db.get(BudgetPeriod, period_id)
    if period is None:
        raise PeriodNotFoundError(period_id)

    # Per-category aggregation via two queries (planned + actual GROUP BY category)
    planned_q = (
        select(
            PlannedTransaction.category_id,
            PlannedTransaction.kind,
            func.sum(PlannedTransaction.amount_cents).label("planned_cents"),
        )
        .where(PlannedTransaction.period_id == period_id)
        .group_by(PlannedTransaction.category_id, PlannedTransaction.kind)
    )
    actual_q = (
        select(
            ActualTransaction.category_id,
            ActualTransaction.kind,
            func.sum(ActualTransaction.amount_cents).label("actual_cents"),
        )
        .where(ActualTransaction.period_id == period_id)
        .group_by(ActualTransaction.category_id, ActualTransaction.kind)
    )
    cats_q = select(Category).where(Category.is_archived.is_(False))

    planned_rows = (await db.execute(planned_q)).all()
    actual_rows = (await db.execute(actual_q)).all()
    cats = {c.id: c for c in (await db.execute(cats_q)).scalars().all()}

    planned_map = {(r.category_id, r.kind): r.planned_cents for r in planned_rows}
    actual_map = {(r.category_id, r.kind): r.actual_cents for r in actual_rows}

    by_category: list[dict] = []
    seen_keys = set(planned_map) | set(actual_map)
    for (cat_id, kind) in seen_keys:
        cat = cats.get(cat_id)
        if cat is None:
            continue  # archived category — skip
        plan = planned_map.get((cat_id, kind), 0) or 0
        act = actual_map.get((cat_id, kind), 0) or 0
        # D-02 sign rule
        if kind == CategoryKind.expense:
            delta = plan - act
        else:
            delta = act - plan
        by_category.append({
            "category_id": cat_id,
            "name": cat.name,
            "kind": kind.value,
            "planned_cents": plan,
            "actual_cents": act,
            "delta_cents": delta,
        })

    plan_exp = sum(p for (_, k), p in planned_map.items() if k == CategoryKind.expense)
    act_exp = sum(a for (_, k), a in actual_map.items() if k == CategoryKind.expense)
    plan_inc = sum(p for (_, k), p in planned_map.items() if k == CategoryKind.income)
    act_inc = sum(a for (_, k), a in actual_map.items() if k == CategoryKind.income)

    balance_now = period.starting_balance_cents + act_inc - act_exp
    delta_total = (plan_exp - act_exp) + (act_inc - plan_inc)

    return {
        "period_id": period.id,
        "period_start": period.period_start,
        "period_end": period.period_end,
        "starting_balance_cents": period.starting_balance_cents,
        "planned_total_expense_cents": plan_exp,
        "actual_total_expense_cents": act_exp,
        "planned_total_income_cents": plan_inc,
        "actual_total_income_cents": act_inc,
        "balance_now_cents": balance_now,
        "delta_total_cents": delta_total,
        "by_category": by_category,
    }
```

### `parse_amount` algorithm (D-49)

```python
import re

_AMOUNT_RE = re.compile(r"^(\d{1,3}(?:[\s ]\d{3})*|\d+)([.,](\d{1,2}))?$")

def parse_amount(s: str) -> int | None:
    """Parse '1500', '1500.50', '1 500', '1500р', '1500₽' → kopecks; None on error."""
    s = s.strip()
    for suffix in ("₽", "руб", "р"):
        if s.lower().endswith(suffix):
            s = s[: -len(suffix)].strip()
    s = s.replace(",", ".")
    s_no_space = s.replace(" ", "").replace(" ", "")
    try:
        f = float(s_no_space)
    except ValueError:
        return None
    if f <= 0:
        return None
    cents = round(f * 100)
    if cents > 10**12:  # 10 трлн копеек = 100 млрд рублей — overflow
        return None
    return cents
```

### `parse_add_command` algorithm (D-50)

```python
def parse_add_command(args: str | None) -> tuple[int, str, str | None] | None:
    """Parse '/add <amount> <category_query> [description]' args (without leading /add).

    Returns (amount_cents, category_query, description_or_None) or None on failure.
    """
    if not args:
        return None
    tokens = args.strip().split()
    if len(tokens) < 2:
        return None
    amount_cents = parse_amount(tokens[0])
    if amount_cents is None:
        return None
    category_query = tokens[1]
    description = " ".join(tokens[2:]) if len(tokens) > 2 else None
    return amount_cents, category_query, description
```

### Disambiguation cache (D-47, D-48)

```python
# app/bot/disambiguation.py
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

TTL = timedelta(minutes=5)

@dataclass
class PendingActual:
    chat_id: int
    kind: str  # 'expense' | 'income'
    amount_cents: int
    description: Optional[str]
    tx_date: Optional[str]  # ISO date or None (defaults to today server-side)
    candidates: list[dict]  # list of CategoryCandidate dicts
    created_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() - self.created_at > TTL

_PENDING: dict[str, PendingActual] = {}


def store_pending(p: PendingActual) -> str:
    """Store pending state; returns short token (8 hex chars) for callback_data."""
    token = uuid4().hex[:8]
    _PENDING[token] = p
    _gc()
    return token


def pop_pending(token: str) -> Optional[PendingActual]:
    """Retrieve and remove pending state; returns None if missing or expired."""
    p = _PENDING.pop(token, None)
    if p is None or p.is_expired:
        return None
    return p


def _gc() -> None:
    """Drop expired entries on every store (cheap; cardinality low)."""
    expired = [k for k, v in _PENDING.items() if v.is_expired]
    for k in expired:
        del _PENDING[k]
```

### Frontend types (mirror Pydantic)

```typescript
// frontend/src/api/types.ts (additions)
export type ActualSource = 'mini_app' | 'bot';

export interface ActualRead {
  id: number;
  period_id: number;
  kind: CategoryKind;
  amount_cents: number;
  description: string | null;
  category_id: number;
  tx_date: string;       // ISO date
  source: ActualSource;
  created_at: string;    // ISO datetime
}

export interface ActualCreatePayload {
  kind: CategoryKind;
  amount_cents: number;
  description?: string | null;
  category_id: number;
  tx_date: string;       // ISO date — required
}

export interface ActualUpdatePayload {
  kind?: CategoryKind;
  amount_cents?: number;
  description?: string | null;
  category_id?: number;
  tx_date?: string;
}

export interface BalanceCategoryRow {
  category_id: number;
  name: string;
  kind: CategoryKind;
  planned_cents: number;
  actual_cents: number;
  delta_cents: number;
}

export interface BalanceResponse {
  period_id: number;
  period_start: string;
  period_end: string;
  starting_balance_cents: number;
  planned_total_expense_cents: number;
  actual_total_expense_cents: number;
  planned_total_income_cents: number;
  actual_total_income_cents: number;
  balance_now_cents: number;
  delta_total_cents: number;
  by_category: BalanceCategoryRow[];
}
```

</specifics>

<deferred>
## Deferred Ideas

- **Search by description (`?q=foo`)** — HLD §4.6 упоминает, но в MVP не покрываем. Single-tenant, ≤ 1000 строк/период, фильтр через UI достаточно.
- **Bot команды редактирования/удаления** (`/edit`, `/delete`) — out of scope. Управление через Mini App.
- **Категория-сортировка по usage frequency** в `find_categories_by_query` (был в scope_to_plan) — отложено: преждевременная оптимизация для single-tenant с ≤14 категориями. Будет добавлено если пользователь жалуется на UX.
- **Refactor `parseRublesToKopecks` в `frontend/src/lib/money.ts`** — отложено: пока используется в 2 файлах (PlanItemEditor + ActualEditor); refactor когда понадобится третий потребитель.
- **Webhook режим бота** — long-poll сохраняем (D-04 Phase 1).
- **Bot команды для plan/template** — out of scope MVP.
- **Bot push-уведомления** — Phase 6 (SUB-03).
- **Per-actual undo через бот** — out of scope.
- **MainButton on ActualScreen** для «+ Трата» — заменено на FAB (более типично для финансовых приложений; MainButton зарезервирован для primary-action на каждом экране отдельно, может конфликтовать).
- **Multiple categories matching by usage history** (учитывать какую категорию пользователь выбрал в прошлый раз для того же query) — отложено.
- **Drag-to-dismiss bottom-sheet** — D-40 paragraph «не делать swipe-to-dismiss» — переиспользуем.
- **Группировка ActualScreen «по категории» вместо «по дате»** — D-65 фиксирует by-date; альтернативная вьюшка отложена.
- **Inline-edit amount на ActualRow** (как в PlanRow) — отложено: для факт-трат меньше потребности в quick-fix; редактирование через sheet достаточно.
- **CSV-экспорт actual'ов периода** — out of scope (REQUIREMENTS.md OUT OF SCOPE).
- **Балансер worker'ом по запросу /balance — пересчёт ending_balance_forecast** — Phase 5 (DSH-01 hero-card).

</deferred>

---

*Phase: 04-actual-transactions-and-bot-commands*
*Context gathered: 2026-05-02 (auto mode)*
