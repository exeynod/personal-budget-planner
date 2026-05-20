# Roadmap: TG Budget Planner

## Milestones

- ✅ **v0.2 — MVP** (Phases 1-6) — shipped 2026-05-03 → [archive](milestones/v0.3-REQUIREMENTS.md) (full v0.2 traceability в v0.3 archive at close)
- ✅ **v0.3 — Analytics & AI** (Phases 7-10.2) — shipped 2026-05-06 → [archive](milestones/v0.3-ROADMAP.md)
- ✅ **v0.4 — Multi-Tenant & Admin** (Phases 11-15) — shipped 2026-05-07 → [archive](milestones/v0.4-ROADMAP.md) (live TG smoke deferred to UAT — see [v0.4-MILESTONE-AUDIT.md](v0.4-MILESTONE-AUDIT.md))
- ✅ **v0.5 — Security & AI Hardening** (Phase 16) — shipped 2026-05-07 → [archive](milestones/v0.5-ROADMAP.md)
- ✅ **v0.6 — iOS App** (Phases 17-21) — shipped 2026-05-09 → [archive](milestones/v0.6-ROADMAP.md) (TestFlight distribution deferred — paid Apple Developer Account out of scope)
- ✅ **v1.0 — Maximal Poster Full** (Phases 22-28) — shipped 2026-05-10 → [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.0.1 — UI Conformance & Tech Debt** (Phases 29-31) — shipped 2026-05-11 → [archive](milestones/v1.0.1-ROADMAP.md)
- ✅ **v1.1 — Monetization Foundation** (Phases 32-38) — shipped 2026-05-11 → [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.1.1 — Liquid Glass Theme** (Phases 50-55) — shipped 2026-05-11 → [archive](milestones/v1.1.1-ROADMAP.md)
- 🚧 **v1.1.2 — iOS v06 Native Rebuild** (Phases 56-66) — in progress, user-direction 2026-05-11. Параллельная разработка в ветке `v1.0-maximal-poster`. Цель: вернуть нативный iOS UI (`MainShell`) как полноценную альтернативу `V10MainShell`, нарастить новый функционал (Accounts / Plan / Savings / Goals / extended Subscriptions / Onboarding 4-step / CategoryDetail drill-down / AddSheet) в нативных iOS-паттернах (Form / List(.insetGrouped) / NavigationStack / .sheet / TabView). Оба шелла сосуществуют через `@AppStorage("ui.theme")` тумблер.
- ⏳ **v1.2 — Acquisition & Retention** (Phases 39-44) — planned, depends on v1.1 ship + Month-3 mini-gate (≥2 paying-30d / ≥30 регистраций), target ship 2026-11-11 (мес 4-6)
- ⏳ **v2.0 — Scale or Stop** (Phases 45-49) — bifurcated per Month-6 kill-metric (8 paying-30d): Branch A (≥15 paying / 10K+ ₽ MRR → Apple Dev + Family + Bank CSV + Stripe + B2B); Branch B (<5 paying → maintenance + knowledge transfer). Target decision 2026-11-11, ship 2027-05-11 (мес 7-12)

## Phase Details (v1.1)

### Phase 32: Multi-tenant Production Enablement ✅ SHIPPED 2026-05-11
**Goal**: Активировать shipped-в-v0.4 multi-tenant инфраструктуру (RLS на 9 доменных таблицах + 4 v1.0 таблицах, role-based deps, AccessScreen) на live production data; миграция legacy single-tenant config OWNER_TG_ID → role-based; load test и rollback runbook; AI cost cap default ON для всех новых пользователей.
**Depends on**: v1.0.1 ship (закрытые UI/tech debt блокеры).
**Requirements**: REQ-32-01..06
**Success Criteria**:
1. RLS активна на всех 13 доменных таблицах (9 v0.4 + account/goal/savings_config + расширенная subscription) и подтверждена интеграционным тестом `test_multitenancy_live.py` (user A не читает данные user B даже через прямой SQL).
2. OWNER_TG_ID legacy fallback удалён из `get_current_user`; auth полностью role-based (owner / member / revoked); миграция владельца к role=owner подтверждена SQL-снапшотом до и после.
3. AI cost cap default `5_USD_cents` активирован при invite-flow без admin action; `GET /ai/usage` показывает remaining для каждого нового user.
4. Load test (k6 или locust) — 50 concurrent users × 100 actual_tx create + 20 AI chats без 5xx, p95 < 800ms.
5. Rollback runbook в `docs/RUNBOOK-multitenant.md` (alembic downgrade -1 проверена на копии prod, dump/restore сценарий).

### Phase 33: Compliance Baseline (152-ФЗ + ПДн + ToS + Privacy) ✅ SHIPPED 2026-05-11
**Goal**: Юридический baseline для публичного launch в РФ — РКН-уведомление как оператор ПДн, явный consent на обработку ПДн при /start (бот + Mini App), Terms of Service, Privacy Policy, право на удаление аккаунта + endpoint полной деперсонализации.
**Depends on**: Phase 32 (role-based auth — иначе не можем правильно deactivate user).
**Requirements**: REQ-33-01..06
**Success Criteria**:
1. РКН-уведомление подано (онлайн через pd.rkn.gov.ru), reg-номер сохранён в `docs/COMPLIANCE.md`.
2. `/start` бот-команда + first-touch Mini App показывают consent-screen с явным «Я согласен на обработку ПДн в целях X» и записывают `app_user.pdn_consent_at` (TIMESTAMPTZ); без согласия дальше не пускают.
3. ToS + Privacy Policy опубликованы по статическим URL (`/tos`, `/privacy`) на main домене + в Mini App Management → Настройки; на консент-экране ссылки кликабельны.
4. `DELETE /api/v1/me/account` endpoint — каскадное удаление user + transactions + ai_conversation + ai_message + embedding_cache; результат — 204; повторный вызов 404; audit log в `data_deletion_log` (user_id_hash, deleted_at, requester_ip_hash).
5. Cookie-banner на landing page (только если Phase 38 уже shipped) с opt-in для analytics.
6. Privacy Policy явно перечисляет: OpenAI как sub-processor (data → API → OpenAI servers EU), retention 1 год, право на экспорт + удаление, контакт DPO (email автора).

**Plans:** 6 plans
- [x] 33-01-PLAN.md — pdn consent schema + audit-log table + audit helper (REQ-33-02, REQ-33-04 base)
- [x] 33-02-PLAN.md — privacy policy + ToS RU/EN + /legal endpoints (REQ-33-03, REQ-33-06)
- [x] 33-03-PLAN.md — consent endpoints + onboarding gate + bot prompt (REQ-33-02)
- [x] 33-04-PLAN.md — data export + account deletion + purge job (REQ-33-04)
- [x] 33-05-PLAN.md — cookie banner + pdn consent checkbox + me.ts helpers (REQ-33-05)
- [x] 33-06-PLAN.md — РКН notification template + legal review checklist + COMPLIANCE.md (REQ-33-01)

### Phase 34: ЮKassa Integration (Самозанятый Edition) ✅
**Goal**: Primary payment rail — ЮKassa merchant в режиме «самозанятый», recurring subscriptions с webhook'ами, auto-чек через ЮKassa→ФНС «Мой Налог» в течение 24h, internal admin view для tracking платежей; TG Stars secondary rail (один SKU, две кнопки на paywall).
**Depends on**: Phase 33 (без РКН + ToS юридически нельзя принимать платежи).
**Requirements**: REQ-34-01..07
**Status**: Shipped 2026-05-11 — 7 plans, 9 tests green, 0 regressions. Manual operator follow-ups в `docs/operator/YOOKASSA-ONBOARDING.md`. TG Stars rail deferred to v1.2 (admin view + HMAC + recurring → v1.2 backlog).
**Success Criteria**:
1. ЮKassa merchant verified в режиме самозанятого (manual setup user-side, документально зафиксировано в `docs/PAYMENTS-SETUP.md`); test-mode webhook доставляется на `/api/v1/payments/yookassa/webhook` + HMAC-signature validated.
2. `subscription_payment` таблица + миграция: provider enum (yookassa / tg_stars), external_id, amount_cents, status (pending/succeeded/canceled/refunded), receipt_url, fiscal_check_url; full audit trail.
3. Recurring billing работает: первый платёж 299 ₽ через ЮKassa → webhook updates `app_user.pro_active_until = now() + 30d`; повторное списание через ЮKassa recurring API в день N+30; cancel endpoint отменяет recurring без proration.
4. Auto-чек через ЮKassa Self-Employed API: после `succeeded` webhook'a сервис вызывает receipt-create, fiscal_check_url возвращён ≤24h; URL сохранён в `subscription_payment.fiscal_check_url`.
5. TG Stars secondary rail: payment provider в @BotFather подключён, `/buy_pro` бот-команда + Mini App paywall кнопка «Через Telegram (Stars)»; pre_checkout_query + successful_payment handler пишет в `subscription_payment` с provider=tg_stars.
6. Internal admin view `/admin/payments` (owner-only) — list paid users + MRR-расчёт + last 50 транзакций; CSV-export для bookkeeping.
7. Idempotency на webhook'ах: повторный webhook с тем же `external_id` не дублирует subscription_payment.

### Phase 35: Paywall + Tier Enforcement + Reverse-Trial ✅
**Goal**: Backend-enforcement tier (Free / Pro) на критических endpoint'ах; UI PaywallSheet (web + iOS) с двумя rail-кнопками; reverse-trial mechanic — новый user стартует с 14-дневным full Pro trial без введения карты, после — auto-downgrade к Free; cancellation flow с retention prompt.
**Depends on**: Phase 34 (без активной payment-rail tier-flip некуда писать).
**Requirements**: REQ-35-01..07
**Status**: Shipped 2026-05-11 — 4 plans, 17 tests green, 0 regressions. Commits: `f7a8b73` (tier schema + resolution) + `e161686` (require_pro + AI gate + /me/tier) + `698d3e7` (PaywallSheet UI + 402 error class) + `0637ab6` (14d reverse-trial grant). Deferred to v1.2: REQ-35-06 (cancellation retention prompt + reason-select), REQ-35-07 (full E2E), iOS PaywallSheet, TG Stars secondary CTA, period detection в webhook (annual vs monthly), trial expiration push (day 12 + 14), formal `docs/TIERS.md`.
**Success Criteria**:
1. Feature-matrix в `docs/TIERS.md`: Free = 30 actual_tx/мес hard cap + 5 active категорий (over → archive prompt) + manual entry only (AI tools блокированы) + бот-команды `/add /balance /today` (без `/tax /csv`); Pro = unlimited + AI chat + AI auto-cat + push + бизнес-теги + tax reserve + CSV.
2. Backend tier-check decorator `@require_pro` на 8 endpoints: AI chat SSE + AI categorize + tax-reserve + CSV export + business-tag + push subscribe + `>30 tx/month` + `>5 active categories` → returns 402 Payment Required с JSON `{error: "pro_required", upgrade_url}`.
3. `app_user.tier` enum (free/trial/pro) + `pro_active_until` TIMESTAMPTZ; computed property `is_pro = tier in (trial, pro) AND pro_active_until > now()`.
4. Reverse-trial: на onboarding-complete сервис ставит `tier=trial, pro_active_until=now()+14d` без payment requirement; на day 12 + day 14 бот отправляет push «trial кончается, продли за 299 ₽».
5. PaywallSheet web + iOS — single component, два CTA («Оплатить через ЮKassa», «Через Telegram Stars»), показывает price + feature-bullets + «отменить в любой момент»; открывается при 402 от backend; analytics events `paywall_shown` / `paywall_cta_click`.
6. Cancellation flow в Management → Pro: «Отменить подписку» → confirm dialog с reason-select (4 опции) → ЮKassa unsubscribe + сохранение reason в `cancellation_reason` для retrospective.
7. E2E test: новый user signup → trial → mock day-15 → API 402 на AI endpoint → paywall → mock ЮKassa webhook succeeded → tier=pro → AI endpoint снова 200.

### Phase 36: Persona E Feature Pack (Самозанятые) ✅ SHIPPED 2026-05-11
**Status**: Backend-only delivery complete (3 plans, 8 tests green). REQ-36-01..03 shipped; REQ-36-04 (ZIP+CP1251) / 05 (AI tools) / 06 (bot commands) deferred to v1.2 + Phase 42.
**Goal**: Целевые фичи для primary persona (самозанятый/микро-ИП РФ) — business/personal теги на категории и транзакции, tax reserve calculator (4% НПД с авто-deposit в копилку при кешировании income), CSV export + auto-чек reminder; AI tools расширены `tag_business_vs_personal` и `record_tax_reserve`.
**Depends on**: Phase 35 (tier-gating нужен — это Pro-only features).
**Requirements**: REQ-36-01..06
**Success Criteria**:
1. `category.kind ∈ {expense, income, mixed}` + `category.scope ∈ {business, personal, both}` миграция; UI toggle на CategoryDetail; default — `personal/expense` для existing rows.
2. Каждый `actual_transaction` получает inherited scope от category; user может override через AddSheet «Бизнес / Личное» chip; backfill для existing rows → scope=personal.
3. Tax reserve config в Management → Настройки: «Я самозанятый» toggle + ставка 4% (физлица) / 6% (юрлица); при создании `actual_transaction` с kind=income + scope=business сервис автоматически создаёт `kind=deposit` child txn на `amount * rate` в копилку (или в отдельный sub-account «Налоговый резерв» если включён). Audit в `tax_reserve_log`.
4. `GET /api/v1/export/csv?period=YYYY-MM` (Pro-only) возвращает 2 файла в ZIP: `operations.csv` (date, kind, scope, category, amount, description) + `summary.csv` (category, plan, fact, delta + tax_reserve total) — CP1251 + UTF-8 BOM варианты в archive.
5. AI tools расширены: `tag_business_vs_personal(tx_ids, scope)` + `record_tax_reserve(amount_cents, period)` + `propose_csv_export(period)`. Используют existing propose-and-approve flow.
6. Bot-команды `/tax` (показывает «Резерв на налог за май: X ₽ из ожидаемых Y ₽») + `/csv` (отправляет ZIP в личку через bot send_document).

### Phase 37: Open-Core Split + GitHub Public Repo ✅ SHIPPED 2026-05-11
**Status**: Legal + docs landed (2 plans, 5 files). REQ-37-01..03 shipped (LICENSE, LICENSE-CLOSED-COMPONENTS, OPEN-CORE-MANIFEST, README, CONTRIBUTING). REQ-37-04 (CI), 37-05 (demo bot), 37-06 (Maximal Poster tokens scrubbing) deferred to manual repo-split + Phase 38.
**Goal**: Выделение ядра в публичный GitHub-репозиторий под PolyForm Shield 1.0.0; closed-source части (AI client, embeddings cache, iOS native UI, Maximal Poster components, multi-tenant cloud-config) выделены behind compile-flag или в отдельную приватную submodule; public README + demo + docker-compose for self-host.
**Depends on**: Phase 32 (multi-tenant активна — open-core должен работать в single-tenant fallback для self-host).
**Requirements**: REQ-37-01..06
**Success Criteria**:
1. Файл `LICENSE` (PolyForm Shield 1.0.0) в корне публичного репо; `NOTICE.md` с разъяснением «что open / что closed»; `LICENSING.md` для contributors (CLA-light с DCO sign-off).
2. Public-eligible модули (schema + Alembic migrations 0001-NNNN до cutoff + period engine + bot commands `/add /income /balance /today` + docker-compose minimal stack) живут в публичной репе `tg-budget-planner` (github.com/<owner>/tg-budget-planner); closed-source модули в private submodule `tg-budget-planner-pro` (AI client + embeddings cache + Maximal Poster + iOS sources) — connected через git-submodule или build-time conditional import.
3. Public README с (a) feature-list open vs Pro, (b) screenshot/GIF, (c) `docker-compose -f docker-compose.public.yml up` demo за < 3 минуты на чистой machine, (d) ссылка на hosted версию `t.me/<bot>`.
4. CI публичной репы: GitHub Actions — pytest + alembic upgrade head smoke + docker build + LICENSE check (deny GPL deps).
5. Demo TG-бот с публичной schema без AI работает; `/start` пишет «это open-core demo, full features в hosted».
6. Maximal Poster CSS tokens + 11 keyframe animations explicitly **closed-source** — не выложены в public репе (только tokens.json schema без значений); iOS source — `.gitignore` в публичной репе.

### Phase 38: Landing Page + Onboarding Funnel + Analytics Instrumentation ✅ SHIPPED 2026-05-11
**Status**: Baseline landing + analytics instrumentation landed (2 plans, 6 files, 2 tests green). REQ-38-01 (landing) + REQ-38-02 (event log + endpoint + frontend helper) shipped. REQ-38-03..07 deferred (UTM → Phase 39; survey/PostHog/funnel/cookie-banner → v1.2 / opt-in after Month-3).
**Goal**: Public-facing landing page на главном домене (`budgetbot.<domain>`); explainer GIF/video; conversion-optimized signup flow (one-click через Telegram OAuth); welcome-survey для user-research; baseline analytics на funnel (registrations → onboarded → trial-active → paying) через PostHog self-host или Plausible.
**Depends on**: Phase 33 (Privacy Policy для cookie consent на landing), Phase 35 (paywall-conversion events нужны).
**Requirements**: REQ-38-01..07
**Success Criteria**:
1. Static landing на `https://<domain>` — single page с hero ("Бюджет в Telegram. Без таблиц.") + 3 feature blocks + pricing card (Free / Pro 299 ₽) + CTA «Открыть в Telegram» (deeplink в бота); Lighthouse mobile > 90.
2. Explainer GIF 30-60s (loop) — Add Sheet → Home → AI chat → CSV export; bundled webp/mp4 < 1MB.
3. Telegram OAuth one-click signup — landing CTA сразу открывает `t.me/<bot>?start=ref_landing`; bot стартует onboarding immediately; UTM-params (`?utm_source=landing&utm_medium=hero`) сохраняются в `app_user.acquisition_source`.
4. Welcome-survey (1 экран после onboarding-complete, optional): 3 вопроса (как нашли / профессия / главная боль с бюджетом); ответы в `user_survey` таблице; skip-button.
5. Analytics instrumentation — PostHog self-host (docker container) или Plausible; events: `signup_started`, `onboarding_complete`, `trial_started`, `paywall_shown`, `paywall_cta_click`, `payment_success`, `payment_failed`, `pro_cancelled`, `ai_message_sent`, `tx_created`.
6. Funnel dashboard в PostHog: registrations → onboarded (24h window) → first-tx (7d) → AI-used (14d) → trial-active-day-14 → paying-30d.
7. Cookie banner на landing с opt-in для analytics (минимальный — Plausible не требует, PostHog требует).

## Phase Details (v1.2)

### Phase 39: Habr Longread #1 + ProductHunt + Show HN Launch
**Goal**: Launch-bundle публичной фазы — технический Habr longread («Архитектура AI-бюджет-приложения с propose-and-approve и open-core ядром»), ProductHunt launch с reusable artefacts, Show HN неделей позже, post-launch retention через TG-канал автора (build-in-public).
**Depends on**: v1.1 ship (Phase 38 landing + Phase 37 open-core repo обязательны).
**Requirements**: REQ-39-01..05
**Success Criteria**:
1. Habr статья опубликована в hub «Финансы в IT» + «Open source» (≥3000 знаков + 4-6 архитектурных диаграмм + GitHub-link); ≥50 закладок / ≥5 комментариев / ≥10K просмотров за 7d.
2. ProductHunt launch ($40 PRO для hunter outreach): demo video 60s + 5 gallery images + tagline + first-comment-template; ≥30 upvotes / ≥3 review comments.
3. Show HN неделей позже («Show HN: Open-core budget app for Telegram, AI categorization, propose-and-approve»): ≥20 points / front-page < 12h target.
4. TG-канал автора (`@<owner>_dev` или `@<project>_log`) — 3 поста/нед × 6 нед минимум (build-in-public metrics: registrations / paying / churn).
5. Post-launch attribution dashboard (extending Phase 38 PostHog): split sources Habr / PH / HN / TG-channel / organic.

### Phase 40: Referral Mechanics
**Goal**: Viral acquisition — «Пригласи друга, оба получают 30 дней Pro» (или -50% от месячной подписки на 2 мес); attribution через `tg_user_id` referrer-параметр в deeplink; anti-abuse cap (1 reward per referrer per 30d, max 5/мес).
**Depends on**: Phase 35 (tier-flip — основа reward), Phase 38 (UTM/source tracking).
**Requirements**: REQ-40-01..05
**Success Criteria**:
1. `referral_code` per user (auto-generated short hash 8-char base32); deeplink `t.me/<bot>?start=ref_<code>`; landing page «Поделиться» button копирует ссылку.
2. На onboarding-complete если `referrer_user_id` resolved (валидный code → existing user) — сохраняется в `referrer_id` FK; не self-referral.
3. Reward-trigger: при первом payment_success у referee — оба user (referrer + referee) получают `pro_active_until += 30d`; audit в `referral_reward_log`.
4. Anti-abuse: max 5 rewards per referrer в 30d (защита от spam); >5 → reward не начисляется, referee всё равно получает 30d.
5. Management → Pro показывает «Приглашено: N друзей · бонус: X дней»; конверсия referral → paid trackается в PostHog dashboard.

### Phase 41: Onboarding Optimization (A/B Reverse-Trial vs Hard Paywall)
**Goal**: Data-driven optimization воронки — A/B test 3 вариантов onboarding paywall: reverse-trial 14d (default из Phase 35) vs hard paywall day-1 vs free-without-AI; metric — paying-30d conversion; «aha-moment» tracking (первая tx, первая AI-катогоризация).
**Depends on**: Phase 38 (instrumentation), Phase 35 (paywall framework).
**Requirements**: REQ-41-01..05
**Success Criteria**:
1. A/B framework — random assignment user'у `experiment_arm` enum (trial_14d / hard_paywall / free_no_ai) при signup; sticky cookie + DB-persistent.
2. Variant 1 (control): текущий reverse-trial 14d.
3. Variant 2 (hard_paywall): после onboarding-complete показать paywall immediately, 1 tx allowed in Free тогда блок на AI.
4. Variant 3 (free_no_ai): Free tier без AI вообще + unlimited tx; AI только Pro.
5. После 200 users в каждом arm (~600 total) — Bayesian analysis в PostHog (или скрипт sql), winner deploy as new default; full report в `.planning/experiments/E-01-paywall-funnel.md`.

### Phase 42: AI Feature Expansion (Pro Anchor Strengthening)
**Goal**: Расширение conversational AI с 6 до 12-15 tools для углубления Pro-value-prop; scheduled-actions через worker (agentic в полноценном смысле); `tag_business_vs_personal` + `forecast_period_end` + `propose_subscription` (auto-detect recurring) + `schedule_action` + `what_if_scenario` + `record_tax_reserve` (re-use из Phase 36).
**Depends on**: Phase 36 (tax reserve и business-tag tools уже добавлены — extend остальное).
**Requirements**: REQ-42-01..05
**Success Criteria**:
1. 12-15 AI tools в `app/ai/tools.py`: 6 v0.3 baseline + Phase 36 (`tag_business_vs_personal`, `record_tax_reserve`) + 4-6 новых (`forecast_period_end`, `propose_subscription` distinguishes recurring patterns from tx history, `schedule_action`, `what_if_scenario` simulates plan changes, `propose_csv_export`).
2. Scheduled actions: `scheduled_ai_action` таблица + worker джоба `run_scheduled_ai_actions` (cron-driven); AI proposes-and-user-approves «завтра 09:00 — резерв 4% от вчерашнего income» → запись в таблицу → worker triggers через 24h → notification.
3. `forecast_period_end` использует existing analytics endpoint + LLM context для текстовой персонализированной формулировки.
4. AI usage 50%+ Pro-users используют ≥1 AI message в неделю (tracked через PostHog `ai_message_sent`).
5. AI cost per Pro-user не превышает 50 ₽/мес (controlled через existing AI cost cap + prompt-caching).

### Phase 43: TG Cross-Promo Network + Paid Channel Experiments
**Goal**: Distribution boost через TG-каналы — 5-10 партнёрств с нефинансовыми (Persona E adjacent: фрилансер-сообщества, дизайн-каналы, SMM) для cross-promo (взаимные mentions); тестовое paid placement за 30-50К₽ в 1-2 каналах как experiment с tracking.
**Depends on**: Phase 39 (нужны post-launch ranks для outreach), Phase 38 (UTM-attribution).
**Requirements**: REQ-43-01..04
**Success Criteria**:
1. 5-10 cross-promo партнёрств зафиксированы (название канала, audience size, дата поста, attribution-UTM); cumulative reach ≥50K (sum of audience sizes).
2. 2 paid placement experiments (бюджет $80-100 каждый) в каналах «Самозанятый.PRO», «Финансы фрилансера» или равно-релевантных; UTM + landing-attribution; conversion targets — ≥30 регистраций / ≥3 paying-trial per experiment (decision rule: <2 = stop spending на этом канале).
3. Build-in-public TG-канал автора достигает 200 подписчиков (organic).
4. Cross-promo retro в `.planning/marketing/cross-promo-retro.md` — что работало, что нет, какие каналы повторить.

### Phase 44: English MVP (Telegram-Diaspora Segment)
**Goal**: i18n toggle web + бот (без отдельного app, single binary); EN strings для onboarding/paywall/AI prompts/bot-commands; target — TG-сегмент русскоязычной диаспоры (Persona D modified); Stripe disabled (no entity), TG Stars only payment rail для intl; без multi-currency (RUB display, manual «эквивалент»).
**Depends on**: Phase 35 (paywall + TG Stars), Phase 38 (analytics для tracking intl signups).
**Requirements**: REQ-44-01..05
**Success Criteria**:
1. i18n framework — `i18next` web + Swift `Localizable.strings` (already exists для v0.6 baseline) + бот через `aiogram-i18n` plugin; RU + EN locales.
2. EN strings для: onboarding 4 шагов, paywall, AI prompts (system + tool descriptions переведены), bot-команды (`/add /balance /tax`), error messages.
3. Locale-toggle в Management → Настройки (`ui.locale = ru|en`); auto-detect через TG `WebApp.initDataUnsafe.user.language_code` при first signup.
4. Payment rail rule: если `app_user.locale == 'en'` или `tg_user.language_code != 'ru'` — paywall показывает только TG Stars кнопку (без ЮKassa); RU-users по-прежнему видят обе.
5. AI prompts в EN-mode возвращают responses на EN (LLM-side instruction); `ai_observation` rule-engine generates EN copy для EN-locale users.

## Phase Details (v2.0)

### Phase 45: Apple Dev Account + TestFlight + App Store Submission (Branch A)
**Goal**: Branch A trigger — после Month-6 gate ≥15 paying / 10K+ ₽ MRR. Apple Developer Program $99/yr оплачен, App Store Connect setup, iOS unfreeze (v1.0.1 baseline → активный roadmap); App Store submission для РФ (если доступно к 2027) или alternative install path для эмигрантов.
**Depends on**: Month-6 gate decision (BRANCH A); все v1.2 phases shipped.
**Requirements**: REQ-45-01..06
**Success Criteria**:
1. Apple Developer Program enrollment complete, $99 оплачен; team-ID + signing certificates сохранены в bitwarden.
2. App Store Connect: app record создан, bundle-ID matches Xcode project, app icons + screenshots (5 devices × 3 languages — RU/EN) uploaded.
3. TestFlight internal + external (до 100 тестеров) — текущие paying users mass-invited; crash-free rate ≥99% за 14d test period.
4. App Store submission: review-notes на EN, demo-account credentials, privacy nutrition labels, in-app purchase setup (TG Stars NOT applicable для iOS — IAP через StoreKit2 для intl Pro subscriptions; RU-users continue через ЮKassa external-web checkout).
5. iOS pixel-perfect baseline (v1.0.1 freeze) промотан до active — Phase 17-21 + wise-tide + v1.0.1 fixes объединены в shipping v1.0 для App Store.
6. Decision-log в `docs/IOS-LAUNCH.md`: RU App Store availability (если Apple suspends — alternative install via signed IPA + AltStore), Apple Pay недоступность в РФ — workaround через web-checkout deeplink.

### Phase 46: Family/Shared Budget (Branch A)
**Goal**: Multi-user shared budget — invite-link для добавления partner/family в один бюджет; permissions (owner / member-readonly / member-edit); split-transaction (50/50 или custom %); удалённый из v1.0 OOS list `Семейный учёт`.
**Depends on**: Phase 45 (Branch A continue); existing multi-tenant + role-based auth.
**Requirements**: REQ-46-01..05
**Success Criteria**:
1. `budget_membership` таблица (user_id, budget_id, role enum: owner/admin/member/viewer); existing budget = user's personal budget с user_id=owner_id.
2. Invite-flow: owner generates one-time link `t.me/<bot>?start=invite_<token>` (TTL 7d, one-use); invitee accepts → budget_membership row created → онбординг bypassed, sees owner's data.
3. Permissions enforced в RLS + app-level: viewer = read-only on transactions; member = create/edit own transactions; admin = manage categories + plan; owner = billing + delete-budget.
4. Split-transaction: при create actual_transaction member может tag «split with @X 50/50» — child txn auto-created для другого member с negative-mirror amount; UI badge «↔ split».
5. Pricing: shared budget — feature Pro+; Pro owner с N members = N × 99 ₽ surcharge (или flat Pro Family 599 ₽); decision в discuss-phase.

### Phase 47: Bank CSV Import (Manual, Not Plaid) (Branch A)
**Goal**: Не Plaid (отвергнуто per S1), но: CSV-импорт банковских выписок (Т-Банк / Сбер / Тинькофф / ВТБ форматы); auto-mapping транзакций в категории через existing embeddings; preview-and-approve UX (никаких silent inserts).
**Depends on**: Phase 36 (CSV export infrastructure — reuse parsing utils), existing AI categorization.
**Requirements**: REQ-47-01..05
**Success Criteria**:
1. `POST /api/v1/import/bank-csv` принимает multipart-file + bank-type enum (tbank/sber/tinkoff/vtb/other) + period (YYYY-MM); response: parsed-preview JSON list ≤500 rows с `proposed_category_id` через embeddings, без коммита.
2. Bank-specific parsers в `app/imports/bank/<bank>.py` — каждый умеет читать CSV/XLSX format (encoding CP1251 + UTF-8 fallback); known columns date, amount, description, mcc.
3. Mini App ImportPreview screen — list parsed rows с editable category dropdown; CTA «Импортировать N транзакций»; backend commits в batch с idempotency key (hash file + period).
4. Dedup: если existing actual_transaction matches (same date, ±5 ₽, similar description через embeddings cosine > 0.9) — preview shows «duplicate?» flag; user может skip или force-insert.
5. Audit log в `import_log` (user_id, file_hash, bank_type, rows_imported, rows_skipped); idempotency через file_hash unique constraint.

### Phase 48: Full English + Stripe + Multi-Currency (Branch A)
**Goal**: Полная EN-локализация (без compromise); Stripe integration для intl users (требует юр.лицо — Estonia e-Residency или KZ LLC, decision в discuss); multi-currency support (USD/EUR display + rate snapshots при ввода); App Store IAP для iOS intl.
**Depends on**: Phase 45 (App Store), Phase 44 (i18n baseline); Branch A continue.
**Requirements**: REQ-48-01..06
**Success Criteria**:
1. Юр.лицо зарегистрировано (Estonia OÜ via e-Residency или KZ LLC); registration cost ~$300 amortized, license + Stripe Atlas alternative considered.
2. Stripe integration — `subscription_payment.provider` extended с `stripe`; webhook handler + recurring; pricing $4.99/mo USD ($49/yr) для EN-locale users.
3. Multi-currency: `currency_code` enum (RUB/USD/EUR) на actual_transaction + `rate_at_tx` BIGINT (rate × 1e6 в RUB); UI Settings — display currency choice; storage всегда в копейках RUB через rate-snapshot.
4. App Store IAP via StoreKit2 для iOS intl users; RU iOS users — continue через external ЮKassa web checkout (Apple ToS-compliant since they don't market external pricing inside app).
5. Full EN — onboarding, settings, paywall, error messages, push-notifications, bot-команды, AI system prompts; native-speaker proofread (paid Fiverr ~$50).
6. Region-router: app_user.locale + tg user language_code + Stripe-vs-ЮKassa rail-selection logic в `app/services/payment_router.py`.

### Phase 49: Maintenance Mode + Knowledge Transfer (Branch B)
**Goal**: Branch B trigger — Month-6 gate <5 paying. Code freeze; перевод в open-source-only режим (donations only через Boosty / GH Sponsors); портфолио-piece formalization; написание публичной ретроспективы; documentation для self-host users; archive marketing/paid efforts.
**Depends on**: Month-6 gate decision (BRANCH B); все v1.2 phases shipped (или partial — это уже не критично).
**Requirements**: REQ-49-01..05
**Success Criteria**:
1. Public retrospective Habr post — «Что я узнал, запустив open-source TG-app: 6 месяцев, 5 платящих, $200 в маркетинг» — honest numbers, lessons, что бы сделал иначе.
2. README обновлён: «Maintenance mode — bugfix only, no new features. Self-host welcome.»; pricing card на landing убран; ЮKassa отключена (existing paying users grandfather до конца subscription period).
3. Boosty или GitHub Sponsors page — passive donations; minimal effort.
4. Hosted version продолжает работать для existing users (≥3 paying) — но не маркетится; SaaS-billing stop, free для всех.
5. Portfolio piece — case study `docs/CASE-STUDY.md`: architecture, scale, tech choices, business outcome, what's reusable; CV-ready.

---

## Phase Details (v1.1.1 — Liquid Glass Theme)

### Phase 50: Theme Registry Foundation ✅
**Status**: Shipped 2026-05-11 — 2 plans, 6 tests green, iOS build clean. Foundation для Phase 51-54.
**Goal**: Multi-theme tokens.json + codegen (CSS-vars + Swift enum) + `useTheme()` hook (web) + `@AppStorage("ui.theme")` (iOS); 3 темы: `maximal_poster` (current default), `liquid_glass` (new), `ios_default` (v0.6 wise-tide baseline).
**Depends on**: v1.1 shipped (DEBT-08 home color picker — reusable pattern для theme switcher).
**Requirements**: THEME-01..04
**Success Criteria**:
1. `tokens.json` имеет `themes.{maximal_poster,liquid_glass,ios_default}.{colors,typography,materials,shadows}` секции; `scripts/gen-css.ts` генерирует CSS под `[data-theme="X"]` селекторами; `scripts/gen-swift.ts` генерирует `enum Theme` + per-case token resolver.
2. `useTheme()` hook (web) с localStorage persist + CustomEvent broadcast + storage cross-tab sync; whitelist enforcement (default = maximal_poster).
3. iOS `@AppStorage("ui.theme")` binding доступен через `PosterTokens.currentTheme` accessor; `BudgetPlannerApp.swift` инжектирует value в environment.
4. tsc clean + iOS build clean; tokens.check CI gate passes (generated CSS = committed).

### Phase 51: Liquid Glass Design System ✅
**Status**: Shipped 2026-05-11 — 2 plans, 6 web vitest pass, iOS build clean. LG tokens (palette/material/typography/motion/radius) + GlassCard primitive (web + iOS) готовы.
**Goal**: LG-specific design tokens (palette, materials, typography SF Pro, motion springs, glass card primitive) — foundational set, applied в Phase 52-53.
**Depends on**: Phase 50.
**Requirements**: LG-SYS-01..05
**Success Criteria**:
1. LG palette / material / typography / motion tokens определены в `tokens.json` (LG-SYS-01..04).
2. `<GlassCard>` web компонент + `GlassCard` SwiftUI view созданы с translucent surface, optional inner border highlight, 14pt rounded corner.
3. Reduce-motion fallback: `prefers-reduced-motion: reduce` отключает blur transitions (web); `accessibilityReduceMotion` на iOS — opacity-only.
4. Visual smoke: GlassCard rendered standalone в storybook-equivalent (или Playwright pixel-snapshot для primitive).

### Phase 52: Web Liquid Glass Port ✅
**Status**: Shipped 2026-05-11 — 1 plan (52-01), vitest 719/719 pass, vite build clean. LG + iOS Default override stylesheets bundled. LG-WEB-04 / LG-WEB-05 deferred к Phase 55.
**Goal**: 9 V10 screens рендерятся под `[data-theme="liquid_glass"]` с LG tokens; Maximal Poster baselines не сломаны.
**Depends on**: Phase 51 (tokens готовы).
**Requirements**: LG-WEB-01..05
**Success Criteria**:
1. Все 9 V10 screens (Home, Transactions, AddSheet, CategoryDetail, Plan, Subscriptions, Savings, AI, Management) визуально консистентны под Liquid Glass — system Light/Dark adaptive backgrounds, glass-tinted surfaces, SF Pro typography.
2. Maximal Poster baselines re-run green (zero pixel diff vs v1.1 baselines).
3. Liquid Glass baselines созданы (9 PNGs, `frontend/tests/e2e/v10-pixel-snapshots-liquid-glass.spec.ts-snapshots/`).
4. Theme switch performance: < 100ms perceived delay через CSS-var swap (нет full reload); `data-testid="theme-applied"` обновляется.

### Phase 53: iOS Liquid Glass Native ✅
**Status**: Shipped 2026-05-11 — 1 plan (53-01, commit f349bef), iOS build clean, XCTest 358/358 pass. ThemedBackground helper + 14 root-level wraps; PosterCard / PosterSheet / BottomNavV10 untouched. LG-IOS-03 18-PNG screenshots партиально — deferred к Phase 55.
**Goal**: iOS обёртки PosterCard / PosterSheet / PosterBottomSheet / BottomNavV10 рендерят `.glassEffect()` (iOS 26 API) когда theme=liquidGlass; existing Maximal Poster path untouched.
**Depends on**: Phase 51 (LG tokens) + Phase 52 (web reference baseline).
**Requirements**: LG-IOS-01..04
**Success Criteria**:
1. `GlassCard.swift` использует iOS 26 `.glassEffect()` (с fallback `.ultraThinMaterial` для iOS < 26).
2. 5 Poster компонентов имеют conditional rendering по theme — без duplication существующего Maximal code path.
3. iOS XCTest 358/358 остаётся green; new tests для conditional theme paths (≥3).
4. Manual XcodeBuildMCP screenshots: 9 screens × 3 themes = 27 PNGs committed в `.planning/phases/53-ios-liquid-glass/screenshots/`.
5. Q4=b spirit preserved: iOS modifications ограничены только theme abstraction layer (no v0.6 wise-tide regression, no Apple Dev requirement).

### Phase 54: Theme Switcher UI ✅
**Status**: Shipped 2026-05-11 — 2 plans (54-01 web commit a61fce9, 54-02 iOS commit 2115167). Vitest 4/4 new tests + 12/12 SettingsView regression pass. iOS build clean.
**Goal**: Settings → row «Тема» (web + iOS) → opens picker sheet с 3 swatches + preview text + ✓ marker; instant apply.
**Depends on**: Phase 52 + Phase 53 (target themes уже работают).
**Requirements**: LG-SW-01..05
**Success Criteria**:
1. `ThemePickerSheet.tsx` (web) рендерит 3 swatches с mini-preview (BigFig + headline под theme tokens); tap → setTheme + close.
2. `ThemePickerSheet.swift` (iOS) — equivalent SwiftUI view; binding к `@AppStorage("ui.theme")`.
3. `SettingsView.tsx` + `SettingsV10View.swift` добавляют row «Тема» после «Цвет Home»; current swatch preview + chevron.
4. Instant apply: web — full re-render через `theme-changed` CustomEvent observer; iOS — automatic via `@AppStorage` SwiftUI binding.
5. Tests: `ThemePickerSheet.test.tsx` (5 cases) — render, select, persist, switch back, default fallback.

### Phase 55: Polish + Acceptance ✅
**Status**: Shipped 2026-05-11 — docs + reduce-motion implementation; 3 acceptance items defer к manual user QA.
**Goal**: Side-by-side acceptance каждой темы; reduce-motion + VoiceOver compatibility; performance + documentation.
**Depends on**: Phases 50-54.
**Requirements**: LG-POL-01..05
**Success Criteria**:
1. 27 web Playwright screenshots (9 screens × 3 themes) + 27 iOS XcodeBuildMCP screenshots — side-by-side review approved.
2. `prefers-reduced-motion` / `accessibilityReduceMotion` — нет mid-scroll blur animation; opacity-only fallback verified.
3. VoiceOver / accessibility: WCAG AA contrast ratios на light + dark Liquid Glass surfaces; tested на iOS Simulator + Chrome DevTools accessibility audit.
4. Performance: web theme switch < 100ms, iOS theme switch < 200ms first-paint после @AppStorage change (measured).
5. `docs/THEMES.md` — token comparison table + screenshots всех 3 тем (cover каждого экрана) для new-contributor onboarding.

---

## Phase Details (v1.1.2 — iOS v06 Native Rebuild)

User-direction 2026-05-11: gap-анализ показал что v06 (Features/) — неполный скелет, V10 (FeaturesV10/) — полнофункциональное приложение с кастомным UI. Пользователь явно отверг подход «переутемить V10 view'ы под нативный iOS» и попросил **новые экраны с нуля** в нативной iOS-парадигме под актуальные v1.0 API. Оба шелла сосуществуют через `@AppStorage("ui.theme")`.

### Phase 56: Foundation (Theme Toggle) ✅
**Status**: Shipped 2026-05-11.
**Goal**: Сделать `ui.theme` тумблер рабочим в обе стороны. Из v06 Settings → V10 (default `maximal_poster`); из V10 Settings → ТЕМА → СТАРЫЙ IOS → v06. До этого AppRouter принудительно фолбэкал `"v06"` в `"v10"`, и в ThemePickerSheet не было опции v06.
**Plans**: 56-01-PLAN.md.
**Success Criteria**:
1. ✅ v06 SettingsView имеет секцию «Дизайн» с кнопкой переключения на V10.
2. ✅ V10 ThemePickerSheet имеет четвёртый ряд «СТАРЫЙ IOS» с pictogram + описанием.
3. ✅ AppRouter условие переключения: `themeRaw == "v06"` → MainShell, иначе → V10MainShell.
4. ✅ Manual smoke в симуляторе: v06 ↔ V10 переключение работает в обе стороны, persistence через `com.exeynod.BudgetPlanner.plist`.
5. ✅ Build 0 errors, 0 new warnings.

### Phase 57: Onboarding 4-step (v06 native) — planned
**Goal**: Native iOS onboarding wizard — 4 шага (income / accounts / plan / goals) через NavigationStack drill-down или TabView page-style. Использует v1.0 API `/onboarding/complete` с расширенными полями. Заменяет минимальный v06 OnboardingView.

**Plans:** 2 plans
- [ ] 57-01-PLAN.md — Native wizard root (NavigationStack) + 4 step views (Income/Accounts/Plan/Goals) reusing OnboardingFlow data model
- [ ] 57-02-PLAN.md — AppRouter conditional mount (v06 → native wizard) + xcodegen regen + simulator build + manual smoke

### Phase 58: Home & Period (v06 native) ✅
**Status**: Shipped 2026-05-11 (minimal correction). Полная интеграция с v1.0 `/periods/current` уже была. Скорректирован только empty state.
**Goal**: Native Home без empty-state «Завершите onboarding» когда user.is_onboarded=true. Интеграция с v1.0 `/periods/current` + `/periods/{id}/balance`. Карточки категорий через List(.insetGrouped).
**Plans**: 58-01-PLAN.md.
**Success Criteria**:
1. ✅ `.noActivePeriod` ContentUnavailableView не упоминает onboarding (AppRouter уже гарантирует is_onboarded=true).
2. ✅ Primary action «Добавить трату» открывает existing TransactionEditor — backend `POST /actual` D-52 auto-create создаст период.
3. ✅ Secondary action «Обновить» re-fetch периода.
4. ✅ Иконка нейтральная (`calendar.badge.clock`).
5. ❌ DEFERRED: миграция HomeView с 2-valued CategoryKind на 4-valued (savings/other) — в Phase 59.

### Phase 59: Transactions (v06 native) ✅ SHIPPED 2026-05-12
**Goal**: Миграция с legacy ActualAPI/PlannedAPI (2-valued kind) на v1.0 ActualV10API (4-valued kind). Фильтры по категории, history/planned subtabs через native Picker. Swipe-to-delete.

**Plans:** 3 plans
- [x] 59-01-PLAN.md — TransactionsViewModel migration to ActualV10DTO + CategoriesV10DTO + unit tests
- [x] 59-02-PLAN.md — TransactionsView body rewrite (subtabs, 3-segment kind picker, filter Menu, V10 rows)
- [x] 59-03-PLAN.md — Swipe-to-delete + confirmationDialog + inline deleteError banner

**Outcome**: Native iOS Transactions screen на v1.0 backend. 3-segment kind picker (Расходы/Доходы/Сбережения), roundup mini-icon, deposit blue, Menu category filter, swipe+confirmationDialog+overlay banner. 15 ViewModel unit tests. Bridge ActualV10DTO→ActualDTO для tap-to-edit legacy TransactionEditor (Phase 64 заменит). Manual smoke approved 2026-05-12 11:25 MSK.

**Discovered**: CategoryV10DTO.kind на самом деле 2-valued — не 4-valued, как утверждал CONTEXT.md. Только `ActualKindV10` 4-valued. PlannedV10API не существует, Planned остаётся legacy.

### Phase 60: Accounts (v06 native, новый домен) ✅
**Status**: SHIPPED 2026-05-12.
**Goal**: Мультиаккаунтность. AccountsView (List со счетами) + AccountDetailView (NavigationLink). API: AccountsAPI v1.0.

**Plans:** 4 plans
- [x] 60-01-PLAN.md — ManagementItem.accounts registration + scaffold files for Features/Accounts
- [x] 60-02-PLAN.md — AccountsViewModel.load + AccountsView body (Hero + List + Empty + tap-to-detail) + ViewModel tests
- [x] 60-03-PLAN.md — NewAccountSheet (Form) + AccountsViewModel.createAccount + ScrollViewReader scroll-to-new + inline error banner
- [x] 60-04-PLAN.md — AccountDetailViewModel.load + AccountDetailView body (Hero + History per period grouped by day)

**Outcome**: Native iOS Accounts domain в v06 shell на v1.0 backend. ManagementItem «Счета» → AccountsView (Hero summary + List rows + ContentUnavailableView empty + `+` toolbar) → AccountDetailView (Hero + day-grouped History) → AccountsNewSheet (Form с validation + MoneyParser + segmented Picker + conditional mask). 32 ViewModel + Validation unit tests pass. T-60-01/02/03 mitigated. Coexistence guards clean (FeaturesV10/* + MainShell.swift untouched). Manual smoke deferred per user override (auto-approved-deferred).

**Deferred**: Update/Delete/SetPrimary endpoints (need backend), Transfer flow (DF-V11-01), multi-period history, HomeView v06 primary-account display.

### Phase 61: Plan Editor (v06 native, новый домен) ✅ SHIPPED 2026-05-12
**Status**: SHIPPED 2026-05-12 (4 plans complete). Manual smoke deferred per user override (auto-approved-deferred).
**Goal**: Редактор месячного плана. Master PlanEditorView (List категорий с Hero «Остаток к распределению» + Aggregates → Прочее/Накопления + Sections Расходы/Доходы) → tap row → push PlanRowEditorView (Form Stepper+TextField+Picker+Toggle). Per-row immediate save через `CategoriesV10API.update` (PlanMonthAPI.patch вне scope этой фазы). Coexistence: FeaturesV10/Plan/* untouched.

**Plans**: 4 plans
- [x] 61-01-PLAN.md — ManagementItem.planEditor registration + scaffold Features/PlanEditor/ (6 файлов: Route, Data, View×2, ViewModel×2) + PlanRowEditorViewModel.onSaved contract.
- [x] 61-02-PLAN.md — PlanEditorData (5 pure helpers) + PlanEditorViewModel.load() (parallel cats+me, sequential period+actuals) + PlanEditorView body (Hero + Aggregates + Sections + navigationDestination для PlanEditorRoute) + tests.
- [x] 61-03-PLAN.md — PlanRowEditorViewModel.load/save/isDirty + PlanRowEditorView body (Form Stepper+TextField+Picker+Toggle + Save toolbar + banner + cancel-confirmation) + tests.
- [x] 61-04-PLAN.md — PlanEditorIntegrationTests (closure-chain parent↔child + recompute helpers) + full test suite run (45 tests pass) + coexistence audit + build smoke.

**Outcome**: Master-detail редактор плана. PlanEditorView с Hero(surplus)/Aggregates/Categories Sections; PlanRowEditorView с Stepper+TextField+Picker+Toggle; per-row immediate save via CategoriesV10API.update. PlanEditorRoute typed enum (избегает Int.self collision с Phase 60 Accounts). 45 tests pass (18 Data + 7 PlanEditorVM + 13 RowEditorVM + 7 Integration). T-61-01/02/03 mitigated. Coexistence: FeaturesV10/Plan/* + Onboarding/* + Management non-ManagementView + Accounts/* untouched. Build clean.

### Phase 62: Savings & Goals (v06 native, новый домен) — planned
**Goal**: Копилка. Список целей (List с прогресс-баром), GoalDetailView, NewGoalSheet (Form), DepositSheet (Form). API: GoalsAPI.

**Plans:** 3/3 plans complete

Plans:
- [x] 62-01-PLAN.md — scaffold (ManagementItem.savings + Savings dir + SavingsRoute + stubs)
- [x] 62-02-PLAN.md — SavingsView master list + VM + SavingsViewData helpers + tests
- [x] 62-03-PLAN.md — GAP: GoalDetailView/VM + NewGoalSheet + DepositSheet Form bodies + WR-05/IN-04 fixes + VM/validation tests

### Phase 63: Subscriptions расширенные (v06 native) — planned
**Goal**: post/unpost action, day_of_month, account_id selection. Form-based редактор с DatePicker и Picker (счёт). Миграция на SubscriptionsV10API.

**Plans:** 2/2 plans complete

Plans:
- [x] 63-01-PLAN.md — Миграция SubscriptionsViewModel на SubscriptionsV10API (list/patch/post/unpost/delete) + post/unpost мутации + SubscriptionsViewData pure-helpers (create остаётся legacy — V10API без create-эндпоинта)
- [x] 63-02-PLAN.md — Editor расширения (account Picker + day_of_month Stepper 1...28 monthly) + row badge + swipe post/unpost с confirmationDialog + create-path (legacy create + follow-up V10 PATCH) + >=10 unit-тестов

### Phase 64: AddSheet нативный (v06) — planned
**Goal**: Замена `TransactionEditor` modal на расширенный native Form sheet — без custom keypad, используем `keyboardType: .decimalPad`. Picker категории/счёта. Подсказка AI-категории inline.

**Plans:** 2/2 plans complete

Plans:
- [x] 64-01-PLAN.md — Account Picker «Счёт списания» в TransactionEditor (actual-режимы, default primary?? first, «Не указан»=nil, load в .task) + ActualUpdateRequest.accountId + unit-тесты default-account
- [x] 64-02-PLAN.md — Inline AI-подсказка категории: AISuggestCategoryAPI (silent-403 без logout) + @Observable AISuggestHint (debounce/cancel) + tappable chip (не авто-применять) + ≥5 unit-тестов

### Phase 65: CategoryDetail drill-down (v06 native) ✅
**Status**: Shipped 2026-05-11.
**Goal**: NavigationLink с категории → CategoryDetailScreen со списком транзакций по этой категории. Кнопка «увеличить лимит» (PlanMonthAPI) deferred до Phase 61.
**Plans**: 65-01-PLAN.md.
**Success Criteria**:
1. ✅ Tap по категории в v06 CategoriesView → push в CategoryDetailScreen (NavigationLink).
2. ✅ Hero section: icon + kind label + total cents за активный период + count операций.
3. ✅ History section: ForEach транзакций отсортирован date desc (через `ActualAPI.list(periodId:, categoryId:)`).
4. ✅ Toolbar Menu: Переименовать / Архивировать (destructive) / Восстановить (если archived) — перенесены из inline-sheet.
5. ❌ DEFERRED: «Увеличить лимит» — Phase 61.
6. ❌ DEFERRED: Migration на v1.0 ActualV10API — Phase 59.
7. ⚠ DISCOVERED: CategoriesView creation падает 500 на v1.0 backend (NOT-NULL `code`) — hotfix-кандидат для Phase 59 или separate.

### Phase 66: Settings + AI + Management Polish (v06 native) — planned
**Goal**: Settings parity с V10 (theme picker, AI cost cap display). AI-чат — оставить v06 AIChatView с подключением v1.0 ai/chat SSE. Management Hub — оставить List как есть, добавить ряды для новых доменов (Accounts, Savings, Plan).

**Plans:** 1/1 plans complete

Plans:
- [x] 66-01-PLAN.md — Theme picker в v06 SettingsView: чистый ThemeOption helper (selected/rawValue/round-trip + unit-тесты) + designSection 4 selectable ряда (MAXIMAL POSTER / LIQUID GLASS / IOS DEFAULT / СТАРЫЙ IOS) с checkmark, пишущий @AppStorage('ui.theme'). AI cost cap / AI chat SSE / Management rows — verify-only (pre-existing).

### Phase 67: v1.1.2 Remediation & Cleanup (multi-lead review fixes) — planned
**Goal**: Устранить находки 5-лидового кросс-доменного ревью (`.planning/v1.1.2-MULTILEAD-REVIEW.md`) и провести механический cleanup-рефакторинг. Покрывает P0 (3 блокера: backend SubscriptionReadV10 response_model, web tsc-build, iOS suppressForbiddenHandler revert), P1 (7 major: BE embeddings user_id, BE double-post race, iOS error-leak, iOS Savings/GoalDetail seam+coalesce, iOS SSE auth, web ui.theme split, APIClient auth/date regression-тесты), P2 (13 minor) и cleanup R1/R2/R5/R8/R9 (iOS дедуп + test-seam, мёртвый web v06-shell, backend-гигиена, docs). Спецификация — review-документ. ВНЕ scope (отложено владельцу/спайку): R3 (схождение legacy/V10 API), R4 (OpenAPI codegen), R6 (судьба двух шеллов), R7 (error-policy/BusinessDate абстракции).
**Depends on**: Phase 62-66 (фиксит их находки).
**Success Criteria**:
1. Все 3 P0-блокера закрыты: GET/POST/PATCH /subscriptions отдают day_of_month/account_id/posted_txn_id; `npm run build` (tsc-гейт) зелёный; suppressForbiddenHandler удалён (402-handling корректен, 403→logout восстановлен).
2. P1 major закрыты с тестами: эмбеддинги пользовательских категорий пишутся; double-post идемпотентен (FOR UPDATE/unique); нет утечки error.localizedDescription в UI; Savings/GoalDetail имеют API-seam + reload-coalesce + поведенческие тесты денежных мутаций; SSE 401/403 согласованы с REST auth; APIClient auth/date покрыты regression-тестами; web ui.theme key разведён.
3. Cleanup R1/R2/R5/R8/R9 выполнены (дедуп account-label/banner/LocalNotifications, dead code удалён, мёртвый web v06-shell разрешён, backend float→cents/get_db/MeResponse-билдер, docs multi-tenant).
4. iOS build + полный suite зелёные; backend pytest зелёный; web build зелёный.

**Plans:** 10/10 plans complete

- [x] 67-01-PLAN.md — [W1] BE P0-1: SubscriptionReadV10 response_model on list/post/patch + round-trip test
- [x] 67-02-PLAN.md — [W1] Web P0-2: fix tsc build (AnalyticsRange import + bottomRef type) — npm run build green
- [x] 67-03-PLAN.md — [W1] iOS P0-3: remove suppressForbiddenHandler, restore strict 403→logout (require_pro=402)
- [x] 67-04-PLAN.md — [W2] BE P1-1/P1-2/P2-13: embedding user_id+tenant scope; double-post FOR UPDATE+unique index migration; savepoint test
- [x] 67-05-PLAN.md — [W2] iOS P1-3/P1-5/R1: APIError→RU mapper (leak cluster), SSE 401/403 split, account-label/banner/LocalNotifications dedup
- [x] 67-06-PLAN.md — [W2] Web P1-6/R5: split ui.shell vs ui.theme keys + dead-shell inventory
- [x] 67-07-PLAN.md — [W3] iOS P1-4/P1-7/R2: Savings/GoalDetail API-seam + reload-coalesce + money-mutation tests; APIClient 403/401+MSK-date regression tests
- [x] 67-08-PLAN.md — [W4] BE P2-4..7/R8: ChatRequest bounds, suggest confidence/docstring, symmetric /me builder, est_cost float→cost_cents migration, get_db dedup
- [x] 67-09-PLAN.md — [W4] Web P2-8..11/R5: useAiCategorize stale-guard, local wire-date parse, single parseRublesToKopecks, window.alert→Toast
- [x] 67-10-PLAN.md — [W5] iOS P2-1/2/3/P2-12/R9: single-reload create, day/nextCharge reconcile, config-inFlight guard, de-flake notification test, multi-tenant docs

---

### Phase 68: Tech-Debt Cleanup (v1.1.2 followup workstream A) ✅ SHIPPED 2026-05-21
**Plans:** 5/5 plans complete
**Goal**: Устранить pre-existing tech-debt, залогированный в фазе 67 (`deferred-items.md`) + отложенные косметические находки ревью, чтобы получить полностью зелёный baseline всех трёх стеков перед архитектурными фазами 69/70. Спецификация — `.planning/CONVERGENCE-AND-DEBT-PLAN.md` §ФАЗА 68 (workstream A) + `.planning/v1.1.2-MULTILEAD-REVIEW.md`. Покрывает A1 (backend pro-gating 402-vs-429: `require_pro` срабатывает до `enforce_spending_cap` → 5 тестов ждут 429, получают 402), A2 (onboarding/complete 422 + `category.code`/`ord` seed-drift Phase 22 → системный фикс seed-helper, не inline), A3 (web tsc test-gate: `@types/node`, prop-дрейф в 3 `.test.tsx`, вернуть тесты под type-check), A4 (stale doc-комментарий 0.5→0.35 threshold в AISuggestCategoryAPI.swift).
**Depends on**: — (независимо, можно сразу; baseline для 69).
**Success Criteria**:
1. Backend pytest полностью зелёный — нет pre-existing фейлов (`test_ai_cap_integration` 3, `test_spend_cap_concurrent` 2, `test_seed_creates_14_categories`, `test_e2e_multi_user_lifecycle` 4); pro-over-cap→429, non-pro→402 подтверждено.
2. Seed-helper системно задаёт NOT-NULL `Category.code` (`^[0-9]{2}$`) + `ord`; ни одному будущему тесту не нужен inline seed-фикс.
3. Web: `npm run build` (prod tsc-гейт) зелёный И тесты проходят type-check (`typecheck:test` или назад в `tsc -b`) И `npx vitest run` зелёный.
4. A4 косметика закрыта.


- [x] 68-01-PLAN.md — [W1] BE A1: pro-gating 402-vs-429 — seed Pro users (seed_user pro/trial params); 6 cap tests assert 429 on pro-over-cap, non-pro→402 (SHIPPED 2026-05-20, commits eece9ae + 0287eda; gate order unchanged, fixture-fix)
- [x] 68-02-PLAN.md — [W2] BE A2: systemic seed_category (code+ord, no inline hacks) + onboarding/complete 422 root-cause fix; test_categories.py (10) + e2e (6) green (SHIPPED 2026-05-20, commits 84b0656 + 81309e3; 422 root = legacy body vs v1.0 onboarding_v10 contract; Rule 1: removed dropped plan_template_item from admin purge)
- [x] 68-03-PLAN.md — [W1] Web A3: @types/node + tsconfig.test.json + typecheck:test; fix prop-drift in 3 .test.tsx; build + test-typecheck + vitest green (SHIPPED 2026-05-20, commits dbe8b47 + 1c8b3dd; separate test project keeps prod tsc -b fast/test-free; AiView baseProps typed to AiViewProps, SettingsView fixture +8 drifted props from Phase 30-07/54-01; build + typecheck:test 0-err + vitest 738 all green)
- [x] 68-04-PLAN.md — [W1] iOS A4: comment-only 0.5→0.35 threshold in AISuggestCategoryAPI.swift + swift-format (SHIPPED 2026-05-20, commit 6bd18b6; verified backend SUGGEST_THRESHOLD=0.35 in ai_suggest.py; fixed BOTH the SuggestCategoryDTO doc-comment + the file-header note, Rule 1; tree-wide make-format churn on ~80 unrelated files reverted — only target file committed)
- [x] 68-05-PLAN.md — [W3] BE A2-suite: drive FULL backend pytest green — finishes the 68-02 seed/contract migration suite-wide (126 TEST-DEBT failures → 0). seed_user(pdn_consent_at) + seed_category(plan_cents/rollover/paused) + helpers/onboarding.py (complete_onboarding_v10); zero raw Category() outside seed.py; classes A(~70 raw seeds)/B(24 consent)/C(13 legacy onboarding→v1.0)/D(4 roundup populate_existing)/E(3 plan_template_item table-lists)/F(1 migration head→0026)/G(~17 template/snapshot 410 + apply-template no-op). FINAL: 774 passed, 34 skipped, 1 xpassed, 0 failed, 0 errors. TEST-ONLY (zero app/migration changes). (SHIPPED 2026-05-20, commits dc556f7 + 7b2a9dd + fcbc408 + 085f535)

---

### Phase 69: Contract Codegen — R4 (v1.1.2 followup workstream B) — planned
**Plans:** 6 plans
**Goal**: Единый источник истины для API-контракта — генерировать TS и Swift DTO из FastAPI OpenAPI; убрать 3 рукописных набора типов и «pending schema» заглушки (наибольший ROI против дрейфа контракта). Спецификация — `.planning/CONVERGENCE-AND-DEBT-PLAN.md` §ФАЗА 69 (workstream B). Решения владельца: внешние библиотеки разрешены (Apple `swift-openapi-generator` допустим); R4 делать целиком (полный codegen + миграция потребителей). Покрывает B1 (чистый детерминированный `/openapi.json` dump-таргет + артефакт `contract/openapi.json`), B2 (web `openapi-typescript` → `generated/schema.ts`), B3 (iOS codegen — планировщик сравнивает `swift-openapi-generator` vs кастомный скрипт→vanilla Codable, обосновывает выбор; xcodegen подхватывает generated/), B4 (миграция потребителей read-DTO сначала: CategoryRead/V10, Subscription*, Me*, Actual*; убрать pending-schema Optional-заглушки), B5 (CI sync-guard: regen+git-diff пуст).
**Depends on**: Phase 68 (зелёные тесты как baseline).
**Success Criteria**:
1. `openapi.json` генерируется детерминированно из приложения и покрывает subscriptions/categories/actuals/me/ai/accounts/savings/goals; зафиксирован как регенерируемый артефакт.
2. TS DTO (`openapi-typescript`) и Swift DTO генерируются идемпотентно; web build и iOS build зелёные на сгенерированных типах.
3. Ключевые read-DTO мигрированы на сгенерированные; «pending schema» Optional-заглушек нет; ноль behavioral-регрессий; полные test-suites всех 3 стеков зелёные.
4. CI sync-guard падает, если типы рассинхронизированы со схемой; regen-команда документирована.

- [x] 69-01-PLAN.md — [W1] B1 backend: response_model audit (typed me consent/account + billing /me/tier + /me/subscription/cancel; GET /me/export + SSE /ai/chat exempted) + deterministic contract/openapi.json dump (sort_keys, idempotent, 8 domains) + make contract + contract guard test; full pytest 778 green (0 regression). Commits f25a7f0 + 0f15007
- [x] 69-02-PLAN.md — [W2] B2 web: openapi-typescript + gen:api → generated/schema.ts (idempotent) + drift-report vs handwritten types.ts (CategoryV10 pending stubs); build+typecheck:test+vitest green (gen only, no consumer migration)
- [x] 69-03-PLAN.md — [W2] B3 iOS: DECISION custom Python script→vanilla Codable (preserves URLSession transport; rejects swift-openapi-generator which forces ClientTransport+runtime) → GeneratedDTO.swift (idempotent) + xcodegen pickup + drift-report; iOS build green
- [x] 69-04-PLAN.md — [W3] B4 web migration: read-DTOs (CategoryV10/Subscription*/Me*/Actual*) onto generated via adapters.ts; remove pending-schema stubs+comments; write payloads deferred; build+typecheck:test+vitest green, zero regression
- [x] 69-05-PLAN.md — [W3] B4 iOS migration: read-DTOs onto generated (typealias/adoption); remove CategoryV10DTO pending stubs+decode fallbacks; transport untouched; write payloads deferred; iOS build+test suite green, zero regression
- [ ] 69-06-PLAN.md — [W4] B5 CI sync-guard: check_contract_sync.sh regen-all + git-diff-empty + CI step + README regen pipeline; passes on current tree

---

### Phase 70: Convergence & Abstractions — R3/R6/R7 (v1.1.2 followup workstreams C/D/E) — planned
**Plans:** TBD
**Goal**: Поверх стабильного codegen-контракта — свести legacy/V10 API (R3), извлечь общий доменный слой iOS чтобы два шелла не дрейфовали (R6), ввести инъектируемые cross-cutting абстракции (R7). Спецификация — `.planning/CONVERGENCE-AND-DEBT-PLAN.md` §ФАЗА 70 (workstreams C/D/E). **Решение владельца R6: ОСТАВИТЬ ОБА ШЕЛЛА навсегда** (iOS MainShell↔V10MainShell + web v06-shell НЕ удалять) — извлечь общий слой, схождение на уровне API/DTO, НЕ шеллов. Покрывает C/R3 (аудит legacy-enum vs V10API per route, V10=canonical; пометить legacy `@available(deprecated)`; мигрировать доказуемо-эквивалентные call-sites; debt-реестр), D/R6 (инвентарь дублированных экранов; извлечь общие ViewModels/Data/бизнес-логику в shared-слой, Views остаются per-shell; начать с домена наибольшего риска дрейфа — Subscriptions/Savings — по одному за раз с тестами), E/R7 (E1 error-policy injection: APIClient switch → инъектируемая ErrorHandling-стратегия, корневой фикс класса `suppressForbiddenHandler`; E2 BusinessDate тип отдельно от audit-времён, MSK как свойство типа, убирает MSK-decode band-aid).
**Depends on**: Phase 69 (codegen — фундамент).
**Success Criteria**:
1. Legacy-enums помечены `@available(*, deprecated)`; доказуемо-эквивалентные call-sites мигрированы на V10 canonical; неэквивалентные оставлены + тикет; debt-реестр в `.planning/`. Оба шелла продолжают работать. Build без новых warnings-as-errors.
2. ≥1 iOS-домен (Subscriptions ИЛИ Savings) использует общий VM/Data слой, потребляемый обоими шеллами; поведение идентично; паттерн задан для остальных доменов.
3. APIClient не содержит per-call auth-флагов (error-policy инъектируема); date-decode без эвристики формата (BusinessDate введён).
4. Полные test-suites всех затронутых стеков зелёные.

---

## Dependency Graph (v1.1 / v1.2 / v2.0)

```
                v1.0.1 (shipped 2026-05-11)
                          │
                          ▼
              Phase 32 (Multi-tenant Prod Enable)
                          │
                          ▼
              Phase 33 (Compliance Baseline)
                          │
                          ▼
              Phase 34 (ЮKassa + Самозанятый)
                          │
                          ▼
              Phase 35 (Paywall + Tier + Reverse-Trial)
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
       Phase 36       Phase 37      Phase 38
       Persona E      Open-core     Landing +
       Pack           GitHub        Analytics
            │             │             │
            └─────────────┴─────────────┘
                          │
                          ▼
                  v1.1 ship → Month-3 mini-gate
                  (<2 paying / <30 reg = STOP)
                          │
                          ▼
              Phase 39 (Habr + PH + Show HN)
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
       Phase 40       Phase 41      Phase 42
       Referral       A/B paywall   AI 12-15 tools
            │             │             │
            └─────────────┴─────────────┘
                          │
                          ▼
              Phase 43 (TG Cross-Promo)
                          │
                          ▼
              Phase 44 (English MVP — TG Stars only)
                          │
                          ▼
                  v1.2 ship → Month-6 KILL-METRIC GATE
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       BRANCH A (≥15 paying)   BRANCH B (<5 paying)
       Phase 45 Apple Dev      Phase 49 Maintenance
       Phase 46 Family               + Knowledge Transfer
       Phase 47 Bank CSV
       Phase 48 EN + Stripe
```

## Phase Details (v1.0.1)

### Phase 29: UI Conformance Audit & Critical Fixes
**Goal**: Pixel-perfect аудит каждого V10 экрана против `prototype/index.html` (web)
+ XcodeBuildMCP screenshots (iOS); produce UI-REVIEW.md с deviations classified BLOCKER/WARNING/INFO; fix BLOCKER-уровневые deviations inline.
**Depends on**: v1.0 ship
**Requirements**: UICONF-01..UICONF-05
**Success Criteria**:
1. Web Playwright snapshots для всех 8 V10 экранов сгенерированы (Home/Tx/AddSheet/CategoryDetail/PLAN/Subscriptions/Savings/AI) с corresponding baselines в `__screenshots__/v10-pixel/`.
2. Каждый screenshot side-by-side сверен с `prototype/index.html` секцией; deviations записаны в UI-REVIEW.md с severity (BLOCKER = visible misalignment / wrong color / missing element; WARNING = micro-spacing / opacity drift; INFO = subjective polish).
3. iOS аудит через XcodeBuildMCP screenshots для тех же 8 экранов с reference в DESIGN-SYSTEM.md.
4. Все BLOCKER-deviations исправлены inline; WARNING/INFO задокументированы для v1.1.
5. Re-run Playwright snapshots green после fix-ов.

**Plans:** 5 plans
- [x] 29-01-PLAN.md — Web Playwright onboarded fixture + 8 baseline PNG snapshots (UICONF-01)
- [x] 29-02-PLAN.md — Web side-by-side audit vs prototype/index.html → UI-REVIEW.md (web) (UICONF-02)
- [x] 29-03-PLAN.md — iOS XcodeBuildMCP screenshots + UI-REVIEW.md iOS section (UICONF-03)
- [x] 29-04-PLAN.md — BLOCKER fix wave (conditional, data-driven from 29-02/29-03 findings) (UICONF-04)
- [x] 29-05-PLAN.md — Re-snapshot pixel baselines + DIVERGENCES.md WARNING/INFO append (UICONF-04 verify + UICONF-05)

### Phase 30: Tech Debt Cleanup
**Goal**: Закрыть 7 achievable v1.0 tech debt items + 1 user-feature: pre-existing TS errors (analytics.ts, AiView.tsx, TxV10TabDemote.test.tsx), AddSheet refetch-after-submit, account picker UI upgrade (web+iOS), iOS Subscription editor error surface, web swipe-left delete, iOS press-feedback animation transition, iOS SettingsAPI file split, + Home screen color customization picker (DEBT-08, продвинуто из v1.1 backlog DF-V11-04 по запросу 2026-05-11).
**Depends on**: Phase 29 (UI fixes might overlap with these files)
**Requirements**: DEBT-01..DEBT-08
**Success Criteria**:
1. tsc --noEmit clean (DEBT-01: TS errors resolved).
2. AddSheet submit triggers parent screen refetch (Home + Transactions) — no stale data (DEBT-02).
3. Account picker is full sheet with list (web + iOS), not row-cycler (DEBT-03).
4. iOS Subscription day/price editor surfaces backend errors via banner (not silent) (DEBT-04).
5. Web Transactions row supports swipe-left delete (parity with iOS) (DEBT-05).
6. iOS press-feedback in PosterStyle.swift + KeypadView.swift uses .posterAnimation (not bare .animation) (DEBT-06).
7. iOS SettingsAPI moved to its own file (DEBT-07 cosmetic).
8. User в Management→Настройки выбирает цвет Home-экрана (4 swatches: coral/cobalt/black/cream); сохранение в localStorage / @AppStorage, мгновенное применение без перезагрузки (DEBT-08).

**Plans:** 7 plans
- [x] 30-01-PLAN.md — TS errors fix (DEBT-01, no-op confirmed)
- [x] 30-02-PLAN.md — AddSheet refetch + AccountPickerSheet web (DEBT-02+03 web)
- [x] 30-03-PLAN.md — AddSheet refetch + AccountPickerSheet iOS (DEBT-02+03 iOS)
- [x] 30-04-PLAN.md — Subscription editor PATCH toast (DEBT-04)
- [x] 30-05-PLAN.md — Web Transactions swipe-left delete (DEBT-05)
- [x] 30-06-PLAN.md — iOS posterAnimation + SettingsAPI split (DEBT-06+07)
- [x] 30-07-PLAN.md — Home screen color picker (DEBT-08)

### Phase 31: Regression Hardening
**Goal**: Добавить test fixtures для onboarded user, починить Playwright §14 acceptance + pixel snapshot tests; добавить iOS testRoundRubles + testCycleDayClampedInFebruary test bug fixes (или isolate как broken); finalize CI green.
**Depends on**: Phase 30
**Requirements**: REG-01..REG-04
**Success Criteria**:
1. Playwright fixtures: onboarded test user (auto-onboards via /api/v1/internal/onboarding если test mode) — Home/Tx/AddSheet рендерятся в спеках без real backend setup.
2. v10-acceptance-tz14 spec проходит на live dev-server.
3. v10-pixel-snapshots генерирует 8 baselines + diff-fail на сознательной regression.
4. iOS XCTest 358/358 (testRoundRubles + testCycleDayClampedInFebruary либо починены, либо marked .skip с reason).

**Plans:** 3 plans
- [x] 31-01-PLAN.md — Live-mode Playwright fixture + dev auth bypass (REG-01)
- [x] 31-02-PLAN.md — §14 acceptance CTA flow + pixel sanity (REG-02+03)
- [x] 31-03-PLAN.md — iOS XCTest 358/358 isolate failures (REG-04)

## Phases

<details>
<summary>✅ v0.2 MVP (Phases 1-6) — SHIPPED 2026-05-03</summary>

- [x] Phase 1: Infrastructure & Auth (6/6 plans) — completed 2026-05-02
- [x] Phase 2: Domain Foundation & Onboarding (6/6 plans) — completed 2026-05-02
- [x] Phase 3: Plan Template & Planned Transactions (6/6 plans) — completed 2026-05-03
- [x] Phase 4: Actual Transactions & Bot Commands (6/6 plans) — completed 2026-05-03
- [x] Phase 5: Dashboard & Period Lifecycle (6/6 plans) — completed 2026-05-03
- [x] Phase 6: Subscriptions & Worker Jobs (7/7 plans) — completed 2026-05-03

</details>

<details>
<summary>✅ v0.3 Analytics & AI (Phases 7-10.2) — SHIPPED 2026-05-06</summary>

- [x] Phase 7: Nav Refactor (6/6 plans) — completed 2026-05-05
- [x] Phase 8: Analytics Screen (5/5 plans) — completed 2026-05-05
- [x] Phase 9: AI Assistant (7/7 plans) — completed 2026-05-06
- [x] Phase 10: AI Categorization (5/5 plans) — completed 2026-05-06
- [x] Phase 10.1: AI Cost Optimization (INSERTED, inline) — completed 2026-05-06
- [x] Phase 10.2: AI Hardening + Write-Flow (INSERTED, inline) — completed 2026-05-06

</details>

<details>
<summary>✅ v0.4 Multi-Tenant & Admin (Phases 11-15) — SHIPPED 2026-05-07</summary>

- [x] Phase 11: Multi-Tenancy DB Migration & RLS (7/7 plans) — completed 2026-05-06
- [x] Phase 12: Role-Based Auth Refactor (7/7 plans) — completed 2026-05-07
- [x] Phase 13: Admin UI — Whitelist & AI Usage (8/8 plans) — completed 2026-05-07
- [x] Phase 14: Multi-Tenant Onboarding (7/7 plans) — completed 2026-05-07
- [x] Phase 15: AI Cost Cap Per User (7/7 plans) — completed 2026-05-07

</details>

<details>
<summary>✅ v0.5 Security & AI Hardening (Phase 16) — SHIPPED 2026-05-07</summary>

- [x] Phase 16: Security & AI Hardening (9/9 plans) — completed 2026-05-07

См. [milestones/v0.5-ROADMAP.md](milestones/v0.5-ROADMAP.md) для full phase details.

</details>

<details>
<summary>✅ v0.6 iOS App (Phases 17-21) — SHIPPED 2026-05-09</summary>

- [x] Phase 17: iOS Foundation — completed 2026-05-08
- [x] Phase 18: iOS Core CRUD — completed 2026-05-08
- [x] Phase 19: iOS Management — completed 2026-05-08
- [x] Phase 20: iOS AI — completed 2026-05-08
- [x] Phase 21: TestFlight Distribution — partial (private install через free Apple ID работает; paid Apple Developer Program + TestFlight distribution отложены)
- [x] **wise-tide refactor (2026-05-09)** — UI/UX полная переработка под iOS 26 native (Liquid Glass APIs, semantic typography, system materials), удалена web-port реализация (peach aurora + 6-layer fake glass + Material Design FAB)

См. [milestones/v0.6-ROADMAP.md](milestones/v0.6-ROADMAP.md) для full phase details.

</details>

### 🚧 v1.0 Maximal Poster Full (Phases 22-28) — IN PROGRESS

- [ ] **Phase 22: Backend Schema & Logic Foundation** — Account/Goal/SavingsConfig/Recurrent ext, ActualKind enum, roundup + rollover services, atomic onboarding, RLS на 4 новых таблицах (блокер всему UI)
- [ ] **Phase 23: Design System Foundation** — codegen tokens, 4 self-hosted шрифта + PT Serif fallback, 11 keyframe-анимаций, PosterNavStack + PosterSheet, dual-shell coexistence (web ║ iOS параллельно)
- [ ] **Phase 24: Onboarding 4-step** — Доход → Счета → План → Цель → Final с persistence draft и atomic commit
- [x] **Phase 25: Home + Transactions + Add Sheet** — coral hero «дневной темп», push-stack реестр, custom 3×4 keypad, FAB на каждом экране (completed 2026-05-10)
- [x] **Phase 26: Category Detail + PLAN мая + Subscriptions** — red/cobalt category screen, PLAN со sliders + регулярные «провести в факт», подписки с editor-меню (completed 2026-05-10)
- [x] **Phase 27: AI + Savings + Accounts + Analytics + Management** — AI initial-state observation + 4 chips, Копилка с roundup-toggle, Accounts list + detail, Analytics rewrite, Mgmt-хаб (completed 2026-05-10)
- [x] **Phase 28: Animations Polish + Acceptance** — `prefers-reduced-motion`, accessibility audit, pixel-perfect side-by-side QA, performance, migration safety, acceptance §14 ТЗ (completed 2026-05-10)

## Phase Details (v1.0)

### Phase 22: Backend Schema & Logic Foundation
**Goal**: Backend готов поддержать v1.0 UI — все новые сущности (Account, Goal, SavingsConfig, Recurrent extension), расширения (Category lim/rollover/paused/parent, ActualKind enum) и бизнес-правила (auto-roundup, rollover остатков на закрытии периода, atomic onboarding) работают через типизированные API endpoints с multi-tenant изоляцией через RLS.
**Depends on**: Nothing — отдельный workstream от существующего v0.6 кода (только backend, web/iOS не трогаются).
**Requirements**: BE-01, BE-02, BE-03, BE-04, BE-05, BE-06, BE-07, BE-08, BE-09, BE-10, BE-11, BE-12, BE-13, BE-14, BE-15, BE-16
**Success Criteria** (что должно быть TRUE):
  1. User-владелец может через `PATCH /api/v1/me` сохранить месячный доход и получить его обратно в `GET /me`; в той же сессии он может создать Account через `POST /accounts` (с balance, primary=true), увидеть его в `GET /accounts` и удалить только если на нём нет транзакций.
  2. При создании expense-транзакции с `roundup_enabled=true` через `POST /actual` сервис автоматически создаёт child-txn (kind=roundup, parent_txn_id=parent.id, тот же account_id), и `account.balance_cents` уменьшается на total (parent + roundup); при удалении parent — child каскадно удаляется и баланс восстанавливается.
  3. В полночь 1-го числа `close_period_job` для категории с `rollover='savings'` создаёт kind=deposit txn с описанием «Остаток {category.name} → копилка», для `rollover='misc'` — суммирует в `period.misc_rollover_cents`; идемпотентность через `period.rollover_processed_at` гарантирует, что повторный запуск джобы не создаст дублей.
  4. Atomic `POST /api/v1/onboarding/complete` принимает body `{income_cents, accounts[], category_plans, goal?, savings_config?}` и в одной DB-транзакции создаёт User.income, Account-rows (первый = primary), 8 default-категорий с кодами food/cafe/home/transit/fun/gifts/health/subs, Goal и SavingsConfig; backward-compat — отсутствие новых полей даёт legacy 14-cat behavior.
  5. Все 4 новые таблицы (account, goal, savings_config, subscription-ext) защищены Postgres RLS — integration test `test_multitenancy_v1_0_columns.py` подтверждает, что user A не может прочитать/изменить/удалить ресурсы user B даже через прямой SQL под `app` ролью; composite FK `(parent_id, user_id)` блокирует cross-tenant ссылки на `category.parent_id` и `actual_transaction.parent_txn_id`.
**Plans**: 16 plans (4 waves)
- [ ] 22.01-alembic-0012-user-account-PLAN.md — User.income_cents + account table + RLS (BE-01, BE-02, BE-03, BE-16)
- [ ] 22.02-alembic-0013-category-extension-PLAN.md — Category extension + composite FK + drop PlanTemplateItem (BE-04, BE-05, BE-16)
- [ ] 22.03-alembic-0014-actual-goal-savings-PLAN.md — ActualKind enum + parent_txn_id + goal + savings_config + subscription ext (BE-06, BE-08, BE-11, BE-12)
- [ ] 22.04-alembic-0015-rls-finalize-PLAN.md — RLS on goal/savings_config + composite FK on parent_txn_id (BE-16)
- [ ] 22.05-sqlalchemy-models-PLAN.md — ORM mappings for all v1.0 schema additions (BE-01, BE-02, BE-04, BE-06, BE-08, BE-11, BE-12)
- [ ] 22.06-account-service-PLAN.md — Account CRUD + balance delta-accounting (BE-02, BE-03)
- [ ] 22.07-roundup-service-PLAN.md — Roundup formula + child txn hook + create_actual_v10 (BE-07)
- [ ] 22.08-savings-goals-service-PLAN.md — Savings aggregator/config + Goal CRUD (BE-08, BE-09, BE-10, BE-11)
- [ ] 22.09-subscription-post-unpost-PLAN.md — Subscription post/unpost flows (BE-12, BE-13)
- [ ] 22.10-rollover-close-period-PLAN.md — Period rollover service + close_period integration (BE-14)
- [ ] 22.11-atomic-onboarding-service-PLAN.md — complete_v10 + reset_v10 (BE-15, BE-05)
- [ ] 22.12-pydantic-schemas-PLAN.md — API schemas (BE-01, BE-02, BE-08, BE-09, BE-10, BE-11, BE-12, BE-15)
- [ ] 22.13-api-routers-PLAN.md — FastAPI routers wiring (BE-01, BE-02, BE-08, BE-09, BE-10, BE-11, BE-13, BE-15)
- [ ] 22.14-internal-onboarding-reset-PLAN.md — Internal admin reset endpoint (BE-15)
- [ ] 22.15-rls-integration-tests-PLAN.md — BE-16 acceptance gate (RLS + composite FK)
- [ ] 22.16-migration-safety-tests-PLAN.md — Forward/round-trip/backfill tests (BE-04, BE-05, BE-06, BE-08, BE-11, BE-12, BE-14, BE-16)

### Phase 23: Design System Foundation
**Goal**: Web и iOS получают общий design-system foundation — codegen tokens (single source `tokens.json`), 4 self-hosted Google-шрифта с PT Serif Italic как cyrillic fallback (ADR-001), 11 keyframe-анимаций, базовые компоненты (Eyebrow / Mass / BigFig / Plate / Chip / Slider / FAB / Toast), iOS custom `PosterNavStack` + `PosterSheet` с ручным edge-swipe (ADR-002), dual-shell coexistence (v0.6 untouched, v1.0 за `@AppStorage("ui.theme")` flag).
**Depends on**: Phase 22 (DTO types `Account` / `Goal` / `Recurrent` нужны для component props), ADR-001 + ADR-002 (decided).
**Requirements**: DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08
**Success Criteria** (что должно быть TRUE):
  1. Дизайнер изменяет `tokens.json` (например, coral `#F26B5E → #F37060`), запускает `npm run gen:tokens` → `frontend/src/stylesV10/tokens.css` и `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` обновляются автоматически; CI-check `make tokens-check` валит билд если generated ≠ committed.
  2. На web `<App data-theme="v10">` рендерит test-страницу с DM Serif italic «Май» + Latin «May» с правильным glyph-routing (PT Serif Italic для cyrillic, DM Serif Italic для Latin) — `pyftsubset --unicodes='U+0410-044F'` smoke-тест проходит, font-display: optional + preload top-2 weights дают LCP < 2.5s.
  3. На iOS test-app с `theme = .v10_poster` рендерит те же глифы из bundled TTF в `Resources/Fonts/`, синхронная регистрация при launch (нет FOUT race), variable Manrope/JetBrainsMono работают через `Font.custom().weight()`.
  4. Все 11 keyframe-анимаций (posterRowIn, posterRiseIn, posterBarFill, posterTabPop, posterPopIn, posterCheck, posterDot, posterSlideInFwd/Back, posterTabSwap, posterToastIn) демонстрируются на Storybook-page (web) и SwiftUI Preview (iOS); включение OS-флага `prefers-reduced-motion` / `accessibilityReduceMotion` редуцирует их до opacity-only без in-app toggle.
  5. iOS `PosterNavStack` (50 LOC, ZStack + asymmetric transitions + @Observable router) + ручной edge-swipe-back (`UIScreenEdgePanGestureRecognizer`, minimumDistance 24, threshold 80px, accessibility label «Назад») работает на real device test (iPhone 11/Pro): push 3 экрана → swipe-back → assert top of stack; `PosterSheet` покрывает sheetEase + backdrop.
  6. Dual-shell flag — `AppRouter` switch на `@AppStorage("ui.theme")` рендерит либо `V06MainShell` (текущий v0.6 код, untouched), либо `V10MainShell` (новый); web `main.tsx` проверяет `localStorage.getItem('ui.theme') === 'v10'` или `VITE_UI_THEME=v10` для выбора между `App.tsx` и `AppV10.tsx`.
**Plans**: 12 plans (5 waves)
- [ ] 23-01-tokens-codegen-PLAN.md — design/tokens.json + gen-tokens.ts + Makefile tokens-check (DS-01)
- [ ] 23-02-web-fonts-PLAN.md — @fontsource self-hosted woff2 + fonts.css with unicode-range cyrillic fallback + index.html preload (DS-02)
- [ ] 23-03-ios-fonts-PLAN.md — 5 TTF in Resources/Fonts + UIAppFonts + XcodeGen regen + cyrillic visual smoke (DS-03)
- [ ] 23-04-web-animations-PLAN.md — 11 @keyframes + utility classes + prefers-reduced-motion media query (DS-04, DS-05)
- [ ] 23-05-web-components-PLAN.md — 10 React components in componentsV10/ + useCountUp hook + index.ts barrel (DS-06)
- [ ] 23-06-ios-animations-PLAN.md — PosterAnimations.swift (11 animations) + reduce-motion view modifiers (DS-04, DS-05)
- [ ] 23-07-ios-components-PLAN.md — 10 SwiftUI components in FeaturesV10/Common + PosterStyle shared (DS-06)
- [ ] 23-08-ios-nav-stack-PLAN.md — PosterRouter + PosterNavStack + PosterTransitions + PosterEdgeSwipe + PosterSheet (DS-07)
- [ ] 23-09-web-shell-preview-PLAN.md — main.tsx theme dispatcher + AppV10 + /preview gallery (DS-08)
- [ ] 23-10-ios-shell-PLAN.md — AppRouter @AppStorage switch + V10MainShell + PreviewGallery (DS-08, DS-07)
- [ ] 23-11-web-smoke-test-PLAN.md — Playwright e2e suite covering DS-02/04/05/06/08 (DS-02, DS-04, DS-05, DS-06, DS-08)
- [ ] 23-12-ios-smoke-test-PLAN.md — Manual simulator + real-device verification + ADR-002 risk closure (DS-03, DS-04, DS-05, DS-06, DS-07, DS-08)
**UI hint**: yes

### Phase 24: Onboarding 4-step
**Goal**: User проходит 4-шаговый онбординг (Доход → Счета → План → Цель опц. → Final «ВСЁ. деньги под контролем.») в новом poster-стиле; черновик сохраняется в localStorage / UserDefaults между сессиями; финальный commit атомарно создаёт User.income + Accounts + 8 default-категорий с планом + Goal + SavingsConfig через расширенный `POST /onboarding/complete`.
**Depends on**: Phase 22 (Account/Goal API + atomic onboarding endpoint), Phase 23 (DM Serif Italic для Final-экрана, slider-компонент, sliding indicator, PosterNavStack для back-arrow).
**Requirements**: ONB-V10-01, ONB-V10-02, ONB-V10-03, ONB-V10-04, ONB-V10-05, ONB-V10-06, ONB-V10-07
**Success Criteria** (что должно быть TRUE):
  1. User-первичный заходит в TG Mini App / iOS app → видит Step 01 «ШАГ 01 / 04» с прогресс-баром (4 деления), large-input для дохода и `₽` suffix; NEXT-кнопка disabled пока `income > 0`.
  2. На Step 02 user видит chip-list (Т-Банк / Сбер / Наличные / + Добавить), может ввести `balance` per account; первый счёт автоматически помечен primary; NEXT enabled при `accounts.length >= 1`.
  3. На Step 03 user распределяет income по 8 default-категориям через slider (initial = `share * income`, step 500 ₽); live-счётчик показывает «остаётся X ₽ → накопления» / «превышение X ₽»; NEXT disabled при `Σ plan > income`; tap по числу → keyboard-input.
  4. На Step 04 user либо создаёт Goal (name + target_cents), либо нажимает «ПРОПУСТИТЬ» сверху; в обоих случаях видит Final-экран с резюме (доход, счета, план, цель) и CTA «НАЧАТЬ →»; tap → атомарный `POST /onboarding/complete` → переход на новый `PosterHomeView`.
  5. User закрывает приложение посреди Step 02 → возвращается через час → видит Step 02 с заполненными ранее данными (draft из `localStorage` / `UserDefaults`); после успешного `POST /onboarding/complete` черновик очищается.
**Plans**: 11 plans (6 waves)
- [ ] 24-01-foundation-draft-flow-PLAN.md — useReducer/Observable + draft I/O + types + 8 default categories + API wrappers (ONB-V10-01, ONB-V10-07)
- [ ] 24-02-web-step01-income-PLAN.md — Web OnboardingChrome + OnboardingFlow + Step01Income (ONB-V10-01, ONB-V10-02)
- [ ] 24-03-ios-step01-income-PLAN.md — iOS OnboardingChrome + OnboardingView + Step01IncomeView + RubleFormatter (ONB-V10-01, ONB-V10-02)
- [ ] 24-04-web-step02-accounts-PLAN.md — Web Step02Accounts + AccountBalanceForm + russian pluralisation hint (ONB-V10-01, ONB-V10-03)
- [ ] 24-05-ios-step02-accounts-PLAN.md — iOS Step02AccountsView + AccountBalanceSheet via PosterSheet + PluralRu (ONB-V10-01, ONB-V10-03)
- [ ] 24-06-web-step03-plan-PLAN.md — Web Step03Plan with 8 PosterSliders + live counter + overflow hintTone (ONB-V10-01, ONB-V10-04)
- [ ] 24-07-ios-step03-plan-PLAN.md — iOS Step03PlanView with 8 PosterSliders + counter (ONB-V10-01, ONB-V10-04)
- [ ] 24-08-web-step04-goal-final-PLAN.md — Web Step04Goal + Final + atomic submit + 200/409/422 handling (ONB-V10-01, ONB-V10-05, ONB-V10-06)
- [ ] 24-09-ios-step04-goal-final-PLAN.md — iOS Step04GoalView + FinalView + submit + 200/409/422 (ONB-V10-01, ONB-V10-05, ONB-V10-06)
- [ ] 24-10-web-wire-e2e-PLAN.md — Wire OnboardingMount into AppV10 + getMeV10 + Playwright e2e covering full flow + 409/422 + persistence (ONB-V10-01, ONB-V10-06, ONB-V10-07)
- [ ] 24-11-ios-wire-shell-PLAN.md — Wire OnboardingMountView into V10MainShell + MeAPI + XCTest gateway + manual smoke checklist (ONB-V10-01, ONB-V10-06, ONB-V10-07)
**UI hint**: yes

### Phase 25: Home + Transactions + Add Sheet
**Goal**: User получает три ключевых экрана нового UX — Home (coral, hero «Дневной темп» с count-up + sorted category list со stagger + plan badge + wallet link), Transactions registry (cobalt push-stack экран с day-grouping, single-select chip filter, spec-tags roundup/deposit), Add Sheet (чёрный фон, custom 3×4 цифровая клава, suppressed system kb на iOS, FAB доступен с любого экрана кроме Add Sheet самого); v0.6 Transactions tab demoted из bottom nav.
**Depends on**: Phase 22 (account.balance для wallet link, ActualKind enum для spec-tags, account.id для Add Sheet), Phase 23 (BigFig count-up, posterRowIn stagger, PosterNavStack для push-stack, FAB component, Toast). Параллельна с Phase 26 и Phase 27 (independent screen groups).
**Requirements**: HOME-V10-01, HOME-V10-02, HOME-V10-03, HOME-V10-04, HOME-V10-05, HOME-V10-06, TXN-V10-01, TXN-V10-02, TXN-V10-03, TXN-V10-04, TXN-V10-05, TXN-V10-06, ADD-V10-01, ADD-V10-02, ADD-V10-03, ADD-V10-04, ADD-V10-05
**Success Criteria** (что должно быть TRUE):
  1. User открывает Home → видит eyebrow `VOL.NN / MONTH YYYY · N ДНЕЙ`, italic «Дневной темп —» + BigFig с count-up easing cubicOut 900ms; ниже подложка «осталось N дней · в кошельке X ₽ →» (X = `Σ account.balance_cents`) tappable → push Accounts list.
  2. User видит сортированный список категорий (по `act/plan` desc, превышения сверху) с stagger-анимацией `posterRowIn` (delay 0.08 + i*0.045s) и bar-fill 700ms; OVER-плашка для `act > plan`; tap → push Category Detail; «ВСЕ ОПЕРАЦИИ →» → push Transactions registry.
  3. User в Transactions registry видит eyebrow «SECTION II» + Mass italic «Реестр.» + список сгруппированных по дням (Сегодня / Вчера / «N мая» через DM Serif italic 28px) с суммой за день; single-select chip-bar (Все / Кафе / Продукты / Транспорт / Подписки / Копилка); roundup отмечены жёлтой плашкой «↻ ОКРУГЛ.», deposit — «→ КОПИЛКА»; swipe-left → delete с confirm.
  4. User тапает FAB → Add Sheet (NEW ENTRY · {date} · {time}) → вводит сумму через custom 3×4 keypad (BigFig 86px жёлтым, на iOS системная клава suppressed через TextField inputView = empty UIView), описание, выбирает дату-чип (Сегодня / Вчера / Своя дата), категорию через horizontal chip-scroll, счёт; CTA меняется «ВВЕДИТЕ СУММУ» → «ВЫБЕРИТЕ КАТЕГОРИЮ» → «СОХРАНИТЬ ↵» (yellow active).
  5. v0.6 Transactions tab fully demoted: bottom nav теперь 5 элементов «Home / Savings / FAB / AI / Mgmt»; единственный путь к реестру — push-stack из Home «ВСЕ ОПЕРАЦИИ →» или Category Detail.
**Plans**: 12 plans (3 waves)
- [x] 25-01-backend-actual-v10-PLAN.md — extend POST /actual schema + route for v10 ActualKind + account_id (Plan 25-01)
- [x] 25-02-web-routing-bottomnav-PLAN.md — web PosterRouter + PosterSheet + BottomNavV10 + format helpers (Plan 25-02)
- [x] 25-03-api-clients-PLAN.md — typed v10 API clients (web + iOS) for /actual /accounts /categories (Plan 25-03)
- [x] 25-04-web-home-view-PLAN.md — web HomeView + HomeMount + computeHomeData (HOME-V10-01..06) (Plan 25-04)
- [x] 25-05-ios-home-view-PLAN.md — iOS HomeV10View + HomeV10ViewModel + HomeData (HOME-V10-01..06) (Plan 25-05)
- [x] 25-06-web-shell-mount-PLAN.md — wire AppV10 → V10MainShell with PosterRouter + BottomNavV10 + AddSheet placeholder (HOME mount + TXN-V10-06 + ADD-V10-01) [gap-closure]
- [x] 25-07-ios-shell-mount-PLAN.md — wire iOS V10MainShell with PosterNavStack + BottomNavV10 + AddSheet placeholder (HOME mount + TXN-V10-06 + ADD-V10-01) [gap-closure]
- [x] 25-08-web-transactions-PLAN.md — web TransactionsView + TransactionsMount + computeTransactions (TXN-V10-01..05) [gap-closure]
- [x] 25-09-ios-transactions-PLAN.md — iOS TransactionsV10View + ViewModel + TransactionsData (TXN-V10-01..05) [gap-closure]
- [x] 25-10-web-addsheet-PLAN.md — web AddSheet + Keypad + computeAddSheet + V10MainShell wire (ADD-V10-01..05) [gap-closure]
- [x] 25-11-ios-addsheet-PLAN.md — iOS AddSheetView + KeypadView + SuppressedKeyboardField + V10MainShell wire (ADD-V10-01..05) [gap-closure]
- [x] 25-12-txn-tab-demote-verify-PLAN.md — automated TXN-V10-06 acceptance + Playwright happy-path (TXN-V10-06) [gap-closure]
**UI hint**: yes

### Phase 26: Category Detail + PLAN мая + Subscriptions
**Goal**: User получает три экрана для управления бюджетом — Category Detail (новый, cobalt/red фон по `isOver`, BigFig + bar-break, rollover-toggle + CTA «+ ПОДНЯТЬ ЛИМИТ» / «ПАУЗА»), PLAN мая (расширенный, sliders 500₽ по 8 категориям + блок «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» + 2 rollover-плашки), Subscriptions (coral, bottom-sheet menu с editor-под-sheet'ами для day/price + destructive delete).
**Depends on**: Phase 22 (Recurrent extension с day_of_month + posted_txn_id, single PATCH endpoint для PLAN, Category.{rollover, paused, parent_id}), Phase 23 (slider, BigFig, Plate, posterBarFill, sheet stacking). Параллельна с Phase 25 и Phase 27.
**Requirements**: CAT-V10-01, CAT-V10-02, CAT-V10-03, CAT-V10-04, CAT-V10-05, CAT-V10-06, PLAN-V10-01, PLAN-V10-02, PLAN-V10-03, PLAN-V10-04, PLAN-V10-05, PLAN-V10-06, SUBS-V10-01, SUBS-V10-02, SUBS-V10-03, SUBS-V10-04
**Success Criteria** (что должно быть TRUE):
  1. User тапает на категорию из Home → видит Category Detail на cobalt-фоне (норма) или red (`isOver`); Mass UPPERCASE имя, italic подзаголовок «— превышено на N%» / «— на N% плана», BigFig факт с count-up; progress bar 6px с разрывом на отметке плана; список операций по этой категории.
  2. User toggle-tap на plate «ОСТАТОК → НАКОПЛЕНИЯ / ПРОЧЕЕ» меняет `category.rollover` через `PATCH /categories/:id`; CTA «+ ПОДНЯТЬ ЛИМИТ» pushes PLAN с фокусом на эту категорию; «ПАУЗА» toggle меняет `category.paused`.
  3. User в PLAN мая видит plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» (`income − Σplan`) с OK/OVER статусом; OVER блокирует продолжение редактирования; 2 плашки «→ ПРОЧЕЕ X ₽» / «→ НАКОПЛЕНИЯ Y ₽» агрегируют по rollover-flag; 8 sliders (шаг 500 ₽, debounce commit 300ms, tap по числу → keyboard input); chip-pair «ПРОЧЕЕ / НАКОПЛЕНИЯ» меняет rollover; single PATCH endpoint валидирует `Σplan ≤ income` server-side.
  4. User в block «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» видит список из `/subscriptions` (cycle=monthly, day_of_month set); каждая строка: имя · «N числа · комментарий» · сумма · кнопка «ПРОВЕСТИ →» (post создаёт actual_transaction kind=expense + Subscription.posted_txn_id) / «ОТМЕНА» (unpost откатывает); tap → toast «✓ ПРОВЕДЕНО · −X ₽ → реестр».
  5. User в Subscriptions (coral) видит Mass italic «Подписки.» + BigFig «X ₽/мес»; tap на `···` → bottom-sheet menu с 3 ghost-кнопками (ПАУЗА toggle, СМЕНИТЬ ДЕНЬ → secondary sheet с DatePicker, ИЗМЕНИТЬ ЦЕНУ → secondary sheet с numeric input) + destructive «ОТМЕНИТЬ ПОДПИСКУ» (red фон) → confirm → `DELETE /subscriptions/:id`.
**Plans**: 7 plans (2 waves)
- [x] 26-01-PLAN.md — backend ext: CategoryUpdate plan_cents/rollover/paused + PATCH /plan-month atomic endpoint (BE-04 ext + new BE-08 — backend prereq для Wave 2)
- [x] 26-02-PLAN.md — web Category Detail screen + updateCategoryV10 + HomeMount swap (CAT-V10-01..06)
- [x] 26-03-PLAN.md — iOS Category Detail screen + CategoryV10UpdateRequest + HomePlaceholders zero-touch swap (CAT-V10-01..06)
- [x] 26-04-PLAN.md — web PLAN мая + planMonth.ts + subscriptions.ts API + sliders + regulars + HomeMount swap (PLAN-V10-01..06)
- [x] 26-05-PLAN.md — iOS PLAN мая + PlanMonthAPI + SubscriptionsV10API + sliders + regulars + zero-touch swap (PLAN-V10-01..06)
- [x] 26-06-PLAN.md — web Subscriptions screen + bottom-sheet menu + day/price editors + delete confirm (SUBS-V10-01..04)
- [x] 26-07-PLAN.md — iOS Subscriptions screen + nested posterSheet menu + .confirmationDialog (SUBS-V10-01..04)
**UI hint**: yes

### Phase 27: AI + Savings + Accounts + Analytics + Management
**Goal**: User получает 5 параллельно разрабатываемых экранов — AI (initial-state с DM Serif italic 36px observation + 4 chip-suggestions, active-state reuse v0.6 SSE), Savings (новый, чёрный фон, накопление + roundup-toggle + base chips + цели), Accounts list + Account Detail (новые, cream + чёрный фон), Analytics (rewrite в poster-стиле, 2 KPI plates + bar-chart + top-5), Management (3-5 numbered list-rows: PLAN / Счета / Аналитика / Настройки / Доступ).
**Depends on**: Phase 22 (Goal CRUD, Savings aggregator + config, Account list/detail endpoints), Phase 23 (DM Serif для AI observation, posterDot для typing, posterBarFill для goal progress, Plate, Chip). Параллельна с Phase 25 и Phase 26.
**Requirements**: AI-V10-01, AI-V10-02, AI-V10-03, AI-V10-04, AI-V10-05, SAV-V10-01, SAV-V10-02, SAV-V10-03, SAV-V10-04, ACCT-V10-01, ACCT-V10-02, ACCT-V10-03, ACCT-V10-04, ANAL-V10-01, ANAL-V10-02, ANAL-V10-03, ANAL-V10-04, MGMT-V10-01, MGMT-V10-02, MGMT-V10-03, MGMT-V10-04
**Success Criteria** (что должно быть TRUE):
  1. User открывает AI tab → видит eyebrow «AI · ASSISTANT / ONLINE» + DM Serif Italic 36px observation поверх данных (rule-engine: «{Month} в плюсе на X ₽» / «{Category} уже +N% к лимиту» / «За неделю экономия Y ₽» / «Завтра списание подписок на Z ₽», cache 1h) + 4 chip-подсказки (DM Serif italic 18px) с `→`; tap чипа → отправляет prompt; active-state reuses v0.6 SSE streaming с typing-indicator (3 dots posterDot animation).
  2. User в Savings (чёрный фон) видит Mass italic «Копилка.» + жёлтую plate «НАКОПЛЕНО ВСЕГО X ₽» + eyebrow «В МАЕ + Y ₽»; toggle ВКЛ/ВЫКЛ + chips базы 10/50/100 ₽ работают через `PATCH /savings/config` (future-only effect); карточки целей с posterBarFill progress; CTA «+ НОВАЯ ЦЕЛЬ» / «ПОПОЛНИТЬ» открывают bottom-sheet form'ы (`POST /goals` / `POST /savings/deposit`).
  3. User в Accounts list (cream) видит Mass italic «Счета.» + dark plate «СУММАРНО · X ₽ · N счетов» + список (bank · type/mask · balance · бейдж ОСНОВНОЙ для primary); tap → push Account Detail (чёрный фон, Mass italic банк-name, 2 KPI plates «БАЛАНС» yellow + «В МАЕ · N ОПЕРАЦИЙ» dark + список операций); CTA «ПЕРЕВОД» disabled с «SOON» badge (defer в v1.1 per OQ-10).
  4. User в Analytics (cream) видит Mass italic «Месяц.» + segmented диапазон «МАР 26 / АПР 26 / МАЙ 26 (•)» + 2 KPI plates («ПОТРАЧЕНО» dark с delta + «СЭКОНОМЛЕНО» yellow «+ X / от плана») + segmented «ДЕНЬ / НЕД. / КАТ.» + bar-chart с красным выделением столбцов ≥75% от плана + топ-5 категорий (re-use v0.6 endpoints).
  5. User в Management hub (чёрный фон) видит 5 numbered list-rows «01 PLAN МЕСЯЦА / 02 СЧЕТА / 03 АНАЛИТИКА / 04 НАСТРОЙКИ / 05 ДОСТУП» (admin only — owner role); tap → push соответствующий screen; Settings — rewrite v0.6 form в poster-стиле без функциональных изменений; Access — admin Users / AI Usage tabs в poster-стиле (re-use v0.6 endpoints).
**Plans**: 11 plans (3 waves)
- [x] 27-01-PLAN.md — backend ai/observation rule-engine + cache (AI-V10-03)
- [x] 27-02-PLAN.md — web AI shell: initial observation + 4 chips + active SSE (AI-V10-01, AI-V10-02, AI-V10-04, AI-V10-05)
- [x] 27-03-PLAN.md — web Savings: total + roundup + goals + deposit (SAV-V10-01..04)
- [x] 27-04-PLAN.md — web Accounts list + detail + new-account sheet (ACCT-V10-01..04)
- [x] 27-05-PLAN.md — web Analytics: segmented + 2 KPI plates + bar chart + top5 (ANAL-V10-01..04)
- [x] 27-06-PLAN.md — web Mgmt hub + Settings + Access + V10MainShell wire (MGMT-V10-01..04)
- [x] 27-07-PLAN.md — iOS AI shell symmetric to 27-02 (AI-V10-01, AI-V10-02, AI-V10-04, AI-V10-05)
- [x] 27-08-PLAN.md — iOS Savings symmetric to 27-03 (SAV-V10-01..04)
- [x] 27-09-PLAN.md — iOS Accounts list + detail symmetric to 27-04 (ACCT-V10-01..04)
- [x] 27-10-PLAN.md — iOS Analytics symmetric to 27-05 (ANAL-V10-01..04)
- [x] 27-11-PLAN.md — iOS Mgmt + Settings + Access + V10MainShell wire (MGMT-V10-01..04)
**UI hint**: yes

### Phase 28: Animations Polish + Acceptance
**Goal**: Финализация v1.0 — все 11 keyframe-анимаций работают точно по spec на каждом экране (web + iOS), accessibility audit (VoiceOver, edge-swipe label, UPPERCASE letter-by-letter override) пройден, pixel-perfect side-by-side QA каждого экрана через Playwright `toHaveScreenshot()` (web) и manual XcodeBuildMCP (iOS) выполнен с `DIVERGENCES.md`, performance целевые (Lighthouse mobile > 90, LCP < 2.5s, woff2 < 200kB gzipped, count-up first paint < 1.5s), migration safety + acceptance §14 ТЗ подтверждены.
**Depends on**: Phases 22-27 (все экраны должны существовать перед polish + acceptance).
**Requirements**: POL-01, POL-02, POL-03, POL-04, POL-05, POL-06, POL-07
**Success Criteria** (что должно быть TRUE):
  1. Все 11 keyframe-анимаций работают на каждом экране со stagger-индексами по DESIGN-SYSTEM §7.4 (rows 0.045s, day-groups 0.07s, hints 0.08s, regulars 0.09s); tab bar имеет 5 колонок 1fr 1fr 64px 1fr 1fr с sliding indicator 350ms sheetEase, tab-pop 0.45s overshoot, FAB 48×48 с `scale(0.88) rotate(-90deg)` на press; Toast top:64 с overshoot in + check-mark stroke-dashoffset + 1700ms life.
  2. User с включённым `prefers-reduced-motion` (web) / `accessibilityReduceMotion` (iOS) видит редуцированные анимации (opacity-only, без movement); accessibility audit с VoiceOver / TalkBack — UPPERCASE+letter-spacing 0.18em имеют `accessibilityLabel` overrides; iOS edge-swipe-back имеет `.accessibilityLabel("Назад")` + `.accessibilityAddTraits(.isButton)`; e2e UI test на real device проходит push 3 screens → swipe-back → assert top of stack.
  3. Каждый экран сверен с `prototype/index.html` через Playwright `toHaveScreenshot()` (web) и manual XcodeBuildMCP screenshot + Preview Canvas (iOS); divergences задокументированы в `.planning/v1.0-handoff/DIVERGENCES.md` (например iOS safe-area, dual-font hybrid rendering из ADR-001); CI-check `make hidden-unicode-grep` находит U+00AD / U+200B / U+200C / U+200D в репе.
  4. Performance: Home первая отрисовка с count-up завершается < 1.5s после launch (iPhone 11 / iPhone Pro target); Lighthouse mobile > 90 / LCP < 2.5s; bundle добавка woff2 < 200kB gzipped; alembic upgrade head → downgrade -1 → upgrade head без падения на копии prod DB; integration test `test_multitenancy_v1_0_columns.py` подтверждает RLS + composite FK защищают cross-tenant access.
  5. Acceptance §14 ТЗ полностью пройден: онбординг < 60 сек / Home показывает дневной темп с count-up / Add Sheet записывает за один tap / PLAN меняет лимиты (Σplan validation) / AI initial state работает / Копилка показывает накопления и цели / нет видимого FOUT после первого визита; default flips на `theme = .v10_poster` в acceptance, v0.6 код остаётся fallback на ~1 release.
**Plans**: 5 plans (1 wave)
- [x] 28-01-PLAN.md — web animations + a11y audit + Playwright reduce-motion test (POL-01 web, POL-02 web, POL-03 web)
- [x] 28-02-PLAN.md — iOS animations audit + PosterEdgeSwipe a11y patch + reduce-motion XCTest (POL-01 iOS, POL-02 iOS, POL-03 iOS)
- [x] 28-03-PLAN.md — Playwright pixel-perfect baseline + DIVERGENCES.md (POL-04 web + iOS)
- [x] 28-04-PLAN.md — Performance audit (bundle + Lighthouse + count-up smoke) (POL-05) [checkpoint:human-verify]
- [x] 28-05-PLAN.md — Migration safety + hidden-unicode + §14 ТЗ E2E happy-path (POL-06, POL-07)
**UI hint**: yes

## Dependency Graph (v1.0)

```
                    Phase 22 (Backend Foundation)
                              │
                              ▼
                    Phase 23 (Design System)        web ║ iOS параллельно
                              │
                              ▼
                    Phase 24 (Onboarding 4-step)    web → iOS
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Phase 25         Phase 26          Phase 27
        Home/Tx/Add      CatDet/PLAN/Subs  AI/Sav/Accts/Anal/Mgmt
        (web → iOS)      (web → iOS)       (web → iOS)
              │               │               │
              └───────────────┴───────────────┘
                              │
                              ▼
                    Phase 28 (Polish + Acceptance)
```

**Параллелизация workstreams** (через `git worktree`):
- Phase 22 — единственный workstream (backend-only, blocker всему)
- Phase 23 — 2 workstreams: `v1.0/23-web` ║ `v1.0/23-ios` (shared `tokens.json` codegen)
- Phase 24 — 2 workstreams sequenced: `v1.0/24-web` → `v1.0/24-ios` (web first для iOS pixel-perfect reference)
- Phase 25 ║ 26 ║ 27 — до 6 одновременных workstreams (web ║ iOS на каждой фазе) если bandwidth позволяет; merges в integration branch end-of-phase
- Phase 28 — единственный workstream (acceptance-only, после всех)

## Progress Table (v1.0)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 22 - Backend Schema & Logic Foundation | 0/16 | Not started | - |
| 23 - Design System Foundation | 0/12 | Not started | - |
| 24 - Onboarding 4-step | 0/0 | Not started | - |
| 25 - Home + Transactions + Add Sheet | 12/12 | Complete    | 2026-05-10 |
| 26 - Category Detail + PLAN мая + Subscriptions | 7/7 | Complete    | 2026-05-10 |
| 27 - AI + Savings + Accounts + Analytics + Management | 11/11 | Complete    | 2026-05-10 |
| 28 - Animations Polish + Acceptance | 5/5 | Complete    | 2026-05-10 |

## Coverage Validation (v1.0)

**Total v1.0 requirements:** 92
**Mapped to phases:** 92
**Orphaned:** 0
**Duplicates:** 0

| Category | Count | Phase |
|---|---|---|
| BACKEND-EXT | 16 | Phase 22 |
| DESIGN-SYSTEM | 8 | Phase 23 |
| ONB | 7 | Phase 24 |
| HOME | 6 | Phase 25 |
| TXN | 6 | Phase 25 |
| ADD | 5 | Phase 25 |
| CAT-DET | 6 | Phase 26 |
| PLAN | 6 | Phase 26 |
| SUBS | 4 | Phase 26 |
| AI | 5 | Phase 27 |
| SAV | 4 | Phase 27 |
| ACCT | 4 | Phase 27 |
| ANAL | 4 | Phase 27 |
| MGMT | 4 | Phase 27 |
| POLISH | 7 | Phase 28 |

**Phase loads:**
- Phase 22: 16 REQs
- Phase 23: 8 REQs
- Phase 24: 7 REQs
- Phase 25: 17 REQs (HOME 6 + TXN 6 + ADD 5)
- Phase 26: 16 REQs (CAT-DET 6 + PLAN 6 + SUBS 4)
- Phase 27: 21 REQs (AI 5 + SAV 4 + ACCT 4 + ANAL 4 + MGMT 4)
- Phase 28: 7 REQs

✓ All 92 v1.0 requirements mapped to exactly one phase.
✓ No orphaned requirements.
✓ No duplicates.

---
*Roadmap reorganized: 2026-05-06 at v0.3 milestone close*
*v0.4 closed: 2026-05-07 — full archive in `milestones/v0.4-ROADMAP.md`*
*v0.5 closed: 2026-05-08 — full archive in `milestones/v0.5-ROADMAP.md`*
*v0.6 closed: 2026-05-09 — full archive in `milestones/v0.6-ROADMAP.md`*
*v1.0 started: 2026-05-09 — Maximal Poster Full (Phases 22-28), integration branch `v1.0-maximal-poster`*
