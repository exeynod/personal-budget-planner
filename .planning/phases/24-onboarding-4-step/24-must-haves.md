# Phase 24 — Must-Haves (goal-backward verification)

**Phase goal (ROADMAP §24):** User проходит 4-шаговый онбординг (Доход → Счета → План → Цель опц. → Final «ВСЁ. деньги под контролем.») в новом poster-стиле с draft persistence + atomic commit через `POST /api/v1/onboarding/complete`. Web (React 18 + Vite + TS) и iOS (SwiftUI) симметричные реализации, переиспользуют Phase 23 компоненты.

---

## Observable Truths

Each truth is verifiable by a human running the application end-to-end.

1. **T1 — Onboarding mounts only for non-onboarded users.** First-time user (`GET /me` → `onboarded_at: null AND income_cents: null`) видит OnboardingFlow at app root; existing onboarded user (`onboarded_at: <ISO>`) видит Home placeholder вместо онбординга.
2. **T2 — Step 01 (Доход) renders с правильным chrome.** User видит eyebrow «ШАГ 01 / 04 · ДОХОД», back-arrow disabled (нет previous step), 4-dot progress (1 paper, 3 dimmed), large input + `₽` suffix; NEXT кнопка disabled пока `income_cents > 0`.
3. **T3 — Step 02 (Счета) renders chip-list + balance input.** User видит чипы Т-Банк / Сбер / Наличные / + Добавить; tap on chip → opens balance input (sheet on iOS, inline form on web); first added account auto-marked primary; NEXT enabled при `accounts.length >= 1`.
4. **T4 — Step 03 (План) renders 8 sliders + live counter.** User видит 8 PosterSlider'ов (food/cafe/home/transit/fun/gifts/health/subs) с initial values = `floor(income * share / 50000) * 50000`, step 500 ₽; bottom counter показывает «остаётся X ₽ → накопления» (зелёный) или «превышение X ₽» (красный); NEXT disabled когда Σplan > income.
5. **T5 — Step 04 (Цель) supports both create and skip paths.** User видит eyebrow «ШАГ 04 / 04 · ЦЕЛЬ» с «ПРОПУСТИТЬ» в right-top; tap «ПРОПУСТИТЬ» → goes to Final без Goal в submit body; create path: name (1..80) + target_cents (>0) + optional due_date (≥ today+1d).
6. **T6 — Final-screen renders с правильной типографикой.** Eyebrow «VOL.04 · ГОТОВО», DM Serif italic «ВСЁ. деньги под контролем.», summary plate с income / accounts count / plan total / goal name (или «без цели»), CTA «НАЧАТЬ →».
7. **T7 — Submit success clears draft + navigates Home.** Tap «НАЧАТЬ →» → `POST /api/v1/onboarding/complete` с body, соответствующим `OnboardingV10Body` schema; 200 → localStorage / UserDefaults `onboarding.v10.draft` cleared, navigated to Home placeholder.
8. **T8 — Submit 409 wipes draft.** If backend returns 409 (already onboarded), draft cleared, toast «вы уже завершили онбординг», navigated to Home placeholder.
9. **T9 — Submit 422 shows error toast.** If backend returns 422 (validation, e.g. Σplan > income), error toast displayed, draft preserved, user lands on the offending step (or current step if ambiguous).
10. **T10 — Draft persists across sessions.** User mid-flight на Step 02 → closes app → returns 1h later → resumes на Step 02 с прежними income / accounts; flow restores from localStorage / UserDefaults JSON.
11. **T11 — Web ↔ iOS UX parity.** Same 4 steps, same default 8 categories, same shares (0.20/0.10/0.30/0.06/0.05/0.04/0.05/0.03), same cleared-on-success behaviour, same russian copy, same number formatter (U+202F thin space).

---

## Required Artifacts

### Web (frontend/src/screensV10/Onboarding/)

| Path | Provides | Min lines |
|------|----------|-----------|
| `OnboardingFlow.tsx` | Root component с `useReducer` step state, mounts steps, persists draft | 80 |
| `OnboardingFlow.module.css` | Coral background, padding, layout primitives | 20 |
| `useOnboardingDraft.ts` (in same dir or `frontend/src/hooks/`) | localStorage round-trip hook (`load() / save() / clear()`) с sanitisation | 60 |
| `Step01Income.tsx` | Income input + Step chrome | 80 |
| `Step01Income.module.css` | Income-step CSS | 15 |
| `Step02Accounts.tsx` | Chip-list + balance input + account list | 120 |
| `Step02Accounts.module.css` | Accounts-step CSS | 25 |
| `Step03Plan.tsx` | 8 sliders + live counter | 100 |
| `Step03Plan.module.css` | Plan-step CSS | 20 |
| `Step04Goal.tsx` | Goal create form OR skip | 80 |
| `Step04Goal.module.css` | Goal-step CSS | 15 |
| `Final.tsx` | Final screen + summary plate + submit | 80 |
| `Final.module.css` | Final-step CSS | 20 |
| `defaultCategories.ts` (shared module) | 8 default categories array (code/name/share/ord) | 25 |
| `frontend/src/api/onboardingV10.ts` | `postOnboardingComplete(body)` typed wrapper | 40 |
| `frontend/src/api/types.ts` (extend) | `OnboardingV10Body` + nested types matching Pydantic | +60 |

### iOS (ios/BudgetPlanner/FeaturesV10/Onboarding/)

| Path | Provides | Min lines |
|------|----------|-----------|
| `OnboardingFlow.swift` | `@Observable final class OnboardingFlow` — step state + draft I/O + submit | 120 |
| `OnboardingDraft.swift` | `Codable struct OnboardingDraft` mirroring web JSON shape | 50 |
| `OnboardingView.swift` | Root `View` switching by `flow.step` | 50 |
| `Step01IncomeView.swift` | Income input | 80 |
| `Step02AccountsView.swift` | Chip-list + PosterSheet for balance input | 130 |
| `Step03PlanView.swift` | 8 sliders + live counter | 110 |
| `Step04GoalView.swift` | Goal create / skip | 90 |
| `FinalView.swift` | Final screen + submit | 90 |
| `OnboardingChrome.swift` | Reusable chrome: back-arrow, eyebrow, progress dots, NEXT CTA | 80 |
| `OnboardingAPI.swift` (in `Networking/Endpoints/`) | `postOnboardingComplete(body) async throws -> OnboardingV10Result` | 60 |

### Phase 22 backend wire contract (read-only, no edits)

- `app/api/schemas/onboarding_v10.py:OnboardingV10Body` — request body shape (exact); web TS + iOS Swift Codable mirror this verbatim
- `app/api/schemas/onboarding_v10.py:OnboardingV10Response` — response shape
- `app/api/schemas/me_v10.py:MeV10Response` — trigger detection input

---

## Required Wiring (Key Links)

| From | To | Via | Pattern |
|------|----|----|---------|
| `frontend/src/AppV10.tsx` | `OnboardingFlow` | conditional render based on `useUser()` returning `onboarded_at: null` | `import { OnboardingFlow }` + ternary on user state |
| `OnboardingFlow.tsx` | `useOnboardingDraft` | every reducer action triggers `save()` via `useEffect([state])` | `useEffect(() => save(state), [state])` |
| `OnboardingFlow.tsx` | `Step01Income/Step02Accounts/Step03Plan/Step04Goal/Final` | switch on `state.step` | `state.step === 1 ? <Step01Income .../> : ...` |
| `Final.tsx` | `frontend/src/api/onboardingV10.ts:postOnboardingComplete` | onClick CTA → POST | `await postOnboardingComplete(serialiseDraft(state))` |
| `Final.tsx` | `clearDraft()` + Home redirect | inside 200 handler | `clearDraft(); navigate('/')` (or window.location reload) |
| `ios/BudgetPlanner/App/V10MainShell.swift` | `OnboardingView` | conditional `if needsOnboarding { OnboardingView(flow:) } else { … }` based on `AuthStore.user.onboardedAt == nil` | SwiftUI `@if` |
| `OnboardingFlow` (Swift) | `UserDefaults.standard` | `didSet` on each `@Observable` field calls `persist()` | `UserDefaults.standard.set(data, forKey: "onboarding.v10.draft")` |
| `FinalView.swift` | `OnboardingAPI.postOnboardingComplete` | async tap handler | `try await OnboardingAPI.postOnboardingComplete(body)` |
| `Step03Plan*` (web + iOS) | `defaultCategories[]` | `.map()` over fixed array | iterates 8 items |
| `Step03Plan*` (web + iOS) | NEXT button disabled state | `disabled = sumPlan > incomeCents` | derived value passed to `PosterButton` |

---

## Server contract sanity (no backend edits in Phase 24)

POST `/api/v1/onboarding/complete` body MUST match `OnboardingV10Body`:

```json
{
  "income_cents": 80000_00,
  "accounts": [
    {"bank":"Т-Банк","kind":"card","balance_cents":50000_00,"primary":true},
    {"bank":"Наличные","kind":"cash","balance_cents":10000_00,"primary":false}
  ],
  "category_plans": {
    "food":16000_00,"cafe":8000_00,"home":24000_00,"transit":4800_00,
    "fun":4000_00,"gifts":3200_00,"health":4000_00,"subs":2400_00
  },
  "goal": {"name":"Подушка","target_cents":200000_00,"due":"2027-01-01"},
  "savings_config": null
}
```

Constraints (server enforces, plan must respect client-side too):
- `income_cents > 0` AND `≤ 100_000_000_00` (100M ₽)
- `accounts: 1..20` items; `bank.length 1..40`; `mask` optional ≤16 chars; `kind ∈ {card, cash, savings}`; `balance_cents ∈ [-100M*100, +100M*100]`
- `category_plans` keys ∈ {food, cafe, home, transit, fun, gifts, health, subs} only; values ≥ 0; Σ ≤ income_cents; each ≤ income_cents * 4
- `goal` optional; `name 1..80`; `target_cents > 0` and `≤ INCOME_MAX_CENTS`; `due` strictly > today (Europe/Moscow)
- At most 1 `primary=true` account
- Body `extra="forbid"` — unknown fields raise 422

---

## Coverage map (requirements → must-haves → plans)

| REQ | Truth(s) | Plan(s) |
|-----|----------|---------|
| ONB-V10-01 (4-step + chrome) | T2, T3, T4, T5, T6 | 24-01, 24-02, 24-03, 24-04, 24-05, 24-06, 24-07, 24-08, 24-09 |
| ONB-V10-02 (Step 01 income input) | T2 | 24-02, 24-03 |
| ONB-V10-03 (Step 02 chip-list accounts) | T3 | 24-04, 24-05 |
| ONB-V10-04 (Step 03 sliders + counter) | T4 | 24-06, 24-07 |
| ONB-V10-05 (Step 04 optional goal + skip) | T5 | 24-08, 24-09 |
| ONB-V10-06 (Final screen + atomic submit) | T6, T7 | 24-08, 24-09, 24-10, 24-11 |
| ONB-V10-07 (draft persistence) | T10 | 24-01, 24-10, 24-11 |

---

## Source Audit

**GOAL** (ROADMAP §24 5 success criteria) — all covered:
- SC-1 (Step 01 chrome + NEXT disabled until income>0) → T2 (24-02, 24-03)
- SC-2 (Step 02 chip-list, 1+ account, primary auto) → T3 (24-04, 24-05)
- SC-3 (Step 03 sliders, live counter, NEXT disabled on overflow) → T4 (24-06, 24-07)
- SC-4 (Step 04 skip OR goal, Final summary, atomic submit) → T5, T6, T7 (24-08, 24-09)
- SC-5 (close mid-flight + return → resumed; cleared on success) → T10 (24-01, 24-10, 24-11)

**REQ** (ONB-V10-01..07) — all covered, see table above.

**RESEARCH** — n/a (Phase 24 reuses Phase 22 backend + Phase 23 components, no new external research).

**CONTEXT** (24-CONTEXT.md decisions) — all covered:
- D-01 Web + iOS симметрия → 24-02..09 paired plans
- D-02 Draft persistence (localStorage / UserDefaults JSON) → 24-01
- D-03 useReducer / @Observable step state → 24-01
- D-04 8 default categories с shares → 24-01 shared module + 24-06, 24-07
- D-05 Step 02 chip-list + balance sheet → 24-04, 24-05
- D-06 Step 03 sliders step=500 + initial floor formula → 24-06, 24-07
- D-07 Step 04 «ПРОПУСТИТЬ» → no Goal in body → 24-08, 24-09
- D-08 Final DM Serif italic «ВСЁ.» → 24-08, 24-09
- D-09 Submit 200 / 409 / 422 handling → 24-08, 24-09, 24-10, 24-11
- D-10 Onboarding entry trigger via `/me` → 24-01, 24-10, 24-11
- D-11 Localization RU + thin space formatter → all step plans

**Deferred (not gaps):** OnbWelcome (intro screen — prototype step 0), re-onboarding flow (R6 deferred to admin reset), multi-currency (out of scope), bank API auto-import (out of scope), step skip beyond Goal (rejected by REQ).

No unplanned items.
