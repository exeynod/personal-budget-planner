# Roadmap: TG Budget Planner

## Overview

MVP перенос личной Google-таблицы бюджета в TG Mini App. Шесть фаз ведут от пустого репозитория до работающего single-tenant продукта на VPS: сначала инфраструктура и auth, затем доменное ядро (категории/периоды) с onboarding, потом план (шаблон + ручные строки), факт-транзакции через Mini App и бот, дашборд с lifecycle периодов, и в финале подписки с cron-джобами.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure & Auth** — docker-compose skeleton (5 контейнеров), БД-схема + миграции, Telegram initData валидация, OWNER_TG_ID whitelist, internal token для bot↔api
- [ ] **Phase 2: Domain Foundation & Onboarding** — категории CRUD + seed, period engine (cycle_start_day), onboarding scrollable-page с bot bind, settings cycle_start_day
- [ ] **Phase 3: Plan Template & Planned Transactions** — шаблон плана + развёртывание на новый период, CRUD строк плана с inline-редактированием и bottom-sheet
- [ ] **Phase 4: Actual Transactions & Bot Commands** — факт-транзакции через Mini App bottom-sheet, бот-команды `/add`, `/income`, `/balance`, `/today`, `/app` с парсингом и disambiguation
- [ ] **Phase 5: Dashboard & Period Lifecycle** — главный экран Mini App (tabs Расходы/Доходы, hero-баланс, aggr-блок, прогресс-бары категорий), все edge-states, переключатель периодов, worker-job автозакрытия периода
- [ ] **Phase 6: Subscriptions & Worker Jobs** — подписки CRUD + horizontal timeline UI, 2 cron-джобы (push 09:00, charge 00:05), notify_days_before settings

## Phase Details

### Phase 1: Infrastructure & Auth
**Goal**: Развёрнут технический skeleton — все 5 контейнеров поднимаются и общаются, миграции применяются автоматически, любой запрос аутентифицируется через Telegram initData с OWNER-whitelist
**Depends on**: Nothing (first phase)
**Requirements**: INF-01, INF-02, INF-03, INF-04, INF-05, AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. `docker-compose up` поднимает 5 контейнеров (caddy, api, bot, worker, db); все health-check эндпоинты возвращают 200
  2. Alembic-миграции применяются автоматически при старте api, схема БД соответствует HLD §2 (6 таблиц + enums + индексы)
  3. Запрос к `/api/v1/me` без валидной `X-Telegram-Init-Data` возвращает 403; с валидной для не-OWNER_TG_ID — тоже 403
  4. Запрос на `/api/v1/internal/*` снаружи Caddy недоступен; внутри docker network с правильным `X-Internal-Token` — отвечает 200
  5. Caddy выдаёт валидный TLS-сертификат через Let's Encrypt на `PUBLIC_DOMAIN`
**Plans**: TBD

### Phase 2: Domain Foundation & Onboarding
**Goal**: Пользователь может пройти первый запуск и получить базовую конфигурацию: bot bind, стартовый баланс, cycle_start_day, seed категорий — после этого активный период существует и категории доступны
**Depends on**: Phase 1
**Requirements**: CAT-01, CAT-02, CAT-03, PER-01, PER-02, PER-03, PER-05, ONB-01, ONB-02, ONB-03, SET-01
**Success Criteria** (what must be TRUE):
  1. Пользователь видит scrollable-onboarding с 4 пронумерованными секциями (bot bind, starting_balance, cycle_start_day, seed категорий) — паттерн sketch 006-B
  2. После `/start` в боте `tg_chat_id` сохраняется в БД, и кнопка bot bind в Mini App меняется на «✓ Привязано»
  3. После завершения onboarding создан первый `budget_period` с введённым `starting_balance`, в БД 14 seed-категорий, активный период покрывает текущую дату согласно `cycle_start_day`
  4. В разделе «Категории» можно создать/переименовать/архивировать категорию; архивированная не появляется в списках выбора, но видна в фильтре «include_archived»
  5. В Settings можно изменить `cycle_start_day` (1..28); изменение применяется только к будущим периодам (текущий не пересчитывается)
**Plans**: TBD
**UI hint**: yes

### Phase 3: Plan Template & Planned Transactions
**Goal**: Пользователь может вести шаблон плана и плановые строки текущего периода с inline-редактированием; шаблон детерминированно разворачивается в новый период
**Depends on**: Phase 2
**Requirements**: TPL-01, TPL-02, TPL-03, TPL-04, PLN-01, PLN-02, PLN-03
**Success Criteria** (what must be TRUE):
  1. На экране «Шаблон» доступен CRUD строк (group by category, inline-edit суммы, bottom-sheet для полного редактора) — паттерн sketch 005-B
  2. Кнопка «Применить шаблон» к пустому периоду создаёт плановые строки из шаблона; повторный вызов того же endpoint не создаёт дублей (idempotent)
  3. Кнопка «Перенести план в шаблон» создаёт snapshot текущих плановых строк периода в `PlanTemplate` (перезатирая старый шаблон)
  4. На экране «План текущего периода» работает CRUD плановых строк с `source=manual`; строки от шаблона имеют `source=template`
  5. План-строки от подписок (когда они появятся) корректно отображаются с маркером «🔁 from subscription» (визуальный паттерн готов и проверен на mock-данных)
**Plans**: TBD
**UI hint**: yes

### Phase 4: Actual Transactions & Bot Commands
**Goal**: Пользователь может в один тап записать факт-трату через Mini App или бот-команду, период факт-транзакции вычисляется автоматически
**Depends on**: Phase 2
**Requirements**: ACT-01, ACT-02, ACT-03, ACT-04, ACT-05
**Success Criteria** (what must be TRUE):
  1. В Mini App открывается bottom-sheet (sketch 002-B) с полями сумма/kind/категория/описание/дата (default — сегодня); сохранение создаёт `actual_transaction` с правильным `period_id` (вычисленным по `tx_date` + `cycle_start_day`)
  2. В чате бота команда `/add 1500 продукты пятёрочка` создаёт расход и отвечает подтверждением с остатком по категории; `/income` — то же для доходов
  3. При неоднозначном `category_query` (≥2 совпадения) бот показывает inline-кнопки выбора, и нажатие создаёт транзакцию
  4. Команды `/balance`, `/today`, `/app` отвечают корректными данными (баланс/дельта периода, факты за сегодня, кнопка-ссылка на Mini App)
  5. При редактировании `tx_date` уже существующей факт-транзакции она автоматически переходит в правильный период (без ручного пересчёта)
**Plans**: TBD
**UI hint**: yes

### Phase 5: Dashboard & Period Lifecycle
**Goal**: Главный экран Mini App показывает Summary как в xlsx с правильными edge-states; периоды автоматически закрываются и создаются worker-джобом
**Depends on**: Phase 3, Phase 4
**Requirements**: DSH-01, DSH-02, DSH-03, DSH-04, DSH-05, DSH-06, PER-04
**Success Criteria** (what must be TRUE):
  1. На главном экране пользователь видит tabs Расходы/Доходы, hero-карточку баланса (sketch 001-B), aggr-блок План/Факт/Δ и плотный список категорий с прогресс-барами факт/план
  2. Знак дельты следует правилу «положительная = хорошо»: расходы `План−Факт`, доходы `Факт−План`; зелёный для положительной, красный для отрицательной
  3. Все 4 состояния дашборда работают (sketch 003): empty (кнопки «Применить шаблон» / «Добавить вручную»), in-progress, warn (≥80% жёлтая обводка), overspend (>100% красная обводка + бейдж процента); closed-период доступен только для чтения с дизейбленным MainButton и бейджем «Закрыт»
  4. Переключатель периодов (← / →) перемещает по архивным периодам; в архивных недоступны мутации
  5. В день `cycle_start_day` 00:01 МСК worker-job автоматически закрывает истёкший период (фиксирует `ending_balance`) и создаёт следующий с `starting_balance = ending_balance` предыдущего; повторный запуск джобы — no-op
**Plans**: TBD
**UI hint**: yes

### Phase 6: Subscriptions & Worker Jobs
**Goal**: Пользователь ведёт список подписок с timeline-визуализацией, получает push за N дней до списания, плановые строки от подписок создаются автоматически без дублей
**Depends on**: Phase 5
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04, SUB-05, SET-02
**Success Criteria** (what must be TRUE):
  1. На экране «Подписки» (sketch 004-A) доступен CRUD подписок (name, amount, monthly/yearly, next_charge_date, category, notify_days_before, is_active) и горизонтальный таймлайн на месяц с today-line и цветовой логикой (≤2 дня — красный, ≤7 — жёлтый)
  2. Worker-job в 09:00 МСК ежедневно отправляет push через бота за `notify_days_before` дней до списания; пользователь получает сообщение в чат
  3. Worker-job в 00:05 МСК ежедневно создаёт `PlannedTransaction(source=subscription_auto)` для подписок с `next_charge_date == today` и сдвигает `next_charge_date` (+1 mo / +1 yr); повторный запуск в тот же день не создаёт дублей (защита через unique `(subscription_id, original_charge_date)`)
  4. Эндпоинт `POST /subscriptions/{id}/charge-now` ручным вызовом создаёт plan-строку и сдвигает дату — поведение идентично авто-джобе
  5. В Settings можно изменить дефолтный `notify_days_before` (применяется только к новым подпискам); существующие подписки имеют свой override
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Auth | 0/TBD | Not started | - |
| 2. Domain Foundation & Onboarding | 0/TBD | Not started | - |
| 3. Plan Template & Planned Transactions | 0/TBD | Not started | - |
| 4. Actual Transactions & Bot Commands | 0/TBD | Not started | - |
| 5. Dashboard & Period Lifecycle | 0/TBD | Not started | - |
| 6. Subscriptions & Worker Jobs | 0/TBD | Not started | - |

---
*Roadmap created: 2026-05-01*
*Synthesized from docs/BRD.md v0.2, docs/HLD.md v0.1, .planning/sketches/ winners*
