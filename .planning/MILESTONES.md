# Milestones: TG Budget Planner

History of shipped versions. Each entry summarizes what was delivered and links to detailed archive.

---

## v0.6 — iOS App

**Shipped:** 2026-05-09 (status: human_needed для verification — функциональная валидация на iPhone Denis)
**Phases:** 17-21 (5 phases) + wise-tide UI/UX refactor
**Branch:** `v0.6-ios-app`
**Known deferred items at close:** 8 (5 verification gaps Phase 17-21 — `human_needed`; 3 quick tasks из v0.4-v0.5 — нерелевантны iOS scope; см. STATE.md Deferred Items)

### Delivered

Native iOS-приложение `BudgetPlanner` (SwiftUI, iOS 26+, Swift 5.10) — feature-parity с web Mini App. Backend остался без изменений архитектурно: добавлен `POST /auth/dev-exchange` + Bearer-fallback в `get_current_user` (web initData продолжает работать). После исходного pixel-perfect web-port под TG Mini App стиль (peach aurora + 6-layer fake glass + Material Design FAB) сделан второй проход — **wise-tide refactor 2026-05-09** — полная переработка под Apple iOS 26 native: `.glassEffect()` API, `.tabBarMinimizeBehavior(.onScrollDown)`, semantic typography, system materials, `Form/List(.insetGrouped)` везде. Установка на iPhone Denis работает через free Apple ID (Personal Team, 7-day profile) с локальным backend по WiFi. TestFlight distribution отложен — требует $99 Apple Developer Account.

### Key Accomplishments

1. **Phase 17 — iOS Foundation:** Xcode-проект `/ios/` (XcodeGen из `project.yml`), `APIClient` URLSession+Codable со всеми CRUD endpoints, `AuthStore` + `KeychainStore` с fallback в UserDefaults для unsigned simulator-сборок, backend endpoint `POST /auth/dev-exchange` (Alembic 0011 + AppUser.role=owner upsert + sha256 token), Bearer-аутентификация в `get_current_user` без поломки web-фронта.
2. **Phase 18 — iOS Core CRUD:** `HomeView` с hero balance + categories list, `TransactionsView` с History/Plan sections, `TransactionEditor` sheet, `CategoriesView` CRUD + archive, `SettingsView`. Domain port — `Period.swift` с `Calendar(timeZone: Europe/Moscow)`, `MoneyParser`/`MoneyFormatter` с XCTest на парсинг "1 500,50" → 150050.
3. **Phase 19 — iOS Management:** `SubscriptionsView` + `SubscriptionEditor` с UNUserNotifications scheduling, `TemplateView` apply-to-period, `AnalyticsView` через native SwiftUI Charts.
4. **Phase 20 — iOS AI:** `SSEClient` через `URLSession.bytes(for:)` с AsyncStream<SSEEvent>, `AIChatView` со streaming UI + ToolUseIndicator, `AIProposalSheet` write-flow для propose_actual_transaction.
5. **Phase 21 (partial) — Distribution:** PrivacyInfo.xcprivacy manifest, AppIcon. **Free Apple ID install на iPhone Denis работает** (Personal Team, профиль 7 дней). TestFlight + Apple Developer Program отложены — внешний gating $99/год.
6. **wise-tide refactor (2026-05-09):** UI/UX полная переработка под iOS 26 native (commits `9c204be → 4fa91d4`, ~−500 LOC net). Удалена web-port реализация (peach `Tokens.Background.cream`, custom `LiquidGlass` UIViewRepresentable с 6-layer composition, custom BottomBar+FAB, hardcoded `.system(size:)` typography). Заменено на native `.glassEffect()` API, `TabView { Tab() }` с `.tabBarMinimizeBehavior(.onScrollDown)`, semantic typography (`.body`/`.headline`/`.largeTitle.monospacedDigit()`), `.systemGroupedBackground` фон, Robinhood-style branded orange как `Color.accentColor`. Все 12 экранов проходят через `Form { Section }` или `List(.insetGrouped)` с native swipeActions/toolbar/Picker/DatePicker.

### Tech Debt / Known Issues

- 5 phase verifications в статусе `human_needed` — функциональная валидация iOS app на физическом iPhone засчитывается, но automated `*-VERIFICATION.md` script для iOS не реализован.
- TestFlight distribution отложен — требует оплаты Apple Developer Program $99/год; sign-in-with-apple/TG Login Widget не реализованы (dev-token flow остаётся).
- Backend для outdoor-доступа требует ngrok / Cloudflare Tunnel — сейчас работает только в LAN с Mac (память `infra-deploy.md`).
- 3 quick tasks (`deploy-fixes`, `ux-fixes`, `tma-playwright`) из v0.4/v0.5 не закрыты formally — артефакты прошлых сессий, к v0.6 iOS не относятся.
- Web Mini App продолжает работать параллельно — v0.6 не заменил web, оба клиента сосуществуют.

### Archive

- [v0.6-ROADMAP.md](milestones/v0.6-ROADMAP.md)
- [v0.6-REQUIREMENTS.md](milestones/v0.6-REQUIREMENTS.md)
- Branch: `v0.6-ios-app` (~25 коммитов)

---

## v0.4 — Multi-Tenant & Admin

**Shipped:** 2026-05-07 (status: human_needed — live TG smoke deferred to user UAT)
**Phases:** 11-15 (5 phases)
**Plans:** 36
**Requirements:** 28/28 satisfied

### Delivered

Перевод single-tenant pet-проекта в multi-user через whitelist-админку + per-user AI cost cap. Multi-tenancy на уровне БД через `user_id` FK + Postgres RLS (defense-in-depth); role-based auth (`owner`/`member`/`revoked`) заменил `OWNER_TG_ID`-eq на каждом запросе; admin UI «Доступ» (видна только owner) для invite/revoke + AI Usage breakdown; member self-onboarding в Mini App без участия owner с auto-embedding 14 seed-категорий; per-user монetary cap на AI с 429 enforcement + Settings spend display + admin PATCH cap.

### Key Accomplishments

- **Phase 11** — Alembic 0006: `user_id BIGINT NOT NULL FK` + RLS policies на 9 доменных таблицах + `UserRole` enum + scoped uniques + backfill для existing owner.
- **Phase 12** — `get_current_user`/`require_owner`/`bot_resolve_user_role` role-based deps; Alembic 0007 split Postgres role на admin/app (RLS enforcement at runtime); /me extended с `role`.
- **Phase 13** — Admin AccessScreen с 2 sub-tabs (Users / AI Usage); endpoints `/admin/users` (invite/revoke) + `/admin/ai-usage` (per-user breakdown); revoke = cascade purge всех данных юзера.
- **Phase 14** — `require_onboarded` 409 gate на 10 routers; bot `/start` ветка для invited member (`onboarded_at IS NULL`); inline async embedding backfill для 14 seed-категорий; frontend `OnboardingRequiredError` + role-branched hero copy.
- **Phase 15** — `spend_cap` service с TTLCache 60s + MSK month boundary; `enforce_spending_cap` dep на `/ai/chat` + `/ai-suggest/*`; PATCH `/admin/users/{id}/cap` (cap=0 = AI off); SettingsScreen «AI расход» + Admin CapEditSheet.

### Tech Debt / Known Issues

- 5 phase verifications в статусе `human_needed` — live TG smoke consolidated в `v0.4-MILESTONE-AUDIT.md` (8 UAT-пунктов U-1..U-8 для owner после рестарта контейнеров).
- `ai_usage_log.est_cost_usd Float` — нарушает CLAUDE.md «no float», legacy от Phase 13; миграция → BIGINT cents отложена.
- `enforce_spending_cap` открывает 2-ю DB-сессию через `Depends(get_db)` рядом с `get_db_with_tenant_scope` — архитектурное упрощение отложено.
- Money-scale calibration: `spending_cap_cents` = 100/USD; default 46500 = $465/мес, не $5; CR-01 fix выровнял Phase 13 admin_ai_usage с Phase 15 шкалой.
- Bot контейнер с TelegramUnauthorizedError (refresh BOT_TOKEN перед UAT).
- 1 pre-existing test failure в DEV_MODE=true container (intentional dev bypass).

### Archive

- [v0.4-ROADMAP.md](milestones/v0.4-ROADMAP.md)
- [v0.4-REQUIREMENTS.md](milestones/v0.4-REQUIREMENTS.md)
- [v0.4-MILESTONE-AUDIT.md](v0.4-MILESTONE-AUDIT.md)

---

## v0.2 — MVP

**Shipped:** 2026-05-03
**Phases:** 1-6 (6 phases)
**Plans:** 38

### Delivered

Перенос личной Google-таблицы бюджета в TG Mini App: single-tenant продукт на VPS — инфраструктура и auth, доменное ядро (категории/периоды) с onboarding, план (шаблон + ручные строки), факт-транзакции через Mini App и бот, дашборд с lifecycle периодов, подписки с cron-джобами.

### Key Accomplishments

1. **Phase 1 — Infrastructure & Auth:** docker-compose skeleton (5 контейнеров: caddy, api, bot, worker, db), БД-схема + миграции, Telegram initData валидация HMAC-SHA256, OWNER_TG_ID whitelist, internal token для bot↔api
2. **Phase 2 — Domain Foundation & Onboarding:** категории CRUD + 14 seed-категорий, period engine (cycle_start_day), scrollable-onboarding с bot bind, settings cycle_start_day
3. **Phase 3 — Plan Template & Planned Transactions:** шаблон плана + развёртывание на новый период, CRUD строк плана с inline-редактированием и bottom-sheet
4. **Phase 4 — Actual Transactions & Bot Commands:** факт-транзакции через Mini App bottom-sheet, бот-команды `/add`, `/income`, `/balance`, `/today`, `/app` с парсингом и disambiguation
5. **Phase 5 — Dashboard & Period Lifecycle:** главный экран Mini App (tabs Расходы/Доходы, hero-баланс, aggr-блок, прогресс-бары категорий), все edge-states (empty/warn/overspend/closed), переключатель периодов, worker-job автозакрытия периода
6. **Phase 6 — Subscriptions & Worker Jobs:** подписки CRUD + horizontal timeline UI, 2 cron-джобы (push 09:00, charge 00:05), notify_days_before settings

### Notes

> v0.2 не закрывался formally через `/gsd-complete-milestone` — этот entry добавлен retroactively при закрытии v0.3.

---

## v0.3 — Analytics & AI

**Shipped:** 2026-05-06
**Phases:** 7-10.2 (6 phases including 2 INSERTED)
**Plans:** 25 (18 numbered + 2 inline insert phases + 5 verification rounds)
**Commits:** 152
**Timeline:** 2 days (2026-05-05 → 2026-05-06)

### Delivered

Функциональный редизайн nav (5 табов), новый экран Аналитики с трендами и прогнозом, conversational AI-помощник с tool-use над данными бюджета (OpenAI gpt-4.1-mini, streaming SSE, prompt caching, persistence в БД, propose-and-approve write-flow), AI-категоризация в форме новой транзакции через эмбеддинги (text-embedding-3-small + pgvector cosine similarity).

### Key Accomplishments

1. **Phase 7 — Nav Refactor:** Bottom nav реорганизован в функциональную: Главная / Транзакции / Аналитика / AI / Управление. История+План объединены под «Транзакциями» с под-табами. 27/27 e2e tests PASS.
2. **Phase 8 — Analytics:** Экран аналитики с трендом расходов по месяцам, топом перерасходов, топом категорий и прогнозом остатка. Самописные SVG-чарты, агрегаты на backend. 13 analytics-specific тестов PASS.
3. **Phase 9 — AI Assistant:** Conversational AI с tool-use (6 tools), streaming SSE, prompt caching, persistence в БД (`ai_conversation`, `ai_message`), абстрактный provider-agnostic LLM-клиент (`LLM_PROVIDER` ENV).
4. **Phase 10 — AI Categorization:** AI-предложение категории через embeddings + cosine similarity, 500ms debounce, pgvector HNSW index, toggle `enable_ai_categorization` в Settings.
5. **Phase 10.1 — AI Cost Optimization (INSERTED):** English system-prompts (~2.3× token compaction), AI usage tracking endpoint (`GET /api/v1/ai/usage`), history 20→8, embed_text LRU cache, embedding-on-create.
6. **Phase 10.2 — AI Hardening + Write-Flow (INSERTED):** OPENAI_API_KEY end-to-end wiring (закрыто 6 latent багов), AI-proposes / human-approves write flow (AI **никогда не пишет в БД молча**), synonym-augmented embeddings, gpt-4.1-nano → gpt-4.1-mini upgrade.

### Known Deferred Items

11 items acknowledged at close (see STATE.md → Deferred Items):

- 2 UAT gaps (Phases 04, 10) — pending human verification scenarios
- 7 verification gaps (Phases 01-05, 09, 10) — все статусы `human_needed`, не code blockers
- 2 quick tasks (`deploy-fixes`, `ux-fixes`) — частичный/unknown статус

### Archive

- `.planning/milestones/v0.3-ROADMAP.md` — full phase details
- `.planning/milestones/v0.3-REQUIREMENTS.md` — requirements traceability
- `.planning/milestones/v0.3-MILESTONE-AUDIT.md` — pre-close audit (verdict: tech-debt accepted)
- `.planning/milestones/v0.3-UAT-PLAN.md` — UAT plan
- `.planning/milestones/v0.3-UAT-RESULTS.md` — UAT execution results

---
