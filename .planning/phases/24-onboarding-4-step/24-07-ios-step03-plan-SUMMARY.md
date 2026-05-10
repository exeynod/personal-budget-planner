---
phase: 24-onboarding-4-step
plan: 07
subsystem: ios/onboarding-v10
tags: [ios, swiftui, onboarding, plan-step, sliders, tdd]
requires:
  - phase 24-01 (DefaultCategories + OnboardingFlow.setPlan whitelist)
  - phase 24-03 (OnboardingChrome scaffold + Step01IncomeView)
  - phase 24-05 (Step02AccountsView)
  - phase 24-06 (web Step03Plan parity reference)
  - Phase 23 PosterSlider (step-snap numeric slider)
provides:
  - Step03PlanView (8 slider rows + Mass headline + eyebrow)
  - HintTone enum (.normal / .overflow) at OnboardingChrome scope
  - OnboardingChrome.hintTone parameter (overflow → PosterTokens.Color.red)
  - OnboardingV10View case 3 wiring (Σplan vs income → hint + tone + nextDisabled)
affects:
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift (additive prop, default .normal — backward-compat)
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift (case 3 placeholder → real step03)
tech-stack:
  added: []
  patterns:
    - Bridging @Observable Dictionary keys to Slider Binding via Binding(get:set:) closure
    - Floor-to-step initial allocation reused defensively (mirrors reducer.SET_INCOME)
    - HintTone enum at file scope (reusable for future step error states)
key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/Step03PlanView.swift
    - ios/BudgetPlannerTests/Step03PlanTests.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift
decisions:
  - HintTone introduced as file-scope enum in OnboardingChrome.swift (not nested) — testable without instantiating the generic <Content: View> view
  - Slider max = max(6_000_000, income*0.6) — same formula as web (6_000_000 cents = 60_000 ₽ floor)
  - Defensive `current(_:)` falls back to floor formula when categoryPlans[code] is nil (post-Back-edit guard)
  - Wrapped sliders in ScrollView so all 8 rows reach on smaller iPhone widths (web has overflow-y on the body)
  - `PosterTokens.Color.red` (#C24A2A) reused from existing tokens — no new color needed
metrics:
  duration_seconds: 280
  completed: 2026-05-10
  tasks: 1
  files_changed: 4
---

# Phase 24 Plan 07: iOS Step03Plan Summary

iOS Step 03 (План) поставлен симметрично web Plan 24-06: 8 PosterSlider-ов, живой счётчик «остаётся / превышение» через `OnboardingChrome.hintTone`, NEXT блокируется при превышении бюджета.

## What was built

- **Step03PlanView** (110 lines + previews) — заголовок Mass italic 32pt «Распредели\n{income} ₽», eyebrow «СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ», ScrollView с 8 строками. Каждая строка: ord (`01`..`08`, JetBrains Mono 11pt @ 0.5 opacity) · name UPPERCASE (Archivo Black 13pt, kerning 0.04em) · текущее значение «X ₽» right-aligned (JetBrains Mono 13pt) · `PosterSlider(value:in:0...sliderMax, step:50_000)` · 1pt divider paper @ 0.22.
- **HintTone enum** в `OnboardingChrome.swift` (file scope, `.normal | .overflow`) — переиспользуем для будущих error-стейтов.
- **OnboardingChrome.hintTone** — новое опциональное property (default `.normal`, backward-compat). При `.overflow` рендерит `PosterTokens.Color.red` с opacity 1.0; иначе paper @ 0.65.
- **OnboardingV10View case 3** — вычисляет `total`, `left = income - total`, формирует hint (3 ветки) + tone (`.overflow` когда `left<0`) + `nextDisabled = left<0`, прокидывает в Chrome + `Step03PlanView(flow: flow)`.
- **Defensive `current(_:)`** в Step03PlanView — fallback к floor-формуле если `categoryPlans[code] == nil` (после Back-навигации к Step 01 + изменения дохода ниже какой-то категории).

## Tests (15 new, all green)

| Group | Cases |
|-------|-------|
| Initial allocation | testInitialAllocationFood (1.6M), testInitialAllocationAllEightCodes, testInitialAllocationFloorRounding (fun=400k, health=400k, subs=200k) |
| SET_PLAN | testSetPlanUpdatesValue, testSetPlanIgnoresUnknownCode, testSetPlanClampsNegative |
| Σplan | testSumPlanForEightyThousand (6_550_000 cents = 65_500 ₽) |
| Hint construction | testHintNormalLeft, testHintEqualWhenFullyAllocated, testHintOverflow |
| Slider max | testSliderMaxFloorAtSixtyKRubles, testSliderMaxAboveFloor |
| RubleFormatter cents | testRubleFormatterCentsSixteenK, testRubleFormatterCentsThreeHundredAtSubsLevel |
| HintTone enum | testHintToneEnumValues |

`xcodebuild -only-testing:BudgetPlannerTests/Step03PlanTests`: **15/15 passed** in 0.05s.

Full BudgetPlannerTests suite: **92/94 passed**. 2 pre-existing failures (`PeriodTests.testCycleDayClampedInFebruary`, `MoneyFormatterTests.testRoundRubles`) уже задокументированы в `deferred-items.md` и не связаны с onboarding.

`make build` — Build Succeeded, чисто.

## Deviations from Plan

1. **[Rule 1 — Test math] Σplan фиксированное значение пересчитано**
   - **Found during:** GREEN phase (тест провалился: actual 6_550_000 vs expected 6_600_000).
   - **Issue:** в RED-комментарии я ошибся в расчёте — у долей 0.06 (transit), 0.04 (gifts), 0.03 (subs) raw / 50_000 не делится нацело, floor «съедает» 30k+20k+40k = 90_000 cents.
   - **Fix:** обновил expected на 6_550_000 + переписал docstring с пер-категорийной таблицей. Импл. (DefaultCategories.defaultPlan) корректна — это была ошибка в тестовом ожидании, не в коде.
   - **Files modified:** `ios/BudgetPlannerTests/Step03PlanTests.swift`
   - **Commit:** a2dd849

2. **[Rule 3 — Blocking infra] xcodebuild test требует CODE_SIGNING_ALLOWED=NO**
   - **Found during:** первый запуск тестов после xcodegen generate.
   - **Issue:** "Cannot code sign because the target does not have an Info.plist file" для BudgetPlannerTests target.
   - **Fix:** запускал тесты с `CODE_SIGNING_ALLOWED=NO` (как `make build`). Это известное состояние project.yml — `make` работает через тот же флаг.
   - **Files modified:** none (workflow-level, не код).

3. **[Naming] Plan говорит `OnboardingView.swift`, по факту правил `OnboardingV10View.swift`**
   - **Reason:** в Plan 24-03 уже задокументирован deviation — два файла с одинаковым именем `OnboardingView.swift` ломают Swift compile (legacy v0.5 onboarding в `Features/Onboarding/`). Файл переименован тогда же.
   - **Action:** менял существующий `OnboardingV10View.swift`. Новых файлов с конфликтным именем не создавал.

## Authentication gates

None.

## Known Stubs

None — Step 03 полностью функциональный. `flow.categoryPlans` персистится через `OnboardingFlow.persist()` в UserDefaults, попадёт в submit body на 24-09 (iOS Step04 + Final + POST /onboarding/complete).

## Threat surface scan

В пределах threat-model плана:
- T-24-07-01 (Tampering: Σ > income) митигирован: `nextDisabled = left < 0` отключает CTA в `OnboardingChrome`. Server-side 422 на сабмите остаётся в зоне ответственности 24-09.
- T-24-07-02 (unknown category code) митигирован двойным гейтом — `ForEach(DefaultCategories.all)` итерирует только whitelist, и `flow.setPlan` сам отбрасывает unknown коды (Plan 24-01).

Нового surface нет (нет network calls, persist по-прежнему через существующий `OnboardingFlow.persist`).

## Self-Check: PASSED

Все заявленные файлы существуют, оба коммита (`9d6e7c7` test RED, `a2dd849` feat GREEN) на ветке `v1.0-maximal-poster`.

- FOUND: `ios/BudgetPlanner/FeaturesV10/Onboarding/Step03PlanView.swift`
- FOUND: `ios/BudgetPlannerTests/Step03PlanTests.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift` (modified — HintTone + hintTone prop)
- FOUND: `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift` (modified — case 3 → step03)
- FOUND: commit `9d6e7c7` (test RED)
- FOUND: commit `a2dd849` (feat GREEN)

## TDD Gate Compliance

- RED gate: `9d6e7c7` — `test(24-07): add failing tests for Step03Plan + HintTone` — компилировать-фейлил по `cannot find type 'HintTone' in scope` ✓
- GREEN gate: `a2dd849` — `feat(24-07): implement iOS Step03PlanView + HintTone in OnboardingChrome` — 15/15 Step03PlanTests pass ✓
- REFACTOR gate: пропущен — код чистый из коробки, никаких post-GREEN правок не требовалось.
