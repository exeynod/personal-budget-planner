---
phase: 24-onboarding-4-step
plan: 06
subsystem: frontend/onboarding-v10
tags: [web, onboarding, plan-step, sliders, react, tdd]
requires:
  - phase 24-01 (defaultCategories.ts + reducer SET_PLAN whitelist)
  - phase 24-02 (OnboardingChrome scaffold + Step01Income)
  - phase 24-04 (Step02Accounts + pluraliseHint pattern)
  - Phase 23 PosterSlider componentsV10 (step-snap range input)
provides:
  - Step03Plan view (8 slider rows + headline + eyebrow)
  - computePlanFooter pure helper (counter logic)
  - OnboardingChrome.hintTone='overflow' (red counter)
  - OnboardingFlow case 3 wiring
affects:
  - frontend/src/screensV10/Onboarding/OnboardingChrome.tsx (new prop, backward-compatible)
  - frontend/src/screensV10/Onboarding/OnboardingChrome.module.css (.hintOverflow)
  - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx (case 3)
tech-stack:
  added: []
  patterns:
    - Pure-function counter (computePlanFooter) — testable without RTL
    - Floor-to-step initial allocation (DATA-MODEL §1.3 formula reused on web)
key-files:
  created:
    - frontend/src/screensV10/Onboarding/Step03Plan.tsx
    - frontend/src/screensV10/Onboarding/Step03Plan.module.css
    - frontend/src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx
  modified:
    - frontend/src/screensV10/Onboarding/OnboardingChrome.tsx
    - frontend/src/screensV10/Onboarding/OnboardingChrome.module.css
    - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
decisions:
  - Counter rendered as OnboardingChrome.hint (single source of truth — no in-step footer)
  - Slider max = max(60_000₽, 60% of income) — preserves headroom for low-income drag-up
  - Defensive default value when categoryPlans[code] is undefined (post-back-edit guard)
  - shake animation deferred (plan 24-10 polish) — overflow now uses static red color
metrics:
  duration_seconds: 180
  completed: 2026-05-10
  tasks: 1
  files_changed: 6
---

# Phase 24 Plan 06: Web Step03Plan Summary

Step 03 (План) поставлен: 8 PosterSlider-ов на категорию, живой счётчик «остаётся X / превышение X», NEXT блокируется при превышении бюджета.

## What was built

- **Step03Plan view** — заголовок «Распредели {income} ₽» (Mass italic 32px) + eyebrow + 8 строк со слайдерами. Каждая строка: ord (`01`..`08`), name UPPERCASE, текущее значение в ₽. Слайдеры с `step=50_000` cents (= 500 ₽), `max = max(60_000₽, round(income * 0.6))`.
- **Initial allocation formula** — `floor(income_cents * share / 50_000) * 50_000`. Применяется как fallback в Step03Plan (defensive); основная инициализация делается в reducer.SET_INCOME (Plan 24-01).
- **computePlanFooter helper** — чистая функция: `(income, plans) → { hint, tone, nextDisabled }`. Три ветки: «всё распределено» / «остаётся X ₽ → накопления» / «превышение X ₽» (overflow).
- **OnboardingChrome.hintTone** — новое опциональное prop `'normal' | 'overflow'`. CSS-класс `.hintOverflow` ставит `color: var(--poster-red)` + `opacity: 1`.
- **OnboardingFlow case 3** — рендерит `Step03Plan`, прокидывает `hint`, `hintTone`, `nextDisabled` в Chrome.

## Tests (12 new, all green)

- `computePlanFooter` — 4 кейса (equal / left / overflow / empty plan)
- Step03Plan rendering — headline, eyebrow, 8 sliders, ord+name, floor formula, override через categoryPlans
- Slider interaction — `fireEvent.change` на `food` (idx 0) → `SET_PLAN { code:'food', cents:2_000_000 }`; на `subs` (idx 7) → `SET_PLAN { code:'subs', cents:300_000 }`

Полный фронт-suite: **120/120 ✓**, `tsc --noEmit` чисто.

## Deviations from Plan

Минимальные:

1. **[Rule 1 — Test ergonomics] regex вместо точной строки в `getByText`**
   - **Found during:** GREEN phase (тест провалился)
   - **Issue:** `getByText('16.000 ₽')` ожидал литеральный текст, но PosterSlider кладёт U+202F (NARROW NO-BREAK SPACE) между разрядами тысяч; точная строка не матчилась.
   - **Fix:** Заменил на regex `/^16.000 ₽$/` (точка как любой символ).
   - **Files modified:** `frontend/src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx`
   - **Commit:** 0c6a1f1

2. **[Rule 2 — Backward compat] `.hint` opacity не трогал**
   - **Found during:** Implementation
   - **Issue:** План предлагал opacity 0.85 для нормального hint, но это сломало бы Step02 (тестируется визуально, тесты не проверяют, но риск регресса). Overflow использует свой класс с `opacity: 1`.
   - **Fix:** Оставил `.hint { opacity: 0.65 }` (status quo); добавил `.hintOverflow { color: var(--poster-red); opacity: 1 }`.

3. **[Deferred — animation] shake-анимация на overflow не делал**
   - **Reason:** В `stylesV10/animations.css` нет keyframe `posterShake`; план явно разрешил дефернуть на 24-10 polish.
   - **Action:** Просто красный цвет, без motion. Заметка для плана 24-10.

## Authentication gates

None.

## Known Stubs

None — Step 03 полностью функциональный, при сохранении в reducer данные доходят до `state.category_plans`, который сериализуется в `serialiseDraft` для submit (плана 24-08 wires submit).

## Threat surface scan

Не вышли за пределы threat-model плана. T-24-06-01 (Tampering: Σ > income) митигирован: `nextDisabled = sum > income`. T-24-06-02 (unknown category code) митигирован двойным гейтом — рендер итерирует `DEFAULT_CATEGORIES` (whitelist), reducer `SET_PLAN` проверяет `VALID_CATEGORY_CODES` (Plan 24-01). Нового surface нет.

## Self-Check: PASSED

Все заявленные файлы существуют, оба коммита (`c1008e0` test, `0c6a1f1` feat) на ветке `v1.0-maximal-poster`.

- FOUND: `frontend/src/screensV10/Onboarding/Step03Plan.tsx`
- FOUND: `frontend/src/screensV10/Onboarding/Step03Plan.module.css`
- FOUND: `frontend/src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx`
- FOUND: commit `c1008e0` (test RED)
- FOUND: commit `0c6a1f1` (feat GREEN)

## TDD Gate Compliance

- RED gate: `c1008e0` — `test(24-06): add failing tests for Step03Plan + computePlanFooter` ✓
- GREEN gate: `0c6a1f1` — `feat(24-06): implement Step03Plan with 8 sliders + live counter` ✓
- REFACTOR gate: пропущен (no cleanup needed; код чистый из коробки).
