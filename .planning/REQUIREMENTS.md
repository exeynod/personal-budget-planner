# Requirements: TG Budget Planner

**Defined:** 2026-05-01
**Core Value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.

## v1 Requirements

Requirements for initial release. Каждый замаплен на ровно одну фазу roadmap'а.

### Auth & Onboarding

- [ ] **AUTH-01**: Telegram `initData` валидируется HMAC-SHA256 с `bot_token`, `auth_date` ≤ 24ч
- [ ] **AUTH-02**: Whitelist через ENV `OWNER_TG_ID`, всё остальное → 403
- [ ] **ONB-01**: Onboarding-экран — single-page scrollable с нумерованными секциями (1 bot bind / 2 starting balance / 3 cycle_start_day / 4 seed категории)
- [ ] **ONB-02**: Если `chat_id` неизвестен — секция bot bind активна с кнопкой `tg.openTelegramLink(...?start=onboard)`
- [ ] **ONB-03**: Бот при `/start` сохраняет `tg_chat_id` в БД для push-уведомлений

### Categories

- [ ] **CAT-01**: CRUD категорий через REST API + UI (kind expense/income, name, sort_order)
- [ ] **CAT-02**: Мягкая архивация — `is_archived=true` скрывает категорию из выбора, исторические записи остаются
- [ ] **CAT-03**: Дефолтный seed-набор из 14 категорий (как в исходной xlsx) предлагается в onboarding шаге 4

### Budget Period

- [ ] **PER-01**: Период определяется глобальной настройкой `cycle_start_day` (1..28, default = 5)
- [ ] **PER-02**: При onboarding пользователь вводит `starting_balance` для первого периода
- [ ] **PER-03**: Каждый последующий период автоматически наследует `starting_balance` = `ending_balance` предыдущего
- [ ] **PER-04**: Worker-job ежедневно 00:01 МСК закрывает истёкший активный период и создаёт следующий
- [ ] **PER-05**: При создании нового периода развёртывается `PlanTemplate` (idempotent)

### Plan Template

- [ ] **TPL-01**: Один `PlanTemplate` на пользователя, каждый item: category, amount, description, day_of_period (опц.)
- [ ] **TPL-02**: CRUD строк шаблона через UI (Grouped by category + inline-редактирование суммы + bottom-sheet для полного редактора)
- [ ] **TPL-03**: Кнопка «Перенести текущий план в шаблон» — snapshot активного периода в шаблон
- [ ] **TPL-04**: Endpoint `/periods/{id}/apply-template` идемпотентен — повторный вызов не создаёт дубли

### Planned Transactions

- [ ] **PLN-01**: CRUD строк плана текущего периода (group by category + inline edit + bottom-sheet)
- [ ] **PLN-02**: Источник создания (`source` enum): template / manual / subscription_auto
- [ ] **PLN-03**: Строка от подписки маркируется визуально («🔁 from subscription»)

### Actual Transactions

- [ ] **ACT-01**: Bottom-sheet форма добавления факт-транзакции (Mini App): сумма, kind, категория, описание, дата (default — сегодня)
- [ ] **ACT-02**: Период факт-транзакции вычисляется по `tx_date` + текущий `cycle_start_day`
- [ ] **ACT-03**: Бот-команды `/add <сумма> <category_query> [описание]` и `/income <...>` создают факт-транзакции
- [ ] **ACT-04**: Бот-команды `/balance`, `/today`, `/app` выводят соответствующие данные
- [ ] **ACT-05**: При неоднозначном `category_query` (≥2 совпадения) бот показывает inline-кнопки выбора

### Dashboard (Summary)

- [ ] **DSH-01**: Главный экран Mini App — tabs Расходы/Доходы + hero-карточка баланса + aggr-блок План/Факт/Δ + плотный список категорий с прогресс-барами факт/план
- [ ] **DSH-02**: Знак дельты «положительная = хорошо»: расходы `План−Факт`, доходы `Факт−План`. Зелёный для положительной, красный для отрицательной
- [ ] **DSH-03**: Состояние in-progress: warn-стили (≥80% = жёлтая обводка), danger-стили (>100% = красная обводка + бейдж процента)
- [ ] **DSH-04**: Состояние empty (нет плана): empty-state с кнопками «Применить шаблон» / «Добавить вручную»
- [ ] **DSH-05**: Состояние closed: read-only, MainButton дизейблен с надписью «Период закрыт», бейдж «Закрыт» на period-switcher
- [ ] **DSH-06**: Переключатель периодов (← / →); навигация в архивные периоды только для просмотра

### Subscriptions

- [ ] **SUB-01**: CRUD подписок через UI (name, amount, cycle ∈ {monthly, yearly}, next_charge_date, category, notify_days_before, is_active)
- [ ] **SUB-02**: Список подписок с горизонтальным таймлайном на месяц (today-line, цветовая логика: ≤2 дня = красный, ≤7 = жёлтый)
- [ ] **SUB-03**: Worker-job ежедневно 09:00 МСК отправляет push через бота за `notify_days_before` дней до списания
- [ ] **SUB-04**: Worker-job ежедневно 00:05 МСК создаёт `PlannedTransaction` (source=subscription_auto) и сдвигает `next_charge_date` (+1 mo / +1 yr)
- [ ] **SUB-05**: Unique constraint `(subscription_id, original_charge_date)` в `planned_transaction` для защиты от дублей при повторных запусках шедулера

### Settings

- [ ] **SET-01**: Настройка `cycle_start_day` через UI, применяется только к будущим периодам
- [ ] **SET-02**: Настройка `notify_days_before` для подписок (default = 2)

### Infrastructure

- [ ] **INF-01**: docker-compose с 5 сервисами: caddy / api / bot / worker / db; все сервисы шарят один Python-codebase
- [ ] **INF-02**: PostgreSQL 16 + Alembic-миграции; автомиграции при старте `api`
- [ ] **INF-03**: Caddy с автоматическим Let's Encrypt; внутренний docker network `bot ↔ api` не проксируется наружу
- [ ] **INF-04**: Internal API endpoints `/api/v1/internal/*` защищены `X-Internal-Token`
- [ ] **INF-05**: Health-check эндпоинты `/healthz` для api/bot, heartbeat для worker

## v2 Requirements

Deferred to future. Tracked but not in current roadmap.

### Analytics

- **ANL-01**: Графики трендов по месяцам (stacked bar по категориям)
- **ANL-02**: Top-категорий перерасхода
- **ANL-03**: Push-алерт при достижении 90% бюджета по критичной категории

### Import / Export

- **IMP-01**: Импорт CSV выписки банка с маппингом в категории
- **IMP-02**: Импорт исходного xlsx (one-shot seed)
- **EXP-01**: Экспорт периода в xlsx для бэкапа

### Multi-tenant

- **MUL-01**: Регистрация любого TG-пользователя
- **MUL-02**: Изоляция данных по `user_id`
- **MUL-03**: Биллинг / тарифы

### Other

- **OTH-01**: Мультивалютность (RUB + USD/EUR с курсом-снапшотом на дату)
- **OTH-02**: Семейный учёт с раздельными подбюджетами
- **OTH-03**: Веб-версия вне Telegram (через email/Google auth)
- **OTH-04**: Привязка ActualTransaction к конкретной строке плана
- **OTH-05**: Дедупликация подписок (фактическая транзакция → автосдвиг next_charge_date)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / SaaS | Это личный pet, single-user достаточно |
| Семейный учёт / роли | «Здоровье Наташи» и т.п. — обычные категории, не отдельные сущности |
| Мультивалютность | Только RUB; курс-снапшоты усложнят без пользы |
| Импорт CSV/выписок банка | Ручной ввод и бот-команды покрывают daily-use |
| Импорт исходного xlsx | Старт с нуля, исторические данные не нужны |
| Графики трендов | MVP-фокус — текущий период; тренды в v2 |
| Push-алерты перерасхода | Только визуальная индикация в UI, без push |
| Веб-версия вне TG | Только Mini App |
| Backup через xlsx-выгрузку | pg_dump покрывает |
| Привязка ActualTransaction к строке плана | Агрегация на уровне категории достаточна |
| Дедупликация подписок | Маркер «🔁» + ручное удаление дубля; автологика хрупкая |
| Оффлайн-режим / локальный кэш | Серверная БД, online-only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | ✓ Complete |
| AUTH-02 | Phase 1 | ✓ Complete |
| ONB-01 | Phase 2 | Pending |
| ONB-02 | Phase 2 | Pending |
| ONB-03 | Phase 2 | Pending |
| CAT-01 | Phase 2 | Pending |
| CAT-02 | Phase 2 | Pending |
| CAT-03 | Phase 2 | Pending |
| PER-01 | Phase 2 | Pending |
| PER-02 | Phase 2 | Pending |
| PER-03 | Phase 2 | Pending |
| PER-04 | Phase 5 | Pending |
| PER-05 | Phase 2 | Pending |
| TPL-01 | Phase 3 | Pending |
| TPL-02 | Phase 3 | Pending |
| TPL-03 | Phase 3 | Pending |
| TPL-04 | Phase 3 | Pending |
| PLN-01 | Phase 3 | Pending |
| PLN-02 | Phase 3 | Pending |
| PLN-03 | Phase 3 | Pending |
| ACT-01 | Phase 4 | Pending |
| ACT-02 | Phase 4 | Pending |
| ACT-03 | Phase 4 | Pending |
| ACT-04 | Phase 4 | Pending |
| ACT-05 | Phase 4 | Pending |
| DSH-01 | Phase 5 | Pending |
| DSH-02 | Phase 5 | Pending |
| DSH-03 | Phase 5 | Pending |
| DSH-04 | Phase 5 | Pending |
| DSH-05 | Phase 5 | Pending |
| DSH-06 | Phase 5 | Pending |
| SUB-01 | Phase 6 | Pending |
| SUB-02 | Phase 6 | Pending |
| SUB-03 | Phase 6 | Pending |
| SUB-04 | Phase 6 | Pending |
| SUB-05 | Phase 6 | Pending |
| SET-01 | Phase 2 | Pending |
| SET-02 | Phase 6 | Pending |
| INF-01 | Phase 1 | ✓ Complete |
| INF-02 | Phase 1 | ✓ Complete |
| INF-03 | Phase 1 | ✓ Complete |
| INF-04 | Phase 1 | ✓ Complete |
| INF-05 | Phase 1 | ✓ Complete |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43 ✓
- Unmapped: 0

**Per-phase distribution:**
- Phase 1 (Infrastructure & Auth): 7 — AUTH-01, AUTH-02, INF-01..05
- Phase 2 (Domain Foundation & Onboarding): 11 — CAT-01..03, PER-01..03, PER-05, ONB-01..03, SET-01
- Phase 3 (Plan Template & Planned Transactions): 7 — TPL-01..04, PLN-01..03
- Phase 4 (Actual Transactions & Bot Commands): 5 — ACT-01..05
- Phase 5 (Dashboard & Period Lifecycle): 7 — DSH-01..06, PER-04
- Phase 6 (Subscriptions & Worker Jobs): 6 — SUB-01..05, SET-02

---
*Requirements defined: 2026-05-01*
*Last updated: 2026-05-01 after roadmap creation (traceability filled by gsd-roadmapper)*
