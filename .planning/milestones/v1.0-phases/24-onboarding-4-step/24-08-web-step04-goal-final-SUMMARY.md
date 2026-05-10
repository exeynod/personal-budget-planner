---
phase: 24-onboarding-4-step
plan: 08
subsystem: frontend/onboarding-v10
tags: [web, onboarding, goal, final, atomic-submit, react, tdd]
requires:
  - phase 24-01 (reducer SET_GOAL/SKIP_GOAL + serialiseDraft + ApiError)
  - phase 24-02 (OnboardingChrome scaffold + onSkip + nextLabel slots)
  - phase 24-06 (Step03Plan pattern for headline/sub-eyebrow layout)
  - Phase 23 Mass / Eyebrow / Toast componentsV10
provides:
  - Step04Goal view (DM Serif italic name + Archivo Black amount + optional date)
  - isGoalValid predicate (NEXT-gate)
  - todayPlusOneISO helper (date input min)
  - Final view (hero + summary plate + atomic submit handler)
  - 200/409/422/network status routing per must_haves
  - OnboardingFlow case 4 (Step04Goal + ПРОПУСТИТЬ skip path)
  - OnboardingFlow case 5 (Final, no chrome)
affects:
  - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx (case 4 + case 5; type cleanup)
tech-stack:
  added: []
  patterns:
    - Pure predicate (isGoalValid) — testable without RTL
    - SET_GOAL with omitted `due` key when empty (matches server Optional+omit policy)
    - status-based error routing via ApiError.status (no string-matching)
    - replay-guard via submitting flag + early-return in handler
    - 409 uses draft.clear() BEFORE delayed onComplete (T-24-08-05)
key-files:
  created:
    - frontend/src/screensV10/Onboarding/Step04Goal.tsx
    - frontend/src/screensV10/Onboarding/Step04Goal.module.css
    - frontend/src/screensV10/Onboarding/Final.tsx
    - frontend/src/screensV10/Onboarding/Final.module.css
    - frontend/src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx
    - frontend/src/screensV10/Onboarding/__tests__/Final.test.tsx
  modified:
    - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
decisions:
  - Final renders WITHOUT OnboardingChrome — the plate + hero + CTA are bespoke and chrome's footer/dots would conflict
  - OnboardingV10Response is now imported from `api/onboardingV10.ts` (canonical) and re-exported from OnboardingFlow for backward compat — kills the divergent placeholder type
  - onComplete prop loosened to `(response | null) => void` so 409 can fall through to host transition without inventing a synthetic response
  - 422 path keeps the user on Final (does NOT call onComplete) so they can see the toast and retry; draft preserved
  - 409 toast then setTimeout(onComplete, 1500) gives the user time to see the conflict copy before host transitions — matches plan §case 5 behaviour
  - Date input `color-scheme: dark` so the native picker icon is visible against coral background
metrics:
  duration_seconds: 360
  completed: 2026-05-10
  tasks: 2
  files_changed: 7
---

# Phase 24 Plan 08: Web Step 04 Goal + Final + atomic submit Summary

Step 04 (Цель, опционально) + Final (ВСЁ. деньги — под контролем.) + атомарный submit с раутингом 200/409/422/network. Завершает 4-шаговый веб-онбординг — пользователь видит сводку и нажимает «НАЧАТЬ →», состояние едет на сервер за один POST.

## What was built

**Step04Goal.tsx**

- Mass italic 32px headline «Зачем копишь?» (двухстрочный) + sub-eyebrow 0.55 «МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ»
- Name input: DM Serif italic 22px, `maxLength=80` (T-24-08-01), placeholder «Цель (Грузия, подушка, ноутбук…)»
- Amount input: Archivo Black 36px + ₽ suffix (24px), digit-only через `parseIncomeInputToCents` (тот же helper, что Step01)
- Optional due date: `<input type="date" min={todayPlusOneISO()}>` (T-24-08-02 — клиент advisory, сервер authoritative по Europe/Moscow)
- Каждый change → `dispatch(SET_GOAL, { name, target_cents, due? })`. `due` ключ опускается, когда пусто (matches server Optional+omit pattern)
- `isGoalValid(g)`: `null/empty-name/whitespace-name/non-positive-target → false`; всё остальное → `true`
- `todayPlusOneISO()`: `(Date.now() + 86400000)` → ISO yyyy-MM-dd

**Final.tsx**

- Hero: Eyebrow opacity 0.65 «VOL.04 · ГОТОВО» + Mass size=88 «ВСЁ.» (Archivo Black) + Mass italic size=28 «деньги — под контролем.»
- Summary plate (4 row): ДОХОД (`{rubles} ₽ / мес`), СЧЕТА (`{count} · {totalRubles} ₽`), ПЛАН (`{sumRubles} ₽ распределено`), ЦЕЛЬ (`{name} · {rubles} ₽` или `без цели`)
- CTA «НАЧАТЬ →» (paper bg, coral text, Archivo Black 13px, kerning 0.18em); disabled while submitting
- Submit handler:
  ```
  200 → draft.clear(); onComplete(response)
  409 → draft.clear(); toast «вы уже завершили онбординг»; setTimeout(onComplete(null), 1500)
  422 → toast «Проверьте план: сумма не может превышать доход»; draft preserved; NO onComplete
  network/other → toast «Ошибка сети, попробуйте ещё раз»
  ```
- Toast (`duration=4000`) поверх экрана, dismiss автоматический

**OnboardingFlow.tsx**

- case 4: рендерит `<Step04Goal goal={state.goal} dispatch={dispatch}/>` внутри chrome; `nextLabel="ГОТОВО →"`, `nextDisabled = !isGoalValid(state.goal)`, `onSkip` диспатчит `SKIP_GOAL` затем `NEXT`
- case 5: рендерит `<Final state={state} onComplete={onComplete}/>` напрямую (без OnboardingChrome — Final владеет своим layout-ом)
- `OnboardingV10Response` теперь импортируется из `api/onboardingV10.ts` (канонический шейп) и реэкспортируется (backward compat для будущих плейсхолдеров)
- `onComplete: (response | null)` — 409 fallthrough поддержан без синтетического ответа

## Tests

22 теста для Step04Goal:
- isGoalValid (7 кейсов)
- todayPlusOneISO (2 кейса — формат + strictly future)
- Render (8 — headline / eyebrow / inputs / placeholder / suffix / min attr / preset goal hydration)
- Input change (5 — name / amount / digit-strip / clear / due add+remove key)

16 тестов для Final:
- Render (10 — eyebrow / Mass / italic subtitle / 4 row labels / values formatted с U+202F / без цели)
- Submit (6 — 200 OK + serialised body + step strip / 200 с goal=null без `goal` key / 409 clear+toast+delayed null / 422 toast+no clear+no onComplete / network generic / replay guard)

Полный onboarding suite — 120/120 проходит. Полный frontend suite — 158/158.

## Threat coverage

| Threat ID | Mitigation |
|-----------|------------|
| T-24-08-01 (tampering — goal name free-text) | `maxLength={80}` на input + reducer хранит как-есть (React escapes на render) |
| T-24-08-02 (tampering — past due date) | `min={todayPlusOneISO()}` на input; сервер validates strict > today (Europe/Moscow) |
| T-24-08-03 (replay — repeated submit) | `submitting` state disables CTA + early-return в `onStart` |
| T-24-08-04 (info disclosure) | error copy зашит в источник; `err.message` / `err.body` НЕ эхоятся |
| T-24-08-05 (logic flaw — 409 with stale draft) | `draft.clear()` вызывается ДО `setTimeout(onComplete(null), 1500)` |

## Deviations from Plan

**1. [Rule 1 - Bug] OnboardingV10Response defined twice (placeholder vs canonical)**
- **Found during:** Task 2 (Final.tsx import resolution)
- **Issue:** `OnboardingFlow.tsx` declared a local `OnboardingV10Response` placeholder с другими полями (`account_count`, `category_count`) ещё с phase 24-02 — пометилось как «plan 24-08 wires the actual call». При попытке передать `Final` использующий канонический тип из `api/onboardingV10.ts` — TS rejected.
- **Fix:** Удалил placeholder, импортнул канонический тип из `api/onboardingV10.ts`, реэкспортнул из `OnboardingFlow.tsx` чтобы будущие callers не сломались.
- **Files modified:** `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx`
- **Commit:** 64f2041

**2. [Rule 1 - Bug] Test author used non-existent `vi.runAllTicksAsync`**
- **Found during:** Task 2 (Final.test.tsx first run)
- **Issue:** План предлагал `vi.runAllTicksAsync()` для flush микротасков в 409-тесте. В vitest 4 этой функции нет.
- **Fix:** Заменил на `await waitFor(...)` + `{ timeout: 3000 }` — promise rejects, catch ветка пишет toast, второй waitFor дожидается setTimeout(onComplete) через реальные таймеры. Никаких fake-timers — устранено caskcade-падение последующих тестов из-за залипшего fakeTimers state.
- **Files modified:** `frontend/src/screensV10/Onboarding/__tests__/Final.test.tsx`
- **Commit:** 64f2041 (один общий с GREEN, тесты тоже считаются)

**3. [Rule 2 - Missing critical functionality] OnboardingFlow.onComplete не принимал null**
- **Found during:** Task 2
- **Issue:** Изначальный пропс `onComplete: (response: OnboardingV10Response) => void` не давал способа сообщить хосту о 409-conflict без выдумывания synthetic response. План явно требовал «409 → onComplete (with synthetic response or null)».
- **Fix:** Расширил тип до `(response | null)`. Это контрактное расширение — не ломает callers (плейсхолдеры pass-through ещё нет).
- **Files modified:** `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx`
- **Commit:** 64f2041

## Verification

- `cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx` → 22/22 ✓
- `cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Final.test.tsx` → 16/16 ✓
- `cd frontend && npm test` → 158/158 ✓ (no regressions)
- `cd frontend && npx tsc --noEmit` → clean

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| d21f409 | test | Step04Goal RED |
| 5f14a22 | feat | Step04Goal GREEN + flow case 4 |
| dd39519 | test | Final RED |
| 64f2041 | feat | Final GREEN + flow case 5 + type unification |

## Self-Check: PASSED

- [x] `frontend/src/screensV10/Onboarding/Step04Goal.tsx` exists (172 lines)
- [x] `frontend/src/screensV10/Onboarding/Step04Goal.module.css` exists
- [x] `frontend/src/screensV10/Onboarding/Final.tsx` exists (172 lines)
- [x] `frontend/src/screensV10/Onboarding/Final.module.css` exists
- [x] `frontend/src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx` exists (235 lines, 22 tests pass)
- [x] `frontend/src/screensV10/Onboarding/__tests__/Final.test.tsx` exists (281 lines, 16 tests pass)
- [x] commit d21f409 (test RED Step04) present in `git log`
- [x] commit 5f14a22 (feat GREEN Step04) present in `git log`
- [x] commit dd39519 (test RED Final) present in `git log`
- [x] commit 64f2041 (feat GREEN Final) present in `git log`
- [x] OnboardingFlow case 4 wires Step04Goal + onSkip (SKIP_GOAL + NEXT) + nextLabel «ГОТОВО →»
- [x] OnboardingFlow case 5 renders Final without chrome
- [x] postOnboardingComplete called with serialiseDraft body (verified by test asserting body has no `step` key + correct `goal` shape)
- [x] draft.clear called on 200 AND 409 (verified by mockClear assertions)
- [x] 422 path: errorMsg shown, draft preserved, onComplete NOT invoked (verified by test)
