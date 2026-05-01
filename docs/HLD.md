# High-Level Design: TG Mini App «Бюджет-планировщик»

> **Статус:** v0.1 — техническое проектирование на основе `docs/BRD.md` v0.2.
> **Дата:** 2026-05-01

---

## 1. Архитектура (контейнеры)

```
                    ┌────────────────────┐
                    │  Telegram Cloud    │
                    └──────┬─────────┬───┘
                           │         │
                  initData │         │ updates (long-poll/webhook)
                           ▼         ▼
              ┌─────────────────┐  ┌──────────────────┐
              │   api (FastAPI) │  │  bot (aiogram)   │
              │   :8000         │◄─┤  push sender     │
              └─────┬───────────┘  └────────┬─────────┘
                    │                       │
                    │       ┌───────────────┘
                    ▼       ▼
              ┌─────────────────┐         ┌──────────────────┐
              │  postgres:16    │◄────────┤ worker           │
              │  budget_db      │         │ (APScheduler)    │
              └─────────────────┘         └──────────────────┘
                    ▲
                    │ HTTPS
              ┌─────┴───────────┐
              │  caddy (TLS)    │
              └─────────────────┘
                    ▲
                    │
              ┌─────┴───────────┐
              │  Mini App SPA   │  (React+Vite, статика, отдаётся caddy)
              └─────────────────┘
```

**Контейнеры (docker-compose):**

| Сервис | Образ / база | Назначение |
|---|---|---|
| `caddy` | `caddy:2-alpine` | TLS + reverse proxy, отдача SPA-статики |
| `api` | собственный (FastAPI) | REST API для Mini App, валидация `initData` |
| `bot` | собственный (aiogram) | Команды бота, отправка push-сообщений |
| `worker` | собственный (APScheduler) | Шедулер: подписки, закрытие периодов, push-триггеры |
| `db` | `postgres:16-alpine` | БД, том для данных |

`api`, `bot`, `worker` шарят один codebase (Python-пакет `app`), точки входа разные.

## 2. ERD (схема БД)

```
┌──────────────────────┐        ┌──────────────────────┐
│  app_user            │        │  category            │
│──────────────────────│        │──────────────────────│
│ id PK                │        │ id PK                │
│ tg_user_id UNIQUE    │        │ name                 │
│ tg_chat_id NULLABLE  │        │ kind enum            │
│ cycle_start_day=5    │        │ is_archived          │
│ onboarded_at         │        │ sort_order           │
│ created_at           │        │ created_at           │
└──────────────────────┘        └─────────┬────────────┘
                                          │
            ┌─────────────────────────────┴─────────┐
            │                                       │
            ▼                                       ▼
┌──────────────────────┐                ┌──────────────────────┐
│  plan_template_item  │                │  subscription        │
│──────────────────────│                │──────────────────────│
│ id PK                │                │ id PK                │
│ category_id FK       │                │ name                 │
│ amount_cents         │                │ amount_cents         │
│ description          │                │ cycle enum (mo/yr)   │
│ day_of_period NULL   │                │ next_charge_date     │
│ sort_order           │                │ category_id FK       │
└──────────────────────┘                │ notify_days_before=2 │
                                        │ is_active            │
                                        └──────────────────────┘

┌──────────────────────┐        ┌──────────────────────────────┐
│  budget_period       │        │  planned_transaction         │
│──────────────────────│        │──────────────────────────────│
│ id PK                │        │ id PK                        │
│ period_start DATE    │◄───────┤ period_id FK                 │
│ period_end DATE      │        │ kind enum (expense/income)   │
│ starting_balance_c   │        │ amount_cents                 │
│ ending_balance_c     │        │ description                  │
│ status enum          │        │ category_id FK               │
│ closed_at NULL       │        │ planned_date NULL            │
│ UNIQUE(period_start) │        │ source enum                  │
└──────────┬───────────┘        │   (template/manual/sub_auto) │
           │                    │ subscription_id FK NULL      │
           │                    └──────────────────────────────┘
           │
           │                    ┌──────────────────────────────┐
           │                    │  actual_transaction          │
           └────────────────────┤──────────────────────────────│
                                │ id PK                        │
                                │ period_id FK                 │
                                │ kind enum                    │
                                │ amount_cents                 │
                                │ description                  │
                                │ category_id FK               │
                                │ tx_date DATE                 │
                                │ source enum (mini_app/bot)   │
                                │ created_at                   │
                                └──────────────────────────────┘
```

### 2.1 Соглашения

- **Деньги:** все суммы хранятся как `BIGINT` в копейках (`*_cents`).
- **Даты:** `DATE` для бизнес-дат (period, tx_date, planned_date, next_charge_date); `TIMESTAMPTZ` для аудита (`created_at`, `closed_at`, `onboarded_at`). В БД — UTC, расчёты периодов и шедулер — `Europe/Moscow`.
- **Soft delete:** только для `category` (через `is_archived`). Транзакции и подписки — hard delete.
- **Single-tenant:** в MVP `app_user` содержит ровно одну строку. FK от других таблиц на `app_user` **не вводим** — упрощаем модель. Если в будущем понадобится multi-tenant, миграция = добавление `user_id` во все таблицы.

### 2.2 Перечисления (enums)

```python
CategoryKind   = Literal["expense", "income"]
PeriodStatus   = Literal["active", "closed"]
PlanSource     = Literal["template", "manual", "subscription_auto"]
ActualSource   = Literal["mini_app", "bot"]
SubCycle       = Literal["monthly", "yearly"]
```

### 2.3 Индексы

| Таблица | Индекс | Зачем |
|---|---|---|
| `actual_transaction` | `(period_id, kind)` | агрегация для дашборда |
| `actual_transaction` | `(category_id, tx_date)` | фильтрация по категории |
| `planned_transaction` | `(period_id, kind)` | агрегация для дашборда |
| `subscription` | `(is_active, next_charge_date)` | поиск ближайших списаний шедулером |
| `budget_period` | `period_start UNIQUE` | один период на дату начала |

## 3. Расчёт периода (детали)

```python
def period_for(date: date, cycle_start_day: int) -> tuple[date, date]:
    """
    cycle_start_day=5, date=2026-02-15 → (2026-02-05, 2026-03-04)
    cycle_start_day=5, date=2026-02-03 → (2026-01-05, 2026-02-04)
    cycle_start_day=31 на февраль → используем последний день месяца.
    """
```

Edge-case: если `cycle_start_day > 28` и в каком-то месяце такого числа нет (29 фев и т. п.) — берём `min(cycle_start_day, last_day_of_month)`. Это документируется в Settings: «Если в месяце меньше дней, период начнётся в последний день».

## 4. API (REST, JSON)

Все эндпоинты под префиксом `/api/v1`, требуют заголовок `X-Telegram-Init-Data: <raw initData>`. Неавторизованный или не-owner → `403 Forbidden`. Время ответа — UTC ISO-8601, суммы в **копейках**.

### 4.1 Auth / Onboarding

| Method | Path | Описание |
|---|---|---|
| `GET` | `/me` | Текущий пользователь, `onboarded`, `cycle_start_day`, `chat_id_known: bool` |
| `POST` | `/onboarding/complete` | Body: `{starting_balance_cents, cycle_start_day, seed_default_categories}`. Создаёт первый `budget_period`, опционально засевает категории. Возвращает 200. |

### 4.2 Categories

| Method | Path | Описание |
|---|---|---|
| `GET` | `/categories?include_archived=false` | Список |
| `POST` | `/categories` | Body: `{name, kind, sort_order?}` |
| `PATCH` | `/categories/{id}` | Body: любое из `{name, sort_order, is_archived}` |

### 4.3 Plan Template

| Method | Path | Описание |
|---|---|---|
| `GET` | `/plan-template/items` | Все строки шаблона |
| `POST` | `/plan-template/items` | Body: `{category_id, amount_cents, description, day_of_period?}` |
| `PATCH` | `/plan-template/items/{id}` | Любое поле |
| `DELETE` | `/plan-template/items/{id}` | — |
| `POST` | `/plan-template/snapshot-from-period/{period_id}` | Перезаписать шаблон тек. планом периода |

### 4.4 Budget Periods

| Method | Path | Описание |
|---|---|---|
| `GET` | `/periods` | Список (year DESC), пагинация `?limit=12&before=YYYY-MM-DD` |
| `GET` | `/periods/current` | Активный период; если нет — создаст по `cycle_start_day` и развернёт шаблон |
| `GET` | `/periods/{id}/summary` | Сводка как Summary в xlsx (см. §4.7) |
| `POST` | `/periods/{id}/close` | Зафиксировать `ending_balance`, status=closed |
| `POST` | `/periods/{id}/apply-template` | Idempotent: применяет шаблон к пустому периоду |

### 4.5 Planned Transactions

| Method | Path | Описание |
|---|---|---|
| `GET` | `/periods/{id}/planned?kind=&category_id=` | Список плановых строк |
| `POST` | `/periods/{id}/planned` | Body: `{kind, amount_cents, description, category_id, planned_date?}` (source=manual) |
| `PATCH` | `/planned/{id}` | — |
| `DELETE` | `/planned/{id}` | — |

### 4.6 Actual Transactions

| Method | Path | Описание |
|---|---|---|
| `GET` | `/periods/{id}/actual?kind=&category_id=&q=` | Список факт-транзакций с поиском по описанию |
| `POST` | `/actual` | Body: `{kind, amount_cents, description, category_id, tx_date}`. Период определяется по `tx_date` + `cycle_start_day`. |
| `PATCH` | `/actual/{id}` | При изменении `tx_date` — пересчёт привязки к периоду |
| `DELETE` | `/actual/{id}` | — |

### 4.7 Period Summary (response)

```json
{
  "period": {
    "id": 12,
    "period_start": "2026-02-05",
    "period_end": "2026-03-04",
    "label": "Февраль 2026",
    "status": "active",
    "starting_balance_cents": 0,
    "ending_balance_forecast_cents": -3085000,
    "ending_balance_actual_cents": 0
  },
  "expense": {
    "plan_total_cents": 40663200,
    "actual_total_cents": 0,
    "delta_cents": 40663200,
    "by_category": [
      { "category_id": 1, "name": "Продукты", "plan_cents": 5000000, "actual_cents": 0, "delta_cents": 5000000 }
    ]
  },
  "income": {
    "plan_total_cents": 37578200,
    "actual_total_cents": 0,
    "delta_cents": -37578200,
    "by_category": []
  }
}
```

### 4.8 Subscriptions

| Method | Path | Описание |
|---|---|---|
| `GET` | `/subscriptions?is_active=true` | Список |
| `POST` | `/subscriptions` | Body: `{name, amount_cents, cycle, next_charge_date, category_id, notify_days_before?}` |
| `PATCH` | `/subscriptions/{id}` | — |
| `DELETE` | `/subscriptions/{id}` | — |
| `POST` | `/subscriptions/{id}/charge-now` | Ручной триггер: создать planned (sub_auto) и сдвинуть `next_charge_date` |

### 4.9 Settings

| Method | Path | Описание |
|---|---|---|
| `GET` | `/settings` | `{cycle_start_day}` |
| `PATCH` | `/settings` | Body: `{cycle_start_day}`. Влияет на будущие периоды. |

### 4.10 Internal (для сервиса `bot`)

Авторизация — внутренний `X-Internal-Token` (общий секрет в env, не доступен снаружи).

| Method | Path | Описание |
|---|---|---|
| `POST` | `/internal/bot/transactions` | Body: `{tg_user_id, kind, amount_cents, category_query, description}`. Бот получает результат для ответа в чат. |
| `POST` | `/internal/bot/balance` | Возвращает данные для команды `/balance`. |
| `POST` | `/internal/bot/today` | Транзакции за сегодня. |
| `POST` | `/internal/bot/chat-bound` | Сохраняет `tg_chat_id` после `/start`. |

## 5. TG-бот (команды и сценарии)

| Команда | Поведение |
|---|---|
| `/start` | Если `tg_user_id == OWNER_TG_ID` → сохранить `chat_id` (вызвать internal `/chat-bound`), ответить «Готово, push включены». Иначе ответить «Извините, бот приватный». |
| `/add <amount> <category_query> [description]` | Создать `expense` через internal API. Если совпала >1 категория — inline-кнопки выбора. Ответ: подтверждение + остаток лимита по категории. |
| `/income <amount> <category_query> [description]` | То же, но `kind=income`. |
| `/balance` | Текущий баланс + дельта по периоду. |
| `/today` | Список факт-транзакций за сегодня (топ-10). |
| `/app` | Кнопка-ссылка на Mini App. |

**Парсинг суммы:** поддержка `1500`, `1500.50`, `1 500`, `1500р`, `1500₽`. На ввод нечислового — ошибка с подсказкой синтаксиса.

## 6. Шедулер (`worker`)

APScheduler с jobstore = PostgreSQL (`apscheduler.jobstores.sqlalchemy`). Все джобы — в TZ `Europe/Moscow`.

| Job | Расписание | Действие |
|---|---|---|
| `notify_subscriptions` | ежедневно 09:00 | Найти подписки `is_active AND (next_charge_date - today).days == notify_days_before`. Через bot отправить push. |
| `charge_subscriptions` | ежедневно 00:05 | Найти подписки `is_active AND next_charge_date == today`. Создать `PlannedTransaction(source=subscription_auto, subscription_id=...)` в текущем периоде, сдвинуть `next_charge_date` (+1 mo / +1 yr). |
| `close_period` | ежедневно 00:01 | Если сегодня = `cycle_start_day`: для активного периода, чей `period_end` = вчера — закрыть (`status=closed`, `ending_balance` = расчёт). Создать новый активный период, развернуть шаблон. |

**Идемпотентность:**
- `charge_subscriptions`: ключ `(subscription_id, original_charge_date)` уникален в `planned_transaction` → unique constraint предотвращает дубли при повторном запуске в тот же день.
- `close_period`: проверяет `status` перед изменением. Запуск дважды → no-op.
- Все джобы оборачиваются в PostgreSQL advisory lock (`pg_try_advisory_lock(<job_hash>)`), чтобы исключить гонки даже при двух запущенных инстансах worker.

## 7. Auth & Security

### 7.1 Telegram initData validation
1. Извлечь `hash` из query string `initData`.
2. Сформировать `data_check_string` из остальных пар, отсортированных по ключу.
3. `secret_key = HMAC_SHA256("WebAppData", bot_token)`
4. `calc_hash = HMAC_SHA256(data_check_string, secret_key).hex()`
5. Сравнить с `hash`. Время жизни — проверка `auth_date` (≤ 24 ч).

### 7.2 Whitelist
- `OWNER_TG_ID: int` в env. Middleware FastAPI на `/api/v1/*` (кроме `/internal/*`) проверяет, что после валидации initData `user.id == OWNER_TG_ID`.
- При несовпадении → `403`.

### 7.3 Internal endpoints
- Префикс `/api/v1/internal/*`.
- Middleware: проверяет `X-Internal-Token == INTERNAL_TOKEN` (env), отдельный от bot_token.
- Не доступны снаружи: caddy не проксирует `/api/v1/internal/*` наружу (внутренний docker network `bot ↔ api`).

## 8. Конфигурация (env)

```
# Общее
DATABASE_URL=postgresql+asyncpg://budget:***@db:5432/budget_db
APP_TZ=Europe/Moscow
LOG_LEVEL=INFO

# Telegram
BOT_TOKEN=...
BOT_USERNAME=tg_budget_planner_bot
OWNER_TG_ID=123456789
MINI_APP_URL=https://budget.example.com

# Internal
INTERNAL_TOKEN=...                  # общий секрет api↔bot
API_BASE_URL=http://api:8000        # для bot/worker

# Caddy
PUBLIC_DOMAIN=budget.example.com
```

## 9. Нефункциональные ограничения

- **Health checks:** `GET /healthz` (api), `GET /healthz` для bot (long-poll alive marker), worker — heartbeat в БД.
- **Логирование:** structlog в JSON, stdout. caddy агрегирует — direct journalctl.
- **Бэкап:** еженощный pg_dump → `/var/backups/budget/` (volume на хосте). Стратегия выноса — открытый вопрос Q-9.
- **Миграции:** Alembic, автозапуск `alembic upgrade head` при старте `api`.
- **Версионирование API:** `/api/v1`, breaking changes — `/api/v2`.
- **Rate-limit:** не нужен (single-user). Ставим debounce на frontend для UC-3 (бот-парсинг ловит дубли отправки).

## 10. Риски и заметки реализации

| # | Заметка |
|---|---|
| N-1 | `subscription` → unique `(subscription_id, original_charge_date)` в `planned_transaction` обязателен **до** первого запуска шедулера, иначе дубли. |
| N-2 | При смене `cycle_start_day` пересчёта существующих периодов нет. Если пользователь поменяет в середине периода — следующий новый период будет уже с новой датой. UI должен это объяснить (тултип). |
| N-3 | `tx_date` в `actual_transaction` определяет привязку к периоду. При редактировании даты возможен переход транзакции в другой период — допустимо, пересчёт автоматический. |
| N-4 | aiogram + FastAPI в одном процессе возможны (через `asyncio.create_task`), но для надёжности и ясности логов оставляем разные контейнеры. |
| N-5 | Push не блокирует основной поток API — `bot` слушает internal endpoint `/internal/bot/notify` (добавим если потребуется) или worker напрямую через `aiogram` (короткоживущая сессия). Решить на этапе реализации. |

## 11. Открытые вопросы (HLD-уровень)

| # | Вопрос |
|---|---|
| Q-7 | UI-kit Mini App: `@telegram-apps/telegram-ui` vs shadcn vs кастом. |
| Q-8 | Привязка `actual_transaction` к периоду по `tx_date` подтверждена; нужно ли хранить также `period_id_at_creation` как историческую метку? Сейчас — нет, считается «по факту». |
| Q-9 | Куда выгружать pg_dump (S3-совместимое / локальный том + ротация). |
| Q-10 | `cycle_start_day` override на конкретный период — пока не делаем, оставляем глобальную настройку. |
| Q-11 | Нужен ли webhook-режим для бота (вместо long-poll)? Webhook требует валидный TLS endpoint, у нас он есть. Но long-poll проще для self-hosted. |
| Q-12 | Стратегия миграции `bot_token` (если его придётся перевыпустить) — документировать в runbook. |
