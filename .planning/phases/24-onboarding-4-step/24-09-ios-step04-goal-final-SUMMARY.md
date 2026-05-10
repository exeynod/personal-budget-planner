---
phase: 24-onboarding-4-step
plan: 09
subsystem: ios/onboarding-v10
tags: [ios, onboarding, goal, final, atomic-submit, swiftui, tdd]
requires:
  - phase 24-01 (OnboardingFlow @Observable + OnboardingDraft + OnboardingV10API + APIError)
  - phase 24-03/24-05/24-07 (Step01/Step02/Step03 wiring + OnboardingChrome with onSkip + nextLabel slots)
  - phase 23 (Mass + Eyebrow + Toast componentsV10 + PosterTokens)
  - plan 24-08 (web symmetric reference for status routing copy + summary plate layout)
provides:
  - Step04GoalView (DM Serif italic name + Archivo Black amount + optional Toggle + DatePicker)
  - OnboardingDateFormatters.goalDue (yyyy-MM-dd, en_US_POSIX, Europe/Moscow)
  - OnboardingDateFormatters.tomorrow(now:) (DatePicker lower bound)
  - FinalView (hero + summary plate + НАЧАТЬ → CTA + Toast overlay)
  - OnboardingSubmitter (@Observable @MainActor; injectable submit closure for tests)
  - 200/409/422/network status routing per plan must_haves
  - OnboardingV10View case 4 (Step04GoalView in chrome with skip handler)
  - OnboardingV10View case 5 (FinalView, no chrome — owns its own scaffold)
affects:
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift (case 4 + case 5; onComplete signature widened to Optional)
tech-stack:
  added: []
  patterns:
    - Submit logic extracted into OnboardingSubmitter (@Observable @MainActor) so XCTest can inject a fake submit closure (no protocol refactor of OnboardingV10API needed)
    - APIError pattern-matching via switch on existing cases (.conflict / .unprocessable / default) — no new error types
    - 409 calls flow.clearDraft() BEFORE delayed onComplete(nil) (T-24-09-04)
    - Replay guard via `submitting: Bool` + early-return inside `start(onComplete:)` (T-24-09-02)
    - JSONEncoder default behavior: nil Optional fields omitted from wire body (verified with testToAPIBodyOmitsNilGoal)
    - DatePicker bound to `tomorrow...` range (Europe/Moscow); server is authoritative per CLAUDE.md
    - Mass italic routes through PT Serif Italic per ADR-001 (DM Serif Display has no Cyrillic Italic)
    - Goal name TextField uses DM Serif Display directly (ASCII placeholder + cyrillic content fall back to system if font lacks glyph)
key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/Step04GoalView.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/FinalView.swift
    - ios/BudgetPlannerTests/Step04GoalTests.swift
    - ios/BudgetPlannerTests/FinalSubmitTests.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift
decisions:
  - FinalView renders WITHOUT OnboardingChrome — the hero + plate + CTA are bespoke, and chrome's footer/dots would conflict (mirror of web 24-08 decision)
  - OnboardingV10View.onComplete signature widened from `(OnboardingAPIResponse) -> Void` to `(OnboardingAPIResponse?) -> Void` so 409 can deliver nil without inventing a synthetic response (Rule 3 fix; web equivalent already does this)
  - 422 path keeps user on Final (onComplete NOT called), draft preserved — they retry after seeing toast
  - 409 path: flow.clearDraft() runs BEFORE the 1500 ms toast dwell + onComplete(nil) (T-24-09-04 mitigation; tests pass conflictDelay=0 to skip the pause)
  - Tests inject a fake submit closure via `OnboardingSubmitter(submit:)` instead of refactoring OnboardingV10API into a protocol — keeps the change surgical (only one caller of the live endpoint, no other API endpoints touched)
  - DM Serif Display registered in PosterTokens.Font.dmSerifItalic (italic-only TTF) used directly via `.custom(...)` for the goal name TextField; `Mass(italic:true)` continues to route to PT Serif (ADR-001 fallback for mixed-Cyrillic text)
  - Used `Calendar(identifier: .gregorian)` with `Europe/Moscow` timezone for DatePicker tomorrow-bound (CLAUDE.md mandate); device-local skew is benign because server validates strict-future
  - Pre-existing failures in `MoneyTests/testRoundRubles` and `PeriodTests/testCycleDayClampedInFebruary` already documented in `deferred-items.md` from 24-01/24-05; not in scope for 24-09
metrics:
  duration_seconds: 1200
  completed: 2026-05-10
  tasks: 2
  files_changed: 5
---

# Phase 24 Plan 09: iOS Step 04 Goal + Final + atomic submit Summary

iOS-симметрия Plan 24-08. Step 04 «Зачем копишь?» (опциональный, со SKIP) + Final «ВСЁ. деньги — под контролем.» с summary-плитой и атомарным сабмитом 200/409/422/network. Замыкает 4-шаговый iOS-онбординг — пользователь видит сводку и нажимает «НАЧАТЬ →», тело уезжает на `POST /api/v1/onboarding/complete` за один вызов.

## What was built

**Step04GoalView.swift** (`ios/BudgetPlanner/FeaturesV10/Onboarding/Step04GoalView.swift`, 263 lines)

- Mass italic 32pt двухстрочный заголовок «Зачем\nкопишь?» + Eyebrow opacity 0.55 «МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ»
- Name TextField: DM Serif Display 22pt, кэп 80 символов (T-24-09-01 — соответствие server schema), плейсхолдер «Цель (Грузия, подушка, ноутбук…)»
- Amount TextField: Archivo Black 36pt + ₽ suffix (24pt), digit-only filter с U+202F group separator на отображении (тот же helper-pattern, что Step01)
- Optional дата: `Toggle("УКАЗАТЬ ДАТУ")` + `DatePicker(in: tomorrow...)` (compact, dark colorScheme), Europe/Moscow timezone
- Каждый input change → `pushGoalToFlow()` диспатчит `flow.setGoal(...)` или `flow.skipGoal()` если оба поля пусты И пользователь не активировал toggle (T-24-09-04 — back-нав из Final не смог пронести устаревший goal)
- `OnboardingDateFormatters.goalDue`: yyyy-MM-dd, en_US_POSIX, Europe/Moscow (CLAUDE.md mandate)

**FinalView.swift** (`ios/BudgetPlanner/FeaturesV10/Onboarding/FinalView.swift`, 247 lines)

- Hero: Eyebrow opacity 0.65 «VOL.04 · ГОТОВО» + `Mass(text:"ВСЁ.", italic:false, size:88)` (Archivo Black) + `Mass(text:"деньги — под\u{00A0}контролем.", italic:true, size:28)` (PT Serif Italic с U+00A0 nbsp между «под» и «контролем»)
- Summary плита: 4 ряда (ДОХОД / СЧЕТА / ПЛАН / ЦЕЛЬ) разделённые 1pt Rectangle (paper @ 0.25 opacity)
  - ДОХОД: `{format(incomeCents)} ₽ / мес`
  - СЧЕТА: `{count} · {format(sumBalances)} ₽`
  - ПЛАН: `{format(sumPlans)} ₽ распределено`
  - ЦЕЛЬ: `{name} · {format(targetCents)} ₽` или `без цели` если goal nil/empty
- CTA «НАЧАТЬ →» (paper bg, coral text, Archivo Black 13pt, kerning 0.18em, padding 16pt vert, full-width, opacity 0.55 при busy)
- Toast overlay байндится к `submitter.errorMessage`, auto-dismiss 4s
- `.background(PosterTokens.Color.coral.ignoresSafeArea())` — fullbleed коралл

**OnboardingSubmitter** (внутри FinalView.swift, @Observable @MainActor)

Инкапсулирует submit lifecycle:
- `submit: (OnboardingAPIBody) async throws -> OnboardingAPIResponse` — инжектируемый closure (default `OnboardingV10API.postOnboardingComplete`)
- `conflictDelay: UInt64 = 1_500_000_000` — пауза перед `onComplete(nil)` на 409 (тесты передают 0)
- `submitting: Bool` — replay guard (T-24-09-02): второй вызов `start()` пока первый в полёте — early-return
- `errorMessage: String?` — фиксированные русские строки, никогда не echoes `error.localizedDescription` (T-24-09-03)

**Status routing** (mirror plan 24-08):

```
200 → flow.clearDraft(); onComplete(response)
409 → flow.clearDraft(); errorMessage = "вы уже завершили онбординг";
      Task.sleep(conflictDelay); onComplete(nil)
422 → errorMessage = "Проверьте план: сумма не может превышать доход";
      draft preserved; onComplete NOT called
default APIError / non-APIError → errorMessage = "Ошибка сети, попробуйте ещё раз"
```

**OnboardingV10View** (`ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift`)

- `onComplete` сигнатура расширена: `(OnboardingAPIResponse?) -> Void` (Rule 3 — type-mismatch fix; 409 теперь может отдать nil)
- Case 4: `OnboardingChrome(step:4, label:"ШАГ 04 / 04 · ЦЕЛЬ", onSkip: {flow.skipGoal(); flow.next()}, nextLabel:"ГОТОВО →", nextDisabled: !isValid)` оборачивает Step04GoalView
- Case 5: `FinalView(flow: flow, onComplete: onComplete)` напрямую — без chrome
- Удалён placeholder helper для steps 4..5 — все шаги теперь имеют реальные view

## Tests

**Step04GoalTests.swift** (12 tests, all pass):

- `testSkipPathLandsOnFinalWithNilGoal` — `flow.skipGoal()` + `flow.next()` → `step==5 && goal==nil`
- `testCreatePathLandsOnFinalWithGoal` — `flow.setGoal(...)` + `flow.next()` → `step==5 && goal != nil`
- `testGoalRoundTripWithDue` / `testGoalRoundTripNilDue` — Codable lossless round-trip
- `testGoalEncodesTargetCentsSnakeCase` — wire keys: `target_cents` (not `targetCents`)
- 4× `testValidGoalRule*` — name non-empty + target_cents > 0 (mirror nextDisabled gate)
- `testDueIsoFormatHasNoTimeComponent` — yyyy-MM-dd, no `T`, 10 chars
- `testSkipPathPersistsNilGoalAcrossInstances` — UserDefaults reload preserves nil goal at step 5

**FinalSubmitTests.swift** (9 tests, all pass):

- `testToAPIBodyOmitsNilGoal` — JSONEncoder skips Optional nil fields by default
- `testToAPIBodyIncludesGoalWhenSet` — goal сериализуется когда set
- `testToAPIBodyMatchesServerSchema` — top-level keys snake_case, no `step` leak, no camelCase
- `testSubmitSuccessClearsDraftAndCallsOnComplete` — 200 path
- `testSubmit409ClearsDraftAndDelaysOnCompleteNil` — 409: clearDraft BEFORE onComplete(nil)
- `testSubmit422KeepsDraftAndDoesNotCallOnComplete` — 422: draft preserved, errorMessage set
- `testSubmitNetworkErrorKeepsDraftAndShowsGenericError` — non-APIError → generic copy
- `testReplayGuardSubmitsOnce` — concurrent `async let a/b` coalesces to 1 submit (50 ms sleep inside fake keeps the window open)
- `testSubmittingFlagFlipsToTrueDuringSubmit` — flag transitions verified

## Verification

```
make build → Build Succeeded
xcodebuild test -only-testing:BudgetPlannerTests/Step04GoalTests → 12/12 ✔
xcodebuild test -only-testing:BudgetPlannerTests/FinalSubmitTests → 9/9 ✔
Full suite: 113/115 ✔ (2 pre-existing failures already in deferred-items.md)
```

## Deviations from Plan

### Rule 3 — Type-system fix during GREEN

**OnboardingV10View.onComplete signature widened to Optional**

- **Found during:** Task 2 GREEN compile
- **Issue:** plan dictates 200→onComplete(response), 409→onComplete(nil); placeholder type was `(OnboardingAPIResponse) -> Void` which can't carry nil
- **Fix:** widened both `OnboardingV10View.onComplete` and `FinalView.onComplete` to `(OnboardingAPIResponse?) -> Void`
- **Files modified:** OnboardingV10View.swift, FinalView.swift
- **Commit:** dc8ca20

### Plan-script vs implementation: protocol refactor avoided

The plan's Task 2 action #2 suggested refactoring `OnboardingV10API` from `enum` to a protocol with `LiveOnboardingAPI` + `FakeOnboardingAPI`. **Skipped.** Instead extracted submit logic into `OnboardingSubmitter` which accepts an injectable `submit` closure (default = the live endpoint). This is surgical: zero changes to `OnboardingV10API`, no impact on other API call sites, and tests get full coalescing/error-injection coverage. Documented this trade-off in OnboardingSubmitter doc-comment.

### Replay guard test required pause

Initial `testReplayGuardSubmitsOnce` used a synchronous fake submit, which meant the replay-guard window (between `submitting=true` and `defer{submitting=false}`) closed before the second concurrent `start()` could observe it. Fixed by adding a 50 ms `Task.sleep` inside the fake — now the second `start()` lands while the first is suspended at the network await, hits the early-return, and the counter stays at 1. This is the realistic scenario (real network has hundreds of ms latency).

## Key Decisions

1. **Final renders WITHOUT OnboardingChrome.** Hero + plate + CTA are bespoke; chrome's progress dots + footer would conflict with «НАЧАТЬ →».
2. **OnboardingSubmitter as @Observable @MainActor class** (not a struct) so `submitting` and `errorMessage` are observable from SwiftUI without the view owning a `@State` per field.
3. **Mass italic routes through PT Serif** (ADR-001) for «деньги — под контролем.» — DM Serif Display lacks Cyrillic Italic. Goal name TextField uses DM Serif directly because the placeholder is monoscript Russian and content typically Russian; if user types Latin, DM Serif renders correctly.
4. **DatePicker timezone = Europe/Moscow** per CLAUDE.md «расчёты Europe/Moscow». Device-local skew is benign because the server validates strict-future authoritatively.
5. **Conflict delay test parameter = 0.** Production uses 1.5 s toast dwell; tests pass `conflictDelay: 0` so the test runner doesn't pause for 1.5 s per 409 case.

## Threat Model Coverage

| Threat | Mitigation | Verified |
|--------|------------|----------|
| T-24-09-01 (Tampering: free-text name) | TextField `maxLength=80` + trim before persist | Step04GoalView.nameInput onChange clamp |
| T-24-09-02 (Replay: double-tap submit) | `submitting` flag + early-return in `start()` | testReplayGuardSubmitsOnce |
| T-24-09-03 (Info Disclosure: error.message leak) | Switch on APIError cases only; fixed russian copy | FinalSubmitTests pass with stub errors carrying detail strings |
| T-24-09-04 (Logic flaw: 409 + stale draft) | flow.clearDraft() called BEFORE onComplete(nil) | testSubmit409ClearsDraftAndDelaysOnCompleteNil |

## Self-Check: PASSED

- [x] `ios/BudgetPlanner/FeaturesV10/Onboarding/Step04GoalView.swift` exists (263 lines, ≥90 min)
- [x] `ios/BudgetPlanner/FeaturesV10/Onboarding/FinalView.swift` exists (247 lines, ≥110 min)
- [x] `ios/BudgetPlannerTests/Step04GoalTests.swift` exists
- [x] `ios/BudgetPlannerTests/FinalSubmitTests.swift` exists
- [x] Commits exist: e1ef31e (RED-Step04), 95cfea3 (GREEN-Step04), 239d573 (RED-Final), dc8ca20 (GREEN-Final)
- [x] FinalView links to OnboardingV10API.postOnboardingComplete (default arg of OnboardingSubmitter.submit)
- [x] FinalView calls flow.clearDraft() on 200 AND 409 paths
- [x] Step04 Tests pass: 12/12
- [x] FinalSubmit Tests pass: 9/9
- [x] make build clean
