---
phase: 24-onboarding-4-step
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/Step01IncomeView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
  - ios/BudgetPlannerTests/Step01IncomeTests.swift
autonomous: true
requirements: [ONB-V10-01, ONB-V10-02]
must_haves:
  truths:
    - "Step 01 renders eyebrow «ШАГ 01 / 04 · ДОХОД» + 4-dot progress + back disabled"
    - "TextField accepts digits only, formats with thin space U+202F + ₽ suffix"
    - "NEXT button «ДАЛЕЕ →» disabled until incomeCents > 0"
    - "OnboardingView switches by flow.step and renders Step01IncomeView for step==1"
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift"
      provides: "Reusable chrome view with back/eyebrow/dots/CTA/skip slot"
      min_lines: 90
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/Step01IncomeView.swift"
      provides: "Income step view"
      min_lines: 80
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift"
      provides: "Root SwiftUI view switching by step"
      min_lines: 50
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift"
      provides: "format(cents: Int) -> String с U+202F"
      min_lines: 30
  key_links:
    - from: "OnboardingView.swift"
      to: "Step01IncomeView.swift"
      via: "switch on flow.step"
      pattern: "if flow\\.step == 1.*Step01IncomeView"
    - from: "Step01IncomeView.swift"
      to: "OnboardingFlow.setIncome(_:)"
      via: "@Bindable view + onSubmit"
      pattern: "flow\\.setIncome"
---

<objective>
iOS symmetric to Plan 24-02. Build:
1. **OnboardingChrome** — SwiftUI ViewBuilder с теми же slots что web: back arrow, eyebrow label, progress dots (4 segments), optional skip, NEXT CTA, optional hint, content body.
2. **OnboardingView** — root view; switches на `flow.step` and renders `Step01IncomeView` for step==1, placeholder Text для steps 2-5 (replaced in subsequent plans).
3. **Step01IncomeView** — SwiftUI Mass italic 36pt «Какой доход\nв месяц?», TextField с digits-only keyboard, ₽ suffix, presets 50/80/120/200K ₽.
4. **RubleFormatter** — single helper `format(cents: Int) -> String` using U+202F group separator (per D-11 / DATA-MODEL §5.1).

Purpose: Mirror Plan 24-02 web exactly — same eyebrow text, same Mass headline, same input behaviour, same NEXT-disabled rule. Down-stream iOS step plans (24-05, 24-07, 24-09) will reuse OnboardingChrome and RubleFormatter.

Output: 4 source files + 1 test file. Does NOT mount yet into V10MainShell — that wiring is plan 24-11.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-01-foundation-draft-flow-PLAN.md
@.planning/phases/24-onboarding-4-step/24-01-foundation-draft-flow-SUMMARY.md

@ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift
@ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift

<interfaces>
<!-- Web parity reference (Plan 24-02): -->
# OnboardingChromeProps (TS):
{ step:1..5, total:4, label:string, onBack?:()=>void, onSkip?:()=>void,
  onNext:()=>void, nextLabel?:string, nextDisabled?:boolean, hint?:string, children }

# Swift translation:
struct OnboardingChrome<Content: View>: View {
    let step: Int
    var total: Int = 4
    let label: String
    var onBack: (() -> Void)? = nil
    var onSkip: (() -> Void)? = nil
    var onNext: (() -> Void)? = nil
    var nextLabel: String = "ДАЛЕЕ →"
    var nextDisabled: Bool = false
    var hint: String? = nil
    @ViewBuilder let content: () -> Content
}

# Existing iOS components from Phase 23:
- Eyebrow(_ text: String, opacity: Double = 1.0)
- Mass(_ text: String, italic: Bool, size: CGFloat)
- PosterButton(_ title: String, variant: .primary/.ghost/.destructive, action: () -> Void)
- PosterTokens.Color.coral / .paper / .ink
- PosterTokens.Font.archivoBlack(_:) / .jetBrainsMono(_:) / .dmSerifItalic(_:)
- @Observable OnboardingFlow.setIncome(_:Int), .next(), .back()

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: OnboardingChrome + OnboardingView root + RubleFormatter</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
  </files>
  <behavior>
    OnboardingChrome:
      - VStack(spacing:0): header HStack | content | footer
      - Header: HStack[back arrow Text("←"), Spacer, Eyebrow(label, opacity:0.65), Spacer, skip Text("ПРОПУСТИТЬ")]
        - Back: opacity 0.85 if onBack != nil else 0.25; tappable only when callback provided
        - Skip: visible only when onSkip != nil; JetBrains Mono 11, letter-spacing 0.14em via .kerning
      - Content: viewbuilder slot, frame(maxHeight:.infinity)
      - Footer: VStack(spacing:14)
        - hint? Text — JetBrains Mono 11, opacity 0.65, .multilineTextAlignment(.center)
        - 4-dot progress: HStack with 4 Rectangle().frame(height:2) — colored .paper for i<step, .paper.opacity(0.25) otherwise; only when step ∈ 1..4
        - CTA: full-width Button with Text(nextLabel) — Archivo Black 13, kerning 0.18em*13, paper bg, coral text; .opacity(nextDisabled ? 0.45 : 1); .disabled(nextDisabled)
      - Background: PosterTokens.Color.coral.ignoresSafeArea(); padding .top 56 / .horizontal 22 / .bottom 28
      - When step == 5 (Final): hide dots, hide CTA (Final has its own CTA)
    OnboardingView:
      - @Bindable var flow: OnboardingFlow
      - var onComplete: (OnboardingAPIResponse) -> Void
      - body: switch flow.step { case 1: Step01IncomeView(flow: flow) inside chrome; case 2: placeholder Text("Step 02 — coming next plan"); case 3..5: similar placeholders }
      - Step 1 chrome: label "ШАГ 01 / 04 · ДОХОД", onBack=nil (back disabled), onNext={ flow.next() }, nextDisabled = flow.incomeCents <= 0
      - Persist trigger: flow handles persistence in setters; nothing extra here
    RubleFormatter:
      - `static func format(cents: Int) -> String` — divide by 100, integer rounding, then group thousands with U+202F (\u{202F})
      - Implementation: NumberFormatter() with .groupingSeparator = "\u{202F}", .groupingSize = 3, .usesGroupingSeparator = true; OR manual digit-grouping (since locale-based grouping may inject space differently across runtimes — manual is safer)
      - Example: format(cents: 12_000_000) → "120 000" (with U+202F between "120" and "000")
  </behavior>
  <action>
    1. Read `PosterTokens.swift` to confirm exact property names for paper/coral colors and Archivo/JetBrains/DMSerif fonts. Use these tokens — never hardcode hex.
    2. Create `RubleFormatter.swift`:
       ```swift
       import Foundation
       enum RubleFormatter {
           static func format(cents: Int) -> String {
               let rubles = abs(cents) / 100
               let s = String(rubles)
               // Insert U+202F every 3 digits from right
               var result = ""
               for (i, ch) in s.reversed().enumerated() {
                   if i > 0 && i % 3 == 0 { result.append("\u{202F}") }
                   result.append(ch)
               }
               return String(result.reversed())
           }
       }
       ```
       Add unit test stub right inside the file or in OnboardingFlowTests target.
    3. Create `OnboardingChrome.swift`. For the CTA button, prefer building a custom HStack-based row (paper bg + coral text + Archivo Black) rather than reusing PosterButton — the Phase 23 PosterButton variants are .primary/.ghost/.destructive which don't quite match the onboarding CTA's "paper-on-coral" inversion. Document this choice in code comments.
    4. Create `OnboardingView.swift`:
       ```swift
       import SwiftUI
       struct OnboardingView: View {
           @Bindable var flow: OnboardingFlow
           var onComplete: (OnboardingAPIResponse) -> Void
           var body: some View {
               switch flow.step {
               case 1:
                   OnboardingChrome(step:1, label:"ШАГ 01 / 04 · ДОХОД", onBack:nil, onNext: { flow.next() }, nextDisabled: flow.incomeCents <= 0) {
                       Step01IncomeView(flow: flow)
                   }
               case 2: placeholder("Step 02 — coming next plan", step:2, label:"ШАГ 02 / 04 · СЧЕТА")
               case 3: placeholder("Step 03 — coming next plan", step:3, label:"ШАГ 03 / 04 · ПЛАН")
               case 4: placeholder("Step 04 — coming next plan", step:4, label:"ШАГ 04 / 04 · ЦЕЛЬ")
               case 5: placeholder("Final — coming next plan", step:5, label:"VOL.04 · ГОТОВО")
               default: EmptyView()
               }
           }
           private func placeholder(...) → OnboardingChrome wrapping VStack with just text
       }
       ```
    5. Verify Xcode target membership: ensure new .swift files are added to BudgetPlanner target via XcodeGen / project.yml — re-run `make generate` (or whatever XcodeGen command the project uses) if necessary. Reference: `make run` command from Memory.
  </action>
  <verify>
    <automated>cd ios && make build 2>&1 | tail -30</automated>
  </verify>
  <done>
    `make build` succeeds. OnboardingView renders without runtime crash in #Preview block (add a #Preview at end of OnboardingView.swift for visual verification).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Step01IncomeView + presets + format-helper integration test</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/Step01IncomeView.swift,
    ios/BudgetPlannerTests/Step01IncomeTests.swift
  </files>
  <behavior>
    Step01IncomeView:
      - @Bindable var flow: OnboardingFlow
      - @State private var rawText: String — derived from flow.incomeCents on init via .onAppear
      - VStack(alignment:.leading, spacing:18):
        - Mass(text:"Какой доход\nв месяц?", italic:true, size:36)
        - Eyebrow("ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ", opacity:0.55)
        - HStack(alignment:.lastTextBaseline, spacing:6) {
            TextField("0", text: $rawText)
              .keyboardType(.numberPad)
              .font(.archivoBlack(48))
              .foregroundColor(.paper)
              .onChange(of: rawText) { _, new in
                  let digits = new.filter(\.isNumber)
                  let rubles = Int(digits) ?? 0
                  flow.setIncome(rubles * 100)
                  // re-format display:
                  rawText = digits.isEmpty ? "" : RubleFormatter.format(cents: rubles*100)
              }
            Text("₽").font(.archivoBlack(32))
          }
          .overlay(Rectangle().frame(height:1).foregroundColor(.paper.opacity(0.5)), alignment: .bottom)
        - Presets HStack: ForEach([50_000, 80_000, 120_000, 200_000], id:\.self) { p in
            Text(RubleFormatter.format(cents: p*100))
              .font(.jetBrainsMono(11)).kerning(0.06*11)
              .padding(.horizontal,10).padding(.vertical,6)
              .background(flow.incomeCents == p*100 ? Color.paper : .clear)
              .foregroundColor(flow.incomeCents == p*100 ? .coral : .paper)
              .overlay(Rectangle().stroke(Color.paper.opacity(0.4), lineWidth:1))
              .onTapGesture { flow.setIncome(p*100); rawText = RubleFormatter.format(cents: p*100) }
          }
    Tests (XCTest):
      - testInitialEmpty: flow.incomeCents=0, rawText="" expected
      - testTypingUpdatesFlow: flow.setIncome via simulated TextField update; verify flow.incomeCents == expected
      - testPresetTapUpdatesFlow: tap 80_000 preset → flow.incomeCents == 8_000_000
      - testRubleFormatter: RubleFormatter.format(cents: 12_000_000) == "120\u{202F}000"
      - testRubleFormatterEdgeCases: cents=0 → "0"; cents=99 → "0" (since /100 = 0); cents=99_99 → "99"; cents=100 → "1"; cents=1_000_000 → "10\u{202F}000"
  </behavior>
  <action>
    1. Read prototype `prototype/poster-screens.jsx` lines 1329-1380 to confirm copy + sizes — translate verbatim.
    2. Implement Step01IncomeView. Note: SwiftUI TextField with .keyboardType(.numberPad) on simulator may still allow paste of non-digits — guard via `new.filter(\.isNumber)` in onChange.
    3. Cap visible value at 100_000_000 ₽ (raw digits ≤ 9 chars after grouping). When user pastes a giant number, slice to 9 digits before parsing.
    4. Tests:
       - Pure logic tests via direct `flow.setIncome(_:)` calls in XCTest target — DO NOT use ViewInspector / XCUI here (those land in plan 24-11).
       - For RubleFormatter: separate test cases as listed.
       - Run with: `xcrun xcodebuild -scheme BudgetPlanner test -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:BudgetPlannerTests/Step01IncomeTests`.
    5. Add a #Preview block at the end of Step01IncomeView.swift wrapping it in OnboardingChrome for visual review:
       ```swift
       #Preview {
           let flow = OnboardingFlow()
           OnboardingChrome(step:1, label:"ШАГ 01 / 04 · ДОХОД", onNext: { flow.next() }, nextDisabled: flow.incomeCents <= 0) {
               Step01IncomeView(flow: flow)
           }
       }
       ```
  </action>
  <verify>
    <automated>cd ios && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/Step01IncomeTests 2>&1 | tail -30</automated>
  </verify>
  <done>
    All Step01IncomeTests pass. `make build` clean. Visual preview in Xcode shows correct layout (manual eyeball check).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user keyboard → TextField | Even with .numberPad, paste can introduce non-digits — must filter |
| numeric overflow | Int.max would crash on multiplication |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-03-01 | Tampering | TextField input | mitigate | `.filter(\.isNumber)` on onChange + slice to 9 digits before parsing |
| T-24-03-02 | Denial of Service | Int overflow on huge paste | mitigate | Slice digits to 9 chars; max value 999_999_999 ₽ < Int.max even on 32-bit |
| T-24-03-03 | Information Disclosure | UserDefaults draft persistence | accept (covered in Plan 24-01 threat model) | OnboardingFlow.persist() runs unchanged |
</threat_model>

<verification>
- `make build` succeeds
- XCTest Step01IncomeTests pass
- #Preview renders correctly (manual)
</verification>

<success_criteria>
- T2 + T11 (Step 01 chrome + iOS parity) verifiable via tests + visual preview
- ONB-V10-02 implemented on iOS
- OnboardingChrome ready for steps 02/03/04 to consume
- RubleFormatter ready for use across all steps
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-03-ios-step01-income-SUMMARY.md` listing files + the OnboardingChrome Swift signature for downstream iOS plans.
</output>
