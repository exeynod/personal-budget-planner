# TG Budget Planner

## What This Is

Telegram Mini App для планирования и ведения месячного бюджета — перенос функционала Google-таблицы (план/факт по категориям, шаблон плана, подписки с напоминаниями) в TG-приложение с быстрым вводом трат через Mini App или бот-команды. После v0.3 включает экран Аналитики с трендами/прогнозом, conversational AI-помощника с tool-use над данными бюджета и AI-категоризацию через эмбеддинги. **Текущая версия — single-tenant** (один пользователь через `OWNER_TG_ID`); v0.4 переводит на multi-tenant с whitelist-подходом.

## Core Value

В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 дополнительно: получать факты о бюджете в режиме разговора («сколько на еду в марте?», «где можно сэкономить?») без необходимости копаться в дашборде.

## Current State

**Shipped:** v0.5 (2026-05-07) — Security & AI Hardening (Phase 16, 9 plans, 2 CRITICAL + 7 HIGH closed)

**Active milestone:** v0.6 — iOS App (planning)

**Codebase:**
- Backend: Python 3.12 / FastAPI / SQLAlchemy 2.x async / Pydantic v2
- Bot: aiogram 3.x
- Frontend: React 18 + Vite + TypeScript + `@telegram-apps/sdk-react`
- DB: PostgreSQL 16 + pgvector + Alembic
- AI: OpenAI gpt-4.1-mini + text-embedding-3-small (через провайдер-агностичный LLM-клиент)
- 5 docker-контейнеров: caddy / api / bot / worker / db
- Hosting: VPS + Cloudflare Tunnel (см. memory `infra-deploy.md`)

**Что работает:**
- Bottom nav 5 табов (Главная / Транзакции / Аналитика / AI / Управление)
- Дашборд Summary с edge-states (empty / warn / overspend / closed)
- CRUD категорий, плана, факт-транзакций, подписок
- Бот-команды `/add`, `/income`, `/balance`, `/today`, `/app`
- 3 cron-джобы (notify_subscriptions 09:00, charge_subscriptions 00:05, close_period 00:01)
- Аналитика: trend / top-overspend / top-categories / forecast
- AI чат с 6 tools, streaming SSE, propose-and-approve write-flow
- AI категоризация при вводе транзакции через embeddings (cosine similarity)

**Текущие ограничения:**
- Single-tenant: только `OWNER_TG_ID` имеет доступ; все доменные таблицы без `user_id` FK
- AI cost cap не enforced (только observability через `GET /ai/usage`)
- 11 deferred items (UAT/verification gaps, см. STATE.md)

## Current Milestone: v0.6 iOS App

**Goal:** Native iOS-приложение (SwiftUI), эквивалентное существующему TG Mini App. Backend остаётся неизменным — добавляется только альтернативный auth-механизм для нативного клиента (Bearer token вместо TG initData). MVP — личное использование на iPhone владельца через Free Provisioning, расширение до TestFlight для друга после оплаты Apple Developer Account.

**Target features:**
- iOS-foundation: новая SwiftUI-кодовая база в `/ios/`, design-system port из `tokens.css`, glass-эффекты через `Material`/`UIVisualEffectView`, Aurora Light + Mesh Dark фоны
- API-клиент: URLSession + Codable + async/await, обёртки над всеми существующими endpoints, SSE-парсер для AI-чата
- Auth: новый бэкенд-endpoint `POST /api/v1/auth/dev-exchange` + Bearer-fallback в `get_current_user`; iOS Keychain-хранение токена; перевод на Telegram Login Widget или Sign in with Apple после $99
- Core CRUD: 4 таб-bar экрана (Home / Transactions / AI / Management) + 6 management sub-screens + Onboarding (4-step) + TransactionEditor bottom-sheet
- AI-чат: SSE consumption, ChatMessage / ToolUseIndicator / AIProposalSheet с реализованным write-flow через стандартные `POST /actual|planned`
- Локальные нотификации: `UNUserNotificationCenter` для напоминаний о подписках (зеркалирует worker-джоб `notify_subscriptions` локально на устройстве, без APNs)
- TestFlight: $99 Apple Developer Account, App Store Connect, internal-tester для друга, опциональный переход на APNs

**Constraints:**
- iOS 17.0+ (для `@Observable`, `NavigationStack`, `MeshGradient`).
- Без сторонних библиотек: vanilla URLSession + Codable + Swift Concurrency.
- Backend остаётся работать для существующего Web Mini App без изменений (только дополнительный auth-механизм).
- Phase numbering продолжается с 17 (v0.5 закончился на Phase 16).
- Локализация только русский на старте.
- Push-уведомления: локальные на dev-фазе, APNs опционален в Phase 5.
- Money/period/balance логика — на сервере; клиент только форматирует через `NumberFormatter(ru-RU)`.

**Out of scope:**
- iPad-оптимизация (master-detail, multi-column).
- Apple Watch companion-приложение.
- Виджеты главного экрана (iOS Widgets).
- macOS / Catalyst-сборка.
- Offline-режим с локальной БД (SwiftData / Core Data) — на старте полная зависимость от API.
- Замена web-фронта на iOS — оба клиента продолжают работать параллельно.

**Контекст и план:** `~/.claude/plans/tender-hopping-simon.md`

## Requirements

### Validated (v0.2 + v0.3)

#### Auth & Onboarding (v0.2)
- ✓ AUTH-01 — Telegram initData HMAC-SHA256 валидация — v0.2 (Phase 1)
- ✓ AUTH-02 — `OWNER_TG_ID` whitelist — v0.2 (Phase 1) — *будет переработано в v0.4 на role-based*
- ✓ ONB-01..03 — onboarding scrollable-page + bot bind + chat_id capture — v0.2 (Phase 2)

#### Domain (v0.2)
- ✓ CAT-01..03 — категории CRUD + soft archive + 14 seed — v0.2 (Phase 2)
- ✓ PER-01..05 — period engine (cycle_start_day, starting_balance inheritance, auto-close, template apply) — v0.2 (Phases 2/3/5)
- ✓ TPL-01..04 — plan template CRUD + apply (idempotent) + snapshot — v0.2 (Phase 3)
- ✓ PLN-01..03 — planned transactions CRUD + source enum + subscription marker — v0.2 (Phase 3)
- ✓ ACT-01..05 — actual transactions Mini App + бот-команды + disambiguation — v0.2 (Phase 4)
- ✓ DSH-01..06 — dashboard tabs Расходы/Доходы + hero + edge-states + period switcher — v0.2 (Phase 5)
- ✓ SUB-01..05 — subscriptions CRUD + timeline + 2 cron-джобы + dedup unique constraint — v0.2 (Phase 6)
- ✓ SET-01, SET-02 — cycle_start_day, notify_days_before — v0.2 (Phases 2/6)
- ✓ INF-01..05 — docker-compose, Postgres, Caddy TLS, internal token, healthchecks — v0.2 (Phase 1)

#### v0.3 — Analytics & AI
- ✓ NAV-01..04, TXN-01..05, MGT-01..04 — bottom nav refactor + transactions tab + management tab — v0.3 (Phase 7)
- ✓ ANL-01..08 — analytics screen + 4 backend endpoints + SVG charts — v0.3 (Phase 8)
- ✓ AI-01..10 — AI chat: streaming SSE + 6 tools + persistence + prompt caching + provider-agnostic client + rate limit — v0.3 (Phase 9)
- ✓ AICAT-01..06 — AI категоризация через embeddings + pgvector + toggle — v0.3 (Phase 10)
- ✓ SET-03 — `enable_ai_categorization` toggle — v0.3 (Phase 10)

> **Adjustments during execution** (см. v0.3-REQUIREMENTS.md → Notes):
> - AI-08 default model: `gpt-4.1-nano` → `gpt-4.1-mini` (Phase 10.2)
> - AI-10 rate limit: 30 → 10 req/мин (Phase 10.1)
> - AICAT-04 confidence threshold: 0.5 → 0.35 (Phase 10.2)

#### v0.4 — Multi-Tenant & Admin
- ✓ MT-01..05 — `user_id` FK + Postgres RLS на 9 доменных таблицах + scoped uniques + backfill — v0.4 (Phase 11)
- ✓ AUTH-03..05 — role-based deps (`get_current_user`, `require_owner`, `bot_resolve_user_role`), Alembic split admin/app role — v0.4 (Phase 12)
- ✓ ADMIN-01..05 — AccessScreen Users / AI Usage tabs + invite/revoke endpoints + cascade purge — v0.4 (Phase 13)
- ✓ ONB-04..06 — `require_onboarded` 409 gate + bot member branch + inline embedding backfill — v0.4 (Phase 14)
- ✓ CAP-01..04 — per-user spending_cap_cents + 429 enforcement + Settings display + admin PATCH cap — v0.4 (Phase 15)

#### v0.5 — Security & AI Hardening
- ✓ SEC-01..02 — XSS escape в ChatMessage + SSE error sanitize — v0.5 (Phase 16)
- ✓ AI-SEC-01..03 — amount > 0 validation + tool-args schema validation + tool-loop guard — v0.5 (Phase 16)
- ✓ CON-01..02 — onboarding atomic + spend-cap per-user asyncio.Lock — v0.5 (Phase 16)
- ✓ DB-01 — `set_tenant_scope` unify в spend_cap.py — v0.5 (Phase 16)
- ✓ CODE-01 — `parseRublesToKopecks` dedup в utils/format.ts — v0.5 (Phase 16)

### Active (v0.6 — iOS App)

> Detailed requirements будут зафиксированы в REQUIREMENTS.md ниже в этом milestone. Below — high-level intent.

- [ ] iOS-foundation: SwiftUI-проект `/ios/`, дизайн-токены порт, glass-эффекты, Aurora/Mesh фоны
- [ ] Networking: URLSession + Codable + AsyncStream SSE-клиент; покрытие всех существующих endpoints
- [ ] Auth: backend `POST /api/v1/auth/dev-exchange` + Bearer-fallback в `get_current_user`; iOS Keychain хранение
- [ ] Onboarding (4-step) + Home (баланс, top-categories, period switcher, forecast)
- [ ] Transactions (History + Planned + Editor bottom-sheet) + Categories CRUD + Settings
- [ ] Subscriptions + локальные UNUserNotifications, Template apply, Analytics через Swift Charts
- [ ] AI-чат: SSE consumption, streaming UI, AIProposalSheet write-flow
- [ ] TestFlight: $99 Apple Developer Account, App Store Connect, internal-tester для друга

### Out of Scope (post v0.3)

| Feature | Reason |
|---------|--------|
| Семейный учёт / роли пользователей | «Здоровье Наташи» и т.п. — обычные категории, не отдельные сущности |
| Мультивалютность | Только RUB; курс-снапшоты усложнят без пользы |
| Импорт CSV/выписок банка | Ручной ввод и бот-команды покрывают daily-use |
| Импорт исходного xlsx | Старт с нуля, исторические данные не нужны |
| Push-алерты перерасхода | Только визуальная индикация в UI, без push |
| Веб-версия вне TG | Только Mini App |
| Backup через xlsx-выгрузку | pg_dump покрывает |
| Привязка ActualTransaction к строке плана | Агрегация на уровне категории достаточна |
| Дедупликация подписок | Маркер «🔁» + ручное удаление дубля; автологика хрупкая |
| Оффлайн-режим / локальный кэш | Серверная БД, online-only |
| Биллинг / тарифы | v0.4 — closed whitelist (5-50 юзеров), денег не берём |
| Бэкапы R2 / Sentry / UptimeRobot / rate limiting Cloudflare | Отложено: scope v0.4 узкий — только multi-tenant + admin |

> **Removed from Out of Scope at v0.3 close:**
> - «Multi-tenant / SaaS» → promoted to v0.4 milestone
> - «Графики трендов» → реализованы в Phase 8 (Analytics)

## Context

**Источник продукта:** Google-таблица `Google Monthly Budget 2026.02.xlsx` с 5 листами: Summary, Plan, Transactions, Мои подписки + рабочий черновик. Все ключевые поля и связи задокументированы в `docs/BRD.md` v0.2.

**Дизайн:** banking-premium dark TG Mini App. Hero-карточки с градиентом + glow, tabular-числа, цветовая логика дельты (зелёный = хорошо). Полный набор экранов проработан в `.planning/sketches/` (winners 001-B, 002-B, 003 all states, 004-A, 005-B, 006-B; v0.3-скетчи 007-A, 008-A, 009-A, 013-A; v0.4-скетчи `010-admin-whitelist` A/B/C — winners ещё не выбраны). Дизайн-система зафиксирована в `.planning/sketches/themes/default.css` и `.planning/sketches/STYLE-GUIDE.md`.

**Bottom nav v0.3:** Главная / Транзакции / Аналитика / AI / Управление — функциональная навигация, заменяет MVP-nav после Phase 7.

**Архитектура:** 5 docker-контейнеров (caddy / api / bot / worker / db). Все сервисы шарят один Python-codebase, точки входа разные. Подробно в `docs/HLD.md` v0.1.

**Шедулер:** APScheduler в отдельном процессе с PostgreSQL advisory locks для координации с API. 3 cron-джобы: уведомления о подписках (09:00), автогенерация плана от подписок (00:05), автозакрытие периода (00:01).

**AI infrastructure (с v0.3):** `app/ai/llm_client.py` с провайдер-агностичным контрактом `chat()` / `embed()`. По умолчанию `openai/gpt-4.1-mini` (chat) + `text-embedding-3-small` (embeddings). Conversation persistence в `ai_conversation` / `ai_message`. Pgvector HNSW для категорий. AI usage в in-process ring buffer (1000 records). Propose-and-approve write-flow: AI никогда не пишет в БД молча.

**Deferred (post v0.3):** 11 items в STATE.md → Deferred Items (UAT/verification gaps, требуют человеческой валидации в реальном TG).

## Constraints

- **Tech stack — backend**: Python 3.12 + FastAPI + SQLAlchemy 2.x (async) + Pydantic v2.
- **Tech stack — bot**: aiogram 3.x.
- **Tech stack — frontend**: React 18 + Vite + TypeScript + `@telegram-apps/sdk-react`.
- **Tech stack — DB**: PostgreSQL 16 + `pgvector` extension. Деньги хранятся как `BIGINT` копейки.
- **Tech stack — scheduler**: APScheduler с PostgreSQL jobstore.
- **Tech stack — AI/LLM**: OpenAI API. По умолчанию `gpt-4.1-mini` (chat) + `text-embedding-3-small` (embeddings). Абстрактный LLM-клиент `app/ai/llm_client.py` → провайдер сменяется через `LLM_PROVIDER` ENV.
- **Hosting**: VPS, docker-compose, Cloudflare Tunnel + Caddy для TLS.
- **Timezone**: расчёты периодов и шедулер в `Europe/Moscow`, БД в UTC.
- **Security**: Telegram `initData` HMAC-SHA256 валидация на каждом запросе, internal token для bot↔api. **v0.4: переход с `OWNER_TG_ID`-eq на role-based + Postgres RLS.**
- **Performance**: < 300 мс TTFB при < 1000 транзакций/период.
- **Backup**: pg_dump nightly, RPO ≤ 24ч, RTO best-effort.
- **Multi-tenant в v0.4**: Closed whitelist (5-50 юзеров), без биллинга. Изоляция через `user_id` FK + Postgres RLS.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single-tenant без `user_id` в FK (v0.2) | Упрощение для pet; миграция возможна позже | ⚠️ Revisit — переработано в v0.4 |
| `cycle_start_day` настраиваемый, default = 5 | Соответствует payroll-циклу заказчика | ✓ Good |
| Дельта расходов = `План−Факт`, доходов = `Факт−План` | Единое правило «положительная = хорошо», зелёный = всегда хорошо | ✓ Good |
| Деньги в копейках (BIGINT) | Избежать ошибок округления float | ✓ Good |
| Bottom-sheet как универсальный edit-pattern | Sketch 002-B winner | ✓ Good — переиспользуется в 005-B и 010.2 |
| Tabs Расходы/Доходы вместо stacked sections | Sketch 001-B winner, лучше в 375px | ✓ Good |
| Подписки: горизонтальный timeline + список | Sketch 004-A winner | ✓ Good |
| Onboarding: scrollable-page с нумерованными секциями | Sketch 006-B winner | ✓ Good — переиспользуется в v0.4 invite flow |
| Категории — мягкая архивация, без удаления | Сохраняет историческую целостность | ✓ Good |
| Дубли подписок — без автоматической дедупликации | Маркер «🔁», пользователь удаляет вручную | ✓ Good |
| Worker как отдельный контейнер | Чистое разделение API и cron-задач | ✓ Good |
| Frontend = React 18 + Vite + `@telegram-apps/sdk-react` | Самая большая экосистема, быстрый старт | ✓ Good |
| **v0.3 Bottom nav: функциональная 5-табов** | Группировка по частоте использования, без свалки «Ещё» | ✓ Good — UAT прошёл |
| **v0.3 LLM provider = OpenAI (gpt-4.1-mini)** | Cheapest reliable; nano не справился с аналитикой (Phase 10.2 fix) | ✓ Good — после upgrade в 10.2 |
| **v0.3 Abstract LLM client** | Контракт `chat()` / `embed()` через `LLM_PROVIDER` ENV | ✓ Good |
| **v0.3 AI-категоризация через embeddings** | Не платим за LLM-вызов на каждой транзакции, мгновенный ответ | ✓ Good — после synonym augmentation в 10.2 |
| **v0.3 AI write-flow: propose-and-approve** | AI **никогда не пишет в БД молча** — bottom-sheet с pre-filled полями | ✓ Good |
| **v0.3 English system prompts** | ~2.3× token compaction на Cyrillic vs Latin | ✓ Good |
| **v0.3 pgvector HNSW index** | Для 14 категорий любой ок, HNSW проще | ✓ Good |
| **v0.4 Multi-tenant: shared schema + user_id FK + Postgres RLS** | Defense-in-depth: app-level фильтрация + DB-level enforcement | — Pending |
| **v0.4 Whitelist через role enum** (owner / member / revoked) | Гибче чем ENV-список, позволяет revoke с purge | — Pending |
| **v0.4 Admin через UI, не бот-команды** | UI по скетчам 010-admin-whitelist | — Pending |
| **v0.4 AI cost cap per user** ($5/month default) | Защита от случайного infinite-loop в чате | — Pending |
| **v0.4 Onboarding для приглашённых: сам выбирает starting_balance + cycle_start_day** | Бюджет — личный, не управляется owner'ом | — Pending |

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
*Last updated: 2026-05-08 — v0.6 milestone started (iOS App)*
