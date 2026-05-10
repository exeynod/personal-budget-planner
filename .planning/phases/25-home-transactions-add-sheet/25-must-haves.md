# Phase 25 — Must-Haves (goal-backward)

**Phase goal (ROADMAP):** User получает три ключевых экрана нового UX — Home (coral, hero «Дневной темп» с count-up + sorted category list со stagger + plan badge + wallet link), Transactions registry (cobalt push-stack экран с day-grouping, single-select chip filter, spec-tags roundup/deposit), Add Sheet (чёрный фон, custom 3×4 цифровая клава, suppressed system kb на iOS, FAB доступен с любого экрана кроме Add Sheet самого); v0.6 Transactions tab demoted из bottom nav.

## Observable Truths (must be TRUE for goal achieved)

### Home (HOME-V10-01..06)
- T-H-01: User-with-`onboarded_at != null` лендится на HomeView (web AppV10 + iOS V10MainShell), без OnboardingFlow. Background = coral.
- T-H-02: User видит eyebrow `VOL.NN / MONTH YYYY · N ДНЕЙ` (period_number = (year-2025)*12+month, days_left из текущей даты vs end-of-month).
- T-H-03: User видит «Дневной темп —» italic + BigFig с count-up cubicOut 900ms; значение = `max(0, (planTotal - totalExpense) / max(1, daysLeft))`.
- T-H-04: User видит подложку «осталось N дней · в кошельке X ₽ →» где X = `Σ account.balance_cents` из `GET /api/v1/accounts`; tap → push AccountsList placeholder view.
- T-H-05: User видит plan-bar бейдж «PLAN МЕСЯЦА · ± X ₽ →» где X = `surplus = planTotal - totalExpense`; tap → push PlanView placeholder.
- T-H-06: User видит сортированный список категорий (по `act/plan` desc, превышения сверху, фильтр `code != 'savings' AND paused = false`); каждая строка с `posterRowIn` stagger (delay 0.08 + i*0.045s) + bar-fill 700ms; OVER-плашка для `act > plan`.
- T-H-07: User tap на категории → push CategoryDetail placeholder; «ВСЕ ОПЕРАЦИИ →» → push TransactionsView.

### Transactions Registry (TXN-V10-01..06)
- T-T-01: User лендится на TransactionsView через push-stack из Home «ВСЕ ОПЕРАЦИИ →». Background = cobalt.
- T-T-02: User видит eyebrow «SECTION II» + Mass italic «Реестр.» + eyebrow `{N} ЗАПИСЕЙ · {Σ |amount|} ₽`.
- T-T-03: User видит filter chip-bar (Все / Кафе / Продукты / Транспорт / Подписки / Копилка), single-select, `Все` default.
- T-T-04: User видит транзакции сгруппированными по дням (Сегодня / Вчера / «N мая» через DM Serif italic 28px) с суммой за день справа; формат строки: время моно · название · `категория · СЧЁТ uppercase` · сумма (моно с U+2212 для negative).
- T-T-05: User видит roundup-tagged rows с inline жёлтой плашкой «↻ ОКРУГЛ.», deposit-tagged с inline plate «→ КОПИЛКА».
- T-T-06: User tap на строку → edit modal/sheet (reuse v0.x TransactionEditor wrapped в PosterSheet/web modal); swipe-left (iOS) / right-click context-menu (web) → confirm-sheet «УДАЛИТЬ ОПЕРАЦИЮ?».
- T-T-07: V0.6 Transactions tab отсутствует в V10 BottomNav (5 tabs: Home / Savings / FAB-center / AI / Mgmt).

### Add Sheet (ADD-V10-01..05)
- T-A-01: User тапает FAB (виден на всех V10 screens кроме самого Add Sheet) → открывается AddSheet через PosterSheet (iOS) / fixed modal (web). Background = #0E0E0E (POSTER.black).
- T-A-02: User видит header «NEW ENTRY · {date_short} · {time_HHMM}» + `×` close button.
- T-A-03: User видит BigFig 86px yellow для текущей суммы; вводит цифры через custom 3×4 keypad (1..9, ., 0, ⌫). На iOS системная клавиатура подавлена (TextField inputView=empty UIView); на web никакого native input — кастомные кнопки.
- T-A-04: User видит description input (italic-сериф placeholder «кафе / продукты / …»), date chips (Сегодня / Вчера / Своя дата → DatePicker), category chip-scroll (filtered `code != 'savings' AND paused = false`, single-select REQUIRED), account row (primary by default, tap → picker list).
- T-A-05: User видит CTA states: amount===0 → «ВВЕДИТЕ СУММУ» (disabled gray); amount>0 && !cat → «ВЫБЕРИТЕ КАТЕГОРИЮ» (disabled gray); amount>0 && cat → «СОХРАНИТЬ ↵» (active yellow).
- T-A-06: User submit → `POST /api/v1/actual` с `{kind:'expense', amount_cents, description, category_id, tx_date, account_id}` → 200 → toast → Add Sheet закрывается, txn появляется в Home / Transactions.
- T-A-07: User закрывает × с dirty form → confirm-sheet «ОТМЕНИТЬ ЗАПИСЬ?»; «ПРОДОЛЖИТЬ» возвращает к редактированию, «ОТМЕНИТЬ» закрывает без сохранения.

### Backend wiring (prereq — actual.py route extension)
- T-B-01: `POST /api/v1/actual` принимает optional `account_id: int` в body; при наличии — service-level использует `create_actual_v10` (delta-balance + roundup hook); v0.x clients без `account_id` продолжают работать (legacy `create_actual` path).
- T-B-02: `ActualRead` response schema эмитит `kind ∈ {expense, income, roundup, deposit}` (расширенный enum) + optional `account_id` + optional `parent_txn_id` для roundup spec-tags на client side.
- T-B-03: `GET /periods/{period_id}/actual` (или client-side period resolver через `GET /actual/balance` → period_id) возвращает все 4 kinds; UI фильтрует по filter-chip.

### V10 BottomNav (TXN-V10-06)
- T-N-01: V10MainShell (iOS) и AppV10 (web) рендерят BottomNavV10 на root level — 5 tabs: Home (active default) / Savings (placeholder «WIP») / FAB-center / AI (placeholder) / Mgmt (placeholder); FAB tap → AddSheet.
- T-N-02: BottomNavV10 hidden пока Add Sheet open (FAB при этом не рендерится повторно — sheet stack management).

## Required Artifacts

### Backend
- path: `app/api/schemas/actual.py` — provides: extended `ActualKindStr = Literal['expense','income','roundup','deposit']`, `ActualCreate` and `ActualRead` with optional `account_id`, `parent_txn_id`. contains: `Literal["expense", "income", "roundup", "deposit"]`.
- path: `app/api/routes/actual.py` — provides: `POST /actual` route uses `create_actual_v10` when `account_id` present (else legacy fallback); response schema emits new fields.

### Web
- path: `frontend/src/screensV10/common/PosterRouter.tsx` — provides: `usePosterRouter()` reducer hook + `PosterRouterProvider` + `PosterRouterView` rendering top-of-stack; min_lines: 80.
- path: `frontend/src/screensV10/common/PosterSheet.tsx` — provides: web modal primitive (backdrop opacity 0.45 + slide-up + drag-to-close touch); min_lines: 50.
- path: `frontend/src/screensV10/common/BottomNavV10.tsx` — provides: 5-tab bottom nav (uses existing `<TabBar>` with FAB) wrapping `<TabBar>` + tab placeholder routing.
- path: `frontend/src/screensV10/common/format.ts` — provides: `formatDay(d, today): string` («Сегодня» / «Вчера» / «N мая»), `formatTimeHM(d): string`, `formatPeriodEyebrow(date): string` («VOL.04 / MAY 2026 · 23 ДНЯ»). exports: ['formatDay','formatTimeHM','formatPeriodEyebrow'].
- path: `frontend/src/screensV10/Home/HomeView.tsx` — provides: HomeView with eyebrow / hero / wallet link / plan bar / category list.
- path: `frontend/src/screensV10/Home/HomeMount.tsx` — provides: data fetcher (parallel `getMeV10` / `listAccounts` / `listCategoriesV10` / period resolver / `listActual`) + render <HomeView> with computed daily pace / surplus / sorted cats.
- path: `frontend/src/screensV10/Transactions/TransactionsView.tsx` — provides: registry with filter chips, day grouping, row format, edit modal trigger.
- path: `frontend/src/screensV10/AddSheet/AddSheet.tsx` — provides: black sheet with custom keypad / description / date chips / cat scroll / account picker / CTA + submit `POST /api/v1/actual`.
- path: `frontend/src/screensV10/AddSheet/Keypad.tsx` — provides: 3×4 numeric pad component.
- path: `frontend/src/api/v10/actual.ts` — provides: typed wrapper for v10 actual list / create with `account_id` + extended kind enum; min_lines: 30.
- path: `frontend/src/api/v10/accounts.ts` — provides: typed wrapper for `GET /api/v1/accounts`; min_lines: 15.
- path: `frontend/src/api/v10/categories.ts` — provides: typed wrapper for v10 categories with `code/plan_cents/paused/rollover`; min_lines: 25.
- path: `frontend/src/AppV10.tsx` — provides: mount-after-onboarding switch (when `onboarded_at != null` → V10MainShell, else OnboardingMount).
- path: `frontend/src/screensV10/V10MainShell.tsx` — provides: V10 root shell with PosterRouter root = HomeView + BottomNavV10 + FAB → AddSheet PosterSheet.

### iOS
- path: `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift` — provides: `V10DayFormatter`, `V10TimeFormatter`, `V10PeriodEyebrow` static helpers. min_lines: 60.
- path: `ios/BudgetPlanner/FeaturesV10/Common/BottomNavV10.swift` — provides: 5-tab bottom nav using existing `TabBar` component.
- path: `ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift` — provides: HomeView (eyebrow / hero / wallet link / plan bar / category list with stagger).
- path: `ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift` — provides: @Observable model that loads /me + /accounts + /categories + /actual + computes daily pace / surplus / sorted cats.
- path: `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsView.swift` — provides: registry with filter chips, day grouping, row format, swipe-left delete.
- path: `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift` — provides: black sheet with keypad / description / date chips / cat scroll / account picker / CTA.
- path: `ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift` — provides: 3×4 numeric pad SwiftUI component.
- path: `ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift` — provides: TextField wrapper with inputView=empty UIView (suppresses system keyboard).
- path: `ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift` — provides: `AccountsAPI.list()` returning `[AccountDTO]`.
- path: `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift` — provides: `CategoriesV10API.list()` returning `[CategoryV10DTO]` (code/plan_cents/paused/rollover).
- path: `ios/BudgetPlanner/Networking/DTO/AccountDTO.swift` — provides: AccountDTO Decodable.
- path: `ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift` — provides: CategoryV10DTO with v1.0 fields.
- path: `ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift` — modified: extend `ActualDTO.kind` to support `roundup`/`deposit` strings, add optional `accountId`, `parentTxnId`.
- path: `ios/BudgetPlanner/App/V10MainShell.swift` — modified: route between OnboardingMountView (if not onboarded) → HomeView через PosterRouter + BottomNavV10 + AddSheet PosterSheet.

## Key Links (where breakage cascades)

- L-01: `frontend/src/AppV10.tsx` → `<V10MainShell>` after `me.onboarded_at != null` (if broken: home never renders, user stuck on placeholder)
- L-02: `frontend/src/screensV10/Home/HomeMount.tsx` → `listAccounts() / listCategoriesV10() / listActual(periodId)` (if broken: Home shows zeros / empty)
- L-03: `frontend/src/screensV10/AddSheet/AddSheet.tsx` → `createActualV10({account_id, ...})` POST (if broken: submit fails or roundup skipped)
- L-04: `frontend/src/screensV10/Transactions/TransactionsView.tsx` → `listActual(periodId)` (if broken: registry empty even after creating txn)
- L-05: `app/api/routes/actual.py` → `actual_svc.create_actual_v10(...)` when `account_id` present (if broken: account.balance not updated, no roundup child)
- L-06: `ios/BudgetPlanner/App/V10MainShell.swift` → `PosterRouter(root: HomeView())` + BottomNavV10 + AddSheet sheet binding (if broken: nav stack/sheet management corrupted)
- L-07: `ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift` → `UITextField.inputView = UIView()` UIViewRepresentable (if broken: system keyboard appears, breaking ADD-V10-02 acceptance)
- L-08: BottomNavV10 (web + iOS) → tab labels include only Home / Savings / AI / Mgmt + center FAB (if broken: TXN-V10-06 fails — Transactions tab still visible)

## Reachability Check

| Must-have | Reachable? | Path |
|-----------|------------|------|
| HomeView | ✓ | AppV10/V10MainShell mount after onboarded_at |
| Wallet link push Accounts | ✓ | PosterRouter.push from HomeView (placeholder view exists) |
| Plan bar push PlanView | ✓ | PosterRouter.push (placeholder until Phase 26) |
| Category tap push CategoryDetail | ✓ | PosterRouter.push (placeholder until Phase 26) |
| Transactions push from Home | ✓ | PosterRouter.push from HomeView |
| AddSheet from FAB | ✓ | TabBar.onFab callback → PosterSheet binding |
| Edit modal from row tap | ✓ | TransactionsView state → PosterSheet wraps existing v0.x TransactionEditor |
| Roundup/deposit spec-tags | ✓ | requires backend ActualRead schema extension (covered in Plan 25-01) |
| Account picker in AddSheet | ✓ | listAccounts() result → modal picker |
| FAB hidden inside AddSheet | ✓ | sheet z-index above tab bar |
