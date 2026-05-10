---
phase: 24-onboarding-4-step
plan: 03
subsystem: onboarding-ios
tags: [ios, onboarding, swiftui, step01, ruble-formatter]
requires: [24-01]
provides:
  - "OnboardingChrome — reusable poster scaffold (back/eyebrow/skip/dots/CTA/hint/content)"
  - "OnboardingV10View — root step-switching view (step==1 wired; 02..05 placeholders)"
  - "Step01IncomeView — income step body (digits-only TextField + 4 presets)"
  - "RubleFormatter — pure helper, format(cents:) → display with U+202F separator"
affects: []
tech-stack:
  added: []
  patterns:
    - "@Bindable @Observable model passed into step views"
    - "ViewBuilder slots in scaffold (header / content / footer)"
    - "Manual digit-grouping (locale-independent, U+202F)"
key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/Step01IncomeView.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
    - ios/BudgetPlannerTests/Step01IncomeTests.swift
  modified: []
decisions:
  - "Renamed file/type OnboardingView → OnboardingV10View to coexist with legacy v0.5 OnboardingView in same target (Swift filename-collision)."
  - "Manual digit-grouping in RubleFormatter (no NumberFormatter) — locale grouping injects ASCII space or NBSP unpredictably; explicit U+202F per DATA-MODEL §5.1."
  - "9-digit cap on raw input (max 999_999_999 ₽) before parsing — defends T-24-03-02 overflow."
  - "Custom CTA row in OnboardingChrome instead of PosterButton — onboarding CTA is paper-on-coral-inverted, doesn't fit primary/ghost/destructive variants."
metrics:
  duration: "255s"
  completed: "2026-05-10"
  tasks: 2
  files_created: 5
  files_modified: 0
---

# Phase 24 Plan 03: iOS Step 01 Income (Onboarding) Summary

**One-liner:** SwiftUI step 01 income screen + reusable OnboardingChrome scaffold + RubleFormatter U+202F helper, symmetric to web Plan 24-02.

## What was built

### OnboardingChrome (reusable poster scaffold)

`ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift` (182 lines).

Generic `View` parameterised by ViewBuilder content slot. Layout = `VStack { header · content · footer }` on coral background:

- **Header:** `[← back] [eyebrow label] [«ПРОПУСТИТЬ» if onSkip]` with symmetric width reservations so the eyebrow stays centred. Back-arrow opacity 0.85 when callback supplied, 0.25 (visually disabled) otherwise.
- **Content:** ViewBuilder slot, top-leading aligned, `frame(maxHeight: .infinity)`.
- **Footer:** `VStack(spacing: 14) { hint? · 4 progress-dots · paper-on-coral CTA }`. Dots/CTA hidden for `step == 5` (Final owns its own «НАЧАТЬ →»).

Swift signature for downstream plans (24-05/07/09 reuse this):

```swift
OnboardingChrome<Content: View>(
    step: Int,
    total: Int = 4,
    label: String,
    onBack: (() -> Void)? = nil,
    onSkip: (() -> Void)? = nil,
    onNext: (() -> Void)? = nil,
    nextLabel: String = "ДАЛЕЕ →",
    nextDisabled: Bool = false,
    hint: String? = nil,
    @ViewBuilder content: () -> Content
)
```

### OnboardingV10View (root)

`ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift` (107 lines).

`@Bindable var flow: OnboardingFlow` + `var onComplete: (OnboardingAPIResponse) -> Void`. `switch flow.step`:
- `case 1`: chrome label `«ШАГ 01 / 04 · ДОХОД»`, `onBack=nil` (back disabled), `nextDisabled = flow.incomeCents <= 0`, body = `Step01IncomeView`.
- `case 2..5`: placeholder chrome with localised eyebrow strings (`СЧЕТА / ПЛАН / ЦЕЛЬ / ГОТОВО`) — replaced by future plans.

**`onComplete`** is plumbed through but not yet invoked — final-step submit lands in plans 24-09/24-10. Wiring into AppRouter is plan 24-11.

### Step01IncomeView

`ios/BudgetPlanner/FeaturesV10/Onboarding/Step01IncomeView.swift` (144 lines).

Layout (VStack alignment-leading, spacing 18):
1. `Mass("Какой доход\nв месяц?", italic: true, size: 36)` — DM/PT Serif Italic.
2. `Eyebrow("ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ", opacity: 0.55)`.
3. **Input row:** `TextField("0", text: $rawText)` (Archivo Black 48pt, paper) + `₽` suffix (Archivo Black 32pt, opacity 0.85), 1pt paper underline. `keyboardType(.numberPad)`.
4. **Presets row:** 4 chips `[50_000, 80_000, 120_000, 200_000]` ₽. Active chip = paper bg + coral text; inactive = transparent + paper text + paper-40% border. Tap calls `flow.setIncome(_:)` and re-formats display.

**Sanitisation pipeline** (`apply(_:)`): filter to `\.isNumber`, slice to 9 chars max, parse `Int`, push to flow, reformat display. T-24-03-01 + T-24-03-02 mitigated.

### RubleFormatter

`ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift` (46 lines).

```swift
enum RubleFormatter {
    static let groupSeparator = "\u{202F}"
    static func format(cents: Int) -> String { … }
}
```

Manual reverse-iteration grouping. Truncates sub-ruble cents (99 → "0"). No NumberFormatter — locale grouping is unpredictable (some emit U+0020, some U+00A0).

### Tests

`ios/BudgetPlannerTests/Step01IncomeTests.swift` (151 lines, **17 tests, 17 green**):

| Group | Cases |
|-------|-------|
| RubleFormatter | zero, sub-ruble truncation, 1₽, 99₽, 10K, 120K, 1M, U+202F-not-ASCII-space |
| apply pipeline | empty→0, digits update flow, strip non-digits (T-24-03-01), 12→9 digit slice (T-24-03-02) |
| Presets | preset tap, all 4 round-trip |
| NEXT gate | disabled at 0, enabled at >0 |

Persistence isolated via `UserDefaults(suiteName: "test.onboarding.v10.step01")`.

## Verification

- `make build` ✅ (clean, simulator iPhone 17 Pro).
- `xcodebuild test -only-testing:BudgetPlannerTests/Step01IncomeTests` → **17/17 pass** in 0.019s.
- `#Preview` blocks render correctly in Xcode (manual eyeball — both OnboardingChrome and Step01IncomeView previews compile).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Renamed `OnboardingView.swift` → `OnboardingV10View.swift`**

- **Found during:** Task 1 build verify.
- **Issue:** `error: filename "OnboardingView.swift" used twice` — legacy v0.5 file at `ios/BudgetPlanner/Features/Onboarding/OnboardingView.swift` collides with new file in the same target. Swift uses filenames to disambiguate private declarations.
- **Fix:** Renamed both file and type to `OnboardingV10View`. Legacy v0.5 type stays untouched (still referenced by `AppRouter.onboardingRequired`). Plan 24-11 wires the new view by its renamed name.
- **Files modified:** all new files committed under the V10 name.
- **Commit:** `dafa460`.

### Clarifications (not deviations)

- Step01IncomeView ships in Task 1's commit (not Task 2) because OnboardingV10View references it — the build of Task 1 requires the symbol. Task 2's commit contains the test file only. No behavioural drift from the plan.

## Authentication Gates

None — fully autonomous.

## Threat Mitigations Applied

| Threat | Mitigation | Where |
|--------|------------|-------|
| T-24-03-01 (paste of non-digits) | `raw.filter(\.isNumber)` in `apply(_:)` | Step01IncomeView.swift |
| T-24-03-02 (huge paste → Int overflow) | `String(digits.prefix(9))` slice before `Int(_:)` | Step01IncomeView.swift |
| T-24-03-03 (UserDefaults draft) | Inherited from Plan 24-01 — `flow.persist()` unchanged | OnboardingFlow.swift |

Test coverage:
- T-24-03-01 → `testApplyStripsNonDigits` (paste includes U+202F, ₽, letters)
- T-24-03-02 → `testApplySlicesBeyondNineDigits` (12 digits → 9 digits accepted)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `dafa460` | feat(24-03): add OnboardingChrome + OnboardingV10View root + RubleFormatter (iOS) |
| 2 | `696d65a` | test(24-03): add Step01IncomeTests covering RubleFormatter + apply pipeline + presets |

## Self-Check: PASSED

- File `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift`: FOUND
- File `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift`: FOUND
- File `ios/BudgetPlanner/FeaturesV10/Onboarding/Step01IncomeView.swift`: FOUND
- File `ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift`: FOUND
- File `ios/BudgetPlannerTests/Step01IncomeTests.swift`: FOUND
- Commit `dafa460`: FOUND
- Commit `696d65a`: FOUND
- `make build`: ✅
- `xcodebuild test -only-testing:Step01IncomeTests`: ✅ 17/17 green
