# Milestones: TG Budget Planner

## v1.0 v1.0 (Shipped: 2026-05-10)

**Phases completed:** 7 phases, 74 plans, 114 tasks

**Key accomplishments:**

- Migration 0013 расширяет category 6 колонками (plan_cents/code/ord/rollover/paused/parent_id) с композитным FK на (id, user_id) для cross-tenant защиты + полностью дропает plan_template_item с predicate-backfill plan_cents в Category.
- Migration 0014 переключает PG enum categorykind→actualkind с новыми values roundup/deposit (через autocommit_block — PG ALTER TYPE ADD VALUE не транзакционный), добавляет parent_txn_id self-FK + 3 колонки на subscription, создаёт две новые таблицы (goal, savings_config) и расширяет budget_period для idempotent close_period rollover.
- `alembic/versions/0015_v10_rls_finalize.py`
- ORM mapping caught up to live v1.0 schema: 3 new classes (Account/Goal/SavingsConfig), 3 new Python enums (ActualKind/AccountKind/RolloverPolicy), 6 extended classes, PlanTemplateItem dropped — all column types verified against migrations 0012-0015 line-by-line.
- Implemented `app/services/accounts.py` with 7 CRUD functions + balance delta-accounting + 2 domain exceptions; 15 DB-backed tests pass against live v1.0 schema. BE-02 (Account CRUD with primary uniqueness + delete protection) and BE-03 (atomic balance delta) are complete.
- Implemented BE-07 auto-roundup hook (DATA-MODEL §4 / CONTEXT §Area 3) end-to-end. Pure integer formula, three-gate early-exit DB hook, and additive `create_actual_v10` / `delete_actual_v10` wiring with full balance delta-accounting + cascading-child cleanup. Includes a fix-up migration `0016_v10_actual_account_id.py` that closes the schema gap deferred from plan 22.06 (so the parent transaction can carry an `account_id` for the roundup child to inherit).
- 1. [Rule 3 — Blocking] Lazy-import `PlanTemplateItem` in `app/services/planned.py`
- Manual provoditel'/cancel of recurrent → expense in one DB transaction with balance delta + idempotency guards.
- Idempotent end-of-period rollover with three-layer protection (advisory lock + processed_at gate + defensive UNIQUE INDEX), wired into close_period_job so misc-remainders accumulate into next period and savings-remainders create deposit txns.
- BE-15 атомарный v1.0-онбординг через `complete_v10`
- 1. [Style] Split single Task 1 into 6 atomic commits (one per file).
- 1. [Rule 1 — Bug] Pydantic strict=True rejected ISO date strings on goal.due
- `app/api/routes/internal_onboarding.py`
- BE-16 acceptance gate — 16 integration tests proving v1.0 multi-tenancy invariants (RLS on account/goal/savings_config + composite FK on category.parent_id and actual_transaction.parent_txn_id) hold under a NOSUPERUSER NOBYPASSRLS role.
- Phase 22 closer.
- 6 files (1 source, 1 generator, 2 build configs, 2 generated artifacts) + 1 lockfile committed across 2 atomic commits.
- Self-hosted font registry
- bare filenames (e.g. `<string>PTSerif-Italic.ttf</string>`).
- 11 keyframe animations (posterRowIn/RiseIn/BarFill/TabPop/PopIn/Check/Dot/SlideInFwd/SlideInBack/TabSwap/ToastIn) defined in `animations.css` with exact durations + cubic-bezier curves from DESIGN-SYSTEM.md §7.2, plus class-selector utilities and `prefers-reduced-motion` media query reducing all to opacity-only fades.
- `PosterAnimations.swift` — 11 SwiftUI animation analogs of the web poster keyframes, sourced from `PosterTokens.Easing` cubic-bezier control points, plus reduce-motion-aware view-modifier wrappers (`posterAnimation` / `posterTransition`).
- 1. [Adjustment - Convenience] Added `posterSlideInFwd` / `posterSlideInBack` static AnyTransition aliases in `PosterTransitions.swift`
- Playwright e2e suite (6 tests) verifies Phase 23 design-system deliverables: 8 component sections render, no console errors, cyrillic glyph routing via PosterSerifItalic, dual-shell theme dispatcher (env / localStorage / tampering / default), and prefers-reduced-motion flattens posterRowIn duration to 0.2s.
- Symmetric web reducer + iOS @Observable state machine for V10 onboarding with localStorage / UserDefaults round-trip and typed POST /onboarding/complete wrappers — 100 unit specs (35 web + 25 iOS) prove every action transition + sanitiser invariant + JSON parity.
- Reusable poster-style onboarding chrome (header/dots/CTA) + reducer-driven OnboardingFlow root + Step 01 income input with U+202F thin-space formatter, 100M ₽ paste cap, and 4 preset chips (50/80/120/200K)
- SwiftUI step 01 income screen + reusable OnboardingChrome scaffold + RubleFormatter U+202F helper, symmetric to web Plan 24-02.
- Chip-list account entry (Т-Банк / Сбер / Наличные / + Добавить) with reusable AccountBalanceForm and Russian pluralisation helpers (счёт / счёта / счётов) wired into OnboardingFlow step 2
- SwiftUI step 02 accounts screen with chip-list entry pattern + bottom-sheet balance form + Russian plural helper, symmetric to web Plan 24-04.
- Step04Goal.tsx
- Step04GoalView.swift
- 1. [Rule 3 - Blocking] StrictMode double-effect breaks `flipAfterCall: 1`
- OnboardingV10View now mounts in V10MainShell via OnboardingMountView gateway: GET /me drives the routing — onboarded_at:nil → onboarding flow, otherwise Home placeholder. 8 XCTest cases + manual smoke checklist round out Phase 24.
- Extended `POST /api/v1/actual` schema and route so the v1.0 UI can pass `account_id` (firing delta-balance + roundup hook server-side) and so `ActualRead` emits the full 4-valued `kind` enum + `account_id` + `parent_txn_id` for spec-tag rendering — without breaking any v0.x client.
- Web `screensV10/common` foundation (PosterRouter useReducer hook + PosterSheet portal modal + BottomNavV10 wrapper + day/time/period formatters) symmetric to iOS PosterRouter/PosterSheet, unblocking all Phase 25 UI plans (Home, Transactions, AddSheet).
- Built the V10 web Home screen end-to-end (HOME-V10-01..06) — coral hero with count-up «Дневной темп», dashed-underlined wallet link, signed PLAN bar with yellow/red surplus, and sorted category list with staggered row-in + bar-fill animations + OVER plate — split into pure compute helpers, props-only HomeView, and a HomeMount data fetcher wired to PosterRouter.push placeholders for all 4 deferred targets.
- Built the iOS Home screen for v1.0 (coral hero with count-up «Дневной темп», wallet link, plan-bar plate, sorted category list with stagger reveal + bar fill, OVER plate, four push routes through `PosterRouter`) — symmetric to the web HomeView landing in parallel via Plan 25-04 — by adding pure-compute helpers (`HomeData`), formatters (`V10Formatters`), an `@Observable` data loader (`HomeV10ViewModel`), placeholder views for unbuilt screens, and a SwiftUI view (`HomeV10View`) that consumes all of the above.
- Wired Wave-1/Wave-2/Wave-3 web primitives (HomeMount + PosterRouterProvider + BottomNavV10 + PosterSheet) into a single V10MainShell so Home actually appears on screen after onboarding completes — replaces the AppV10 → OnboardingMount → HomePlaceholder stub path with AppV10 → V10MainShell → PosterRouterProvider(OnboardingMount → HomeMount) + BottomNavV10 + AddSheet PosterSheet binding.
- Wired the iOS V10 root shell — `V10MainShell` now composes `PosterNavStack(router=…) { OnboardingMountView }` under a `BottomNavV10` chrome with the FAB-driven `posterSheet` AddSheet binding, and `OnboardingMountView`'s onboarded branch renders the real `HomeV10View` instead of the local placeholder — closing HOME-V10-01..06 (built-but-not-mounted), TXN-V10-06 (4-tab + FAB nav with no Транзакции tab), and ADD-V10-01 (FAB visible everywhere except inside the open AddSheet) on iOS.
- Built the V10 web Transactions registry end-to-end (TXN-V10-01..05) — cobalt push-stack screen with eyebrow/Mass italic header, single-select filter chip-bar, day-grouped rows with DM Serif italic dateLabel + mono time/amount, inline roundup/deposit spec-tag plates and U+2212 negatives — split into pure compute helpers, props-only TransactionsView, and a TransactionsMount data fetcher wired to PosterRouter.pop + PosterSheet edit stub + window.confirm-gated delete; HomeMount «ВСЕ ОПЕРАЦИИ →» now lands on the real registry instead of the WIP placeholder.
- Built the iOS Transactions registry (cobalt push-stack screen with eyebrow «SECTION II», italic «Реестр.», summary line, 6-chip single-select filter, day-grouped sections with day-sums, time-mono / name / category / amount rows with U+2212 minus and inline yellow «↻ ОКРУГЛ.» / paper «→ КОПИЛКА» spec-tag plates, swipe-left → confirmationDialog → DELETE /actual/{id}, row tap → posterSheet edit stub) and rebound HomePlaceholders.TransactionsViewPlaceholderView to render the real screen — closing TXN-V10-01..05 on iOS by adding pure-compute helpers (TransactionsData), an @Observable data loader (TransactionsV10ViewModel), and a SwiftUI screen (TransactionsV10View) that consumes both.
- Built the v1.0 AddSheet on the POSTER.black sheet (custom 3×4 numeric keypad replacing the system keyboard, BigFig 86px yellow amount, description input, date chips, category chip-scroll filtering savings/paused, account row, 3-state CTA, atomic POST via createActualV10, dirty-close confirm gate) and replaced V10MainShell's `AddSheetPlaceholderContent` stub with the real component — closing ADD-V10-01..05 entirely.
- Locked TXN-V10-06 acceptance on both web (vitest) and iOS (XCTest) plus a single end-to-end Playwright spec covering the Phase 25 happy path (Home → Transactions push → AddSheet open) — any future regression that re-adds a «Транзакции» tab to the V10 BottomNav, or accidentally demotes the legacy v0.6 nav, breaks CI immediately.
- Расширил CategoryUpdate Pydantic schema (plan_cents/rollover/paused/parent_id) и добавил PATCH /api/v1/plan-month — atomic batch plan-cents update с server-side Σplan ≤ income validation; 17/17 integration tests pass.
- Built the V10 web Category Detail screen end-to-end (CAT-V10-01..06) — push-stack screen on cobalt (red when fact > plan) with Mass UPPERCASE category name, italic «— на N% плана» / «— превышено на N%» subtitle, BigFig fact with count-up, 6px progress bar capped at 100% with a 1px break-tick at the plan position when over-budget, rollover-toggle plate flipping ОСТАТОК → НАКОПЛЕНИЯ / ПРОЧЕЕ via PATCH /categories/:id, ghost CTA row («+ ПОДНЯТЬ ЛИМИТ» / «ПАУЗА» / «ВКЛЮЧИТЬ»), and a day-grouped operations list filtered to this category — split into pure compute helpers, props-only View, and a Mount data-fetcher wired to PosterRouter + PATCH-backed toggle handlers; HomeMount row tap now lands on the real screen instead of the WIP placeholder.
- Built the iOS Category Detail screen (CAT-V10-01..06): cobalt-default / red-when-over ZStack background, Mass UPPERCASE category name, italic «— превышено на N%» / «— на N% плана» subtitle, BigFig fact count-up, 6pt progress bar with break-tick at plan/fact for over-budget rows, paper rollover plate that flips «ОСТАТОК → ПРОЧЕЕ» ↔ «ОСТАТОК → НАКОПЛЕНИЯ» via PATCH /api/v1/categories/:id (Phase 26-01 backend ext), ghost CTA row with «+ ПОДНЯТЬ ЛИМИТ» (pushes PlanViewPlaceholder for now — Plan 26-05 will swap to real PlanView with focus param) and «ПАУЗА» / «ВКЛЮЧИТЬ» toggling `category.paused` via the same PATCH endpoint, and a day-grouped operations list filtered to this category — symmetric to web Plan 26-02 — by adding pure-compute helpers (CategoryDetailData) with TDD coverage (13 XCTests, 16 assertions, all green), an @Observable VM, a SwiftUI view, and a 6-line zero-touch placeholder swap in HomePlaceholders.swift so HomeV10View's existing row-tap push lands on the real screen without any further wiring.
- Built the V10 web Plan editor end-to-end (PLAN-V10-01..06) — push-stack screen on cobalt with «PLAN МЕСЯЦА.» Mass headline, surplus plate (yellow OK / red OVER) gated on `income − Σplan`, 2 rollover aggregate plates («→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ»), РЕГУЛЯРНЫЕ block listing monthly subs with post/unpost CTAs + Toast confirmation, N PosterSliders (step 500₽) per category each with a «ПРОЧЕЕ / НАКОПЛЕНИЯ» chip-pair routing to PATCH /categories/:id, and a single PATCH /plan-month atomic save with inline overflow error display — split into 2 typed API wrappers, pure compute helpers, props-only View, and a Mount data-fetcher wired to PosterRouter + ApiError(400) handling; HomeMount PLAN-bar tap and CategoryDetail «+ ПОДНЯТЬ ЛИМИТ» both land on the real screen, with deep-link `focusCategoryId` scrolling to the relevant slider row.
- Built the iOS PLAN мая screen (PLAN-V10-01..06): cobalt-bg ZStack with «MGMT / LIMITS» eyebrow + Mass «PLAN МЕСЯЦА.» 70pt header, surplus plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» that flips yellow→red and disables «СОХРАНИТЬ» when Σplan exceeds income, two rollover-aggregate plates («→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ»), a «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» block with «ПРОВЕСТИ →» / «ОТМЕНА» buttons that wrap POST /subscriptions/:id/post|unpost, eight PosterSlider rows (step 50_000 = 500₽, 300ms debounce built-in) with a paper-outline chip-pair toggling rollover per category via PATCH /categories/:id (Phase 26-01 backend ext), and a single «СОХРАНИТЬ» CTA that fires PATCH /api/v1/plan-month atomically (Phase 26-01 BE-08) with the entire local edit batch — surplus plate's red state + CTA's disabled state + server-side Σplan ≤ income check create three layered overflow defences. Symmetric to web Plan 26-04 — by adding pure-compute helpers (PlanData) with TDD coverage (20 XCTests, all green), an @Observable VM (parallel async-let load, inFlight guard, atomic submit), a SwiftUI view, and two zero-touch wirings: HomePlaceholders.PlanViewPlaceholderView's body rebound to render PlanView() and CategoryDetailView's «+ ПОДНЯТЬ ЛИМИТ» CTA finalising its push from PlanViewPlaceholderView() to PlanView(focusCategoryId: cat.id) so the screen scrolls to the focused slider row anchor=.center on appear.
- 1. [Rule 3 - Blocking] Created v10 subscriptions API client + types myself
- Built the iOS Subscriptions screen (SUBS-V10-01..04): coral push-stack background, Mass italic «Подписки.» 70pt, BigFig monthly_total/100 with «₽/мес» suffix, eyebrow «N АКТИВНЫХ · Y ₽ В ГОД», list of subs with name UPPER + cadence caption (RU genitive months for yearly via V10Formatters) + price + «···» 36×36 tap target opening a primary posterSheet menu with 3 ghost buttons (ПАУЗА/ВКЛЮЧИТЬ toggle, СМЕНИТЬ ДЕНЬ → secondary posterSheet with Stepper(1...28), ИЗМЕНИТЬ ЦЕНУ → secondary posterSheet with numeric TextField) and a destructive «ОТМЕНИТЬ ПОДПИСКУ» CTA wiring through a SwiftUI .confirmationDialog (T-26-07-01 two-step gate) — symmetric to web Plan 26-06 — by adding pure-compute helpers (SubscriptionsData) with TDD coverage (14 XCTests, all green on iPhone 17 Pro Simulator), an @Observable VM, two SwiftUI views, and the V10 API surface (SubscriptionsV10API + SubscriptionV10DTO + SubscriptionV10UpdateRequest + SubscriptionPostResponseDTO) the plan attributed to dependency 26-05 but which had not yet landed in this worktree at execution time.
- Built the V10 web AI screen end-to-end (AI-V10-01..02, AI-V10-04..05) — black poster surface with «AI · ASSISTANT / ONLINE» eyebrow, DM Serif Italic 36px observation fetched from Phase 27-01's `GET /ai/observation`, 4 italic chip-suggestions, active-state chat bubbles + 3-dot typing indicator using v0.6 SSE streaming infra (no reimpl), and a sticky composer with «↵ ОТПРАВИТЬ» — split into pure compute helpers, props-only AiView, and a router-bound AiMount.
- Built the V10 web Копилка screen end-to-end (SAV-V10-01..04) — poster-black push-stack screen with Mass italic «Копилка.», yellow Plate «НАКОПЛЕНО ВСЕГО · X ₽» (BigFig with ₽ suffix), eyebrow «В <MONTH> + Y ₽» (current local-month inflows), ОКРУГЛЕНИЕ ТРАТ toggle (ВКЛ/ВЫКЛ) + 3 base chips (10/50/100 ₽) wired to optimistic PATCH /savings/config, ЦЕЛИ section with goal cards (name UPPER · «срок · {due}» · «{cur}/{tgt} ₽» · «{pct}%») using posterBarFill animation, empty state, and primary/ghost CTA pair («+ НОВАЯ ЦЕЛЬ» → NewGoalSheet → POST /goals; «ПОПОЛНИТЬ» → DepositSheet → POST /savings/deposit) — split into 2 typed API wrappers (savings + goals), 4 pure compute helpers (progress %, RU date format, 2 form-validation gates), props-only View, 2 standalone bottom-sheet form components, and a Mount data-fetcher with discriminated-union sheet state machine + reload-token refetch + window.alert error fallback; V10MainShell wiring resolved by parallel Plan 27-06 (MainShell now imports SavingsMountStub which Plan 27-06 will swap for SavingsMount once barrel exports stabilize).
- Built the V10 web Accounts feature end-to-end (ACCT-V10-01..04) — cream-bg list with Mass italic «Счета.» + dark СУММАРНО plate (BigFig sum + N счетов), bank rows with ОСНОВНОЙ yellow badge + tap-to-push, «+ ДОБАВИТЬ СЧЁТ» PosterSheet form (bank/kind chips/mask/balance/primary → POST /accounts) + disabled «ПЕРЕВОД SOON» CTA; black-bg Account Detail with Mass italic bank-name + 2 KPI plates («БАЛАНС» yellow + «В МАЕ · N ОПЕРАЦИЙ» dark) + per-account ops list — split into 6 pure compute helpers, 2 props-only Views, 1 form Sheet, and 2 router-bound Mounts; api/v10 surface extended with createAccount wrapper + AccountCreatePayload type.
- 1. [Rule 3 - Blocker] Adapted to actual backend API surface
- Web Phase 27 final wire-plan: ships the 3-screen Management cluster (Hub, Settings, Access) in poster style and rewires V10MainShell.handleTab so all 4 BottomNav tabs (home/savings/ai/mgmt) push real (or sibling-wave-stub) Mount components instead of the legacy WIP placeholders. ДОСТУП row owner-gated with fail-closed default.
- Built the V10 iOS AI screen end-to-end (AI-V10-01..02, AI-V10-04..05) — black poster surface with «AI · ASSISTANT / ONLINE» eyebrow, PT Serif Italic 36pt observation fetched from Phase 27-01's GET /ai/observation, 4 italic chip-suggestions, active-state chat bubbles + 3-dot typing indicator using v0.6 AIChatAPI SSE streaming infra (no reimpl), and a sticky composer with «↵ ОТПРАВИТЬ» — split into pure compute helpers, @Observable VM, and a router-aware SwiftUI presenter.
- Built the V10 iOS Копилка screen end-to-end (SAV-V10-01..04) — symmetric to web Plan 27-03 — as a poster-black push-stack SwiftUI screen with Mass italic «Копилка.», yellow Plate «НАКОПЛЕНО ВСЕГО · X ₽» (BigFig with ₽ sup), eyebrow «В <MONTH> + Y ₽» (current local-month inflows), ОКРУГЛЕНИЕ ТРАТ toggle (ВКЛ inverted yellow / ВЫКЛ ghost) + 3 Chip base buttons (10/50/100 ₽) wired to optimistic PATCH /savings/config, ЦЕЛИ section with tappable goal cards (name UPPER · «срок · {dueRu}» · «{cur}/{tgt} ₽» · «{pct}%») using easeOut(0.7) animated GoalProgressBar, italic empty state, and primary/ghost CTA pair («+ НОВАЯ ЦЕЛЬ» → NewGoalSheet → POST /goals; «ПОПОЛНИТЬ» → DepositSheet → POST /savings/deposit) — split into 2 typed API enums (SavingsAPI + GoalsAPI), 4 pure compute helpers in SavingsData (progress %, RU date format, 2 form-validation gates), props-driven SwiftUI View, 2 standalone bottom-sheet form components, and an @MainActor @Observable ViewModel with discriminated SheetMode enum (.none / .newGoal / .deposit(goalId: Int?)), parallel async-let snapshot+accounts fetch, and 5 mutations (load + 4 user actions); V10MainShell.swift UNCHANGED (Plan 27-11 wires the bottom-nav 'savings' tab).
- Built the V10 iOS Accounts feature end-to-end (ACCT-V10-01..04) — cream-bg list with Mass italic «Счета.» 70pt + dark СУММАРНО plate (BigFig sumBalances / 100 ₽ + N СЧЕТОВ), bank rows with subtitle + balance + ОСНОВНОЙ yellow badge + tap-push to Detail, «+ ДОБАВИТЬ СЧЁТ» PosterSheet form (bank/kind chips/mask digits-only/balance rubles/primary toggle → POST /accounts via AccountsAPI.create) + disabled «ПЕРЕВОД» with SOON badge; black-bg Account Detail with Mass italic bank-name + mono subtitle + 2 KPI plates («БАЛАНС» yellow on ink + «В МАЕ · N ОПЕРАЦИЙ» dark on paper) + per-account period-filtered operations list reusing TransactionsData.formatTxAmount — split into 6 pure compute helpers in AccountsData.swift, 2 @Observable ViewModels (List load+create, Detail parallel-fetch+filter), 2 SwiftUI Views (cream list + black detail), 1 form Sheet, AccountsAPI extended with create(_:) + AccountCreateRequest Encodable struct.
- iOS Analytics screen on cream poster background — italic «Месяц.», 3-chip period (МАР 26 / АПР 26 / МАЙ 26), dark «ПОТРАЧЕНО» + yellow «СЭКОНОМЛЕНО» KPI plates, ДЕНЬ/НЕД./КАТ. group chips, ink-bar chart with red highlight ≥75% of plan, and top-5 categories list fed by `/analytics/top-categories`.
- Wired the iOS V10 management cluster (MgmtHubView, SettingsV10View, AccessV10View) in poster style and rewrote V10MainShell.handleTabChange so all 4 BottomNav tabs (home/savings/ai/mgmt) push real V10 screens instead of legacy placeholders. ДОСТУП row owner-gated with fail-closed default; settings PATCH optimistic with rollback; access tab catches 403 and renders friendly «Только для владельца» banner.
- 1. [Rule 1 - Bug] `context.emulateMedia` is not a function in installed Playwright version
- Playwright snapshot scaffolding for 8 V10 screens (home, transactions, add-sheet, category-detail, plan-month, subscriptions, savings, ai-initial) plus a 207-line DIVERGENCES.md cataloging W/I/X divergences with an iOS manual visual-QA checklist for acceptance §14.
- `make perf-report` Makefile target + 28-perf-report.md фиксирующий 2.1MB bundle / 700kB woff2 inventory / 233kB realistic ru-load vs 200kB target — все три acceptance gate items resolved (1 hard gap accepted, 2 deferred to owner manual smoke).
- Makefile guards (`hidden-unicode-grep`, `migration-roundtrip`) + scripts/alembic-roundtrip.sh + 265-LOC §14 ТЗ acceptance Playwright spec — три independent safety/acceptance артефакта для v1.0 release.

---

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
