# Roadmap: TG Budget Planner

## Overview

MVP (milestone v0.2, **complete 2026-05-03**) перенёс личную Google-таблицу бюджета в TG Mini App: 6 фаз от пустого репозитория до работающего single-tenant продукта на VPS — инфраструктура и auth, доменное ядро (категории/периоды) с onboarding, план (шаблон + ручные строки), факт-транзакции через Mini App и бот, дашборд с lifecycle периодов, подписки с cron-джобами.

**Milestone v0.3 (active, started 2026-05-05) — «Analytics & AI»:** функциональный редизайн nav (5 табов: Главная / Транзакции / Аналитика / AI / Управление), новый экран Аналитики с трендами и прогнозом, conversational AI-помощник с tool-use над данными бюджета, AI-категоризация в форме новой транзакции через эмбеддинги.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### Milestone v0.2 — MVP (Complete)

- [x] **Phase 1: Infrastructure & Auth** — docker-compose skeleton (5 контейнеров), БД-схема + миграции, Telegram initData валидация, OWNER_TG_ID whitelist, internal token для bot↔api
- [x] **Phase 2: Domain Foundation & Onboarding** — категории CRUD + seed, period engine (cycle_start_day), onboarding scrollable-page с bot bind, settings cycle_start_day
- [x] **Phase 3: Plan Template & Planned Transactions** — шаблон плана + развёртывание на новый период, CRUD строк плана с inline-редактированием и bottom-sheet
- [x] **Phase 4: Actual Transactions & Bot Commands** — факт-транзакции через Mini App bottom-sheet, бот-команды `/add`, `/income`, `/balance`, `/today`, `/app` с парсингом и disambiguation
- [x] **Phase 5: Dashboard & Period Lifecycle** — главный экран Mini App (tabs Расходы/Доходы, hero-баланс, aggr-блок, прогресс-бары категорий), все edge-states, переключатель периодов, worker-job автозакрытия периода
- [x] **Phase 6: Subscriptions & Worker Jobs** — подписки CRUD + horizontal timeline UI, 2 cron-джобы (push 09:00, charge 00:05), notify_days_before settings

### Milestone v0.3 — Analytics & AI (Active)

- [x] **Phase 7: Nav Refactor** — функциональный bottom nav (Главная / Транзакции / Аналитика / AI / Управление), объединение History+Plan под «Транзакциями» с под-табами, переименование More→Управление, placeholder-табы «Аналитика» и «AI» (completed 2026-05-05)
- [x] **Phase 8: Analytics Screen** — экран Аналитики с трендом расходов по месяцам, топом перерасходов, топом категорий и прогнозом остатка; новые API endpoints `/api/v1/analytics/*` (completed 2026-05-05)
- [ ] **Phase 9: AI Assistant** — conversational AI с tool-use над данными бюджета (OpenAI gpt-4.1-nano), streaming SSE, prompt caching, persistence в БД, абстрактный provider-agnostic LLM-клиент
- [ ] **Phase 10: AI Categorization** — AI-предложение категории в форме новой транзакции через embeddings (text-embedding-3-small + pgvector cosine similarity)

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
**Plans**: 6 планов

Plans:
- [ ] 01-01-PLAN.md — Wave 0: test stubs (pytest infrastructure, RED тесты AUTH-01/AUTH-02/INF-04/INF-05/INF-02)
- [ ] 01-02-PLAN.md — Python skeleton: pyproject.toml, app/ пакет, settings, logging, ORM-модели 6+1 таблиц
- [ ] 01-03-PLAN.md — Frontend scaffold: Vite+React+TypeScript stub, Dockerfile.frontend
- [ ] 01-04-PLAN.md — Auth layer: validate_init_data HMAC-SHA256, dependencies, Alembic async env + начальная миграция
- [ ] 01-05-PLAN.md — Entrypoints: main_api.py (lifespan+routers), main_bot.py (polling+healthz), main_worker.py (APScheduler), entrypoint.sh
- [ ] 01-06-PLAN.md — Docker infra: Dockerfile SERVICE, docker-compose.yml 5 сервисов, Caddyfile TLS, .env.example, .gitignore

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
**Plans**: 6 планов
**UI hint**: yes

Plans:
- [x] 05-01-PLAN.md — Backend: GET /api/v1/periods + GET /api/v1/periods/{id}/balance endpoints (DSH-06)
- [x] 05-02-PLAN.md — Worker: close_period_job (PER-04 + PER-03 inheritance) с pg_try_advisory_lock + cron 00:01 МСК
- [ ] 05-03-PLAN.md — Frontend data-layer: utils/format (formatKopecks*), api/periods.ts, hooks usePeriods + useDashboard
- [x] 05-04-PLAN.md — Frontend components: HeroCard, PeriodSwitcher, AggrStrip, DashboardCategoryRow (+ CSS modules)
- [x] 05-05-PLAN.md — Frontend integration: HomeScreen full replacement + edge states (empty/warn/overspend/closed) + FAB/MainButton wiring
- [x] 05-06-PLAN.md — Verification: pytest + tsc + vite build regression + UAT visual checklist + PER-04 manual trigger + 05-VERIFICATION.md

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
**Plans**: 7 планов
**UI hint**: yes

Plans:
- [x] 06-01-PLAN.md — Wave 0: RED тесты подписок (test_subscriptions.py, D-87) + worker tests scaffold (test_worker_charge.py, D-88)
- [x] 06-02-PLAN.md — DB + Service layer: notify_days_before migration (0002), Subscription service, charge_subscription shared logic, AlreadyChargedError, Settings extension
- [x] 06-03-PLAN.md — API routes: subscriptions router (CRUD + charge-now), settings PATCH extension, router.py registration
- [x] 06-04-PLAN.md — Worker cron jobs: notify_subscriptions_job (09:00, lock 20250502) + charge_subscriptions_job (00:05, lock 20250503), main_worker.py registration
- [x] 06-05-PLAN.md — Frontend data layer: api/subscriptions.ts, api/types.ts extend, hooks useSubscriptions, SubscriptionEditor component
- [x] 06-06-PLAN.md — Frontend UI: SubscriptionsScreen (hero + timeline + flat list), App.tsx nav, SettingsScreen notify_days_before field, HomeScreen quick-nav
- [x] 06-07-PLAN.md — Final verification: pytest + tsc + build checks, 06-VERIFICATION.md, ROADMAP Phase 6 → Complete

### Phase 7: Nav Refactor
**Goal**: Bottom nav v0.3 заменяет MVP-навигацию на функциональную (Главная / Транзакции / Аналитика / AI / Управление); существующие экраны реорганизуются без потери функциональности; placeholder-экраны «Аналитика» и «AI» содержат «Скоро будет», чтобы разблокировать UX-форму до Phase 8/9
**Depends on**: Phase 6 (milestone v0.2 complete)
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, MGT-01, MGT-02, MGT-03, MGT-04
**Success Criteria** (what must be TRUE):
  1. Bottom nav показывает ровно 5 табов с функциональными лейблами и Phosphor-иконками; AI-таб подсвечен фиолетовым (`#a78bfa`) когда активен
  2. Таб «Транзакции» содержит под-табы История / План; История группирует факт-транзакции по дням с total в day-header; План группирует по категориям с source-badge
  3. Таб «Управление» = меню-список 4 пунктов (Подписки / Шаблон / Категории / Настройки) с контекстными desc; entry-point в `SubscriptionsScreen`/`TemplateScreen`/`CategoriesScreen`/`SettingsScreen` без изменений саб-скринов
  4. Табы «Аналитика» и «AI» рендерят PageTitle + блок «Скоро будет» — placeholder для Phase 8/9
  5. Старая `BottomNav.tsx` удалена / переписана; `App.tsx` routing соответствует новой nav; e2e тесты обновлены
**Plans**: 6 планов

Plans:
- [x] 07-01-PLAN.md — Wave 0: RED e2e тесты (nav-v03.spec.ts)
- [x] 07-02-PLAN.md — Общие компоненты: BottomNav (5 табов), SubTabBar, PageTitle
- [x] 07-03-PLAN.md — TransactionsScreen: HistoryView + PlannedView + filter chips + context-aware FAB
- [x] 07-04-PLAN.md — ManagementScreen (4 пункта) + placeholder AnalyticsScreen + AiScreen
- [x] 07-05-PLAN.md — App.tsx routing rewrite + удаление MoreScreen
- [x] 07-06-PLAN.md — Verification: e2e GREEN + VERIFICATION.md + ROADMAP complete
**UI hint**: yes — sketches 007-A, 012 (all 3 states valid), 013-A

### Phase 8: Analytics Screen
**Goal**: Экран Аналитика — top-level таб с трендом расходов, топом перерасходов, топом категорий и прогнозом остатка периода; backend API возвращает агрегаты, UI рендерит SVG-чарты без внешних chart-libs
**Depends on**: Phase 7
**Requirements**: ANL-01, ANL-02, ANL-03, ANL-04, ANL-05, ANL-06, ANL-07, ANL-08
**Success Criteria** (what must be TRUE):
  1. Экран рендерит PageTitle, period chips (1/3/6/Год мес), блок «Топ перерасходов» с лево-бордером danger/warn, line chart тренда расходов, горизонтальные bars топ-категорий, forecast card
  2. API endpoints `GET /api/v1/analytics/{trend,top-overspend,top-categories,forecast}` отвечают валидной структурой и проходят contract-тесты; все агрегаты считаются на backend
  3. SVG-чарты — самописные (без recharts/visx); используют tokens-цвета и chart-палитру (chart-1..chart-6)
  4. Прогноз остатка к концу периода = текущий баланс + (плановые-факт) с linear-extrapolation темпа дневных расходов; обрабатывает edge-case первых дней периода
  5. Pytest contract-тесты + Vitest unit-тесты для ANL-* блоков
**Plans**: 5 планов

Plans:
- [x] 08-01-PLAN.md — Wave 0: RED contract-тесты для 4 analytics endpoints (test_analytics.py)
- [x] 08-02-PLAN.md — Wave 1: Backend service + schemas + API routes + router registration
- [x] 08-03-PLAN.md — Wave 2: Frontend data layer (types.ts extend, api/analytics.ts, useAnalytics hook)
- [x] 08-04-PLAN.md — Wave 3: Frontend UI — полный AnalyticsScreen + 4 chart компонента + CSS
- [x] 08-05-PLAN.md — Wave 4: Verification — pytest + tsc + vite build + VERIFICATION.md + ROADMAP Complete
**UI hint**: yes — sketch 008-A

### Phase 9: AI Assistant
**Goal**: Экран AI — conversational chat с tool-use над данными бюджета. OpenAI gpt-4.1-nano, streaming SSE, prompt caching, persistence в БД, абстрактный provider-agnostic LLM-клиент. Tools покрывают основные сценарии (баланс, топ расходов, сравнение периодов)
**Depends on**: Phase 7
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-08, AI-09, AI-10
**Success Criteria** (what must be TRUE):
  1. Экран AI рендерит PageTitle с аватаром, empty-state с suggestion chips, при отправке сообщения streaming-ответ появляется token-by-token через SSE
  2. Tool-use indicator («Смотрю март...» pulse-pill) показывается во время вызова tool; после завершения tool-call ответ AI содержит реальные данные из БД
  3. LLM-клиент `app/ai/llm_client.py` имеет `chat()` и `embed()` контракт; провайдер выбирается через ENV `LLM_PROVIDER=openai|anthropic|deepseek`, дефолт `openai`; switch на DeepSeek через ENV не требует кода
  4. Conversation persistence: новые таблицы `ai_conversation` (user_id, created_at, last_message_at) и `ai_message` (conversation_id, role, content, tool_calls, created_at); пользователь может очистить историю
  5. Prompt caching системного промпта + контекста бюджета (категории, текущий период, агрегаты) — отдельные `cache_control` блоки в OpenAI request; снижает input cost при повторных вопросах
  6. Rate limit 30 req/мин на пользователя enforced на API-слое; превышение → 429 с `Retry-After` header
**Plans**: 7 планов

Plans:
- [ ] 09-01-PLAN.md — Wave 0: RED тесты AI-слоя (test_llm_client, test_tools, test_ai_chat, test_ai_conversation_service)
- [ ] 09-02-PLAN.md — Wave 1: DB схема + Alembic 0003 (AiConversation, AiMessage) + settings LLM
- [ ] 09-03-PLAN.md — Wave 2: AbstractLLMClient + OpenAI провайдер (streaming, prompt caching)
- [ ] 09-04-PLAN.md — Wave 2: Tools registry (4 tools) + system prompt builder + conversation service + Pydantic схемы
- [ ] 09-05-PLAN.md — Wave 3: API endpoints POST /ai/chat (SSE) + GET /ai/history + DELETE /ai/conversation + rate limiter
- [ ] 09-06-PLAN.md — Wave 4: Frontend data layer (types.ts, api/ai.ts, useAiConversation, ChatMessage, ToolUseIndicator)
- [ ] 09-07-PLAN.md — Wave 5: AiScreen integration (replace placeholder, suggestion chips, streaming render, auto-scroll)
**UI hint**: yes — sketch 009-A

### Phase 10: AI Categorization
**Goal**: AI-предложение категории в форме «Новая транзакция» через embeddings и cosine similarity, без LLM-вызова на каждой транзакции (только embedding API)
**Depends on**: Phase 9 (LLM-клиент готов)
**Requirements**: AICAT-01, AICAT-02, AICAT-03, AICAT-04, AICAT-05, AICAT-06, SET-03
**Success Criteria** (what must be TRUE):
  1. При вводе описания в `ActualEditor` через ~500ms debounce backend возвращает топ-1 категорию по cosine similarity description-embedding и cached category-embeddings
  2. Если confidence ≥ 0.5 — UI показывает AI-suggestion box (имя + confidence-bar) вместо `<select>`; кнопка «Сменить» возвращает обычный select
  3. Если confidence < 0.5 — UI показывает обычный select без AI-навязывания
  4. Эмбеддинги категорий хранятся в новой таблице `category_embedding(category_id PK, vector(1536), updated_at)`; pgvector extension добавлен в Postgres init; перегенерация при изменении имени категории
  5. Toggle `enable_ai_categorization` в Settings (`SET-03`) отключает feature; default = on
  6. Pgvector index (HNSW или IVFFlat — выбрать в plan) для быстрого cosine search; для 14 категорий любой подход работает
**Plans**: TBD
**UI hint**: yes — sketch 011-A

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Внутри milestone v0.3 фазы 8 и 9 могут идти параллельно после Phase 7.

### Milestone v0.2 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Auth | 6/6 | Complete | 2026-05-02 |
| 2. Domain Foundation & Onboarding | 6/6 | Complete | 2026-05-02 |
| 3. Plan Template & Planned Transactions | 6/6 | Complete | 2026-05-03 |
| 4. Actual Transactions & Bot Commands | 6/7 | Mostly complete | - |
| 5. Dashboard & Period Lifecycle | 6/6 | Complete | 2026-05-03 |
| 6. Subscriptions & Worker Jobs | 7/7 | Complete | 2026-05-03 |

### Milestone v0.3 (Active)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Nav Refactor | 6/6 | Complete   | 2026-05-05 |
| 8. Analytics Screen | 5/5 | Complete   | 2026-05-05 |
| 9. AI Assistant | 0/0 | Pending plan | - |
| 10. AI Categorization | 0/0 | Pending plan | - |

---
*Roadmap created: 2026-05-01*
*Synthesized from docs/BRD.md v0.2, docs/HLD.md v0.1, .planning/sketches/ winners*
*Phase 1 plans created: 2026-05-01*
*Phase 5 plans created: 2026-05-03*
*Milestone v0.3 added: 2026-05-05 — phases 7-10, sketches 007-A/008-A/009-A/012/013-A*
