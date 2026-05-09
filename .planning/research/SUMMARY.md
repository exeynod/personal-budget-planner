# Project Research Summary — v1.0 «Maximal Poster Full»

**Project:** TG Budget Planner — milestone v1.0 (Maximal Poster Full)
**Domain:** Cross-platform UI migration (Telegram WebApp + native iOS) с pixel-perfect typographic poster дизайн-системой + расширение data model (Account / Goal / Recurrent / SavingsConfig / auto-roundup / rollover)
**Researched:** 2026-05-09
**Confidence:** HIGH

---

## Executive Summary

v1.0 — это два независимых трека под одним зонтом:
- **(A) Backend extension** под новые сущности (Account как реальный кошелёк, Goal, Recurrent заменяющий plan_template_item, SavingsConfig + auto-roundup, rollover остатков по категориям, расширение Category и Transaction) — это блокер всему UI.
- **(B) UI-rewrite на дизайн-систему «Maximal Poster»** — типографически-постерный визуал на 4-х кастом-шрифтах + 11 keyframe-анимаций + custom navigation/sheet/keypad на iOS — pixel-perfect side-by-side между Web TWA и нативным iOS.

Сложность не в количестве фич (39 TS + 11 DF, всё well-specified в handoff), а в **аккуратной интеграции с существующим v0.6 кодом** (single-tenant→multi-tenant RLS уже есть с v0.4; нельзя ломать backward compat для bot/AI tools).

Рекомендованный подход: **минимум новых dependencies** (4 npm-пакета для шрифтов на web, 0 SPM на iOS — все 11 анимаций через native SwiftUI primitives, custom `PosterNavStack` 50 LOC вместо UIKit-bridge, custom `PosterSheet` overlay вместо нативного sheet). Существующая архитектура (CSS Modules + tokens.css на web, vanilla SwiftUI 0-deps на iOS, FastAPI services-pattern на backend) расширяется, не переписывается. Backend: extend `Subscription` → `Recurrent` (single migration, 40 файлов не трогаем), новая таблица `Account` с service-layer balance-sync (триггеры опционально), enum `actual_transaction.kind` extension через `autocommit_block`, RLS обязательно на 4 новых таблицы.

Главные риски:
1. **DM Serif Display Italic не имеет кириллицы в Google Fonts** — блокирующий ADR до старта Phase 23
2. **Custom `PosterNavStack` теряет edge-swipe-back** на iOS
3. **FOUT vs LCP tension** — handoff требует «нет FOUT» что нереалистично с 4 family × Cyrillic subset
4. **Roundup integer math edge-cases** (overflow, kind=expense check, amount % base == 0)
5. **RLS policies для 4 новых таблиц** + composite FK для cross-tenant защиты на `parent_txn_id` и `category.parent_id`

Все mitigations известны и actionable.

---

## Stack Additions (compact)

| Платформа | Что добавляем | Почему |
|---|---|---|
| **Web** | `@fontsource-variable/manrope@5.2.8` | body, variable wght 200–800 + italic, cyrillic subset OK |
| **Web** | `@fontsource-variable/jetbrains-mono@5.2.8` | numbers/eyebrow, variable wght + ital, cyrillic OK |
| **Web** | `@fontsource/dm-serif-display@5.2.8` (`/400-italic.css` only) | italic-сериф акценты — **ВНИМАНИЕ: cyrillic под вопросом, см. ADR-001** |
| **Web** | `@fontsource/archivo-black@5.2.8` | display headlines, single weight 900, cyrillic OK |
| **Web** | (build target) `frontend/src/styles/animations.css` | 11 keyframes copy-paste из DESIGN-SYSTEM.md §7.2 |
| **iOS** | TTF в `Resources/Fonts/` (5 файлов, ~260 kB) + `UIAppFonts` Info.plist | синхронная регистрация, нет FOUT race |
| **iOS** | Variable TTF (Manrope, JetBrainsMono) | iOS 16+ supports variable fonts через `Font.custom().weight()`, экономит ~170 kB |
| **iOS** | (новые файлы) `PosterNavStack.swift`, `PosterSheet.swift`, `PosterTokens.swift`, `PosterTransitions.swift` | custom navigation/sheet, design tokens, 0 SPM dependencies |
| **Backend** | Alembic 0011 (Account, Goal, Recurrent ext, SavingsConfig) + 0012 (RLS + composite FK) | новые сущности под v1.0; миграция enum через `autocommit_block` |

**Что НЕ ставим:** Framer Motion / Motion (CSS keyframes покрывают 100%), Tailwind v4 (migration cost 28 .module.css), vanilla-extract (single-theme overhead), Lottie iOS (500 kB SPM, native primitives покрывают), `swiftui-navigation-transitions` SPM (custom-bezier всё равно вручную), Percy/BackstopJS (Playwright `toHaveScreenshot()` уже в проекте).

**Total bundle добавка:** Web ~110 kB woff2 (gzipped, all subsets), iOS ~260 kB TTF (~150 kB сжатый LZFSE).

---

## Feature Table Stakes (Top-10 critical, P1)

| # | Feature | Why expected |
|---|---|---|
| TS-08 | 5-tab nav (Home / Savings / FAB / AI / Mgmt) + sliding indicator + tab-pop | Foundation всей навигации; v0.6 сейчас 4 tab — IA shift |
| TS-09 + TS-20 | FAB → Add Sheet с custom 3×4 keypad | Core promise «один тап — одна запись»; iOS suppresses system kb для amount |
| TS-10 + TS-11 | Home: «дневной темп» count-up + sorted category list со stagger + bar fill | Anchor metric; ТЗ §1.2 «План всегда на виду» |
| TS-19 | PLAN мая со sliders 500₽ + блок «регулярные · провести в факт» + rollover chips | «Control room» бюджета; XL complexity, state-heaviest screen |
| TS-27 | Savings (Копилка) с roundup toggle + base 10/50/100 + goals progress | Differentiator; новый экран в v1.0 |
| TS-28 | Roundup auto-creation server-side (kind=roundup, parent_txn_id) | Magic, на которой строится Savings |
| TS-29 | Rollover остатков на закрытии периода (misc → virtual / savings → kind=deposit) | Закрывает месяц; cron-job extension |
| TS-01..07 | 4-step Onboarding (Доход → Счета → План → Цель) с persistence | First-launch gate; OQ-01 (LS draft) обязателен |
| TS-23 + TS-24 | Accounts list + Account Detail + primary badge | Wallet visibility; Home «в кошельке X ₽» зависит |
| TS-35 + TS-36 + TS-37 | Slide push/pop transitions + 4 fonts loaded + color tokens | Foundation для всего; FOUT acceptance §14.7 |

---

## Differentiators (unique to this product)

- **DF-01 — Print-typography aesthetic** (Maximal Poster: full-screen colored backgrounds coral/cobalt/cream/black + Mass italic + BigFig JetBrains negative letter-spacing). Нет аналогов в RU finance.
- **DF-02 — Daily-pace headline** как primary metric (не balance, не pie chart). Нудж «как долго не превышаю темп — всё ок».
- **DF-03 — Roundup → Savings** с base 10/50/100 (Acorns-style, редко в RU consumer apps).
- **DF-04 — Per-category rollover destination** (Прочее ↔ Накопления chip-pair на каждой PLAN row). Underspending = вознаграждение.
- **DF-05 — AI initial observation** (DM Serif 36px + 4 chip-suggestions, не пустой чат). Always-loaded, рекомендован rule-engine + LLM fallback (OQ-11).
- **DF-06 — Recurrent post-to-fact** (manual «провести в факт» вместо автопостинга subscriptions). Transparency.
- **DF-07 — Custom 3×4 numeric keypad** (suppresses system kb на iOS для amount field). Cross-platform consistency + faster чем system numeric kb.
- **DF-09 — Goal cards** с progress + due. Serotonin loop.
- **DF-10 — PLAN mid-month editing** без month-close (slider step 500₽ + live recalc «Осталось распределить»).

---

## Anti-Features (что НЕ строим)

- AF-01 — Bank-statement import / Open Banking (RU non-existent, ручной ввод — discipline mechanism)
- AF-02 — Multi-select на filter chips (single-select per prototype)
- AF-03 — Soft delete для transactions (only categories через `is_archived`)
- AF-04 — Multi-currency / FX
- AF-05 — Push-уведомления над budget overspend (notification fatigue, ТЗ §1.6 «никакой милоты»)
- AF-06 — In-app reduce-motion toggle (только OS setting через `prefers-reduced-motion` / `accessibilityReduceMotion`)
- AF-07 — Editable initial AI observation hide-button (defeat differentiator)
- AF-08 — Account-per-goal (goals = virtual progress trackers, savings = pooled)
- AF-09 — Skip на Onb steps 01/02/03 (только Goal step skippable)
- AF-10 — «Smart» auto-categorization bypass (AICAT-pre-select остаётся как hint, юзер confirm-tap)
- AF-11 — Real-time WebSocket sync web↔iOS (single-user-single-device; pull-on-foreground enough)
- AF-12 — Confirmation на roundup-toggle off с retroactive delete (future-only effect)

**Defer to v1.1+:** Account-to-account transfer (DF-11, OQ-10), AI-driven recurrent suggestions, multiple goals с goal-specific deposits, bot-command parity testing с новой schema.

---

## Critical Pitfalls — Top-5 (Watch out for)

1. **DM Serif Display Italic не имеет кириллицы в Google Fonts** (Pitfall 1). **Prevention:** перед началом Phase 23 прогнать `pyftsubset --unicodes='U+0410-044F'` character-coverage test; принять решение в **ADR-001**: вариант A (заменить на PT Serif Italic / Lora Italic / Source Serif 4 Italic — все cyrillic-готовы) / вариант B (DM Serif только для латинских вкраплений + dual-font через `unicode-range` для cyrillic) / вариант C (custom cyrillic add-on от designer).

2. **Custom `PosterNavStack` теряет edge-swipe-back** (Pitfall 4) — 90% iOS users instinct. **Prevention:** **ADR-002**: либо (i) `NavigationStack` + `.navigationTransition(.slide)` iOS 18+ (28px не достижим точно, но direction + timing совпадают), либо (ii) custom ZStack-based + `UIScreenEdgePanGestureRecognizer` руками + `.accessibilityLabel("Назад")` + `.accessibilityAddTraits(.isButton)`.

3. **FOUT acceptance §14.7 нереалистично** с 4 family × Cyrillic subset (Pitfall 2) — total ~250-300 kB шрифтов до first paint. **Prevention:** переформулировать §14.7 на «нет видимого FOUT после первого визита» (font-display: optional + service-worker cache + preload top-2 critical weights: Manrope 500 + JetBrains 600). Self-host woff2 subsetted. Lighthouse mobile > 90.

4. **Roundup integer math edge-cases** (Pitfall 5) — overflow, signed amount confusion, `amount % base == 0` skip case, `kind=='expense'` validation. **Prevention:** Phase 22 — service-функция `compute_roundup_delta(amount_cents: int, base_rubles: int) -> int` с unit-тестами на 8+ edge cases; SQL CHECK constraint `actual_transaction.amount_cents != 0`; integer-safe `((|amount_cents| + base_cents - 1) // base_cents) * base_cents` вместо `math.ceil()`; в Swift `Int64.multipliedReportingOverflow` или clamp validator.

5. **Multi-tenant migration leakage** (Pitfall 8) — RLS на 4 новых таблицах + composite FK для cross-tenant защиты. **Prevention:** Phase 22-01: `ENABLE ROW LEVEL SECURITY` + `FORCE` + `POLICY tenant_isolation` на каждой; composite unique `(id, user_id)` + composite FK `(parent_id, user_id) REFERENCES category(id, user_id)`; enum extension через `with op.get_context().autocommit_block()`; backfill `category.code`, `category.ord`, `savings_config` per existing user; integration test `test_multitenancy_v1_0_columns.py`.

**Дополнительные moderate pitfalls (не блокеры, но требуют внимания):** VoiceOver letter-by-letter на UPPERCASE русском (Pitfall 10), P3 vs sRGB на iOS Asset Catalog (Pitfall 11), Hidden Unicode chars в copy-paste (Pitfall 9), Animation jank на iPhone 11 (Pitfall 12), PLAN sum(plan) ≤ income race (Pitfall 17), Recurrent post race 2-tab (Pitfall 18), Account.primary uniqueness (Pitfall 20).

---

## Cross-Cutting Decisions (Required ADRs Before Phase 23)

### ADR-001: DM Serif Display Italic — Cyrillic Fallback Strategy

**Context:** DM Serif Display (включая Italic) — Latin/Latin-Extended/Vietnamese only. На Google Fonts subset=cyrillic для этого family **отсутствует**. Это самый яркий типографический акцент во всём design-system (AI наблюдение Hero, day-grouping в Transactions, Goal input, Final onboarding).

| Вариант | Pros | Cons | Effort |
|---|---|---|---|
| **A. Заменить на PT Serif Italic / Lora Italic / Source Serif 4 Italic** | Cyrillic-ready официально, Google Fonts стандарт | Brand divergence от handoff prototype; designer review нужен | S |
| **B. Dual-font через `unicode-range`** (DM Serif для Latin, PT Serif/Lora для русского) | Сохраняет DM Serif где возможно; самый close к prototype | Сложнее для iOS (composite UIFont) | M |
| **C. Заказать custom cyrillic add-on у foundry / designer** | Точное соответствие prototype | Time + cost; не подходит для pet | XL |

**Recommended:** **Вариант B (dual-font + unicode-range)** для Web; **Вариант A (PT Serif Italic)** для iOS как pragmatic fallback. Запротоколировать в `.planning/research/ADR-001-cyrillic-font-fallback.md` до старта Phase 23.

**Affects:** Phase 23 (font assets), Phase 24-27 (везде где DM Serif), Phase 28 (acceptance pixel-perfect parity).

### ADR-002: PosterNavStack Approach — Custom ZStack vs NavigationStack Override

**Context:** ТЗ §2 + DESIGN-SYSTEM §7.2 требуют `posterSlideInFwd` (28px справа, 420ms easeOut). Native iOS `NavigationStack` использует системный slide ~60% width ~350ms — нельзя override на custom-bezier+offset.

| Вариант | Pros | Cons | Effort |
|---|---|---|---|
| **A. NavigationStack + `.navigationTransition(.slide)` (iOS 18+)** | Edge-swipe-back работает out-of-box, accessibility traits сохраняются | 1px diff с spec; `.navigationTransition` имеет только presets | S |
| **B. Custom PosterNavStack** (ZStack + asymmetric transition + @Observable router) | Точное соответствие spec; 0 dependencies | **Теряет edge-swipe-back** (Pitfall 4); требует ручной `UIScreenEdgePanGestureRecognizer` + accessibility labels | M |
| **C. UINavigationController через UIViewControllerRepresentable + custom UIViewControllerAnimatedTransitioning** | Абсолютный контроль, edge-swipe сохраняется | ~150 LOC boilerplate, UIKit↔SwiftUI state sync complexity | L |

**Recommended:** **Вариант B (Custom PosterNavStack)** + obligatory ручная имплементация edge-swipe (только когда stack count > 1, `minimumDistance: 24`). Запротоколировать в `.planning/research/ADR-002-poster-nav-stack-approach.md`.

**Affects:** Phase 23 (PosterNavStack.swift), Phase 25 (первое использование), Phase 28 (accessibility audit + edge-swipe e2e на real device).

---

## 5 User-Decision Open Questions (REQUIRES_DECISION before roadmap finalization)

| # | Open Question | Recommendation | Affects | Phase |
|---|---|---|---|---|
| **OQ-13** | **Где в v1.0 Mgmt находятся Settings + Access screens?** Prototype показывает только 3 пункта (PLAN / Счета / Аналитика); v0.6 имеет Settings (cycle_start_day, notify_days_before, AI categorization toggle, spending cap) + AccessScreen (admin Users/AI Usage). | Расширить prototype: добавить «04 НАСТРОЙКИ» + «05 ДОСТУП» (admin only) с тем же visual styling. Handoff incomplete. | TS-31 | Phase 27 |
| **OQ-21** | **Что происходит с существующими v0.6 `plan_template_item` / `planned_transaction` таблицами?** v1.0 вводит `Recurrent` overlapping с template. | (a) `Subscription` extend → переименовать в UI на «Recurrent»; (b) `plan_template_item` rows которые subscription-источник → migrate в `Recurrent`; (c) `planned_transaction` либо drop, либо оставить вне UI. Документировать в Phase 22. | TS-22, BACKEND-EXT | Phase 22 |
| **OQ-22** | **Существующий v0.6 Transactions tab — оставить как tab или fully demote в push-stack?** Spec (TS-14) требует push-stack. | **Demote в push-stack** (handoff explicit: 5-tab = Home / Savings / FAB / AI / Mgmt). Quick access = «ВСЕ ОПЕРАЦИИ →» link на Home + filter chips через Category Detail. | TS-08, TS-14 | Phase 25 |
| **OQ-09** | **Subscriptions menu items «СМЕНИТЬ ДЕНЬ» / «ИЗМЕНИТЬ ЦЕНУ»** — функциональные editors в v1.0 или stubs? | **Functional editors в v1.0**: secondary bottom-sheet с form (DatePicker для day, Numeric input для price). Не large scope. | TS-21 | Phase 26 |
| **OQ-10** | **Account-to-account transfer (CTA «ПЕРЕВОД»** на Accounts list)** — ship в v1.0 или defer? | **Defer в v1.1** (DF-11). Disabled с «SOON» badge или скрыть. | TS-23, DF-11 | (defer) |

**Дополнительно (lower priority — recommended-defaults достаточно, не блокеры):** OQ-01 (LS persistence YES), OQ-02 (Income mode enum), OQ-03 (Account.kind в onboarding), OQ-05 (count-up replay — only on value change), OQ-07 (slider commit debounce 300ms), OQ-08 (custom keypad — render amount как Text, не TextField), OQ-11 (AI observation rule-engine + 1h cache), OQ-12 (roundup off — future-only), OQ-14 (custom edge-swipe per ADR-002), OQ-19 (`occurredAt = today`).

---

## Phase 22-28 Build Order Rationale

| Phase | Name | What It Delivers | Why This Order | Critical Pitfalls Addressed | Research Flag |
|---|---|---|---|---|---|
| **22** | Backend Schema & Logic Foundation | Account, Goal, Recurrent ext, SavingsConfig, Category extensions, ActualKind enum (`+roundup, +deposit`), RLS на 4 новых таблицах, composite FK, roundup_svc + rollover_svc, close_period extension, atomic `POST /onboarding/complete`, ~12 new endpoints | **Блокер всему UI**. Без Account API нет «в кошельке X ₽». Без Recurrent — нет PLAN. Без roundup_svc — нет Копилки | Pitfall 5, 6, 7, 8, 17, 18, 20, 25 | **NEEDS RESEARCH**: Subscription→Recurrent rename feasibility (Phase 22 spike); roundup edge-cases test design |
| **23** | Design System Foundation (web ║ iOS parallel) | 4 fonts bundled + tokens.json + codegen → tokens.css + PosterTokens.swift; 11 animations.css; PosterNavStack + PosterSheet + PosterCountUp; Tokens parity CI check | После backend, до screen-level. Foundation для всех визуальных фаз. Параллелится web ║ iOS т.к. shared tokens.json | Pitfall 1 (DM Serif — **ADR-001 BLOCKER**), 2 (FOUT), 3 (iOS font cache), 4 (PosterNavStack — **ADR-002 BLOCKER**), 9, 11, 15 | **NEEDS DEEPER RESEARCH** на старте: cyrillic character-coverage test; PosterNavStack POC на real device |
| **24** | Onboarding 4-step (web → iOS) | OnbIncome / OnbAccounts / OnbPlan / OnbGoal / OnbDone / OnbChrome / OnbDots; LS draft persistence; atomic single-endpoint commit; seed 8 categories с `code`; back-arrow logic; Σ plan ≤ income validator; 4 income presets + radio mode | Зависит от Phase 22 (Account/Goal API) + Phase 23 (DM Serif Italic, slider, sliding indicator). First-launch gate | Pitfall 16 (atomicity); persistence via OQ-01 | **STANDARD PATTERN** (multi-step onboarding well-documented) |
| **25** | Home + Transactions + Add Sheet (web → iOS) | Home (count-up + sorted cat list + plan badge + wallet link); Transactions registry (push-stack, day-grouping, filter chips, spec tags); Add Sheet с custom 3×4 keypad; FAB на every screen; demote v0.6 Transactions tab | Зависит от Phase 22 + 23 + 24. Самый-используемый flow — приоритет после foundation | Pitfall 4, 13 (Russian dates), 22 (tabular-nums width jitter) | **NEEDS RESEARCH**: iOS custom keypad с suppress system kb. VoiceOver semantics для count-up Hero |
| **26** | Category Detail + PLAN мая + Subscriptions (║ Phase 25, 27) | Category Detail (red/cobalt bg, BigFig + bar break, rollover info, CTAs); PLAN мая (8 BudgetRows со sliders 500₽ + tap-edit + rollover chip pair, regular-pay block, 2-card rollover summary, OK/OVER); Subscriptions (coral, bottom-sheet menu с editors per OQ-09) | Можно параллельно с Phase 25 после Phase 23. PLAN — XL state-heaviest screen | Pitfall 17 (PLAN sum race — single PATCH atomic), 18 (recurrent post race — optimistic locking), 21 | **STANDARD PATTERN** (slider + tap-edit + commit pattern well-known) |
| **27** | AI + Savings + Accounts + Analytics + Management (║ Phase 25, 26) | AI initial-state (DM Serif 36px observation + chip-suggestions) + active-state (reuse v0.6 SSE); Savings (yellow plate, roundup toggle + base chip, goals progress); Accounts list + Account Detail; Analytics rewrite (2-KPI, range segmented, bar-chart days, top-5); Management hub (3 items per OQ-13 или 5) | 5 экранов параллельно. AI/Analytics reuse существующих v0.6 endpoints (только UI rewrite). Savings/Accounts — новые но independent | Pitfall 19 (AI observation slow — cache + skeleton + fallback template), 21 | **NEEDS RESEARCH** на старте: AI observation rule-engine vs LLM (OQ-11); Goal celebration animation pattern |
| **28** | Animations Polish + Acceptance | `prefers-reduced-motion` toggle; VoiceOver audit с `.accessibilityLabel` overrides; iOS edge-swipe-back acceptance; perceptual-diff side-by-side QA web ║ iOS; FOUT regression; Lighthouse mobile > 90 / LCP < 2.5s; e2e timezone period close test; Bundle size audit (woff2 < 200kb gzipped); Multi-tenant integration test; Hidden Unicode CI-check; `DIVERGENCES.md` | Final phase — после всех screens. Acceptance §14.7 verification | Pitfall 2, 7, 10, 11, 12, 14 | **STANDARD PATTERN** (Playwright + Instruments + Accessibility Inspector) |

**Phase Ordering Rationale:**
- **Phase 22 backend first** — блокер всему UI.
- **Phase 23 design system before screens** — shared tokens + components reused в 24-27. Параллелится web ║ iOS.
- **Phase 24 onboarding before main app** — first-launch gate.
- **Phases 25-27 parallel** — independent screen groups после foundation. Web → iOS sequencing внутри каждой фазы устраняет cross-platform merge conflicts.
- **Phase 28 acceptance last** — integration testing.

**Worktree strategy:** `git worktree add ../tg-25-web v1.0/25-web`, `../tg-25-ios v1.0/25-ios` (per-phase × per-platform). Backend stays in main worktree (Phase 22 уже merged в integration branch `v1.0-maximal-poster`).

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | **HIGH** | npm registry verified (5.2.8); Apple docs verified (variable fonts iOS 16+, phaseAnimator/keyframeAnimator iOS 17+); existing codebase прочитан |
| Features | **HIGH** | Handoff specs прочитаны end-to-end; prototype JSX 1572 LOC прочитан; 39 TS + 11 DF + 12 AF идентифицированы |
| Architecture | **HIGH** | Verified file:line. **MEDIUM** на 2 sub-areas: Subscription→Recurrent merge feasibility (нужен Phase 22 spike); iOS PosterNavStack edge-swipe interaction with TabView (нужен real-device test) |
| Pitfalls | **HIGH** | Stack-specific, mostly verified против official docs. 25 pitfalls identified — 12 critical, 8 moderate, 5 minor |

**Overall confidence:** **HIGH**.

### Gaps to Address

- **DM Serif Display Italic cyrillic coverage** — character-coverage test (`pyftsubset --unicodes='U+0410-044F'`) на старте Phase 23 до final ADR-001
- **PosterNavStack edge-swipe gesture conflict с TabView swipe** — prototype на real device первую неделю Phase 23
- **Token codegen workflow** (`tokens.json` → `tokens.css` + `PosterTokens.swift`) — proposed но не validated. Trade-off: ~half-day setup vs ≥3 sync bugs over Phase 23-27
- **Bundle-size estimate** Web ~110kB woff2 — rule-of-thumb; recommend measuring after first integration в Phase 23
- **AI observation refresh frequency** (OQ-15) — recommendation cache 1h server-side
- **Goal celebration animation** (OQ-16) — recommendation single posterCheck flash + toast

---

*Research synthesis completed: 2026-05-09*
*Ready for roadmap: yes — pending ADR-001 (cyrillic font fallback) + ADR-002 (PosterNavStack approach) decisions before Phase 23 start*
