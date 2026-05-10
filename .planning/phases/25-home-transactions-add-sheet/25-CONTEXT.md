# Phase 25: Home + Transactions + Add Sheet - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous fast-path) — REQ-driven, defaults accepted

<domain>
## Phase Boundary

Three core user-facing screens of v1.0 — Home (coral, hero «Дневной темп»), Transactions registry (cobalt push-stack), Add Sheet (black, custom 3×4 keypad) — built in poster style for web + iOS. v0.6 Transactions tab demoted from bottom nav (5-tab layout: Home/Savings/FAB/AI/Mgmt; FAB always available except inside Add Sheet itself).

Phase 25 reuses Phase 22 backend (`/api/v1/me`, `/api/v1/accounts`, `/api/v1/categories`, actual_transaction CRUD with v10 paths) + Phase 23 design system + Phase 24 OnboardingMount routing primitive.

</domain>

<decisions>

### Home (HOME-V10-01..06)
- **Background**: coral (default per HOME-V10-06 «Tweak»)
- **Eyebrow**: `VOL.{period_number_padded} / {MONTH_UPPER} {YYYY} · {days_left} ДНЕЙ` — period_number = (year - 2025) * 12 + month
- **Hero**: italic «Дневной темп —» + BigFig with count-up (cubicOut 900ms), value = `dailyPace = max(0, (planTotal - totalExpense) / daysLeft)` per DATA-MODEL §2.2
- **Wallet link**: «осталось N дней · в кошельке X ₽ →» (X = `Σ account.balance_cents` from `GET /api/v1/accounts`); tap → PosterRouter.push(AccountsListView)
- **Plan-bar badge**: «PLAN МЕСЯЦА · ± X ₽ →» where X = `surplus = planTotal - totalExpense`; tap → push PlanView (placeholder until Phase 26)
- **Category list**: from `GET /api/v1/categories` filtered by `code != 'savings' AND paused = false`, sorted by `act/plan DESC, plan_cents DESC`. Each row = Eyebrow ord + Mass.uppercase name + bar (`posterBarFill` 700ms with break on plan if isOver) + amount. OVER-plate appears for `act > plan` (red plate). Stagger animation `posterRowIn` delay = `0.08 + i*0.045s`.
- **Category tap**: push CategoryDetail (placeholder until Phase 26)
- **«ВСЕ ОПЕРАЦИИ →»**: push TransactionsRegistry (this phase)

### Transactions Registry (TXN-V10-01..06)
- **Background**: cobalt
- **Header**: Eyebrow «SECTION II» + Mass italic «Реестр.» + Eyebrow «{N} ЗАПИСЕЙ · {Σ |amount|} ₽»
- **Filter chips** (single-select, horizontal): Все / Кафе / Продукты / Транспорт / Подписки / Копилка. Filter state in component-local React state (web) / `@State` (iOS).
- **Day grouping**: `formatDay(d, today)` per DATA-MODEL §5.3 — «Сегодня» / «Вчера» / «N мая» (DM Serif italic 28px). Sum-per-day on right.
- **Row format**: time mono · name · `категория · СЧЁТ uppercase mask` · amount (mono with U+2212 for negative). Roundup → yellow plate «↻ ОКРУГЛ.». Deposit → plate «→ КОПИЛКА».
- **Tap → edit sheet**: reuse existing TransactionEditor wrapped in PosterSheet (iOS) / modal (web)
- **Swipe-left delete** (iOS) / right-click delete (web) → confirm sheet «УДАЛИТЬ ОПЕРАЦИЮ?»
- **v0.6 Transactions tab demoted**: bottom nav v0.6 had Главная/Транзакции/Аналитика/AI/Управление; v1.0 has Home/Savings/FAB/AI/Mgmt. Transactions accessible only via push-stack from Home «ВСЕ ОПЕРАЦИИ →» and Category Detail (Phase 26)
- **Endpoint**: `GET /api/v1/actual?from=...&to=...&category_id=...&account_id=...` (existing endpoint от v0.x — reuse)

### Add Sheet (ADD-V10-01..05)
- **Trigger**: FAB tap (FAB visible on every screen except Add Sheet itself; PosterSheet stack management)
- **Background**: black (#0E0E0E)
- **Header**: «NEW ENTRY · {date_short} · {time_HHMM}» + `×` close button (top-right)
- **Amount input**: BigFig 86px yellow. Custom 3×4 numeric keypad (1..9, ., 0, ⌫) overlay. iOS: TextField inputView=empty UIView (suppresses system kb); Web: hidden input + custom button row.
- **Description input**: italic-серif placeholder «кафе / продукты / ...»
- **Date chips**: Сегодня / Вчера / Своя дата (DatePicker on tap «Своя дата»)
- **Category picker**: horizontal chip-scroll, single-select, REQUIRED. Source = `Category` list filtered by `code != 'savings' AND paused = false`.
- **Account picker**: row showing primary account name; tap → opens picker list from `GET /accounts`
- **CTA states**:
  - amount === 0: «ВВЕДИТЕ СУММУ» (disabled gray)
  - amount > 0 && !category: «ВЫБЕРИТЕ КАТЕГОРИЮ» (disabled gray)
  - amount > 0 && category: «СОХРАНИТЬ ↵» (active yellow)
- **Submit**: `POST /api/v1/actual` (existing v0.x endpoint) with body `{kind: 'expense', amount_cents: -amount, category_id, account_id, description, occurred_at}`. v10 roundup hook fires automatically server-side (Phase 22 BE-07).
- **Unsaved close**: tap × with form dirty → confirm sheet «ОТМЕНИТЬ ЗАПИСЬ?»

### General
- **Web routing**: extend AppV10 — render `<HomeMount />` after onboarding gate; HomeMount wraps `<HomeView />` + push-stack via lightweight router state OR React Router (PLAN-phase decides; recommend simple state-based stack like iOS PosterRouter for symmetry)
- **iOS routing**: V10MainShell after onboarding completes → `PosterNavStack { HomeView() }`. Push routes: TransactionsView, AccountsListView, AccountDetailView (placeholder), CategoryDetailView (placeholder until Phase 26), PlanView (placeholder until Phase 26), AddSheetView via PosterSheet.
- **FAB management**: rendered at root level of V10MainShell (web equivalent), hidden when AddSheet is open
- **Number formatter**: U+202F thin space per DATA-MODEL §5.1 (web `formatRubles` from Phase 24 onboarding, iOS `RubleFormatter` from Phase 24-03 — reuse both)
- **Date formatter**: per DATA-MODEL §5.3 (formatDay + formatTime helpers — reuse from Phase 24 if exist; else create)

### Claude's Discretion
- Exact PosterRouter integration for web (recommend lightweight `useReducer({stack: View[]}, action: push|pop)` matching iOS contract)
- v0.6 bottom nav demotion implementation: extend MainShell or build new BottomNavV10 component for V10 tree only — don't modify v0.6
- Sample data display while empty (e.g. «Никаких трат сегодня» vs hide section)
- TransactionEditor poster-style retrofit scope — reuse existing TransactionEditor.tsx component if Phase 11+ has one, else build minimal wrapper
- Exact OVER-plate styling (red flat plate at end of bar; copy from prototype)

</decisions>

<code_context>

### Backend (Phase 22)
- `GET /api/v1/me` returns `MeV10Response` (income_cents, accounts, onboarded_at)
- `GET /api/v1/accounts` returns AccountResponse[] for primary + others
- `GET /api/v1/categories` returns Category[] (with plan_cents, code, ord, rollover, paused)
- `GET /api/v1/actual?from&to&category_id&account_id` — existing v0.x endpoint, returns ActualTransaction[]
- `POST /api/v1/actual` — existing v0.x endpoint, creates expense/income txn (also `create_actual_v10` from Phase 22-07 if route mapping done in 22-13)
- `GET /api/v1/budget-period/current` — returns active BudgetPeriod with `plan_cents` aggregate (or compute client-side from Σ Category.plan_cents)

### Phase 23 components used
- Eyebrow, Mass, BigFig (with count-up), Plate, PosterButton, Chip, FAB, Toast, TabBar
- PosterNavStack, PosterRouter, PosterSheet (iOS only — web needs symmetric primitive)
- 11 keyframe animations (especially posterRowIn, posterBarFill, posterToastIn, posterDot)

### Phase 24 reuse
- `OnboardingMount` (web) / `OnboardingMountView` (iOS) — Phase 25 mounts AFTER `me.income_cents != null AND accounts.length > 0`
- `formatRubles` (web), `RubleFormatter` (iOS), `pluralAccounts` for «N счета/счетов»

### Existing v0.x code
- `frontend/src/screens/HomeView.tsx` (or similar) — v0.6 home; DO NOT modify (gated behind `theme=v06`)
- `frontend/src/screens/TransactionsScreen.tsx` — v0.6 transactions; demote in v10 path only
- iOS Features/{Home,Transactions,Add}/* — v0.6 versions; gated behind `theme=v06`

</code_context>

<specifics>
- **`prototype/poster-screens.jsx`** has reference impls for HomeView (lines ~150-450), TransactionsView (~500-800), AddSheet (~900-1200). Plan-phase agent extracts exact layouts.
- **Roundup spec-tag styling** (yellow plate «↻ ОКРУГЛ.») and deposit plate («→ КОПИЛКА») are inline elements within transaction row, not full-width plates.
- **Filter chip mapping**: Все = no filter, Кафе = `code='cafe'`, Продукты = `code='food'`, Транспорт = `code='transit'`, Подписки = filter by Subscription-linked txns OR `code='subs'`, Копилка = `kind IN ('roundup', 'deposit')`.
- **Empty states**: «Сегодня без трат — спокойный день» (italic) per DESIGN-SYSTEM convention.
- **Web PosterSheet equivalent**: build minimal `<PosterSheet>` modal component with backdrop opacity 0.45 + slide-up + drag-to-close (touch events) — mirror iOS contract.

</specifics>

<deferred>
- **Background color toggle (HOME-V10-06 alt: cobalt/cream)** — explicit defer to R6
- **Subscription-linked txn filter logic** — needs Subscription-Txn join via `posted_txn_id`; defer optimization, simple filter ok for MVP
- **TransactionEditor poster retrofit** — fall back to existing v0.x editor wrapped in PosterSheet for Phase 25; full poster-styled editor in Phase 26 if time permits, else R6
- **Swipe-left delete on web** — REQ asks for it on iOS (mobile gesture); web uses right-click or ⋯-menu (cleaner desktop UX). Document divergence in SUMMARY.
- **Bottom nav redesign for V10** — add minimal V10BottomNav (5 tabs: Home/Savings/FAB-center/AI/Mgmt). Savings/AI/Mgmt tabs are placeholders («WIP») until Phase 27. FAB-center is the Add trigger.

</deferred>
