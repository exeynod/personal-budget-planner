---
phase: 24-onboarding-4-step
plan: 05
type: execute
wave: 3
depends_on: [03]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/AccountBalanceSheet.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift
  - ios/BudgetPlannerTests/Step02AccountsTests.swift
autonomous: true
requirements: [ONB-V10-01, ONB-V10-03]
must_haves:
  truths:
    - "Step 02 renders Mass italic «Где лежат\\nденьги?» + chips Т-Банк/Сбер/Наличные/+ Добавить"
    - "Tap on chip presents PosterSheet (bottom sheet) with balance input"
    - "First added account auto-primary; star toggles primary; × removes"
    - "NEXT enabled iff flow.accounts.count >= 1"
    - "Hint pluralised: 1→'счёт', 2..4→'счёта', 5+→'счётов'"
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift"
      provides: "Accounts step view"
      min_lines: 130
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/AccountBalanceSheet.swift"
      provides: "PosterSheet content with bank + balance inputs"
      min_lines: 80
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift"
      provides: "Russian pluralisation helper"
      min_lines: 30
  key_links:
    - from: "Step02AccountsView.swift"
      to: "OnboardingFlow"
      via: "@Bindable flow + addAccount/removeAccount/setPrimary"
      pattern: "flow\\.addAccount"
    - from: "AccountBalanceSheet.swift"
      to: "Step02AccountsView"
      via: "PosterSheet modifier with onSave callback"
      pattern: "\\.posterSheet\\("
---

<objective>
iOS symmetric to Plan 24-04. Build Step02AccountsView (chip-list + accounts list + +-add chip) and AccountBalanceSheet (PosterSheet content) for entering bank name + balance. Use existing `PosterSheet` modifier from Phase 23 (`ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift`).

Output: 4 source files + 1 test file. Wires into OnboardingView's `case 2:` switch arm.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-03-ios-step01-income-PLAN.md
@.planning/phases/24-onboarding-4-step/24-03-ios-step01-income-SUMMARY.md

@ios/BudgetPlanner/FeaturesV10/Common/Chip.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift
@ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift
@ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingChrome.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift

<interfaces>
# PosterSheet usage (from Phase 23):
SomeView()
  .posterSheet(isPresented: $showSheet) {
      AccountBalanceSheet(initialBank: ..., initialKind: ..., editable: ..., onSave: { acc in
          flow.addAccount(bank: acc.bank, kind: acc.kind, balanceCents: acc.balanceCents)
          showSheet = false
      })
  }

# OnboardingFlow methods (from Plan 24-01):
.addAccount(bank: String, kind: AccountKind, balanceCents: Int, mask: String? = nil)
.removeAccount(at: Int)
.setPrimary(at: Int)
.accounts: [OnboardingAccount]
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PluralRu helper + AccountBalanceSheet content view</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/AccountBalanceSheet.swift
  </files>
  <behavior>
    PluralRu:
      - `enum PluralRu { static func accounts(_ n: Int) -> String }`
      - 1, 21, 31, 101 → "счёт"
      - 2..4, 22..24, 32..34 → "счёта"
      - 0, 5..20, 25..30 → "счётов"
      - Standard Russian rule: mod10/mod100 lookup
    AccountBalanceSheet:
      - Props (struct):
        - var initialBank: String
        - var initialKind: OnboardingAccount.AccountKind
        - var editable: Bool
        - var onSave: (OnboardingAccount) -> Void
        - var onCancel: () -> Void
      - @State bank: String, balance: String
      - VStack(alignment:.leading, spacing:14):
        - Eyebrow("НОВЫЙ СЧЁТ", opacity:0.6)
        - if editable: TextField("Название (Т-Банк, наличные…)", text: $bank).font(.dmSerifItalic(18))
          else: Text(initialBank).font(.archivoBlack(13))
        - Balance row: TextField("0", text: $balance).keyboardType(.numberPad) + Text("₽").font(.archivoBlack(18)); .onChange filter digits + reformat with RubleFormatter
        - HStack: ОТМЕНА (ghost button) | ДОБАВИТЬ (paper bg, coral text); ДОБАВИТЬ disabled when bank.trimmingCharacters(in: .whitespaces).isEmpty
      - On save: parse balance digits → cents = rubles * 100; call onSave(OnboardingAccount(bank: bank.uppercased().trimmingCharacters(in: .whitespaces), mask: nil, kind: initialKind, balanceCents: cents, primary: false /* flow assigns primary */))
      - Use PosterTokens for paper/coral.
  </behavior>
  <action>
    1. Create PluralRu.swift with `accounts(_:)` static func — pure logic, no SwiftUI imports.
    2. Create AccountBalanceSheet.swift. Match the form layout from Plan 24-04 web — same field order, same disabled rule.
    3. The sheet renders inside the PosterSheet's content slot (PosterSheet provides drag-to-close + bottom anchor); we just provide the form content.
    4. No isolated tests — covered in Step02AccountsTests via flow assertions.
  </action>
  <verify>
    <automated>cd ios && make build 2>&1 | tail -20</automated>
  </verify>
  <done>
    Compiles. PluralRu and AccountBalanceSheet defined.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Step02AccountsView + chip-list + sheet presentation + integration into OnboardingView + tests</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift,
    ios/BudgetPlannerTests/Step02AccountsTests.swift
  </files>
  <behavior>
    Step02AccountsView:
      - @Bindable var flow: OnboardingFlow
      - @State sheetMode: SheetMode? where SheetMode = struct { initialBank, initialKind, editable }
      - @State showSheet: Bool = false
      - VStack(alignment:.leading, spacing:14):
        - Mass(text:"Где лежат\nденьги?", italic:true, size:32)
        - Eyebrow("ВСЕ КАРТЫ И НАЛИЧНЫЕ", opacity:0.55)
        - List of existing accounts (ForEach flow.accounts.indices):
            HStack: VStack[Text(account.bank).font(.archivoBlack(13)).kerning(0.04*13), HStack[Text(RubleFormatter.format(cents:account.balanceCents) + " ₽").font(.jetBrainsMono(11)).opacity(0.6), if account.primary { Text("· основной").font(.jetBrainsMono(11)).opacity(0.6) }]] | star button | × button
            - star: opacity 1 + paper bg + coral text if primary; transparent + paper border otherwise; tap → flow.setPrimary(at: idx)
            - ×: tap → flow.removeAccount(at: idx)
        - Chip row (HStack with wrapping?): Т-Банк, Сбер, Наличные, + Добавить
            - Each chip uses existing Chip component (Phase 23) with label
            - Tap → sheetMode = .init(bank, kind, editable: bank.isEmpty)
            - Set showSheet = true
      - .posterSheet(isPresented: $showSheet) {
          if let mode = sheetMode {
              AccountBalanceSheet(initialBank: mode.initialBank, initialKind: mode.initialKind, editable: mode.editable,
                  onSave: { acc in flow.addAccount(bank: acc.bank, kind: acc.kind, balanceCents: acc.balanceCents); showSheet = false; sheetMode = nil },
                  onCancel: { showSheet = false; sheetMode = nil })
          }
        }
    OnboardingView update:
      - Add `case 2:` rendering OnboardingChrome(step:2, label:"ШАГ 02 / 04 · СЧЕТА", onBack:{flow.back()}, onNext:{flow.next()}, nextDisabled:flow.accounts.isEmpty, hint: hintText) { Step02AccountsView(flow: flow) }
      - hintText computed: if flow.accounts.isEmpty → "нужен минимум один счёт"; else → "\(n) \(PluralRu.accounts(n)) · \(RubleFormatter.format(cents: total)) ₽"
    Tests (XCTest):
      - testPluralRu: 0→"счётов", 1→"счёт", 2→"счёта", 5→"счётов", 11→"счётов", 21→"счёт", 22→"счёта", 25→"счётов"
      - testAddAccountFromTBankChip: simulate flow.addAccount(bank:"Т-Банк", kind:.card, balanceCents:5_000_000) → flow.accounts.count == 1, accounts[0].primary == true
      - testRemoveAccount: 2 accounts → flow.removeAccount(at:0) → count==1; new primary handover happened in flow already
      - testSetPrimary: 2 accounts, primary on idx 0 → flow.setPrimary(at:1) → accounts[0].primary==false, accounts[1].primary==true
      - (No XCUI; pure logic tests against the @Observable model)
  </behavior>
  <action>
    1. Read existing Chip.swift for its API (label string + active bool? + onTap?). Use it; if its design doesn't match the «+ Добавить» dashed-border style, render the +-chip as plain HStack with custom border modifier.
    2. Use the existing PosterSheet modifier — confirm its `isPresented:` binding parameter name by reading `PosterSheet.swift` again (`func posterSheet(isPresented: Binding<Bool>, @ViewBuilder content: ...)` was confirmed).
    3. The accounts list may exceed screen height with 5+ entries → wrap in ScrollView if needed. Default Mac/iPhone simulator should handle 1-3 accounts without scroll; add scroll only when count > 3.
    4. Update OnboardingView.swift to replace placeholder for case 2 with the real Step02AccountsView wrapped in OnboardingChrome.
    5. Tests via XCTest, asserting flow state changes — no SwiftUI ViewInspector.
  </action>
  <verify>
    <automated>cd ios && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/Step02AccountsTests 2>&1 | tail -30</automated>
  </verify>
  <done>
    XCTest suite passes. `make build` clean. #Preview block in Step02AccountsView shows correct layout (eyeball check).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user free-text bank name | TextField input — trim + length-cap before persist |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-05-01 | Tampering | bank free-text | mitigate | `.trimmingCharacters(in: .whitespaces)` + slice to 40 chars before flow.addAccount |
| T-24-05-02 | XSS / format-string | bank string in views | accept | SwiftUI Text({String}) doesn't interpret format specifiers; no markup parsing |
| T-24-05-03 | Logic flaw | primary account uniqueness | mitigate | flow.setPrimary clears others (Plan 24-01); flow.addAccount first-only auto-primary (Plan 24-01) |
</threat_model>

<verification>
- `make build` clean
- XCTest Step02AccountsTests pass
- #Preview renders correctly
</verification>

<success_criteria>
- T3 + T11 (Step 02 + iOS parity) verifiable via tests
- ONB-V10-03 implemented on iOS
- AccountBalanceSheet uses PosterSheet modifier (drag-to-close from Phase 23 works)
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-05-ios-step02-accounts-SUMMARY.md`.
</output>
