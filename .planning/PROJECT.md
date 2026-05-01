# TG Budget Planner

## What This Is

Личный Telegram Mini App для планирования и ведения месячного бюджета — перенос функционала Google-таблицы заказчика (план/факт по категориям, шаблон плана, подписки с напоминаниями) в TG-приложение с быстрым вводом трат через Mini App или бот-команды. Single-tenant: один пользователь, авторизация по `tg_user_id` через `OWNER_TG_ID`.

## Core Value

В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.

## Requirements

### Validated

(None yet — ship to validate)

### Active

#### Auth & Onboarding
- [ ] **AUTH-01**: Telegram `initData` валидируется HMAC-SHA256 с `bot_token`, `auth_date` ≤ 24ч
- [ ] **AUTH-02**: Whitelist через ENV `OWNER_TG_ID`, всё остальное → 403
- [ ] **ONB-01**: При первом запуске пользователь видит scrollable-page с нумерованными секциями: bot bind → стартовый баланс → cycle_start_day → seed категорий
- [ ] **ONB-02**: Если `chat_id` неизвестен — секция bot bind активна с кнопкой `tg.openTelegramLink(...?start=onboard)`
- [ ] **ONB-03**: Бот при `/start` сохраняет `tg_chat_id` для push-уведомлений

#### Категории
- [ ] **CAT-01**: CRUD категорий (kind expense/income, name, sort_order, is_archived)
- [ ] **CAT-02**: Мягкая архивация — архивированная категория исчезает из выпадающих списков, исторические записи остаются
- [ ] **CAT-03**: Дефолтный seed-набор из 14 категорий (как в исходной xlsx) предлагается в onboarding

#### Период бюджета
- [ ] **PER-01**: Период определяется глобальной настройкой `cycle_start_day` (default = 5), редактируется в Settings
- [ ] **PER-02**: При первом периоде пользователь вводит `starting_balance` вручную
- [ ] **PER-03**: Каждый последующий период автоматически наследует `starting_balance` = `ending_balance` предыдущего
- [ ] **PER-04**: Шедулер автоматически закрывает период в день `cycle_start_day` 00:01 МСК и создаёт следующий
- [ ] **PER-05**: При создании нового периода развёртывается `PlanTemplate`

#### Шаблон плана
- [ ] **TPL-01**: Один `PlanTemplate` на пользователя, состоит из `PlanTemplateItem` (category, amount, description, day_of_period опц.)
- [ ] **TPL-02**: CRUD строк шаблона (Grouped by category UI с inline-редактированием суммы + bottom-sheet для полного редактора)
- [ ] **TPL-03**: Кнопка «Перенести текущий план в шаблон» (snapshot)
- [ ] **TPL-04**: Кнопка «Применить шаблон» (idempotent, безопасный повтор)

#### Плановые транзакции
- [ ] **PLN-01**: CRUD строк плана текущего периода (group by category + inline edit + sheet)
- [ ] **PLN-02**: Источник создания: template-разворот / manual / subscription_auto
- [ ] **PLN-03**: Строка от подписки маркируется визуально («🔁 from subscription»)

#### Фактические транзакции
- [ ] **ACT-01**: Bottom-sheet форма добавления факт-транзакции (Mini App): сумма, kind, категория, описание, дата (default — сегодня)
- [ ] **ACT-02**: Период факт-транзакции вычисляется по `tx_date` + `cycle_start_day`
- [ ] **ACT-03**: Бот-команды `/add <сумма> <категория>` и `/income <сумма> <категория>` создают факт-транзакции
- [ ] **ACT-04**: Бот-команды `/balance`, `/today`, `/app` выводят соответствующие данные
- [ ] **ACT-05**: При неоднозначном category-query бот показывает inline-кнопки выбора

#### Дашборд (Summary)
- [ ] **DSH-01**: Главный экран Mini App с tabs «Расходы / Доходы», hero-карточкой баланса, aggr-блоком План/Факт/Δ, плотным списком категорий с прогресс-барами
- [ ] **DSH-02**: Знак дельты — «положительная = хорошо»: расходы `План−Факт`, доходы `Факт−План`
- [ ] **DSH-03**: Состояния дашборда: empty (нет плана), in-progress, overspend (>100% = красный border + бейдж), warn (≥80% = жёлтый)
- [ ] **DSH-04**: Closed-период: read-only, MainButton дизейблен, бейдж «Закрыт»
- [ ] **DSH-05**: Переключатель периодов (← / →), архивные периоды доступны только для просмотра

#### Подписки
- [ ] **SUB-01**: CRUD подписок (name, amount, cycle mo/yr, next_charge_date, category, notify_days_before)
- [ ] **SUB-02**: Список подписок с горизонтальным таймлайном на месяц (today-line, цветовая логика: ≤2 дня = красный, ≤7 = жёлтый)
- [ ] **SUB-03**: Шедулер ежедневно 09:00 МСК отправляет push за `notify_days_before` дней до списания
- [ ] **SUB-04**: Шедулер ежедневно 00:05 МСК создаёт `PlannedTransaction` (source=subscription_auto) и сдвигает `next_charge_date`
- [ ] **SUB-05**: Unique `(subscription_id, original_charge_date)` в `planned_transaction` для защиты от дублей

#### Settings
- [ ] **SET-01**: Настройка `cycle_start_day` (1..28), применяется только к будущим периодам
- [ ] **SET-02**: Настройка `notify_days_before` для подписок (default = 2)

### Out of Scope

- Multi-tenant / SaaS — это личный pet
- Семейный учёт / роли пользователей — категории «Здоровье Наташи» и т.п. трактуются как обычные категории
- Мультивалютность — только RUB
- Импорт CSV/выписок банка — ручной ввод и бот-команды покрывают MVP
- Импорт исходного xlsx — старт с нуля
- Графики/тренды по месяцам — отложено в post-MVP, в MVP только сводка текущего периода
- Алерты перерасхода в push — только визуальные (warn/danger в UI), без push
- Веб-версия вне TG — только Mini App
- Backup/restore через xlsx-выгрузку — отложено
- Привязка ActualTransaction к конкретной строке плана — агрегация только на уровне категории
- Дедупликация подписок при ручном вводе — пользователь сам удаляет дубль
- Оффлайн-режим / локальный кэш — серверная БД, online-only

## Context

**Источник продукта:** Google-таблица `Google Monthly Budget 2026.02.xlsx` с 5 листами: Summary, Plan, Transactions, Мои подписки + рабочий черновик. Все ключевые поля и связи задокументированы в `docs/BRD.md` v0.2.

**Дизайн:** banking-premium dark TG Mini App. Hero-карточки с градиентом + glow, tabular-числа, цветовая логика дельты (зелёный = хорошо). Полный набор экранов проработан в `.planning/sketches/` (winners 001-B, 002-B, 003 all states, 004-A, 005-B, 006-B). Дизайн-система зафиксирована в `.planning/sketches/themes/default.css`.

**Архитектура:** 5 docker-контейнеров (caddy / api / bot / worker / db). Все сервисы шарят один Python-codebase, точки входа разные. Подробно в `docs/HLD.md` v0.1.

**Шедулер:** APScheduler в отдельном процессе с PostgreSQL advisory locks для координации с API. 3 cron-джобы: уведомления о подписках (09:00), автогенерация плана от подписок (00:05), автозакрытие периода (00:01).

## Constraints

- **Tech stack — backend**: Python 3.12 + FastAPI + SQLAlchemy 2.x (async) + Pydantic v2. Зафиксировано опросом.
- **Tech stack — bot**: aiogram 3.x. Один процесс, отдельный контейнер.
- **Tech stack — frontend**: React 18 + Vite + TypeScript + `@telegram-apps/sdk-react`. UI-kit ещё открыт (Q-7).
- **Tech stack — DB**: PostgreSQL 16. Деньги хранятся как `BIGINT` копейки.
- **Tech stack — scheduler**: APScheduler с PostgreSQL jobstore.
- **Hosting**: VPS (Hetzner / Timeweb / Yandex Cloud), docker-compose, Caddy для TLS.
- **Timezone**: расчёты периодов и шедулер в `Europe/Moscow`, БД в UTC.
- **Security**: Telegram `initData` HMAC-SHA256 валидация, `OWNER_TG_ID` whitelist, internal token для bot↔api.
- **Performance**: < 300 мс TTFB при < 1000 транзакций/период.
- **Backup**: pg_dump nightly, RPO ≤ 24ч, RTO best-effort.
- **No multi-tenant in DB schema**: упрощение для pet, миграция на multi-tenant потребует добавления `user_id` во все таблицы.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single-tenant без `user_id` в FK | Упрощение для pet; миграция возможна позже | — Pending |
| `cycle_start_day` настраиваемый, default = 5 | Соответствует payroll-циклу заказчика | — Pending |
| Дельта расходов = `План−Факт`, доходов = `Факт−План` | Единое правило «положительная = хорошо», зелёный = всегда хорошо | — Pending |
| Деньги в копейках (BIGINT) | Избежать ошибок округления float | — Pending |
| Bottom-sheet как универсальный edit-pattern | Sketch 002-B winner, переиспользуется в 005-B | — Pending |
| Tabs Расходы/Доходы вместо stacked sections | Sketch 001-B winner, лучше в 375px | — Pending |
| Подписки: горизонтальный timeline + список | Sketch 004-A winner | — Pending |
| Onboarding: scrollable-page с нумерованными секциями | Sketch 006-B winner | — Pending |
| Категории — мягкая архивация, без удаления | Сохраняет историческую целостность | — Pending |
| Дубли подписок — без автоматической дедупликации | Маркер «🔁 from subscription», пользователь удаляет вручную | — Pending |
| Worker как отдельный контейнер | Чистое разделение API и cron-задач | — Pending |
| Frontend = React 18 + Vite + `@telegram-apps/sdk-react` | Самая большая экосистема, быстрый старт | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-01 after initialization (synthesized from docs/BRD.md v0.2, docs/HLD.md v0.1, .planning/sketches/)*
