# Roadmap: TG Budget Planner

## Milestones

- ✅ **v0.2 — MVP** (Phases 1-6) — shipped 2026-05-03 → [archive](milestones/v0.3-REQUIREMENTS.md) (full v0.2 traceability в v0.3 archive at close)
- ✅ **v0.3 — Analytics & AI** (Phases 7-10.2) — shipped 2026-05-06 → [archive](milestones/v0.3-ROADMAP.md)
- ✅ **v0.4 — Multi-Tenant & Admin** (Phases 11-15) — shipped 2026-05-07 → [archive](milestones/v0.4-ROADMAP.md) (live TG smoke deferred to UAT — see [v0.4-MILESTONE-AUDIT.md](v0.4-MILESTONE-AUDIT.md))
- ✅ **v0.5 — Security & AI Hardening** (Phase 16) — shipped 2026-05-07 → [archive](milestones/v0.5-ROADMAP.md)
- ✅ **v0.6 — iOS App** (Phases 17-21) — shipped 2026-05-09 → [archive](milestones/v0.6-ROADMAP.md) (TestFlight distribution deferred — paid Apple Developer Account out of scope)
- 🚧 **v1.0 — Maximal Poster Full** (Phases 22-28) — started 2026-05-09 — integration branch `v1.0-maximal-poster`

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
- [ ] **Phase 25: Home + Transactions + Add Sheet** — coral hero «дневной темп», push-stack реестр, custom 3×4 keypad, FAB на каждом экране
- [ ] **Phase 26: Category Detail + PLAN мая + Subscriptions** — red/cobalt category screen, PLAN со sliders + регулярные «провести в факт», подписки с editor-меню
- [ ] **Phase 27: AI + Savings + Accounts + Analytics + Management** — AI initial-state observation + 4 chips, Копилка с roundup-toggle, Accounts list + detail, Analytics rewrite, Mgmt-хаб
- [ ] **Phase 28: Animations Polish + Acceptance** — `prefers-reduced-motion`, accessibility audit, pixel-perfect side-by-side QA, performance, migration safety, acceptance §14 ТЗ

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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
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
| 25 - Home + Transactions + Add Sheet | 0/0 | Not started | - |
| 26 - Category Detail + PLAN мая + Subscriptions | 0/0 | Not started | - |
| 27 - AI + Savings + Accounts + Analytics + Management | 0/0 | Not started | - |
| 28 - Animations Polish + Acceptance | 0/0 | Not started | - |

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
