---
phase: 24-onboarding-4-step
plan: 07
type: execute
wave: 4
depends_on: [05]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Onboarding/Step03PlanView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift
  - ios/BudgetPlannerTests/Step03PlanTests.swift
autonomous: true
requirements: [ONB-V10-01, ONB-V10-04]
must_haves:
  truths:
    - "Step 03 renders Mass italic «Распредели\\n{income} ₽»"
    - "8 PosterSlider components rendered (one per default category) with step=50_000 cents"
    - "Initial slider value per category = floor(incomeCents * share / 50_000) * 50_000"
    - "Hint shows «всё распределено» / «остаётся X ₽ → накопления» / «превышение X ₽»"
    - "NEXT disabled when sumPlan > incomeCents"
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/Step03PlanView.swift"
      provides: "Plan distribution step view"
      min_lines: 110
  key_links:
    - from: "Step03PlanView.swift"
      to: "PosterSlider"
      via: "ForEach DefaultCategories.all rendering PosterSlider per code"
      pattern: "DefaultCategories\\.all.*PosterSlider"
    - from: "Step03PlanView.swift"
      to: "OnboardingFlow.setPlan(code:cents:)"
      via: "@Bindable + slider onCommit"
      pattern: "flow\\.setPlan\\(code"
---

<objective>
iOS symmetric to Plan 24-06. Render 8 `PosterSlider`s (one per default category) with step=50_000 cents (= 500₽). Bottom hint reflects Σplan vs incomeCents.

Output: Step03PlanView + OnboardingView wiring + OnboardingChrome `hintTone` enhancement + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-05-ios-step02-accounts-PLAN.md

@ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift

<interfaces>
# PosterSlider iOS init (Phase 23):
PosterSlider(value: Binding<Int>, in: ClosedRange<Int>, step: Int = 500, label: String? = nil, onCommit: ((Int) -> Void)? = nil)

# Note: web uses cents end-to-end (step=50_000); iOS PosterSlider's step param is generic Int — pass 50_000 for cents granularity.
# Range = 0...max where max = max(6_000_000, Int(Double(incomeCents) * 0.6))
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Step03PlanView + OnboardingChrome hintTone enhancement + flow integration + tests</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/Step03PlanView.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift,
    ios/BudgetPlannerTests/Step03PlanTests.swift
  </files>
  <behavior>
    OnboardingChrome enhancement:
      - Add var hintTone: HintTone = .normal where enum HintTone { case normal, overflow }
      - In hint Text rendering: foregroundColor = hintTone == .overflow ? PosterTokens.Color.red : PosterTokens.Color.paper.opacity(0.65)
      - If PosterTokens has no `.red`, use Color(hex: "#E04545") inline + add a TODO comment to add to tokens (do not block on it)
    Step03PlanView:
      - @Bindable var flow: OnboardingFlow
      - Computed:
          var sumPlan: Int { flow.categoryPlans.values.reduce(0, +) }
          var sliderMax: Int { max(6_000_000, Int(Double(flow.incomeCents) * 0.6)) }
          func current(_ code: String) -> Int { flow.categoryPlans[code] ?? defaultFor(code) }
          func defaultFor(_ code: String) -> Int { /* floor(income * share / 50_000) * 50_000 */ }
      - VStack(alignment:.leading, spacing:14) inside ScrollView (the 8 sliders + headers may exceed screen):
        - Mass(text: "Распредели\n\(RubleFormatter.format(cents: flow.incomeCents)) ₽", italic: true, size: 32)
        - Eyebrow("СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ", opacity: 0.55)
        - ForEach(DefaultCategories.all, id: \.code) { c in
            VStack(alignment:.leading, spacing:6) {
              HStack {
                Text(c.ord).font(.jetBrainsMono(11)).opacity(0.5)
                Text(c.name).font(.archivoBlack(13)).kerning(0.04*13)
                Spacer()
                Text("\(RubleFormatter.format(cents: current(c.code))) ₽").font(.jetBrainsMono(13))
              }
              PosterSlider(
                value: Binding(
                  get: { current(c.code) },
                  set: { flow.setPlan(code: c.code, cents: $0) }
                ),
                in: 0...sliderMax,
                step: 50_000,
                label: nil
              )
            }
            .padding(.vertical, 6)
            Divider().background(Color.paper.opacity(0.22))
          }
    OnboardingView update (case 3):
      - let total = flow.categoryPlans.values.reduce(0, +)
      - let left = flow.incomeCents - total
      - let hint = left == 0 ? "всё распределено" : left > 0 ? "остаётся \(RubleFormatter.format(cents: left)) ₽ → накопления" : "превышение \(RubleFormatter.format(cents: -left)) ₽"
      - let tone: HintTone = left < 0 ? .overflow : .normal
      - OnboardingChrome(step:3, label:"ШАГ 03 / 04 · ПЛАН", onBack:{flow.back()}, onNext:{flow.next()}, nextDisabled: left < 0, hint: hint, hintTone: tone) { Step03PlanView(flow: flow) }
    Tests (XCTest):
      - testInitialAllocation: flow.setIncome(80_000_00); flow.categoryPlans["food"] == 16_000_00 (floor(80k*0.20 / 500) * 500 = 16k₽)
      - testSetPlan: flow.setPlan(code: "food", cents: 5_000_00); flow.categoryPlans["food"] == 5_000_00
      - testSumPlan: with default allocation for income=80k, sum = (20+10+30+6+5+4+5+3)*0.01*80_000_00 = 0.83*80_000_00 = 66_400_00 (verify exact)
      - testHintNormal: left>0 → "остаётся ..." (case insensitive substring check)
      - testHintOverflow: manually set categoryPlans to sum > income; verify left < 0
      - testRubleFormatterCents: format(cents: 16_000_00) → "16\u{202F}000"
  </behavior>
  <action>
    1. Update OnboardingChrome.swift to support `hintTone` parameter. Define HintTone enum at file scope (or as nested enum). Apply foreground color conditionally.
    2. Read PosterTokens.swift to find existing red token; if absent, document inline color usage with TODO.
    3. Implement Step03PlanView. PosterSlider takes Binding<Int>; use a custom Binding(get/set) closure to bridge flow.categoryPlans[code] (which is `[String: Int]` indexed access — returns Int? — use ?? defaultFor).
    4. Wrap in ScrollView so all 8 sliders are reachable on smaller screens.
    5. Update OnboardingView.swift case 3 with the computed hint/tone/disabled.
    6. Tests in ios/BudgetPlannerTests/Step03PlanTests.swift. Pure logic against the @Observable flow — no SwiftUI ViewInspector.
  </action>
  <verify>
    <automated>cd ios && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/Step03PlanTests 2>&1 | tail -30</automated>
  </verify>
  <done>
    All Step03PlanTests pass. `make build` succeeds. #Preview renders 8 sliders + counter for sample income.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| slider value range | PosterSlider clamps to `in: range` already |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-07-01 | Tampering | UserDefaults draft with sum > income | mitigate | NEXT disabled at UI; server returns 422 if smuggled past UI (handled in plan 24-09 error toast) |
| T-24-07-02 | Logic flaw | unknown code passed to setPlan | mitigate | flow.setPlan whitelists via DefaultCategories.codes (Plan 24-01) |
</threat_model>

<verification>
- `make build` clean
- XCTest Step03PlanTests pass
- Visual #Preview check
</verification>

<success_criteria>
- T4 + T11 (Step 03 + iOS parity) verifiable via tests
- ONB-V10-04 implemented on iOS
- OnboardingChrome.hintTone enhancement available for any future steps that need it
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-07-ios-step03-plan-SUMMARY.md`.
</output>
