# Phase 24: Onboarding 4-step - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — defaults accepted

<domain>
## Phase Boundary

User проходит 4-step poster-стиль онбординг (Доход → Счета → План → Цель опц. → Final «ВСЁ. деньги под контролем.») с draft persistence и atomic commit через `POST /api/v1/onboarding/complete`. Web + iOS симметричные реализации, переиспользуют Phase 23 компоненты (Eyebrow, Mass, BigFig, Plate, PosterButton, Chip, PosterSlider step=500, FAB) + PosterNavStack/PreviewGallery routing primitives.

Phase 24 НЕ строит Home/Transactions — Final-экран навигирует на placeholder «Home WIP» (web) или `theme="v10"` shell (iOS) до прихода Phase 25.

</domain>

<decisions>
## Implementation Decisions

### Draft persistence (ONB-V10-07)
- **Web:** `localStorage.getItem('onboarding.v10.draft')` — JSON `{ step: 1|2|3|4, income_cents, accounts: [...], category_plans: {...}, goal: {...} | null }`. Cleared after successful `POST /onboarding/complete` 200.
- **iOS:** `UserDefaults.standard` key `"onboarding.v10.draft"` — same JSON shape via `JSONEncoder/Decoder`. Cleared on success.
- **Validation on resume:** if backend returns 409 Conflict (already onboarded), wipe draft and redirect to Home.

### Step state machine
- **Web:** single `<OnboardingFlow>` component с `useReducer` — actions `SET_INCOME, ADD_ACCOUNT, REMOVE_ACCOUNT, SET_PLAN, SET_GOAL, SKIP_GOAL, NEXT, BACK`. State persisted to localStorage on every action via `useEffect`.
- **iOS:** `@Observable final class OnboardingFlow` — symmetric state + `step: Int`, `next() / back() / submit()` methods.
- No URL routing per step — single mounted component, internal step state.

### Validation timing
- onChange (debounced 200ms for income input) — NEXT-button disabled state updates live
- Error toasts shown ONLY on tap NEXT с invalid state (server returns 422 → display error)
- Slider Σplan > income → disable NEXT; show «превышение X ₽» live in counter

### Default 8 categories (Step 03)
Per DATA-MODEL §1.3:

| ord | code | name (UPPERCASE) | share |
|-----|------|------------------|-------|
| 01 | food | ПРОДУКТЫ | 0.20 |
| 02 | cafe | КАФЕ | 0.10 |
| 03 | home | ДОМ | 0.30 |
| 04 | transit | ТРАНСПОРТ | 0.06 |
| 05 | fun | РАЗВЛЕЧ. | 0.05 |
| 06 | gifts | ПОДАРКИ | 0.04 |
| 07 | health | ЗДОРОВЬЕ | 0.05 |
| 08 | subs | ПОДПИСКИ | 0.03 |

Initial slider value = `Math.floor(income_cents * share / 50000) * 50000` (rounded down to step 500₽). Sum of shares = 0.83; remaining 0.17 предлагается в копилку (показывается в нижнем счётчике).

### Step 02: Account chip-list
- Predefined chips: «Т-Банк», «Сбер», «Наличные» (kind='cash'), «+ Добавить»
- Tap «Т-Банк» / «Сбер» / «Наличные» → opens balance input sheet → on save, account added to list with primary=true if first
- «+ Добавить» → free-text bank name + balance input
- Account list editable: tap existing → edit/delete; primary checkbox toggles
- Validation: ≥1 account; exactly 1 primary (auto-managed)

### Step 03: PLAN distribution slider
- 8 sliders, one per default category, range 0..income_cents, step 500₽
- Hard limit on each slider: max = income_cents (но Σ-violation handling separate)
- Bottom counter:
  - «остаётся X ₽ → накопления» (green/yellow) когда Σplan < income_cents
  - «превышение X ₽» (red, shaking text) когда Σplan > income_cents → NEXT disabled
- Tap on slider value → opens numeric input sheet (override step 500)

### Step 04: Goal (optional)
- «ПРОПУСТИТЬ» button at top-right → skips, no Goal created
- name input (1..80 chars), target_cents input (>0)
- due_date input optional (DatePicker, ≥ today + 1d)

### Final screen
- DM Serif italic mass-text «ВСЁ. деньги под контролем.»
- Summary plate listing income, account count, total plan, goal name (or «без цели»)
- «НАЧАТЬ →» CTA → `POST /onboarding/complete` → on 200: clear draft + navigate to Home (placeholder для Phase 24, real Home в Phase 25)
- On 409: wipe draft, show toast «вы уже завершили онбординг», navigate to Home
- On 422: show error toast, disable submit until user fixes

### Web → iOS sequencing
- Web first within each step (composing Phase 23 web components)
- iOS parallel after web step ships (composing Phase 23 iOS components)
- Plans interleaved: 24-01 web step 01 + 24-02 iOS step 01 (parallel), etc.

### Onboarding entry trigger
- Auto-mounted at app root if backend `GET /api/v1/me` returns `income_cents: null AND accounts: []`
- Existing OWNER_TG_ID with backfilled NULL income (per Phase 22 0012 migration) → onboarding shown on next launch

### Claude's Discretion
- Exact CSS animation hookup для step-transition (use posterSlideInFwd + posterSlideInBack from Phase 23)
- Exact iOS `withAnimation` curves (use PosterAnimations from Phase 23)
- Step indicator styling (4 dots horizontally, accent на active step) — can choose matching DESIGN-SYSTEM aesthetic
- Sheet vs modal для balance input on iOS (recommend PosterSheet from Phase 23)
- Default focus on step 01 income input для UX

</decisions>

<code_context>
## Existing Code Insights

### Backend dependency (Phase 22)
- `POST /api/v1/onboarding/complete` accepts `OnboardingV10Body` Pydantic schema (see `app/api/schemas/onboarding_v10.py`)
- Returns 409 if already onboarded (existing accounts), 422 if Σplan > income, 200 OK with `OnboardingV10Result` on success
- `GET /api/v1/me` extended (`MeV10Response`) returns `income_cents`, `accounts: [AccountResponse]`, `onboarded_at` for trigger detection
- `app/api/schemas/onboarding_v10.py:OnboardingV10Body` is the wire contract — serialize draft JSON to match this exactly

### Frontend dependency (Phase 23)
- `frontend/src/componentsV10/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,FAB,Toast}.tsx` — reusable
- `frontend/src/AppV10.tsx` — root entry; mount onboarding when triggered
- `frontend/src/preview/PreviewApp.tsx` — currently the gallery; replace or extend for onboarding routing
- `ios/BudgetPlanner/FeaturesV10/Common/{10 components}.swift` — symmetric
- `ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` + `PosterRouter.swift` — for step transitions
- `ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift` — for balance input modal

### Established Patterns
- Web routing: lazy-import shells, no router lib needed for Phase 24 (single `<OnboardingFlow>` mounted)
- iOS routing: `PosterRouter.push(_:)` from PreviewGallery pattern
- TypeScript strict + Pydantic v2 (matches Phase 22 schemas verbatim)
- Form state: useReducer (web), @Observable (iOS) — established Phase 23 patterns

### Integration Points
- Phase 25 (Home) consumes `User.income_cents` set in step 01 + `Account.balance_cents` from step 02 + Category.plan_cents from step 03
- Phase 27 (Savings) reads SavingsConfig from step 04 (or default if skipped)
- Phase 28 acceptance — pixel-perfect QA against `prototype/poster-screens.jsx` for all 4 steps + Final

</code_context>

<specifics>
## Specific Ideas

- **`prototype/poster-screens.jsx`** has reference impl для всех 4 шагов + Final. Plan-phase agent должен прочитать для точных layout values.
- **DM Serif italic Final-text** «ВСЁ. деньги под контролем.» — точный кернинг + размер из prototype.
- **Localization** — все строки на русском (single-tenant single-locale RU). Number formatter с U+202F thin space per DATA-MODEL §5.1.
- **Default Goal seed на skip** — explicitly NOT created. SavingsConfig defaults `roundup_enabled=false, base=10` per Phase 22 BE-08.

</specifics>

<deferred>
## Deferred Ideas

- **Re-onboarding flow для existing user** — defer R6 (admin endpoint `/internal/onboarding/reset` from Phase 22 covers manual reset)
- **Multi-currency input** — out of scope (RUB only)
- **Imported account auto-detection (Tinkoff/Sber API integration)** — out of scope, free-text bank names only
- **Step skip/jump («пропустить план, заполнить позже»)** — REJECTED per REQ; all steps required (kроме step 04 Goal)
- **Animated step transitions с custom direction (forward vs back)** — use posterSlideInFwd на NEXT, posterSlideInBack на BACK per Phase 23 keyframes

</deferred>
