# Milestones: TG Budget Planner

History of shipped versions. Each entry summarizes what was delivered and links to detailed archive.

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
