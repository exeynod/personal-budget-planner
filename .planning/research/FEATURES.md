# Feature Research — v1.0 Maximal Poster UI

**Domain:** Personal finance / budget planner (TG Mini App + native iOS), 1 user (single-tenant for owner; whitelist others).
**Researched:** 2026-05-09
**Confidence:** HIGH (handoff specs + working prototype JSX read end-to-end; v0.6 codebase inventoried).

> Scope note: only the **NEW v1.0 Maximal Poster** behavior is analyzed here. Backend domain features that ship from v0.2-v0.5 (auth, periods, embeddings, AI tools, RLS, etc.) are out of scope for this file — see `.planning/REQUIREMENTS.md` and `PROJECT.md`.

---

## 0. How to read this document

Each row in the tables uses:

- **Complexity** — S = ≤ 1 day, M = 1-3 days, L = 3-7 days, XL = > 1 week (per platform; web first, iOS adapts).
- **Dependencies** — features/code that must land first. References to existing code (`v0.6`) or other features by name.
- **Confidence on behavior** — HIGH = handoff or prototype is explicit; MED = inferable; LOW = handoff silent → see Open Questions.

---

## 1. Feature Landscape

### 1.1 Table Stakes (users will assume these exist; missing = product feels broken)

| # | Feature | Why expected | Complexity (web / iOS) | Confidence | Notes |
|---|---------|--------------|------------------------|------------|-------|
| **TS-01** | **4-step Onboarding (Доход → Счета → План → Цель)** with progress dots, back-arrow, optional skip on Цель | First-launch flow defines initial state; mandatory gate before Home. Prototype `PosterOnboarding`. | M / M | HIGH | State held in single parent component, no per-step persistence in prototype — see OQ-01. Existing v0.6 onboarding (1-form `cycle_start_day` + `notify_days_before`) needs full replacement. |
| **TS-02** | **Income input** with thin-space formatting + 4 presets (50k / 80k / 120k / 200k) + «как приходит» radio (once/split/irreg) | Anchor for the entire plan-distribution flow. | S / S | HIGH | `mode` field NOT in `DATA-MODEL.md` `User` schema → see OQ-02 (store as enum or drop?). Prototype shows it; ТЗ doesn't mention it. |
| **TS-03** | **Accounts step in onboarding** (≥1 required, first = primary, ★ to set primary, × to remove, free-text bank name + balance) | No accounts → no Add Sheet target → no Home wallet figure. | M / M | HIGH | Prototype builds via local list, no `kind` (card/cash/savings) selected in onboarding → defaults to card. See OQ-03. |
| **TS-04** | **Plan step with 8-category sliders (step 500 ₽), live «осталось / превышение» indicator, NEXT disabled at over-spend** | Without it, plan is just a wishlist. Prototype `OnbPlan`. | M / M | HIGH | Slider max = `max(60000, income*0.6)`; initial seeded from `share` × income, snapped to 500. `Σ plan ≤ income` is the validator. Backend needs `share` constants seeded server-side too (see TS-05). |
| **TS-05** | **Seed 8 default categories** server-side at onboarding finish (food 0.20 / cafe 0.10 / home 0.30 / transit 0.06 / fun 0.05 / gifts 0.04 / health 0.05 / subs 0.03) | If POST `/onboarding` doesn't seed, the Plan step has nothing to point at and Home is empty. | S / — (backend) | HIGH | DATA-MODEL §1.3 explicit. Existing v0.2 seeds 14 categories — needs reduction/migration to 8. |
| **TS-06** | **Goal step (optional skip)** capturing `{ name, amount }` with 3 presets + DM Serif italic input | If absent, Final screen has no «ЦЕЛЬ» row to summarize. | S / S | HIGH | `due` field is optional in DATA-MODEL but not collected in onboarding — see OQ-04. |
| **TS-07** | **Final screen «ВСЁ.»** with stagger row-in animation + 4 summary rows + CTA | Closes the onboarding loop, sets the tone. | S / S | HIGH | Prototype `OnbDone` shows pattern. Triggers actual seed POST + transition to Home. |
| **TS-08** | **5-tab bottom nav (Home / Savings / FAB / AI / Mgmt)** with sliding indicator + tab-pop animation on active glyph + `posterTabSwap` fade-rise on content | Foundation of all navigation. | M / M | HIGH | v0.6 has 4 tabs (Home/Transactions/AI/Mgmt) — need to insert Savings tab + relocate Transactions to push-stack from Home (`ВСЕ ОПЕРАЦИИ →`). Major IA shift. |
| **TS-09** | **FAB (yellow + glyph) center of tabbar → Add Sheet** | The «one tap to record» core promise of the product. | S / M | HIGH | Press: `scale(0.88) rotate(-90deg)` on mouse-down. iOS needs custom button (no system FAB). |
| **TS-10** | **Home: «дневной темп» hero with count-up animation** (formula `max(0, (planTotal - totalExpense) / daysLeft)`) | Anchor metric. ТЗ §1.2 «План всегда на виду». | M / M | HIGH | `useCountUp` in prototype: cubic ease-out, 900 ms default, 1100 ms on Category Detail. iOS: `Text` + `withAnimation` + `TimelineView` or `@State` ramp. See OQ-05 for replay semantics. |
| **TS-11** | **Home category list** sorted by `act/plan` desc (over-budget on top) with `posterRowIn` 45ms stagger + `posterBarFill` 700 ms bar + OVER badge on overspend | Visual hierarchy: «pain on top». | M / M | HIGH | Stagger delay = `0.08 + i*0.045 s`. iOS: `.transition` + `.animation` per row, computed delay. |
| **TS-12** | **Plan badge on Home** showing `+/− surplus ₽` (yellow on positive, red on negative), tap → PLAN screen | Quick visual delta. | S / S | HIGH | Сurrent v0.6 has separate dashboard summary row — replace. |
| **TS-13** | **Home «в кошельке X ₽ →» link** (sum of all account balances) → Accounts list | Keeps the wallet figure 1 tap from anywhere. | S / S | HIGH | Need `GET /api/me` to include `accounts.balance[]`. Existing v0.6 doesn't expose this aggregate. |
| **TS-14** | **Transactions registry** (push-stack from Home, NOT a tab in v1.0) with day-grouping (DM Serif italic 28px), `posterRowIn` stagger per day, day-sum on right | Where users review what happened. | M / M | HIGH | Existing v0.6 has separate Transactions tab → demote to push-stack screen. |
| **TS-15** | **Filter chips (single-select)** «Все / Кафе / Продукты / Транспорт / Подписки / Копилка» with active = yellow bg | Standard registry filter. | S / S | HIGH | Prototype is single-select (`filter` is single string). See OQ-06 for multi-select consideration. |
| **TS-16** | **Empty state on filter** «Ничего не найдено в фильтре «{name}».» — DM Serif italic 24px | Without it, empty filter looks broken. | S / S | HIGH | Prototype explicit. |
| **TS-17** | **Spec tags «↻ ОКРУГЛ.» / «→ КОПИЛКА»** on transactions with `kind ∈ {roundup, deposit}` (yellow plate, Archivo Black, letterSpacing 0.14em) | Differentiates auto-roundup from manual entry; required for trust in roundup feature. | S / S | HIGH | Backend must return `kind` and `parentTxnId` in transaction DTO — extension of v0.6 schema (REQ BACKEND-EXT). |
| **TS-18** | **Category Detail screen** (push-stack from Home / PLAN / Transactions filter chip) with red bg if over, cobalt if normal; bigfig + bar with break-line on `100% c.plan/c.act`; rollover info + `+ ПОДНЯТЬ ЛИМИТ` / `ПАУЗА` CTAs + per-cat tx list | Context for «why is this category red?». New screen — doesn't exist in v0.6. | L / L | HIGH | iOS: 2 background colors + `posterRiseIn` on big number + bar break overlay = non-trivial. |
| **TS-19** | **PLAN мая screen** with: «Осталось распределить», 2-card «Прочее / Накопления» rollover summary, regular-pay block («провести в факт»), 8 BudgetRows (slider 500₽ + tap-edit + rollover chip pair). Status badge OK / OVER. | The «control room» of the budget. Already exists in v0.6 as Template — needs rewrite. | XL / XL | HIGH | Most state-heavy screen. Slider + tap-edit ↔ commit cycle is fragile (see OQ-07). |
| **TS-20** | **Add Sheet bottom-sheet** with: Today/Yesterday/Custom-date chips, Category chips (8 default), Account row + change, custom 3×4 numeric keypad, dynamic CTA label (ВВЕДИТЕ СУММУ → ВЫБЕРИТЕ КАТЕГОРИЮ → СОХРАНИТЬ ↵), unsaved-changes confirm-sheet | The single most-used input flow. Replaces v0.6 TransactionEditor sheet. | L / L | HIGH | Custom keypad means **iOS must suppress system keyboard for the amount field** (description field still uses system kb). See OQ-08. |
| **TS-21** | **Subscriptions screen (coral bg)** with bigfig «X ₽/мес», sub list, tap → bottom-sheet menu (ПАУЗА / СМЕНИТЬ ДЕНЬ / ИЗМЕНИТЬ ЦЕНУ / ОТМЕНИТЬ ПОДПИСКУ red CTA) | Existing v0.6 sub-screen needs visual rewrite, behavior largely same. | M / M | HIGH | «ИЗМЕНИТЬ ЦЕНУ» / «СМЕНИТЬ ДЕНЬ» menu items = non-functional shells in prototype (close sheet on tap). See OQ-09 for whether they open a secondary editor. |
| **TS-22** | **Recurrent post-to-fact flow** — list with «ПРОВЕСТИ →» button per item; tap creates a real `actual_transaction`, button toggles to «↺ ОТМЕНА» which deletes it (idempotent via `recurrent.posted_txn_id`) | Required for «PLAN» screen completeness. | M / M | HIGH | Backend endpoints `POST /recurrents/:id/post` + `POST /recurrents/:id/unpost` (DATA-MODEL §7). Server must verify ownership + period. |
| **TS-23** | **Accounts list** (cream bg) with summary plate (СУММАРНО · X ₽ · N счетов), per-account row (bank · type/mask · balance · «история →»), ОСНОВНОЙ badge, CTAs «+ ДОБАВИТЬ СЧЁТ» / «ПЕРЕВОД» | Wallet visibility. New in v1.0. | M / M | HIGH | «ПЕРЕВОД» (transfer between accounts) is shown but **not implemented in prototype** (no handler) — see OQ-10. |
| **TS-24** | **Account Detail** (black bg) with bigfig name, mask/type subline, 2-KPI «БАЛАНС / В МАЕ · N ОПЕРАЦ.», history grouped by day (filtered by `accountId`) | Drill-down from Accounts list. New. | M / M | HIGH | Empty state «По счёту пока нет операций.» (R5). |
| **TS-25** | **AI initial state** with DM Serif 36px observation + DM Serif italic 24px enrichment + «— из ваших данных, {date}» eyebrow + 4 chip-suggestions (DM Serif italic 18px, → arrow on right) | The screen that defines product personality. ТЗ §1.4. | M / M | HIGH | Backend must compute observation server-side per request (see OQ-11). Active state (chat) reuses existing v0.6 streaming SSE chat — only UI styling changes. |
| **TS-26** | **AI input bar** (black plate, mono-font, yellow ↵ ОТПРАВИТЬ button) | Persistent across both initial and active state. | S / S | HIGH | Reuses existing v0.6 SSE streaming. |
| **TS-27** | **Savings (Копилка) screen** with: yellow plate «НАКОПЛЕНО ВСЕГО / В МАЕ», roundup toggle ВКЛ/ВЫКЛ + base chip pair (10/50/100), goals list with progress bars, CTAs «+ НОВАЯ ЦЕЛЬ» / «ПОПОЛНИТЬ» | The differentiating «копилка» feature, ТЗ §1.5. New in v1.0. | L / L | HIGH | New backend endpoints (`GET/PATCH /savings`, `POST /goals`, `POST /savings/deposit`). |
| **TS-28** | **Roundup auto-creation** on every expense txn — server-side: `delta = ceil(\|amount\|/base)*base − \|amount\|`; if `0 < delta < base` → create kind=`roundup` txn with `parentTxnId`. Also subtracts from primary account balance. | The roundup magic the user opted into. | M / — (backend) | HIGH | DATA-MODEL §4. **Toggle off ≠ retroactive delete** — see OQ-12. |
| **TS-29** | **Rollover at month-end** (cron job 00:00 of 1st) — for non-paused categories: `remainder = max(0, plan - fact)`; if `rollover==savings` create kind=`deposit` txn; if `rollover==misc` add to virtual «Прочее» of next period | Closes the month, prepares fresh state. | M / — (backend) | HIGH | Existing v0.2 has `close_period_job` (00:01) — extend to handle rollover destinations. Idempotency via advisory lock. |
| **TS-30** | **Analytics screen** (cream bg) with month-segmented (МАР / АПР / МАЙ • current), 2-KPI (ПОТРАЧЕНО dark / СЭКОНОМЛЕНО yellow), grouping segmented (ДЕНЬ / НЕД. / КАТ.), bar-chart days of month (≥75% red), «1 ЧИСЛО / СЕГОДНЯ» axes, top-5 categories | Trend-spotting. Existing v0.6 has analytics — needs visual rewrite + 2-KPI restructure. | M / M | HIGH | Existing endpoints sufficient (`/api/analytics/trend|top-categories|forecast`). |
| **TS-31** | **Management hub (3 items: PLAN / Счета / Аналитика)** on black bg with «01 / 02 / 03» numbering, name + meta-description + → arrow | Lightweight list — most weight is in the destinations. | S / S | HIGH | Existing v0.6 Management has more items (Settings, Categories, Subscriptions, Access). v1.0 specifies only 3 — see OQ-13: where do Settings + Access go? |
| **TS-32** | **«Один тап — одна запись» principle** — FAB on every screen except onboarding | ТЗ §1.1 explicit. Without it, UX broken. | S / S | HIGH | iOS: ZStack overlay with safe-area-aware bottom-bar. |
| **TS-33** | **Money formatter `fmt(cents)`** with thin space U+202F + minus U+2212 (math, not hyphen) | Required for visual consistency on every numeric screen. | S / S | HIGH | DATA-MODEL §5. Existing v0.6 already uses kopecks-to-rubles conversion — extend to U+202F + U+2212. |
| **TS-34** | **Date formatter `Сегодня / Вчера / 7 мая` (genitive months)** | Used everywhere in transaction grouping. | S / S | HIGH | DATA-MODEL §5.3. iOS already has `DateFormatters.swift` — verify «сегодня/вчера» path. |
| **TS-35** | **Slide push/pop transitions** (`fwd` 28px slide-in right 420 ms, `back` slide-in left, `tab` fade+rise 350 ms) | Defines navigation rhythm. iOS needs custom NavigationStack replacement (`PosterNavStack`). | M / L | HIGH | v0.6 uses default iOS NavigationStack — needs replacement to match `posterSlideInFwd/Back`. Coupling concern: iOS edge-swipe-back must still work or feel broken (see OQ-14). |
| **TS-36** | **4 Google fonts loaded** (Archivo Black, DM Serif Display, JetBrains Mono, Manrope) without FOUT (acceptance §14.7) | If fonts pop in late, the entire poster aesthetic falls apart. | S / M | HIGH | iOS: bundle TTFs in `Resources/Fonts/`. Web: preconnect + `font-display: optional`. |
| **TS-37** | **Color palette tokens** (cream / ink / yellow / coral / cobalt / red / black / paper) shared web ↔ iOS | Mandatory for cross-platform parity. | S / S | HIGH | DESIGN-SYSTEM tokens.css → iOS `Tokens.swift`. v0.6 has `Tokens.swift` but with old palette — needs full rewrite. |
| **TS-38** | **Edit/delete transaction** (R5 in ТЗ §7) — tap row → editor; swipe-left → confirm-delete | DATA-MODEL `DELETE /api/txns/:id` exists. ТЗ marks it MVP-required. | M / M | HIGH | Existing v0.6 has tap-edit + delete via TransactionEditor. Need swipe-left gesture (web: react-swipeable; iOS: native `.swipeActions`). |
| **TS-39** | **Authentication carry-over** — TG initData (web) + Bearer token (iOS) → no change | Must work across redesign. | — | HIGH | Existing v0.6 stack. Just verify Maximal Poster doesn't break Telegram WebApp auth. |

### 1.2 Differentiators (set the product apart from typical Russian budget apps like CoinKeeper / Дзен-Деньги / Monefy)

| # | Feature | Value proposition | Complexity | Confidence | Notes |
|---|---------|-------------------|------------|------------|-------|
| **DF-01** | **Print-typography aesthetic** (Maximal Poster) — `Mass italic` + `BigFig` JetBrains Mono with negative letter-spacing + colored full-screen backgrounds (coral/cobalt/cream/black) per screen | Nothing like it in RU finance apps; reinforces «деньги — серьёзно» tone. ТЗ §0. | XL (one-time foundation cost) | HIGH | Risk: user fatigue on long sessions (high-saturation backgrounds). Mitigation: each screen short, scroll terminates. |
| **DF-02** | **Daily-pace headline as the primary metric** (not balance, not pie chart) | Nudges «as long as I stay under daily-pace I'm fine» behavior — opposite of accounting-app feel. ТЗ §1.2. | S | HIGH | Already conceptually different from v0.5/v0.6 hero «План — Факт = N ₽». |
| **DF-03** | **Roundup → Savings (configurable base 10/50/100)** | Common in Western banking apps (Acorns, Chase) but rare in RU consumer apps. Self-coercive saving. | M (backend + UI) | HIGH | Combined with goals, becomes a real saving system. |
| **DF-04** | **Per-category rollover destination (Прочее ↔ Накопления)** with chip-pair on each PLAN row | Subverts the «if I don't spend it, it disappears» frustration. Makes underspending feel rewarding. | M | HIGH | DATA-MODEL §3 explicit. Behaviorally novel; needs clear copy. |
| **DF-05** | **AI initial observation (no empty chat)** — DM Serif 36px sentence on the AI tab on every open | Most chat assistants open empty → cognitive friction. Always-loaded observation = product personality + immediate utility. ТЗ §1.4. | M (backend rule + UI) | HIGH | Refresh policy unclear → see OQ-15. |
| **DF-06** | **«Регулярные · провести в факт» on PLAN** instead of fully automated subscription posting | User keeps explicit control: «yes, the rent went out». Gives transparency vs. automated systems that surprise users with mis-categorized cron actions. | S | HIGH | Plays well with «один тап» principle when applied to each row. |
| **DF-07** | **Custom 3×4 numeric keypad** (replacing system kb for amount entry) | (a) consistency across web ↔ iOS, (b) faster than system numeric kb (no shift), (c) reinforces poster aesthetic | M (web simple, iOS hard) | HIGH | iOS challenge — see TS-20 + OQ-08. |
| **DF-08** | **«Один план, один кошелёк»** — single-tenant simplicity (no shared budgets, no joint accounts in MVP) | Avoids the 90% of complexity that dual-user finance apps drown in. | — (already a constraint) | HIGH | Aligns with existing single-tenant + whitelist v0.4 design. |
| **DF-09** | **Goal cards with progress + due** in Savings | Visible saving progress = serotonin loop. Not common in RU pet-budget apps. | S | HIGH | Cap at 100% — see OQ-16 for celebration behavior. |
| **DF-10** | **PLAN mid-month editing without month-close** — slider step 500 ₽, immediate live recalc of «Осталось распределить» | Lets user re-balance mid-month without ceremony («чтобы переехать аренду в подписки нужно закрыть период» = bad). | M | HIGH | Edge case: changing limit when `act > new_limit` instantly creates over-budget state — need server to handle gracefully (no rejection). |
| **DF-11** | **In-period account-transfer screen reachable from Accounts** (CTA «ПЕРЕВОД») | Accounts panel = real wallet, not just summary. | M | LOW | Prototype shows the button but no handler → not in MVP. See OQ-10. |

### 1.3 Anti-Features (visible from prototype but should NOT be built; or commonly requested but creates problems)

| # | Anti-Feature | Why someone might want it | Why it's problematic | Better approach (handoff-aligned) |
|---|--------------|---------------------------|----------------------|-----------------------------------|
| **AF-01** | **Bank-statement import / Open Banking** | «Auto-categorize my real transactions» | Russian Open Banking is non-existent for retail; CSV varies per bank; explicit-input is the product's discipline mechanism | ТЗ §15 R6 backlog. Stay manual + bot commands + AI «Запиши кофе 350 ₽». Prototype hard-codes accounts; consistent with PROJECT.md «Out of Scope». |
| **AF-02** | **Multi-select on filter chips in Transactions** | «Show me cafe + restaurants» | Doubles state, no copy hint, prototype is single-select; sub-categories (R3 backlog) is the proper answer | Keep single-select. If user needs combined view → use Category filter chip from Home → Category Detail. |
| **AF-03** | **Soft delete / archived transactions** | «What if I delete by mistake» | Clutters DB + needs restore-UI; standard «confirm + hard delete» is enough at 1-user volume | Hard delete + confirm sheet (already in spec for Add Sheet). Categories DO use soft delete (`is_archived`) — that's separate and existing. |
| **AF-04** | **Multi-currency / FX rates** | «But I have $$ savings» | Snapshot-rate complexity, daily-rate fetch, conversion ambiguity for >1 user | RUB only; constraint already in PROJECT.md. |
| **AF-05** | **Notifications for over-budget on Home** | «Push me when I'm overspending cafe» | Notification fatigue; conflicts with «никакой милоты» tone (ТЗ §1.6); visual indication is enough | Keep visual `OVER` badge + red bg on Category Detail. R4 backlog has notifications for «category.over» — defer past v1.0. |
| **AF-06** | **Animations skip / reduce-motion only via OS setting** | «Animations annoy me» | Adds toggle UI clutter | iOS: respect `accessibilityReduceMotion`. Web: respect `prefers-reduced-motion`. No in-app toggle. |
| **AF-07** | **Editable initial AI observation** | «Hide the observation, give me chat» | Defeats the differentiator (DF-05); chat is reachable just by typing | Always show observation when `messages.length == 0`. No hide-button. |
| **AF-08** | **Goals as «sub-views» of Savings accounts** (one savings account per goal) | «My Грузия savings should be a separate account» | Account-per-goal explodes account count + duplicates balance accounting; goals are virtual targets, savings are pooled | Goals are pure progress trackers over `savingsTotal`. Savings-kind accounts are physical (e.g. real Tinkoff Savings); separate concepts. Confirm copy on Goal cards. |
| **AF-09** | **Onboarding skip button on step 01 / 02 / 03** | «Just let me in» | Without income/account/plan → Home is empty + non-functional → user bounces. Step 04 (Goal) IS skippable — that's enough. | Keep `onSkip` only on Goal step (current prototype behavior). Prototype does enforce this — see `OnbChrome.onSkip` only passed in `OnbGoal`. |
| **AF-10** | **«Smart» auto-categorization on Add Sheet** (bypassing user-tap) | «Predict and pre-select» | v0.3 already has embedding-based AI categorization that pre-fills the chip — keep it as a hint, not auto-action | Existing AICAT-01..06 (AI categorization) keeps its pre-select behavior; user must still tap to confirm (matches «выбор обязателен» in §3 of ТЗ). |
| **AF-11** | **Real-time WebSocket sync of transactions across web ↔ iOS** | «I want my iPad to update when I add on iPhone» | Single-user-single-device for now; pull-on-foreground is enough; WebSocket adds infra cost | Pull on each screen mount + after Add Sheet save. Existing v0.6 pattern. |
| **AF-12** | **Confirmation sheet on roundup-toggle off** «Удалить уже созданные округления?» | «Why are old roundups still there if I disabled?» | Destroys historical truth; user can manually delete each roundup txn from Transactions filter «Копилка» | Toggle off = future-only effect. Document in copy. See OQ-12. |

---

## 2. Detailed Behavioral Analysis (per question from research brief)

> Section 1's tables answer **what**. This section answers **how should it behave**, especially where the handoff is silent.

### 2.1 Onboarding 4-step (TS-01)

| Sub-question | Recommendation | Confidence | Source |
|--------------|----------------|------------|--------|
| **Back navigation across steps** | `←` always returns to previous step. From step 01, no `←` displayed (`onBack` is `undefined`, opacity 0.25 in prototype). | HIGH | `OnbChrome` line 1296: `cursor: onBack ? 'pointer' : 'default'`. From `PosterOnboarding` line 1552: `back = () => step > 0 && setStep(step - 1)`. |
| **Skip behavior** | Only on step 04 (Goal). Skip = same as «ГОТОВО →» (advances to Final). | HIGH | `OnbGoal` calls `onSkip={next}` — line 1562. |
| **Deep-link mid-onboarding** (e.g. external URL `/onboarding/3`) | **Not supported.** Onboarding is a single-component state machine; routing should redirect any deep-link to step 0 if `user.onboarded == false`. | MED — silent in handoff | Industry pattern (cf. UXCam, Appcues) confirms deep-link to mid-flow is anti-pattern when prior steps gate state. |
| **Persistence between sessions** (user closes app on step 02 — return to 02 or restart?) | **OQ-01.** Recommendation: persist `onboardingDraft` in localStorage / `UserDefaults`; on app launch if `onboardedAt == null && draft exists` → resume at last step. Discard draft on `OnbDone` finish or explicit «начать заново» button (R5). | LOW | Prototype state is in-memory only. Industry best practice = persist to avoid frustrating restart (mockplus.com / userpilot.com). |
| **Validation timing — on-blur vs on-submit** | Prototype validates **on-change**: NEXT button enabled/disabled live (`nextDisabled={!income \|\| income <= 0}`). Errors not shown as text — only NEXT disabled. On step 03 over-spend, hint copy at bottom turns red («превышение на X ₽»). | HIGH | `OnbIncome` line 1333, `OnbPlan` line 1450. |
| **Error messages** | Prototype shows `hint` copy only (e.g. «нужен минимум один счёт» step 02). No validation errors per field. | HIGH | `OnbAccounts` line 1397. |
| **Accessibility — screen reader for progress dots** | **OQ-17.** Recommendation: `OnbDots` renders `aria-label="Шаг 2 из 4"` on the container, not on dots themselves; live region announces step changes. iOS: `accessibilityLabel("Шаг 2 из 4")` on the dots row. | MED | WCAG: progress indicators must announce; prototype `OnbDots` has no a11y attributes. |

**Recommendation:** Implement persistence (LS draft) to prevent data loss; add a11y labels on chrome; keep all other behavior identical to prototype.

### 2.2 Hero count-up on Home (TS-10)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **First mount → animate from 0 to value** | Yes, 900 ms cubic-out (`useCountUp` line 161). | HIGH |
| **Re-mount on tab-switch back to Home** | **OQ-05.** Recommendation: replay only if value changed since last view; cache last-rendered value. Don't replay if user just tapped FAB → Add Sheet → close (instant return, same value). | LOW |
| **Background API update mid-view (e.g. AI just posted a tx)** | **OQ-05a.** Recommendation: small `posterPopIn` flash (scale 0.96 → 1.04 → 1.00, 280 ms) on the bigfig — not a full count-up replay. Provides feedback without distraction. | MED |
| **VoiceOver semantics** | iOS: `Text` element should have `accessibilityValue` synced to current displayed number, NOT animated count-up (otherwise SR reads each frame). Trick: separate visual count-up state from a11y value (`.accessibilityValue("\(targetValue) рублей")`). Web: `aria-live="off"` on the animated span; mirror final value to a visually-hidden `<span aria-live="polite">`. | HIGH (Apple HIG) |
| **Reduced-motion** | Show final value immediately, no ramp. Detect via `UIAccessibility.isReduceMotionEnabled` / `prefers-reduced-motion`. | HIGH |

### 2.3 Stagger of category rows (TS-11)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **First mount on Home → each row animates row-in with `0.08 + i*0.045` s delay** | Per prototype line 261. | HIGH |
| **Fast scroll past early rows on first mount — what happens?** | Web: rows further down still animate when reached (each row starts its CSS animation on mount, not on visible). iOS: same — `.transition` triggers per-row on first appearance. **Edge case:** rows already off-screen at scroll-down still get the animation when they re-appear → looks weird. **Recommendation**: on iOS, use `.onAppear` + `@State var hasAnimated` per row, animate only first-appearance. | MED |
| **Re-sort (e.g. user adds tx that flips order)** | Prototype re-renders unsorted vs sorted — no special transition for re-order. Recommendation: don't animate re-order in v1.0; rely on row-level value change → React/SwiftUI implicit fade if framework supports. | MED — handoff silent |
| **List of 8 categories is finite — no virtualization needed** | Correct. No `LazyVStack` virtualization concerns at 8 rows. | HIGH |

### 2.4 Filter chips on Transactions (TS-15)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Multi-select?** | **Single-select** per prototype line 318 (`filter` is single string). Don't change without designer input. See AF-02. | HIGH |
| **Keyboard navigation (web)** | Add `role="tablist"` + arrow-key navigation. Tab cycles through chips; Enter activates. | MED |
| **Empty-filter state** | DM Serif italic 24px text per TS-16. Prototype line 348. | HIGH |
| **«Копилка» filter logic** | Prototype maps `cat == 'накопления'`; backend should map by `kind ∈ {roundup, deposit}`. | HIGH |
| **Persisted filter on tab-leave-and-return** | Recommendation: reset to «Все» on full screen unmount; preserve during scroll/navigation within Transactions screen. | MED |

### 2.5 3×4 numeric keypad (TS-20)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Haptic feedback on digit tap** | iOS: `UIImpactFeedbackGenerator(.light)` on each press; `.medium` on backspace; `.success` on save. Web: `navigator.vibrate(10)` if available (TG WebApp on Android). | HIGH (HIG) |
| **Long-press backspace = clear all** | **OQ-18.** Recommendation: yes, add 600 ms long-press on `⌫` → reset amount to 0 with `.medium` haptic. Standard pattern in iOS calculator apps. | LOW |
| **iOS — suppress system keyboard for amount field** | Use `UIViewRepresentable` wrapping a `UITextField` with `inputView = UIView(frame: .zero)` + `tintColor = .clear`. Or simpler: use **no `TextField` at all** — render the bigfig as a `Text` whose value updates from custom keypad button taps directly. **Recommended path #2** since prototype's amount is not a real text input — it's a bigfig that updates on keypad tap (line 1166 + 1156-1158). | HIGH |
| **iOS — description field uses system kb** | Yes, only the amount uses custom keypad. Description is a regular `TextField`. | HIGH |
| **Decimal point — prototype shows it but at opacity 0.45 (line 1222)** | Treat `.` as **disabled** in MVP (kopecks not collected on UI per DATA-MODEL §5.4). Match prototype. | HIGH |
| **Number max** | `9999999` kopecks per prototype line 1157 → 99 999.99 ₽. DATA-MODEL §6 caps at 100 M ₽. Use prototype's smaller cap for amount entry safety. | HIGH |

### 2.6 Slider on PLAN with step 500 ₽ (TS-19, BudgetRow)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Tactile feedback** | iOS: `.sensoryFeedback(.selection, trigger: limit)` on each step; web: no haptics. | HIGH |
| **Snap-to-step animation** | Inherent in `<input type="range" step="500">`. iOS: `Slider(value: ..., in: 0...max, step: 500)` does it natively. | HIGH |
| **Tap on number → tap-edit** | Prototype line 859 (`onClick={() => setEditing(true)}`) opens **inline input field** under the same row, slider stays visible. NOT a modal. On Enter / blur → commit; Escape → cancel. | HIGH |
| **Conflict between slider drag and edit-input** | Prototype: `useEffect` on line 830 — when `value` changes externally and not editing, draft sync'd. Editing locks draft until commit. | HIGH |
| **Server commit timing** | **OQ-07.** Recommendation: debounce slider changes (300 ms) → PATCH `/categories/:id { plan }`. Optimistic local state, rollback on error. Tap-edit commits on blur/Enter. | LOW |
| **`act > new_limit` after lowering** | Server accepts; client shows OVER instantly. No special UX needed (matches existing over-spend visual). | HIGH |

### 2.7 Roundup behavior (TS-28, AF-12)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Toggle off — what happens to existing roundup txns?** | **Future-only effect.** Existing roundup txns remain. Document in copy below toggle: «отключение не удалит уже созданные округления». | MED — handoff silent (OQ-12) |
| **Pending roundup before save** | Add Sheet: don't preview roundup. After save → server creates roundup → client refreshes. Show toast «округлено до X ₽ в копилку» on success. | MED |
| **Edit transaction amount after the fact** | If `parentTxnId` exists for that txn — find roundup child, recalc delta, update child txn (or delete + recreate). Server-side responsibility. | MED |
| **Delete parent transaction** | Cascade-delete its roundup child (`txn.parentTxnId == parent.id`). DATA-MODEL §8 explicit: «Откат `account.balance` и связанных roundup-txn». | HIGH |
| **Change roundup base 50 → 100** | Future-only. Old roundups unchanged. | MED |

### 2.8 Goals progress (DF-09)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Progress bar at 100%** | Cap visual at 100% (`pct = Math.min(100, ...)` line 1049). Numeric label can show actual `pct`. | HIGH |
| **Celebration animation on first reach 100%** | **OQ-16.** Recommendation: one-time `posterCheck` animation (already in keyframes) + toast «ЦЕЛЬ ВЗЯТА» with confetti-free poster aesthetic. Persist per-goal `celebratedAt` to avoid re-triggering. | LOW |
| **Overflow `cur > target`** | Allow. Show actual numbers (e.g. «125 000 / 120 000») + 100% bar. User can manually close goal. | MED |
| **«Закрыть цель» action** | Not in prototype; not in MVP. R5 backlog. | HIGH |
| **Allocate from savings to specific goal** | DATA-MODEL §3.4: «не в MVP». Goals are virtual progress trackers; savings is a single pool. | HIGH |

### 2.9 Accounts list (TS-23, DF-11)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **`kind: 'savings'` accounts — separate UI from card?** | Same row layout, only subtitle differs («накопит. счёт»). DATA-MODEL §1.2. | HIGH |
| **Multiple savings accounts allowed** | Yes — `kind` is just a tag, no `unique` constraint. Prototype shows mixed kinds (line 32-37). | HIGH |
| **Default primary** | Onboarding: first added = primary. Existing v0.6: ad-hoc; needs migration to 1 primary per user. | HIGH |
| **Change primary post-onboarding** | UI: tap ★ on any account in Accounts list. Server: PATCH `/accounts/:id { primary: true }` → cascade unset others. | MED |
| **Transfer between accounts** (CTA «ПЕРЕВОД») | **OQ-10.** Not implemented in prototype; defer to v1.1 unless user pushes. If shipped: 2 mirror txns (`-X` from src, `+X` to dst), kind=`income`/`expense`, link via `parentTxnId`. | LOW |
| **Delete account with transactions** | DATA-MODEL §7: `DELETE` only if 0 txns. Otherwise show toast «нельзя — есть операции». | HIGH |

### 2.10 Recurrent posting (TS-22)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Idempotency** | `recurrent.posted_txn_id` per period. Re-POST same period → 409 «уже проведено». Prototype `done` map mimics this in-memory. | HIGH |
| **Undo window** | No window: «↺ ОТМЕНА» works as long as `posted_txn_id != null`. Pressing it deletes the txn + nulls FK. | HIGH (prototype line 816) |
| **Auto-post if `dayOfMonth` passed and not posted** | **No.** Manual only — that's the differentiator (DF-06). Server doesn't auto-post. | HIGH (ТЗ §3.2) |
| **Notification on `dayOfMonth`** | R4 backlog — defer past v1.0. Existing v0.5 has `notify_subscriptions` cron at 09:00; could be reused but isn't required. | HIGH |
| **Late posting (post on 20th for 15th rent)** | Allowed. Sets `occurredAt` to today (or `dayOfMonth` of current month? — see OQ-19). | LOW |
| **Recurrent for past month** | Out of scope. Period is current. | HIGH |

### 2.11 AI initial observation (DF-05, TS-25)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Refresh policy — every open?** | **OQ-15.** Recommendation: server caches per-user observation for 1 h; refresh on AI tab open if stale. Client always shows latest cached if request fails. | MED |
| **Generation rule** | Server-side rule engine + LLM rendering. Templates from ТЗ §6: surplus / over-budget / upcoming subs. Pick by priority (over-budget > upcoming subs > savings achievement). | MED |
| **No data state (0 transactions)** | Show fallback observation «Май только начался — впереди план на 85 500 ₽.» Don't show empty card. | MED |
| **Suggestions chips** | Prototype hardcodes 4 (line 416). Recommendation: context-aware (if user has zero cafe txns, hide «сколько потратил на еду»; if no upcoming subs, hide «шаблон отпуск»). MVP: ship hardcoded; iterate. | MED |
| **Active state (after first message)** | Reuse v0.6 streaming SSE — no functional change, only UI styling (DM Serif italic for AI replies, mono for user). | HIGH |

### 2.12 Custom slide navigation on iOS (TS-35)

| Sub-question | Recommendation | Confidence |
|--------------|----------------|------------|
| **Custom `PosterNavStack` replaces `NavigationStack`** | Required to match `posterSlideInFwd/Back` (28 px slide right, 420 ms) — system NavigationStack uses different curve + offset. Use `ZStack` + `@State var stack: [Screen]` + `.transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)))`. | HIGH |
| **Edge-swipe-back behavior** | **OQ-14.** Recommendation: implement `DragGesture` on root with `minimumDistance: 20` from leading edge → if drag completes >50% of width, pop. If <50%, snap back. Else cancel. Mimics iOS native. | MED |
| **Swipe on first screen of stack (no parent)** | No-op (drag elastic-snaps back). Don't dismiss tab itself on swipe. | HIGH |
| **Rotation / multitasking** | iPhone-only TG / iOS app: rotation not supported (locked portrait). Multitasking iPad — out of scope per PROJECT.md v0.6. | HIGH |
| **Tab change during push** | Edge case: user is mid-push from Home → Category, then taps Savings tab. Recommendation: cancel push animation, fade-rise to Savings. State of Home stack saved per-tab (each tab has independent stack). | MED |

### 2.13 Side-by-side parity with web (TS-35, design system)

| Category | Examples | Notes |
|----------|----------|-------|
| **Pixel-perfect possible** | Home, Category Detail, Transactions, Accounts list, Account Detail, Subscriptions list, AI initial state, Savings, Mgmt, Final onboarding screen | All use only static layout + custom typography + animations replicable in SwiftUI keyframe-anim equivalents. |
| **Adapted (~95% parity)** | PLAN screen, Onboarding step 03 (Plan) — sliders | Native `Slider` look slightly different from `<input type="range">` styled. iOS `Slider` doesn't support gradient fill — needs custom `GeometryReader + Rectangle()`. |
| **Native iOS overrides** | Onboarding step 02 (Accounts) text inputs, Onboarding step 04 (Goal) text inputs, AI input bar, Add Sheet description input, Subscription edit modals (when implemented) | iOS uses native `TextField`. Web `<input>` cosmetics differ slightly (caret color, accessibility). Must match poster styling but can't disable native auto-correct UI on iOS. |
| **Native iOS overrides — keyboard** | Add Sheet **amount** = custom poster keypad (no system kb). Description = system kb. | This is a deliberate hybrid — see TS-20 + 2.5. |
| **Native iOS overrides — date picker** | Onboarding 04 (Goal due) + Add Sheet «Своя дата» chip | iOS: `DatePicker(.compact)` opens system picker — can't fully poster-style. Web: HTML5 `<input type="date">` similarly system-styled. Accept partial parity. |
| **Native iOS overrides — bottom-sheet** | Subscription menu, confirm-close on Add Sheet | iOS 26: `.sheet(isPresented:)` with `.presentationDetents([.height(280)])` matches poster look once styled. Custom `PosterSheet` may be needed for slide-up animation parity. |
| **Native iOS overrides — slide-back gesture** | Push-stack screens | iOS users will instinctively edge-swipe — must implement (OQ-14). Web has no equivalent; uses `←` button only. |

---

## 3. Feature Dependencies

```
TS-05 (seed 8 categories) ──> TS-04 (Plan slider step) ──> TS-07 (Final summary)
                                       │
TS-02 (Income) ────────────────────────┼──> TS-19 (PLAN screen)
                                       │
TS-03 (Accounts onb) ─────> TS-23 (Accounts list) ─> TS-24 (Account Detail)
        │                            │
        └─────> TS-13 (wallet sum) ◄─┘
        │
        └─────> TS-20 (Add Sheet account row)

TS-08 (5-tab nav) ──> TS-09 (FAB) ──> TS-20 (Add Sheet)
                          │
                          └──> TS-32 (FAB on every screen)

TS-10 (count-up) ──> TS-11 (cat list stagger) ──> TS-12 (plan badge) ──> TS-18 (cat detail)
                                                       │
                                                       └──> TS-19 (PLAN screen)

TS-19 (PLAN screen) ──┬──> TS-21 (Subs link)
                      ├──> TS-22 (recurrent post-to-fact)
                      └──> TS-18 (Category Detail link)

TS-27 (Savings) ──┬──> TS-28 (Roundup auto-create) ──> TS-17 (spec tags on tx)
                  │                                              │
                  │                                              └──> TS-14 (Transactions list)
                  │
                  └──> TS-29 (Rollover at month-end)
                                  │
                                  └──> DF-04 (per-cat rollover dest)

TS-25 (AI initial) ──> [reuses v0.6 SSE] ──> TS-26 (input bar)

TS-35 (slide transitions) ──> [foundation for all push-stack screens]
TS-36 (fonts loaded) ──> [foundation for everything; FOUT acceptance]
TS-37 (color tokens) ──> [foundation for everything]
TS-39 (auth) ──> [no change; verified post-foundation]
```

### 3.1 Critical-path dependency chain

```
Backend Schema Extension (BACKEND-EXT)
   ├── User.income, Account, Goal, SavingsConfig, Recurrent tables
   ├── Category.{plan, rollover, paused}, Transaction.kind/parentTxnId
   ├── /api/me aggregate, /api/savings, /api/goals, /api/recurrents/:id/post
   ├── Roundup auto-creation hook on POST /txns
   └── Rollover extension to close_period_job
       │
       ▼
Design System Foundation (TS-36, TS-37, TS-35)
   ├── 4 fonts bundled (web preload + iOS Resources/Fonts)
   ├── Color tokens (web .css vars + iOS Tokens.swift)
   └── Animation library (11 keyframes web + iOS equivalents)
       │
       ▼
Onboarding (TS-01..07) ─────► must work before anyone sees Home
       │
       ├──> Home + Tx + AddSheet (TS-08..17, TS-20)
       │       │
       │       └──> Category Detail + PLAN + Subs (TS-18, TS-19, TS-21, TS-22)
       │
       └──> AI + Savings + Accounts + Analytics + Mgmt (TS-23..27, TS-30, TS-31)
                        │
                        ▼
                  Animations Polish + Acceptance (matches Phase 28)
```

This dependency graph **matches the existing 7-phase roadmap in PROJECT.md** (Phases 22-28) — confirming research aligns with planned phasing.

---

## 4. MVP Definition

### 4.1 Launch With v1.0 (must-have)

All TS-01..TS-39 + DF-01..DF-10. Specifically:

- [x] **Backend extension** — schema + auto-roundup + rollover (Phase 22)
- [x] **Design system foundation** — fonts, tokens, animations (Phase 23)
- [x] **Onboarding 4-step** with persistence (Phase 24)
- [x] **Home + Transactions + Add Sheet** with custom keypad (Phase 25)
- [x] **Category Detail + PLAN + Subscriptions** (Phase 26)
- [x] **AI + Savings + Accounts + Analytics + Management** (Phase 27)
- [x] **Animations polish + a11y + acceptance** (Phase 28)

### 4.2 Add After v1.0 Validation (v1.1)

- [ ] **Account-to-account transfer** (DF-11) — UI exists in prototype (CTA «ПЕРЕВОД»), no handler
- [ ] **Multiple goals with goal-specific deposits** (extend DATA-MODEL §3.4)
- [ ] **AI-driven recurrent suggestions** («у вас 2 списания Spotify подряд — добавить как регулярку?»)
- [ ] **Bot-command parity** (re-test `/add`, `/income` with new schema)
- [ ] **Web-only TWA fallback** (existing v0.6 web client) full migration to Maximal Poster (currently pixel-perfect under Apple HIG style, needs replacement)

### 4.3 Future Consideration (v2+)

- [ ] **Bank import** (CSV/Open Banking, R6 ТЗ backlog)
- [ ] **Multi-currency** (post-v0.4 hard-no in PROJECT.md)
- [ ] **Shared / family budgets** (PROJECT.md hard-no)
- [ ] **Sub-categories** (R3 backlog — кафе → кофейни/доставка)
- [ ] **Inbox / notifications** (R4)
- [ ] **CSV / PDF export** (R6)
- [ ] **Budget templates** (e.g. «Отпуск +130k в июне» — AI mentions it but not first-class)

---

## 5. Feature Prioritization Matrix

| # | Feature | User Value | Implementation Cost | Priority |
|---|---------|------------|---------------------|----------|
| TS-01..07 | Onboarding | HIGH | M | P1 |
| TS-08..09 | Bottom nav + FAB | HIGH | M | P1 |
| TS-10..13 | Home (hero + cats + plan-bar + wallet) | HIGH | M | P1 |
| TS-14..17 | Transactions registry + chips + spec tags | HIGH | M | P1 |
| TS-18 | Category Detail | HIGH | L | P1 |
| TS-19 | PLAN screen | HIGH | XL | P1 |
| TS-20 | Add Sheet (3×4 keypad) | CRITICAL | L | P1 |
| TS-21 | Subscriptions visual + menu | MED | M | P1 |
| TS-22 | Recurrent post-to-fact | MED | M | P1 |
| TS-23..24 | Accounts + Detail | MED | M | P1 |
| TS-25..26 | AI initial state | HIGH | M | P1 |
| TS-27 | Savings | HIGH | L | P1 |
| TS-28 | Roundup auto-create | HIGH | M | P1 |
| TS-29 | Rollover month-end | MED | M | P1 |
| TS-30 | Analytics rewrite | MED | M | P1 |
| TS-31 | Mgmt hub | LOW | S | P1 |
| TS-32..39 | Foundation (FAB, fmt, dates, transitions, fonts, tokens) | CRITICAL | M | P1 |
| DF-01..10 | All differentiators | HIGH | (already in TS) | P1 |
| DF-11 | Account transfer | MED | M | P2 |
| AF-01..12 | Anti-features | — | — | DON'T BUILD |

**Priority key:** P1 = ship in v1.0, P2 = v1.1, P3 = v2+, DON'T BUILD = explicit anti-feature.

---

## 6. Open Questions for User Clarification

These items the handoff is silent on; planners need answers before phase execution.

| # | Question | Recommendation if user shrugs | Affects |
|---|----------|-------------------------------|---------|
| **OQ-01** | **Onboarding draft persistence**: should partial state persist across app restarts? | YES — store `onboardingDraft` in localStorage / `UserDefaults`. Discard on finish. | TS-01, all onb steps |
| **OQ-02** | **Income `mode` field** (once / split / irreg) — store in DB or drop? Prototype shows it; DATA-MODEL silent. | Add `User.income_mode` enum. Currently nothing uses it on Home/PLAN — store for future budgeting algorithms. | TS-02, BACKEND-EXT |
| **OQ-03** | **Account `kind` collected during onboarding**? Prototype only takes name + balance. | Add a 3-radio selector «карта / наличные / накопит. счёт» in `OnbAccounts` form. Default «карта». | TS-03 |
| **OQ-04** | **Goal `due` field** — capture in onboarding step 04 or only post-onboarding in Savings? | Defer to Savings (avoids bloat in onboarding); set `due = null` from onb. | TS-06 |
| **OQ-05** | **Count-up animation replay on tab return** — animate from 0 every time, or only on value change? | Only on value change. Cache previous render. | TS-10, TS-18 |
| **OQ-05a** | **Background API delta on visible Home** — replay full count-up, pop-animate, or static replace? | `posterPopIn` (scale 0.96 → 1.04 → 1.00, 280 ms). | TS-10 |
| **OQ-06** | **Multi-select transaction filter chips**? | NO — single-select per prototype + AF-02. | TS-15 |
| **OQ-07** | **PLAN slider commit timing** — debounce-on-drag, on-release-only, or each step? | Debounce 300 ms during drag; immediate on tap-edit Enter. Optimistic UI. | TS-19 |
| **OQ-08** | **iOS Add Sheet — fully custom keypad with system kb suppression for amount field**? | YES — render amount as `Text` (not `TextField`); custom keypad updates `@State`. Description uses system kb. | TS-20 |
| **OQ-09** | **Subscriptions «СМЕНИТЬ ДЕНЬ» / «ИЗМЕНИТЬ ЦЕНУ»** menu items — ship as functional editors in v1.0 or stubs (close sheet)? | Functional. Open secondary sheet with form. Not large scope. | TS-21 |
| **OQ-10** | **Account-to-account transfer** (CTA «ПЕРЕВОД» on Accounts list) — ship in v1.0? | Defer to v1.1 (DF-11). Show button as «SOON» badge or disable. | TS-23, DF-11 |
| **OQ-11** | **AI initial observation source** — server LLM-call per request (cost) or rule-engine + cached? | Rule-engine + deterministic templates with $$X$$ substitution; LLM fallback only on free-text user prompts. Cache per-user 1 h. | TS-25, DF-05 |
| **OQ-12** | **Roundup toggle off — what happens to existing roundup txns?** | Future-only effect. Existing remain. Add copy below toggle. | TS-28, AF-12 |
| **OQ-13** | **Where do existing Settings + Access screens go in v1.0 Mgmt?** Prototype shows only 3 items (PLAN / Счета / Аналитика). | Add «04 НАСТРОЙКИ» + «05 ДОСТУП» (admin only) below the 3 — extend prototype. The handoff is incomplete here. | TS-31 |
| **OQ-14** | **iOS edge-swipe-back gesture** — implement custom or accept default `NavigationStack` behavior? | Implement custom in `PosterNavStack` (matches `posterSlideInBack` curve). Acceptance §14.7 implies poster animations everywhere. | TS-35 |
| **OQ-15** | **AI observation refresh frequency** | Cache 1 h server-side; client refresh on tab open if stale. | TS-25 |
| **OQ-16** | **Goal 100% celebration** — single `posterCheck` flash + toast, or larger animation? | Single `posterCheck` (1 s) + toast «ЦЕЛЬ ВЗЯТА». Persist `celebratedAt` per goal. | DF-09 |
| **OQ-17** | **A11y screen-reader on onboarding progress dots** | `aria-label="Шаг 2 из 4"` on container; live region. | TS-01 |
| **OQ-18** | **Custom keypad long-press backspace = clear all?** | YES — 600 ms long-press → reset, medium haptic. | TS-20, DF-07 |
| **OQ-19** | **Recurrent posted late** — `occurredAt = today` or `occurredAt = day_of_month-current_month`? | `occurredAt = today` (matches user intent: «I just paid the rent»). Document. | TS-22 |
| **OQ-20** | **iOS/web parity: PosterSheet for Add Sheet** vs system `.sheet`? | Custom PosterSheet on iOS for `posterSlideInFwd` parity. System `.sheet` doesn't quite match the curve. | TS-20 |
| **OQ-21** | **What happens to existing v0.6 plan_template_item / planned_transaction tables?** v1.0 introduces `Recurrent` which overlaps. Migration? | Migrate `plan_template_item` rows that are recurrent (subscription source) → `Recurrent`. Delete `planned_transaction`. Document migration in BACKEND-EXT. | TS-22, BACKEND-EXT |
| **OQ-22** | **Existing v0.6 Transactions tab** — keep as a tab or fully demote to push-stack? Spec says push-stack (TS-14), but users might miss the tab. | Demote to push-stack (handoff is explicit on 5-tab layout: Home / Savings / FAB / AI / Mgmt). Provide quick access via Home «ВСЕ ОПЕРАЦИИ →». | TS-08, TS-14 |
| **OQ-23** | **Notification settings** — keep `notify_days_before` from v0.5 (subscription reminder cron) or drop? Handoff doesn't mention notifications. | Keep in Settings hidden under «04 НАСТРОЙКИ» (OQ-13). Don't surface in Mgmt as separate item. | TS-21, TS-31 |
| **OQ-24** | **AI categorization toggle** (existing `enable_ai_categorization` from v0.3) — surface in onboarding or only Settings? | Settings only. Default ON for new users. | TS-31 |

---

## 7. Cross-Reference: Existing Code Impact

This table tells planners what changes vs. what reuses for each TS feature.

| TS | Existing v0.6 reuses | Replaces | Adds |
|----|----------------------|----------|------|
| TS-01 | `OnboardingView.swift` shell | Full content rewrite (1-form → 4-step + welcome + final) | 6 new sub-views |
| TS-02 | none | — | `User.income` field, mode enum |
| TS-03 | none | — | `Account` table + onboarding flow |
| TS-04 | `Category` table + plan | shape of `plan_template_item` if relevant | `share` constant client-side; slider state |
| TS-05 | seed_categories.py | from 14 cats to 8 | `share` constants in seed |
| TS-06..07 | none | — | `Goal` table + summary computation |
| TS-08 | `BottomNav.swift` | 4-tab → 5-tab + sliding indicator | `posterTabPop` + `posterTabSwap` |
| TS-09 | none | — | FAB component, custom press anim |
| TS-10..13 | `HomeView.swift` shell | Visual rewrite, hero formula change (daily-pace not balance) | `useCountUp`, sorted list |
| TS-14..17 | `TransactionsView.swift` (tab) | Demote to push-stack, visual rewrite | filter chips, spec tags, day-grouping with DM Serif |
| TS-18 | none | — | `CategoryDetail.swift` brand new |
| TS-19 | `TemplateView.swift` | Full rewrite with sliders + recurrent block + rollover chips | BudgetRow component |
| TS-20 | `TransactionEditor.swift` (sheet) | Full rewrite — custom keypad, no system kb for amount | 3×4 keypad component |
| TS-21 | `SubscriptionsView.swift` | Visual rewrite (coral bg) + bottom-sheet menu | edit-day, edit-price sub-sheets (OQ-09) |
| TS-22 | none | — | `Recurrent` table, post/unpost endpoints |
| TS-23..24 | none | — | `AccountsView.swift`, `AccountDetail.swift` |
| TS-25..26 | `AIChatView.swift` | Visual rewrite + initial-state vs active-state branch | observation card, suggestion chips |
| TS-27 | none | — | `SavingsView.swift`, goals UI |
| TS-28 | none | — | server-side roundup hook on `POST /txns` |
| TS-29 | `close_period_job` | Extend with rollover-destination logic | virtual «Прочее» merge for next period |
| TS-30 | `AnalyticsView.swift` | Visual rewrite, 2-KPI plates | `range` segmented (Mar/Apr/May), top-5 |
| TS-31 | `ManagementView.swift` | Reduce to 3 items (or 5 with OQ-13 expansion) | numbered list |
| TS-32 | — | — | Always-visible FAB overlay |
| TS-33..34 | `MoneyFormatter.swift`, `DateFormatters.swift` | Update separators (U+202F, U+2212) and «сегодня/вчера/genitive» | — |
| TS-35 | `NavigationStack` | `PosterNavStack` custom | edge-swipe gesture |
| TS-36..37 | `Tokens.swift`, `Glass.swift` | Full token rewrite to poster palette | 11 keyframe animations |
| TS-38 | swipe-delete on `TransactionsView` | confirm-sheet matches poster style | — |
| TS-39 | `AuthStore.swift` | — | — |

---

## 8. Risks Most Likely to Cause Phase Rework

| Risk | Phase impacted | Mitigation |
|------|----------------|------------|
| **Onboarding state-machine doesn't persist → user data loss** | Phase 24 | Implement OQ-01 (LS draft) early, before any UI work. |
| **Custom 3×4 keypad hides system kb breaks accessibility** (VoiceOver can't read amount) | Phase 25 | Use semantic `Text` for amount + `accessibilityValue` updates from keypad state. Test with VoiceOver before merging. |
| **PLAN slider live-edit conflicts with optimistic state across tab leave/return** | Phase 26 | OQ-07 — debounce + optimistic + server-as-truth on remount. |
| **Roundup creates infinite loop** (roundup of roundup) | Phase 22 (backend) | Server check: if `kind == 'roundup'` → don't trigger another roundup. |
| **Rollover at month-end runs twice** (cron not idempotent) | Phase 22 | Existing `pg_try_advisory_lock` pattern from v0.2 — verify covers new logic. |
| **iOS PosterNavStack breaks edge-swipe expectation** | Phase 23 | OQ-14 — implement custom drag gesture or test users feel back-button-only is OK. |
| **4 fonts not loaded at first paint → FOUT visible** (acceptance §14.7 violated) | Phase 23 | iOS bundle TTFs (no network); web preconnect + font-display: optional + measure with Lighthouse. |
| **Existing 14 categories in v0.5/v0.6 conflict with new 8-default seed** | Phase 22 | Migration: archive 6 unused (`is_archived = true`); user keeps history but new categories surface. |
| **Existing `plan_template_item` overlaps with `Recurrent`** | Phase 22 | OQ-21 — explicit migration plan. |
| **AI initial observation cost (LLM call per AI tab open)** | Phase 27 | OQ-11 — rule-engine + 1 h cache to bound. |

---

## 9. Sources

- `.planning/PROJECT.md` — Project state, milestones, constraints (v0.5, v0.6 baseline + v1.0 active scope)
- `.planning/v1.0-handoff/handoff/SCREENS.md` — Authoritative screen inventory (read end-to-end)
- `.planning/v1.0-handoff/handoff/ТЗ.md` — Business rules §3, acceptance §14, backlog §13 (read end-to-end)
- `.planning/v1.0-handoff/handoff/DATA-MODEL.md` — Entities §1, derived §2, rollover §3, roundup §4, validators §6, API §7, events §8 (read end-to-end)
- `.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx` — Working prototype (1572 LOC, read in 4 chunks; behavior derived from actual code, not just specs)
- `/ios/BudgetPlanner/Features/...` — Existing v0.6 SwiftUI sources (file list inventoried)
- [Mobile App Onboarding: Best Practices & 15 Examples (mockplus.com)](https://www.mockplus.com/blog/post/app-onboarding-examples) — multi-step persistence pattern (MED confidence support for OQ-01)
- [The Definitive Guide to Mobile Deep Linking (neilpatel.com)](https://neilpatel.com/blog/mobile-deep-linking/) — context for OQ deep-link analysis
- [Creating a Custom Keyboard in SwiftUI (Medium)](https://medium.com/@saidalo.saydamatov/creating-a-custom-keyboard-in-swiftui-85c2bffb029b) — `inputView = UIView(frame: .zero)` pattern for system kb suppression (TS-20)
- [How to disable custom keyboards in iOS SwiftUI-based applications (eidinger.info)](https://blog.eidinger.info/how-to-disable-custom-keyboards-in-ios-swiftui-based-applications) — confirmation that custom keypad is the standard solution

---
*Feature research for: TG Budget Planner v1.0 Maximal Poster*
*Researched: 2026-05-09*
