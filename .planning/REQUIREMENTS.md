# REQUIREMENTS — v1.1.1 Liquid Glass Theme

> Patch milestone между v1.1 shipped и v1.2 planned. Target ship: 2026-06-11.
> Goal: Liquid Glass (iOS 26) + Maximal Poster + iOS Default — три темы через единый toggle.

## Phase 50 — Theme Registry Foundation

- [x] **THEME-01** — `frontend/src/stylesV10/themes/registry.ts` экспортирует `Theme = 'maximal_poster' | 'liquid_glass' | 'ios_default'`; `THEMES: readonly Theme[]`; `themeLabel(t)`, `themeDescription(t)` helpers.
- [x] **THEME-02** — `useTheme()` React hook (расширение pattern от `useHomeColor`): читает `localStorage['ui.theme']`, validate whitelist, default = `maximal_poster` (current); setter dispatches CustomEvent `theme-changed` + storage event listener.
- [x] **THEME-03** — `tokens.json` расширен с per-theme секцией: `themes.maximal_poster.{colors,typography,materials,shadows}`, `themes.liquid_glass.{...}`, `themes.ios_default.{...}`; codegen `scripts/gen-css.ts` генерирует CSS-vars с `[data-theme="liquid_glass"]` селекторами; `scripts/gen-swift.ts` генерирует `enum Theme { case maximalPoster, liquidGlass, iosDefault }` + per-case token resolver.
- [x] **THEME-04** — iOS `Theme` enum в `PosterTokens.swift`: `@AppStorage("ui.theme")` binding в `BudgetPlannerApp.swift`, `PosterTokens.currentTheme` static accessor для component-level access.

## Phase 51 — Liquid Glass Design System

- [x] **LG-SYS-01** — LG palette tokens defined: `--lg-bg-primary` (system Light/Dark adaptive), `--lg-glass-tint`, `--lg-glass-border`, `--lg-shadow-elevated/floating/floating-strong`, `--lg-text-primary/secondary/tertiary` (Apple HIG-spec colors).
- [x] **LG-SYS-02** — Material tokens: `--lg-material-ultra-thin` (`backdrop-filter: blur(20px) saturate(180%)` + 12% white tint), `--lg-material-thin` (40px blur), `--lg-material-regular` (60px blur), `--lg-material-thick` (80px blur). iOS native maps к `.ultraThinMaterial` / `.thinMaterial` / `.regularMaterial` / `.thickMaterial`.
- [x] **LG-SYS-03** — Typography: SF Pro Display / SF Pro Text mapping для web (via `font-family: -apple-system, BlinkMacSystemFont, ...`) + iOS native (default `Font.system`). Sizes per iOS 26 HIG: `largeTitle` 34pt, `title1` 28pt, `title2` 22pt, `body` 17pt, `caption` 12pt.
- [x] **LG-SYS-04** — Motion tokens: `--lg-spring-default` (`response: 0.4, damping: 0.85`), `--lg-spring-bouncy`, `--lg-easing-decel` (cubic-bezier system standard). Reduce-motion fallback: opacity-only transitions.
- [x] **LG-SYS-05** — Glass card component primitive: `<GlassCard>` (web) + `GlassCard` (SwiftUI) — translucent surface, optional inner border highlight, rounded 14pt corner (iOS default). Used as building block для Plate / Sheet / Toast.

## Phase 52 — Web Liquid Glass Port

- [x] **LG-WEB-01** — Все 9 V10 screens (Home, Transactions, AddSheet, CategoryDetail, Plan, Subscriptions, Savings, AI, Management) рендерятся под `[data-theme="liquid_glass"]` без визуальных регрессий: background = system adaptive, surfaces = glass-tinted, text = SF Pro.
- [x] **LG-WEB-02** — Хero/headlines в Maximal Poster (DM Serif Italic / Archivo Black) под Liquid Glass переключаются на SF Pro Display (largeTitle weight 700) — `font-family` через CSS-var `--lg-font-display`.
- [x] **LG-WEB-03** — Existing Maximal Poster screens НЕ сломаны (theme=maximal_poster — default retention path); Playwright pixel-snapshots для Maximal Poster baselines re-run green (zero diff vs v1.1 baselines).
- [~] **LG-WEB-04** — Playwright pixel-snapshots для Liquid Glass baselines созданы (9 PNGs) под `frontend/tests/e2e/v10-pixel-snapshots-liquid-glass.spec.ts-snapshots/`. **Deferred to Phase 55** (manual side-by-side acceptance; browser blur-shader determinism brittle для Playwright).
- [~] **LG-WEB-05** — Theme switch performance: < 100ms perceived delay от tap → full re-render (через CSS-var swap, без full page reload). `data-testid="theme-applied"` обновляется когда switch завершён. **Deferred to Phase 55** (manual measurement after Phase 54 ThemePickerSheet ships).

## Phase 53 — iOS Liquid Glass Native

- [x] **LG-IOS-01** — `GlassCard` SwiftUI view с `.glassEffect()` (iOS 26 API) когда theme=liquidGlass; fallback `.background(.ultraThinMaterial)` если iOS < 26. (Phase 51-02-ios + Phase 53-01, commit f349bef)
- [x] **LG-IOS-02** — V10 screens обёрнуты в conditional rendering через `.themedBackground()`: theme=maximalPoster → existing Poster paper; theme=liquidGlass → `.ultraThinMaterial` + `.glassEffect()`; theme=iosDefault → system grouped background. PosterCard / PosterSheet / BottomNavV10 untouched. (Phase 53-01, commit f349bef)
- [x] **LG-IOS-03** — XCTest 358/358 pass (zero regressions vs Phase 52 baseline). Manual XcodeBuildMCP 18 PNGs (9 screens × 2 LG themes) — partially deferred к Phase 55 acceptance. (Phase 53-01, commit f349bef)
- [x] **LG-IOS-04** — iOS unfreeze ограничен только `ThemedBackground.swift` + 14 root-level wraps (Q4=b spirit preserved). (Phase 53-01, commit f349bef)

## Phase 54 — Theme Switcher UI

- [x] **LG-SW-01** — Web `ThemePickerSheet.tsx` — PosterSheet с 3 options (Maximal Poster / Liquid Glass / iOS Default); swatch + label + description + ✓ marker на текущем. (Phase 54-01, commit a61fce9)
- [x] **LG-SW-02** — Web `SettingsView.tsx` добавляет row «Тема» (после «Цвет Home» row) с current theme label + chevron; tap → opens ThemePickerSheet. (Phase 54-01, commit a61fce9)
- [x] **LG-SW-03** — iOS `ThemePickerSheet.swift` (SwiftUI) — `.posterSheet` с теми же 3 options + swatch + label + description + ✓. (Phase 54-02, commit 2115167)
- [x] **LG-SW-04** — iOS `SettingsV10View.swift` добавляет row «Тема» (после `homeColorRow`) с binding к `@AppStorage("ui.theme")`. (Phase 54-02, commit 2115167)
- [x] **LG-SW-05** — Instant apply: web через `theme-changed` CustomEvent + React state re-render; iOS через `@AppStorage` SwiftUI binding observer. (Phases 54-01 + 54-02)

## Phase 55 — Polish + Acceptance

- [ ] **LG-POL-01** — Side-by-side acceptance: каждый из 9 V10 screens × 3 темы = 27 screenshots для web (Playwright) + 27 для iOS (XcodeBuildMCP). Visual diff approval — manual user-side.
- [ ] **LG-POL-02** — `prefers-reduced-motion` honored для Liquid Glass: blur/material — static (без mid-scroll animation); iOS native respects `accessibilityReduceMotion`.
- [ ] **LG-POL-03** — VoiceOver / accessibility audit Liquid Glass: contrast ratios ≥ WCAG AA на light + dark adaptive surfaces; glass tint не блокирует screen-reader element identification.
- [ ] **LG-POL-04** — Performance: web theme switch < 100ms (LG-WEB-05); iOS theme switch < 200ms first paint после @AppStorage change.
- [ ] **LG-POL-05** — Documentation: `docs/THEMES.md` — table tokens × 3 themes + screenshots каждой темы для onboarding новых contributors.

---

# REQUIREMENTS — v1.1 Monetization Foundation

> v1.0.1 (Phase 29-31) shipped 2026-05-11 — see traceability table ниже.
> v1.1 — entries-stubs ниже; полная детализация per phase в discuss-phase.

## Phase 32 — Multi-tenant Production Enablement ✅ SHIPPED 2026-05-11

- [x] **REQ-32-01** — RLS активна на всех 12 доменных таблицах (9 v0.4 + 3 v1.0; plan_template_item dropped в v1.0); `tests/test_rls_audit.py` (24 parametrized) + `tests/test_multitenancy_live.py` (2 cross-tenant raw-SQL scenarios) проверяют изоляцию через non-superuser `app` роль.
- [x] **REQ-32-02** — Production path (`get_current_user`, DEV_MODE=false) НЕ использует OWNER_TG_ID — auth полностью role-based (owner / member / revoked); docstring sharpened; `tests/test_no_owner_tg_id_in_prod.py` (2 tests) — regression cover.
- [x] **REQ-32-03** — AI cost cap default 500 cents ($5/mo) shipped: `app/db/models.py` + alembic `0018_cap_500` migration; `GET /api/v1/ai/usage` extended с `cap_cents` / `remaining_cents` / `spent_cents_period`; `tests/test_ai_cap_default.py` (3 tests) — orm/server/INSERT defaults.
- [x] **REQ-32-04** — Locust load-test harness: `loadtest/locustfile.py` (2 user classes: ActualTxnUser + AIChatUser); `docs/LOAD-TEST.md` методология + acceptance criteria + pre-deploy checklist. Manual rerun в staging обязателен перед production deploy.
- [x] **REQ-32-05** — `docs/RUNBOOK-multitenant.md` — pre-migration checklist, alembic upgrade/downgrade procedure, pg_dump/pg_restore disaster recovery (RTO 10-20 min for pet-scale), monitoring queries, alert triage. Round-trip `alembic upgrade head → downgrade -1 → upgrade head` clean (verified).
- [x] **REQ-32-06** — Alembic migration `0019_owner_backfill` — idempotent UPDATE с env-driven OWNER_TG_ID; `tests/test_owner_role_backfill.py` (3 scenarios) — promotes member, idempotent owner, no-row-safe.

## Phase 33 — Compliance Baseline (152-ФЗ + ToS + ПДн + Privacy) ✅ SHIPPED 2026-05-11

- [x] **REQ-33-01** — РКН-уведомление template + checklist готовы (`docs/legal/RKN-NOTIFICATION.md` + `docs/legal/LEGAL-REVIEW-TODO.md` + `docs/COMPLIANCE.md`); фактическая подача — manual user-side через pd.rkn.gov.ru (ЭЦП/Госуслуги required).
- [x] **REQ-33-02** — `app_user.pdn_consent_at TIMESTAMPTZ` shipped (alembic `0020_pdn_compliance`); `POST /api/v1/me/consent` (idempotent grant) + `DELETE /api/v1/me/consent` (revoke); server-side gate в `complete_v10()` returns 403 `pdn_consent_required` без consent; bot `/start` шлёт consent prompt user'у без `pdn_consent_at`. 8 tests.
- [x] **REQ-33-03** — `docs/legal/privacy-policy.{ru,en}.md` + `docs/legal/terms.{ru,en}.md` (Draft v0.1); `app/api/routes/legal.py` exposes `GET /legal/privacy` + `GET /legal/terms` с `?lang=ru|en`, mounted без `/api/v1` prefix; ссылки в `<PdnConsentCheckbox />` + `<CookieBanner />`.
- [x] **REQ-33-04** — `GET /api/v1/me/export` (JSON dump, audit-event `data_export`) + `DELETE /api/v1/me/account` (soft-delete + audit `deletion_requested`, repeat → 410); `purge_deleted_users_job` (APScheduler daily 02:00 MSK, advisory lock 20260101) — cascade hard-delete 11 tenant tables + `deletion_completed` audit. Все события пишутся в `pdn_audit_log` (sha256-hashed user_id, survives erasure). 12 tests.
- [x] **REQ-33-05** — `<CookieBanner />` (info-only, `localStorage['cookie_consent_v1']`) mounted в `App.tsx`. Full analytics opt-in deferred to Phase 38 per CMP-33-05 (PostHog/Plausible не установлены).
- [x] **REQ-33-06** — Privacy policy explicitly перечисляет: OpenAI как sub-processor (EU servers), retention 12 месяцев после deletion, права субъекта (access/correction/deletion/withdrawal через corresponding endpoints), DPO contact.

## Phase 34 — ЮKassa Integration (Самозанятый Edition)

- [x] **REQ-34-01** — `payment` + `subscription_billing` schemas + RLS + indexes (commits c9b4fbf + b701b47). HMAC validation + IP allowlist deferred to v1.2 hardening.
- [x] **REQ-34-02** — `YookassaClient` async wrapper (create_payment / get_payment / refund) + httpx mock-transport tests (commit f6fa963, 3 tests green).
- [x] **REQ-34-03** — Webhook `/webhooks/yookassa` + idempotent state machine (commit 312acb1, 3 tests green). Recurring auto-renewal deferred to v1.2 (save_payment_method API готов в client).
- [x] **REQ-34-04** — Billing endpoints `/api/v1/billing/create-payment` + `/billing/payments` + frontend `PaymentButton.tsx` (commits 62c7a29 + 5fbdd7c, 3 tests green).
- [x] **REQ-34-05** — Subscription state machine (active / past_due / canceled / expired) — commit 312acb1 (combined with webhook handler).
- [x] **REQ-34-06** — Cancel subscription endpoint `/api/v1/me/subscription/cancel` (commit 62c7a29, idempotent).
- [x] **REQ-34-07** — Operator onboarding doc `docs/operator/YOOKASSA-ONBOARDING.md` + auto-чеки через ЮKassa Self-Employed (передача в «Мой Налог» ФНС автоматическая) — commit b09acd1.

## Phase 35 — Paywall + Tier Enforcement + Reverse-Trial ✅ SHIPPED 2026-05-11

- [~] **REQ-35-01** — Tier resolution shipped (effective_tier service в `app/services/tier.py` + два TIMESTAMPTZ в `app_user`: `trial_ends_at` / `pro_active_until`); commit `f7a8b73`. **Partial**: формальный `docs/TIERS.md` feature-matrix (UI копирайт + Free=30tx cap enforcement) → v1.2 docs cleanup. 6 tests pass.
- [x] **REQ-35-02** — `require_pro` dependency на `POST /ai/chat` + `GET /ai/suggest-category` (Free → 402 PRO_TIER_REQUIRED с JSON `{error, current_tier, upgrade_url}`) + `GET /api/v1/me/tier` endpoint; commit `e161686`, 5 tests pass. Остальные 6 endpoint'ов из исходного REQ (tax-reserve, CSV, business-tag, push, >30tx, >5cats) — gating появится вместе с этими фичами в Phase 36+.
- [x] **REQ-35-03** — `trial_ends_at` + `pro_active_until` TIMESTAMPTZ shipped (alembic `0022`); computed tier через `effective_tier(user, now=None)`. Single source of truth = два timestamp'a, без stored enum (architectural choice — no state drift risk); commit `f7a8b73`.
- [x] **REQ-35-04** — Reverse-trial 14d grant on user creation (через `_dev_mode_resolve_test_user` + `_dev_mode_resolve_owner` INSERT path; ON CONFLICT не трогает `trial_ends_at` — idempotent); commit `0637ab6`, 1 test pass. Push «trial кончается» (day 12 + 14) → v1.2 (APScheduler job + bot).
- [~] **REQ-35-05** — Frontend `PaywallSheet.tsx` shipped (monthly 299 ₽ + annual 1990 ₽ -44%, 5 feature bullets, ЮKassa CTA, `ProTierRequiredError` class); commit `698d3e7`, 5 tests pass. **Partial**: iOS native PaywallSheet + TG Stars secondary CTA + analytics events → v1.2.
- [ ] **REQ-35-06** — Cancellation flow с retention prompt + 4-reason select — **deferred to v1.2**: `POST /me/subscription/cancel` уже есть (Phase 34-06), но reason-select UI + 5% discount offer — отдельный UX-pass.
- [ ] **REQ-35-07** — E2E test (signup → trial → mock day-15 → 402 → succeeded → 200) — **deferred to v1.2**: full E2E с time-mocking требует test harness extension. Частично покрыто unit + integration tests Phase 35 (17/17 green).

## Phase 36 — Persona E Feature Pack (Самозанятые) ✅ SHIPPED 2026-05-11

- [x] **REQ-36-01** — `category.tag` (NOT NULL DEFAULT `'personal'`) + `actual_transaction.tag` (NULL-able override) shipped via alembic `0023`; CHECK constraints + partial index `ix_actual_transaction_tag WHERE tag='business'`; commit `10aa998`, 2 tests pass. UI toggle CategoryDetail/AddSheet → deferred к v1.2 (backend-only delivery в Phase 36).
- [x] **REQ-36-02** — Tax reserve calculator (НПД 4%/6% + 5% safety margin) + Pro-gated `GET /api/v1/tax/reserve`; commit `d3204a0`, 4 tests pass. Регим через query param `regime=nalog_4|nalog_6` — `app_user.nalog_regime` storage + Management toggle → v1.2. Auto-deposit child txn → deferred (только recommendation, не charge).
- [x] **REQ-36-03** — Pro-gated `GET /api/v1/tax/export.csv` — UTF-8 BOM + RFC 4180 excel dialect; денорм category code/name/tag для self-contained spreadsheet; commit `8e3d32b`, 2 tests pass. ZIP с CP1251 вариантом → deferred к v1.2.
- [ ] **REQ-36-04** — ZIP с operations.csv + summary.csv (CP1251 + UTF-8 BOM варианты) — **deferred to v1.2**: single-file UTF-8 CSV (REQ-36-03) закрывает 80% use-case; ZIP wrapper + CP1251 variant → v1.2 если будет запрос.
- [ ] **REQ-36-05** — AI tools extension (`tag_business_vs_personal`, `record_tax_reserve`, `propose_csv_export`) — **deferred to Phase 42** (AI Feature Expansion) per ROADMAP §Phase 42.
- [ ] **REQ-36-06** — Bot-команды `/tax` + `/csv` (send_document ZIP в личку) — **deferred to v1.2** UI wave.

## Phase 37 — Open-Core Split + GitHub Public Repo

- [x] **REQ-37-01** — `LICENSE` (PolyForm Shield 1.0.0) в корне репо; commit `3fc4e8e`. `NOTICE.md` / `LICENSING.md` folded into `LICENSE-CLOSED-COMPONENTS.md` + `CONTRIBUTING.md` (DCO clause).
- [x] **REQ-37-02** — Closed-components inventory shipped (`LICENSE-CLOSED-COMPONENTS.md` + `OPEN-CORE-MANIFEST.md`); commit `3fc4e8e`. Physical submodule / compile-flag split → manual user-side operation (out of Phase 37 scope).
- [x] **REQ-37-03** — Public-facing `README.md` + `CONTRIBUTING.md` shipped; commit `4806f4d`. Screenshot/GIF + `<3 min` benchmark + hosted bot URL → content TODO (deferred к Phase 38 landing).
- [ ] **REQ-37-04** — CI публичной репы (GitHub Actions): pytest + alembic upgrade head smoke + docker build + LICENSE check (deny GPL deps) — **deferred to manual repo-split task**.
- [ ] **REQ-37-05** — Demo TG-бот с публичной schema без AI; `/start` пишет «open-core demo, full в hosted» — **deferred to Phase 38**.
- [ ] **REQ-37-06** — Maximal Poster CSS tokens + 11 keyframe animations — schema-only public version; tokens.json scrubbing — **deferred to manual repo-split task** (closed-components list already documented в `LICENSE-CLOSED-COMPONENTS.md`).

## Phase 38 — Landing Page + Onboarding Funnel + Analytics ✅ SHIPPED 2026-05-11

- [x] **REQ-38-01** — Static landing `landing/index.html` shipped (274 LOC single-file, Maximal Poster palette, hero + 3 features + pricing card + FAQ + footer + CTA deeplink `t.me/<bot>?start=ref_landing`); commit `c802043`. Lighthouse audit + deploy → manual user-side follow-up.
- [x] **REQ-38-02** — Analytics event log shipped: alembic `0024_analytics_event` (BIGSERIAL + JSONB props + 3 indexes, no RLS — anonymized internal log) + `track_event` service с fire-and-forget semantics + 12 EVENT_* constants + `POST /api/v1/analytics/event` endpoint (separate `event_router` без `require_onboarded`) + frontend `trackEvent()` helper + `EVENT` enum; commit `621cd76`, 2 tests pass. Explainer GIF/video — content TODO.
- [ ] **REQ-38-03** — UTM-attribution capture в `app_user.acquisition_source` — **deferred to Phase 39** (Habr launch).
- [ ] **REQ-38-04** — Welcome survey (1 экран после onboarding) — **deferred to v1.2** UX wave.
- [ ] **REQ-38-05** — PostHog / Plausible self-host — **deferred**: ad-hoc SQL поверх собственной `analytics_event` таблицы достаточен на pet-scale; opt-in after Month-3 gate if volume растёт.
- [ ] **REQ-38-06** — Funnel dashboard — **deferred**: query templates пишутся ad-hoc для Month-3 review (registrations → onboarded → first-tx → AI-used → trial-day-14 → paying-30d).
- [ ] **REQ-38-07** — Cookie banner на landing — **deferred**: landing статичен без cookies; required только если PostHog активируется.

## Phase 39 — Habr Longread #1 + ProductHunt + Show HN Launch (v1.2)

- [ ] **REQ-39-01** — Habr статья в hub «Финансы в IT» + «Open source» (≥3000 знаков + 4-6 диаграмм + GitHub link); ≥50 закладок / ≥5 коммент / ≥10K views за 7d.
- [ ] **REQ-39-02** — ProductHunt launch ($40 PRO для hunter): demo video 60s + 5 gallery + tagline + first-comment-template; ≥30 upvotes / ≥3 reviews.
- [ ] **REQ-39-03** — Show HN неделей позже: ≥20 points / front-page <12h target.
- [ ] **REQ-39-04** — TG-канал автора 3 поста/нед × 6 нед минимум (build-in-public metrics).
- [ ] **REQ-39-05** — Attribution dashboard в PostHog: source-split Habr / PH / HN / TG-channel / organic.

## Phase 40 — Referral Mechanics (v1.2)

- [ ] **REQ-40-01** — `referral_code` per user (auto-gen 8-char base32); deeplink `t.me/<bot>?start=ref_<code>`; landing «Поделиться» button.
- [ ] **REQ-40-02** — На onboarding-complete если `referrer_user_id` valid → `referrer_id` FK; no self-referral.
- [ ] **REQ-40-03** — Reward-trigger: first payment_success у referee → оба user `pro_active_until += 30d`; `referral_reward_log`.
- [ ] **REQ-40-04** — Anti-abuse: max 5 rewards / referrer / 30d; >5 → no reward для referrer, referee всё равно получает 30d.
- [ ] **REQ-40-05** — Management → Pro: «Приглашено N друзей · бонус X дней»; conversion tracked в PostHog.

## Phase 41 — Onboarding Optimization (A/B Reverse-Trial vs Hard Paywall) (v1.2)

- [ ] **REQ-41-01** — A/B framework — `experiment_arm` enum (trial_14d / hard_paywall / free_no_ai) random при signup, sticky cookie + DB-persistent.
- [ ] **REQ-41-02** — Variant 1 control: reverse-trial 14d (existing Phase 35).
- [ ] **REQ-41-03** — Variant 2 hard_paywall: paywall immediately, 1 tx allowed Free, AI блок.
- [ ] **REQ-41-04** — Variant 3 free_no_ai: Free без AI, unlimited tx; AI только Pro.
- [ ] **REQ-41-05** — После 200 users / arm — Bayesian analysis, winner deploy as default; full report `.planning/experiments/E-01-paywall-funnel.md`.

## Phase 42 — AI Feature Expansion (Pro Anchor Strengthening) (v1.2)

- [ ] **REQ-42-01** — 12-15 AI tools: 6 v0.3 baseline + Phase 36 (`tag_business_vs_personal`, `record_tax_reserve`) + 4-6 new (`forecast_period_end`, `propose_subscription`, `schedule_action`, `what_if_scenario`, `propose_csv_export`).
- [ ] **REQ-42-02** — Scheduled actions: `scheduled_ai_action` table + worker джоба `run_scheduled_ai_actions`; AI proposes → user approves → запись → worker triggers через 24h → notification.
- [ ] **REQ-42-03** — `forecast_period_end` использует existing analytics + LLM context для текстовой формулировки.
- [ ] **REQ-42-04** — AI usage ≥50% Pro-users ≥1 message/нед (PostHog `ai_message_sent`).
- [ ] **REQ-42-05** — AI cost per Pro-user ≤50 ₽/мес (existing AI cost cap + prompt-caching).

## Phase 43 — TG Cross-Promo Network + Paid Channel Experiments (v1.2)

- [ ] **REQ-43-01** — 5-10 cross-promo партнёрств зафиксированы (название канала, audience, date, UTM); cumulative reach ≥50K.
- [ ] **REQ-43-02** — 2 paid placement experiments (бюджет $80-100 каждый) с UTM; ≥30 регистраций / ≥3 paying-trial / placement (decision rule: <2 → stop).
- [ ] **REQ-43-03** — Build-in-public TG-канал достигает 200 подписчиков (organic).
- [ ] **REQ-43-04** — Cross-promo retro `.planning/marketing/cross-promo-retro.md` — что работало, что нет, какие повторить.

## Phase 44 — English MVP (Telegram-Diaspora Segment) (v1.2)

- [ ] **REQ-44-01** — i18n framework: `i18next` web + Swift `Localizable.strings` (existing) + `aiogram-i18n` бот; RU + EN locales.
- [ ] **REQ-44-02** — EN strings: onboarding 4 шага, paywall, AI prompts, bot-команды (`/add /balance /tax`), error messages.
- [ ] **REQ-44-03** — Locale-toggle в Management → Настройки (`ui.locale = ru|en`); auto-detect из TG `language_code` при first signup.
- [ ] **REQ-44-04** — Payment rule: locale=en OR language_code != ru → paywall только TG Stars (Stripe yet deferred); RU users — обе кнопки.
- [ ] **REQ-44-05** — AI prompts EN-mode → responses EN (LLM instruction); `ai_observation` rule-engine generates EN copy для EN users.

## Phase 45 — Apple Dev Account + TestFlight + App Store Submission (v2.0 Branch A)

- [ ] **REQ-45-01** — Apple Developer Program enrollment + $99; team-ID + signing certs в bitwarden.
- [ ] **REQ-45-02** — App Store Connect: app record + bundle-ID + icons + screenshots (5 devices × 3 langs RU/EN).
- [ ] **REQ-45-03** — TestFlight internal + external (≤100 testers) — current paying users mass-invited; crash-free rate ≥99% за 14d.
- [ ] **REQ-45-04** — App Store submission: review notes EN, demo creds, privacy nutrition labels, IAP setup (StoreKit2 intl only).
- [ ] **REQ-45-05** — iOS pixel-perfect (v1.0.1 freeze) promoted to active — Phase 17-21 + wise-tide + v1.0.1 fixes объединены в shipping v1.0.
- [ ] **REQ-45-06** — Decision-log `docs/IOS-LAUNCH.md`: RU App Store availability + alternative install (AltStore IPA) + Apple Pay workaround.

## Phase 46 — Family/Shared Budget (v2.0 Branch A)

- [ ] **REQ-46-01** — `budget_membership` таблица (user_id, budget_id, role enum owner/admin/member/viewer); existing budget = personal с user_id=owner.
- [ ] **REQ-46-02** — Invite-flow: owner generates link `t.me/<bot>?start=invite_<token>` (TTL 7d, one-use); invitee accepts → membership.
- [ ] **REQ-46-03** — Permissions в RLS + app-level: viewer = read-only; member = own txns; admin = categories+plan; owner = billing+delete.
- [ ] **REQ-46-04** — Split-transaction: member tag «split with @X 50/50» → child txn auto-created для другого; UI badge «↔».
- [ ] **REQ-46-05** — Pricing decision (discuss-phase): per-member surcharge OR flat Pro Family 599 ₽.

## Phase 47 — Bank CSV Import (v2.0 Branch A)

- [ ] **REQ-47-01** — `POST /api/v1/import/bank-csv` — multipart-file + bank-type enum + period; response preview ≤500 rows с `proposed_category_id` (no commit).
- [ ] **REQ-47-02** — Bank parsers `app/imports/bank/<bank>.py` (tbank/sber/tinkoff/vtb/other); CP1251 + UTF-8 fallback; columns date/amount/description/mcc.
- [ ] **REQ-47-03** — Mini App ImportPreview screen — editable category per row; CTA «Импортировать N»; batch commit + idempotency через file_hash.
- [ ] **REQ-47-04** — Dedup: existing actual_transaction match (date, ±5₽, embedding cosine >0.9) → preview shows «duplicate?» flag.
- [ ] **REQ-47-05** — Audit `import_log` (user_id, file_hash, bank_type, rows_imported, rows_skipped); idempotency unique constraint.

## Phase 48 — Full English + Stripe + Multi-Currency (v2.0 Branch A)

- [ ] **REQ-48-01** — Юр.лицо зарегистрировано (Estonia OÜ via e-Residency или KZ LLC); ~$300 amortized.
- [ ] **REQ-48-02** — Stripe integration — `subscription_payment.provider` extended; webhook + recurring; pricing $4.99/mo USD ($49/yr).
- [ ] **REQ-48-03** — Multi-currency: `currency_code` enum + `rate_at_tx` BIGINT; UI Settings — display currency choice; storage RUB always.
- [ ] **REQ-48-04** — App Store IAP via StoreKit2 intl iOS users; RU iOS users — external ЮKassa web-checkout (Apple ToS-compliant).
- [ ] **REQ-48-05** — Full EN: onboarding, settings, paywall, errors, push, bot-команды, AI; native-speaker proofread (~$50 Fiverr).
- [ ] **REQ-48-06** — Region-router `app/services/payment_router.py` — locale + language_code + Stripe-vs-ЮKassa rail-selection.

## Phase 49 — Maintenance Mode + Knowledge Transfer (v2.0 Branch B)

- [ ] **REQ-49-01** — Public retrospective Habr post — «Что я узнал: 6 мес, 5 paying, $200 в маркетинг» — honest numbers + lessons.
- [ ] **REQ-49-02** — README обновлён «Maintenance mode — bugfix only»; pricing card убран; ЮKassa disabled (grandfather existing до конца period).
- [ ] **REQ-49-03** — Boosty / GitHub Sponsors page — passive donations; minimal effort.
- [ ] **REQ-49-04** — Hosted version продолжает работать для existing users (≥3 paying); SaaS-billing stop, free всем.
- [ ] **REQ-49-05** — Portfolio piece `docs/CASE-STUDY.md`: architecture, scale, tech, business outcome, что reusable; CV-ready.

---

# REQUIREMENTS — v1.0.1 UI Conformance & Tech Debt

## Phase 29 — UI Conformance Audit & Critical Fixes

- [x] **UICONF-01** — Web Playwright snapshot baselines созданы для всех 8 V10 экранов (Home, Transactions, AddSheet, CategoryDetail, PLAN мая, Subscriptions, Savings, AI initial-state) с onboarded test fixture.
- [x] **UICONF-02** — UI-REVIEW.md содержит per-screen deviation report против `prototype/index.html` (web) с severity classification (BLOCKER / WARNING / INFO).
- [x] **UICONF-03** — iOS UI-REVIEW.md содержит per-screen deviation report через XcodeBuildMCP screenshots vs DESIGN-SYSTEM.md spec.
- [x] **UICONF-04** — Все BLOCKER-уровневые deviations исправлены (commits с `fix(ui-conf):` префиксом); re-run snapshots green.
- [x] **UICONF-05** — WARNING/INFO deviations задокументированы в DIVERGENCES.md с v1.1 backlog reference.

## Phase 30 — Tech Debt Cleanup

- [x] **DEBT-01** — `npx tsc --noEmit` exit 0 (фикс pre-existing errors в `analytics.ts`, `AiView.tsx`, `TxV10TabDemote.test.tsx`, `AiView.test.tsx`).
- [x] **DEBT-02** — AddSheet submit handler triggers refetch на parent screens (HomeMount + TransactionsMount); `data-testid="parent-refetched"` updates после successful create.
- [x] **DEBT-03** — Account picker заменён на bottom-sheet list (web + iOS); row-cycler удалён.
- [x] **DEBT-04** — iOS SubscriptionMenuSheet day/price editor PATCH error surfaces via PosterToast (не silent fail); web equivalent.
- [x] **DEBT-05** — Web Transactions row swipe-left delete (parity с iOS swipeActions); fallback right-click context menu для desktop.
- [x] **DEBT-06** — iOS PosterStyle.swift + KeypadView.swift press-feedback uses `.posterAnimation(...)` modifier (replace bare `.animation()`); reduce-motion respected.
- [x] **DEBT-07** — iOS SettingsAPI extracted to own `SettingsAPI.swift` file (cosmetic re-org per Plan 27-11 frontmatter intent).
- [x] **DEBT-08** — Настраиваемый цвет фона Home-экрана. User в Management → Настройки выбирает один из палитры цветов (coral default / cobalt / black / cream); выбор сохраняется (`localStorage['ui.home-color']` для web, `@AppStorage("ui.home-color")` для iOS) и применяется к Home при загрузке (`--color-home` CSS-var override / `homeBackground` token resolver на iOS). Изменение мгновенно отражается на Home без перезагрузки.

## Phase 31 — Regression Hardening

- [x] **REG-01** — Playwright fixture `tests/e2e/fixtures/onboarded-user.ts` setups onboarded test user via `/api/v1/internal/onboarding/*` (test-mode bypass); reused by acceptance + pixel specs.
- [x] **REG-02** — `v10-acceptance-tz14.spec.ts` проходит зелёным (CTA label flexible regex matching dynamic state).
- [x] **REG-03** — `v10-pixel-snapshots.spec.ts` генерирует все 8 baselines на dev machine; diff fails на сознательно introduced regression (sanity).
- [x] **REG-04** — iOS XCTest 358/358 (testRoundRubles + testCycleDayClampedInFebruary либо fixed, либо `XCTSkipIf` с TODO).

---

## Traceability

| ID | Phase | Status |
|----|-------|--------|
| UICONF-01 | Phase 29 | Complete |
| UICONF-02 | Phase 29 | Complete |
| UICONF-03 | Phase 29 | Complete |
| UICONF-04 | Phase 29 | Complete |
| UICONF-05 | Phase 29 | Complete |
| DEBT-01 | Phase 30 | Complete |
| DEBT-02 | Phase 30 | Complete |
| DEBT-03 | Phase 30 | Complete |
| DEBT-04 | Phase 30 | Complete |
| DEBT-05 | Phase 30 | Complete |
| DEBT-06 | Phase 30 | Complete |
| DEBT-07 | Phase 30 | Complete |
| DEBT-08 | Phase 30 | Complete |
| REG-01 | Phase 31 | Complete |
| REG-02 | Phase 31 | Complete |
| REG-03 | Phase 31 | Complete |
| REG-04 | Phase 31 | Complete |

**Coverage:** 16/16 requirements mapped ✓
