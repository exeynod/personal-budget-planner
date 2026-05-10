---
phase: 24-onboarding-4-step
plan: 09
type: execute
wave: 5
depends_on: [07]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Onboarding/Step04GoalView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/FinalView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
  - ios/BudgetPlannerTests/Step04GoalTests.swift
  - ios/BudgetPlannerTests/FinalSubmitTests.swift
autonomous: true
requirements: [ONB-V10-01, ONB-V10-05, ONB-V10-06]
must_haves:
  truths:
    - "Step 04 renders Mass italic «Зачем копишь?» + ПРОПУСТИТЬ in chrome"
    - "Goal name + amount + optional due (DatePicker, min today+1)"
    - "ПРОПУСТИТЬ → flow.skipGoal() then flow.next() (advances to Final with goal=nil)"
    - "Final renders Eyebrow «VOL.04 · ГОТОВО» + Mass «ВСЁ.» + DM Serif italic «деньги — под контролем.»"
    - "Final summary rows with ДОХОД / СЧЕТА / ПЛАН / ЦЕЛЬ"
    - "CTA «НАЧАТЬ →» triggers OnboardingAPI.postComplete"
    - "200 → flow.clearDraft + onComplete(response)"
    - "409 → flow.clearDraft + Toast + onComplete(nil) after delay"
    - "422 → Toast error + draft preserved, no onComplete"
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/Step04GoalView.swift"
      provides: "Goal step view"
      min_lines: 90
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/FinalView.swift"
      provides: "Final screen + submit handler"
      min_lines: 110
  key_links:
    - from: "FinalView.swift"
      to: "OnboardingAPI.postComplete"
      via: "Task { ... try await ... }"
      pattern: "OnboardingAPI\\.postComplete"
    - from: "FinalView.swift"
      to: "flow.clearDraft()"
      via: "200 OR 409 success path"
      pattern: "flow\\.clearDraft\\(\\)"
---

<objective>
iOS symmetric to Plan 24-08. Build Step04GoalView + FinalView, add submit handler via OnboardingAPI from Plan 24-01.

Output: 2 source files + OnboardingView wiring + flow submit method augmentation + 2 test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-07-ios-step03-plan-PLAN.md

@ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
@ios/BudgetPlanner/FeaturesV10/Common/Plate.swift
@ios/BudgetPlanner/FeaturesV10/Common/Toast.swift
@ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift

<interfaces>
# Mass(text:italic:size:) — italic=true uses DM Serif italic (Latin) + PT Serif italic (Cyrillic) per ADR-001 routing
# OnboardingAPI.postComplete(_ body: OnboardingAPIBody) async throws -> OnboardingAPIResponse
# Errors: APIClient throws structured errors — read APIClient.swift to confirm error type (likely an enum APIError with .httpStatus(Int)). Match on status 409 / 422 / other.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Step04GoalView + flow integration + tests</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/Step04GoalView.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift,
    ios/BudgetPlannerTests/Step04GoalTests.swift
  </files>
  <behavior>
    Step04GoalView:
      - @Bindable var flow: OnboardingFlow
      - @State name: String, amountText: String, dueDate: Date? = nil, useDue: Bool = false
      - On init/onAppear: hydrate from flow.goal if present
      - Layout VStack(alignment:.leading, spacing:14):
        - Mass(text:"Зачем копишь?", italic:true, size:32)
        - Eyebrow("МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ", opacity:0.55)
        - TextField("Цель (Грузия, подушка, ноутбук…)", text: $name).font(.dmSerifItalic(22)).foregroundColor(.paper)
            .onChange(of: name) { _, _ in updateFlowGoal() }
            .submitLabel(.next)
        - HStack(alignment:.lastTextBaseline, spacing:6) {
            TextField("0", text:$amountText).keyboardType(.numberPad).font(.archivoBlack(36))
              .onChange(of: amountText) { _, new in let digits = new.filter(\.isNumber); /*reformat*/; updateFlowGoal() }
            Text("₽").font(.archivoBlack(24))
          }
        - Toggle("Указать дату", isOn: $useDue).font(.jetBrainsMono(11)).tint(.paper)
        - if useDue { DatePicker("До какой даты", selection: Binding($dueDate, default: Calendar.current.date(byAdding:.day, value:1, to: Date())!), in: tomorrow..., displayedComponents: .date).font(.jetBrainsMono(11)) }
      - updateFlowGoal():
          if name.trimmingCharacters(in:.whitespaces).isEmpty && amountText.isEmpty {
              flow.skipGoal()  // both empty → no goal
          } else {
              let cents = (Int(amountText.filter(\.isNumber)) ?? 0) * 100
              let dueIso: String? = useDue && dueDate != nil ? ISO8601DateFormatter.dateOnly.string(from: dueDate!) : nil
              flow.setGoal(OnboardingGoal(name: name.trimmingCharacters(in:.whitespaces), targetCents: cents, due: dueIso))
          }
    OnboardingView (case 4):
      - let isValid = (flow.goal?.name.isEmpty == false) && ((flow.goal?.targetCents ?? 0) > 0)
      - OnboardingChrome(step:4, label:"ШАГ 04 / 04 · ЦЕЛЬ", onBack:{flow.back()}, onSkip:{ flow.skipGoal(); flow.next() }, onNext:{flow.next()}, nextLabel:"ГОТОВО →", nextDisabled: !isValid) { Step04GoalView(flow: flow) }
    Tests (XCTest):
      - testSkipPath: flow.skipGoal(); flow.next() → flow.step == 5 && flow.goal == nil
      - testCreatePath: flow.setGoal(OnboardingGoal(name:"Подушка", targetCents:200_000_00, due:nil)); flow.next() → flow.step == 5 && flow.goal != nil
      - testGoalRoundTrip: encode goal → JSON → decode → equal
      - testValidGoalRule: name="" target>0 → invalid; name="X" target=0 → invalid; name="X" target=1 → valid
      - testDueIsoFormat: ISO8601DateFormatter.dateOnly produces "YYYY-MM-DD" (no time)
  </behavior>
  <action>
    1. Implement Step04GoalView. Use SwiftUI DatePicker with `in: tomorrow...` range — compute `tomorrow` as `Calendar.current.date(byAdding:.day, value:1, to:.now)!`. The server enforces `> today` Europe/Moscow; client uses local TZ; small TZ skew acceptable (server is authoritative).
    2. Add `static let dateOnly: ISO8601DateFormatter` to a small `DateFormatters.swift` extension OR inline using `DateFormatter()` with `dateFormat = "yyyy-MM-dd"` and `locale = en_US_POSIX` + `timeZone = Europe/Moscow` (CLAUDE.md: расчёты Europe/Moscow). Pick the latter — ISO8601DateFormatter is fussy with date-only.
    3. Wire updateFlowGoal() on every input change. When both name AND amount empty → flow.skipGoal() (so navigating back from Final into 04, then forward without entry, doesn't smuggle stale goal).
    4. Update OnboardingView case 4 with skip handler.
    5. Tests as listed.
  </action>
  <verify>
    <automated>cd ios && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/Step04GoalTests 2>&1 | tail -30</automated>
  </verify>
  <done>
    Step04GoalTests pass. Skip path lands on Final with flow.goal == nil. Create path lands on Final with valid OnboardingGoal.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: FinalView + submit handler + 200/409/422 + flow integration + tests</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/FinalView.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift,
    ios/BudgetPlannerTests/FinalSubmitTests.swift
  </files>
  <behavior>
    OnboardingFlow augmentation:
      - func toAPIBody() -> OnboardingAPIBody {
          OnboardingAPIBody(
            incomeCents: incomeCents,
            accounts: accounts.map { APIAccount(bank: $0.bank, mask: $0.mask, kind: $0.kind.rawValue, balanceCents: $0.balanceCents, primary: $0.primary) },
            categoryPlans: categoryPlans,
            goal: goal.map { APIGoal(name: $0.name, targetCents: $0.targetCents, due: $0.due) },   // nil-passthrough → omit key on encode
            savingsConfig: savingsConfig.map { APISavingsConfig(roundupEnabled: $0.roundupEnabled, base: $0.base) }
          )
        }
      - Make sure Encodable for OnboardingAPIBody handles nil → field omitted (use `if let` encoding strategy or rely on `Optional` default behavior with `JSONEncoder` which omits nil keys when wrapped).
    FinalView:
      - @Bindable var flow: OnboardingFlow
      - var onComplete: (OnboardingAPIResponse?) -> Void
      - @State submitting = false
      - @State errorMessage: String? = nil
      - Layout VStack(alignment:.leading, spacing:14):
        - Eyebrow("VOL.04 · ГОТОВО", opacity: 0.65)
        - Mass(text: "ВСЁ.", italic: false, size: 88)
        - Mass(text: "деньги — под\u{00A0}контролем.", italic: true, size: 28)  // U+00A0 nbsp between "под" and "контролем" (visual control per prototype)
        - Summary list (4 rows separated by Divider):
            row("ДОХОД", "\(RubleFormatter.format(cents: flow.incomeCents)) ₽ / мес")
            row("СЧЕТА", "\(flow.accounts.count) · \(RubleFormatter.format(cents: flow.accounts.reduce(0){$0+$1.balanceCents})) ₽")
            row("ПЛАН",  "\(RubleFormatter.format(cents: flow.categoryPlans.values.reduce(0,+))) ₽ распределено")
            row("ЦЕЛЬ",  flow.goal.map { "\($0.name) · \(RubleFormatter.format(cents: $0.targetCents)) ₽" } ?? "без цели")
        - Spacer()
        - CTA Button "НАЧАТЬ →" (paper bg, coral text, Archivo Black 13, full-width) — disabled while submitting
        - Toast component (Phase 23) bound to errorMessage
      - .background(PosterTokens.Color.coral)
      - .ignoresSafeArea()
      - Submit handler (async tap):
        ```swift
        func onStart() {
            submitting = true
            errorMessage = nil
            Task {
                defer { submitting = false }
                do {
                    let body = flow.toAPIBody()
                    let response = try await OnboardingAPI.postComplete(body)
                    flow.clearDraft()
                    onComplete(response)
                } catch let error as APIError where error.statusCode == 409 {
                    flow.clearDraft()
                    errorMessage = "вы уже завершили онбординг"
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    onComplete(nil)
                } catch let error as APIError where error.statusCode == 422 {
                    errorMessage = "Проверьте план: сумма не может превышать доход"
                } catch {
                    errorMessage = "Ошибка сети, попробуйте ещё раз"
                }
            }
        }
        ```
        — Confirm `APIError.statusCode` shape by reading APIClient.swift; adjust pattern matching accordingly.
    OnboardingView (case 5):
      - FinalView(flow: flow, onComplete: onComplete) — directly, no chrome wrapper
    Tests (XCTest):
      - testToAPIBodyOmitsNilGoal: flow.skipGoal(); JSON encode flow.toAPIBody(); decode to [String:Any]; assert key "goal" absent (JSONEncoder default omits nil Optional)
      - testToAPIBodyIncludesGoalWhenSet: flow.setGoal(...); encode; "goal" key present
      - testToAPIBodyMatchesServerSchema: encode body → assert keys: income_cents, accounts, category_plans, savings_config (or absent if nil); accounts[0] keys: bank, mask, kind, balance_cents, primary
      - testFinalSubmitSuccessClearsDraft: stub OnboardingAPI via protocol injection (refactor OnboardingAPI to a protocol + injectable shared instance for tests, OR create `OnboardingAPIFake` test double); inject fake returning response → call submit handler logic → assert flow.toDraft().incomeCents stays in flow but UserDefaults cleared (flow.clearDraft removes the key)
      - testFinalSubmit409ClearsDraft: fake throws .httpStatus(409); after submit, UserDefaults.standard.object(forKey:"onboarding.v10.draft") == nil
      - testFinalSubmit422KeepsDraft: fake throws .httpStatus(422); UserDefaults still has the draft after error
  </behavior>
  <action>
    1. Read APIClient.swift to confirm error type. If errors aren't yet a structured type, this plan should add a small APIError enum (case httpStatus(Int)) — but verify first; do NOT refactor across the project.
    2. To make submit tests deterministic without hitting the network, refactor OnboardingAPI from `enum OnboardingAPI` (static func) to a protocol-based design:
       ```swift
       protocol OnboardingAPIClient { func postComplete(_ body: OnboardingAPIBody) async throws -> OnboardingAPIResponse }
       struct LiveOnboardingAPI: OnboardingAPIClient { ... }
       ```
       Then FinalView accepts `var apiClient: any OnboardingAPIClient = LiveOnboardingAPI()` and tests inject a fake. Keep this surgical — don't refactor other API endpoints.
    3. Implement FinalView per behavior. Layout matches prototype lines 1514-1542 closely.
    4. Wire OnboardingView case 5 → FinalView(flow: flow, onComplete: onComplete).
    5. Add OnboardingFlow.toAPIBody() method. JSONEncoder default omits nil Optional fields when CodingKeys are explicit; verify via testToAPIBodyOmitsNilGoal.
    6. Tests in BudgetPlannerTests target. Use a fake/mock for the API client. For testFinalSubmit*ClearsDraft: instantiate flow with a test UserDefaults suite, populate, run submit logic, assert key removal.
  </action>
  <verify>
    <automated>cd ios && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/FinalSubmitTests 2>&1 | tail -30</automated>
  </verify>
  <done>
    All FinalSubmitTests pass. JSON encoded body matches OnboardingV10Body schema (verified via dictionary inspection). 409/422/network paths each behave correctly.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server submit | Server is authoritative — strict + extra="forbid"; we just don't lie |
| 409 race | User opens 2 sessions, completes one, retries other |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-09-01 | Tampering | goal name free-text in TextField | mitigate | trim() + length cap (Swift String slicing if > 80) before persist |
| T-24-09-02 | Replay | repeated tap on submit | mitigate | submitting flag disables CTA |
| T-24-09-03 | Information Disclosure | error.localizedDescription leaks server info | mitigate | Switch on APIError status only; never display error.localizedDescription as user-facing text |
| T-24-09-04 | Logic flaw | 409 with stale draft | mitigate | flow.clearDraft() called BEFORE onComplete in 409 branch |
</threat_model>

<verification>
- `make build` clean
- All XCTest suites pass
- Manual visual check via #Preview in Xcode (FinalView with sample flow)
</verification>

<success_criteria>
- T5 + T6 + T7 + T8 + T9 + T11 covered on iOS
- ONB-V10-05, ONB-V10-06 implemented
- OnboardingFlow.toAPIBody() produces JSON byte-equal (modulo whitespace) to web `serialiseDraft` output for the same logical state — manual verification documented in SUMMARY
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-09-ios-step04-goal-final-SUMMARY.md`.
</output>
