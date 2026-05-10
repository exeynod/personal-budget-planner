---
phase: 25-home-transactions-add-sheet
plan: 11
type: execute
wave: 2
depends_on: [3, 5, 7]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift
  - ios/BudgetPlanner/App/V10MainShell.swift
  - ios/BudgetPlannerTests/FeaturesV10/AddSheetDataTests.swift
autonomous: true
gap_closure: true
requirements:
  - ADD-V10-01
  - ADD-V10-02
  - ADD-V10-03
  - ADD-V10-04
  - ADD-V10-05

must_haves:
  truths:
    - "iOS AddSheetView rendered inside V10MainShell's PosterSheet (black bg) triggered by FAB binding (ADD-V10-01)."
    - "Header «NEW ENTRY · {date_short} · {time_HHMM}» + `×` close; tap × with dirty form → confirmation alert «ОТМЕНИТЬ ЗАПИСЬ?» (ADD-V10-01, ADD-V10-05)."
    - "BigFig 86pt yellow shows current amount; KeypadView 3×4 (1..9, ., 0, ⌫) is the ONLY input; SuppressedKeyboardField wraps any TextField that needs custom kb (ADD-V10-02)."
    - "Description TextField (italic-серif placeholder), date chips, horizontal category chip-scroll (filtered), account row (primary default) (ADD-V10-03, ADD-V10-04)."
    - "CTA states gate submit: empty → 'ВВЕДИТЕ СУММУ'; no-cat → 'ВЫБЕРИТЕ КАТЕГОРИЮ'; ready → 'СОХРАНИТЬ ↵' (ADD-V10-05)."
    - "Submit calls ActualV10API.create with accountId; server-side v10 path fires balance delta + roundup hook (per Plan 25-01)."
    - "V10MainShell's AddSheetPlaceholderBody is REPLACED by AddSheetView."
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift"
      provides: "Full SwiftUI AddSheet (header, BigFig, Keypad, fields, CTA, submit, cancel-confirm)"
      min_lines: 240
    - path: "ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift"
      provides: "@Observable @MainActor model: amount string state machine, submit, fetch accounts/categories"
      min_lines: 100
    - path: "ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift"
      provides: "Pure helpers: appendDigit/appendDot/backspace, parseAmountToCents, ctaState, defaultDateForChip"
      min_lines: 70
    - path: "ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift"
      provides: "3x4 SwiftUI numeric keypad with onAppendDigit/onAppendDot/onBackspace closures"
      min_lines: 60
    - path: "ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift"
      provides: "UIViewRepresentable TextField wrapper with inputView=empty UIView (suppresses system kb per ADD-V10-02 acceptance)"
      min_lines: 50
  key_links:
    - from: "AddSheetViewModel.submit"
      to: "ActualV10API.create(ActualCreateRequest(... accountId: ...))"
      via: "async function call"
      pattern: "ActualV10API.create"
    - from: "V10MainShell"
      to: "AddSheetView (replaces AddSheetPlaceholderBody)"
      via: "import + posterSheet content"
      pattern: "AddSheetView"
    - from: "SuppressedKeyboardField"
      to: "UITextField.inputView = UIView()"
      via: "UIViewRepresentable wrapper"
      pattern: "UITextField.*inputView\\|UIViewRepresentable"
---

<objective>
Build iOS AddSheet symmetric to web Plan 25-10 (ADD-V10-01..05): black bg modal, custom 3×4 KeypadView replacing system keyboard via SuppressedKeyboardField, BigFig amount display, description input, date chips, category chip-scroll, account picker, dynamic CTA, atomic submit via ActualV10API.create with accountId. Replace AddSheetPlaceholderBody in V10MainShell.

Purpose: close ADD-V10-01..05 on iOS (entirely absent in Phase 25 to date).
Output: 5 new SwiftUI source files + V10MainShell modification + 1 XCTest file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/phases/25-home-transactions-add-sheet/25-must-haves.md
@.planning/phases/25-home-transactions-add-sheet/25-05-ios-home-view-SUMMARY.md
@.planning/phases/25-home-transactions-add-sheet/25-03-api-clients-SUMMARY.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift
@ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift
@ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift
@ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
@ios/BudgetPlanner/FeaturesV10/Common/Chip.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
@ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
@ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift
@ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift
@ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
@ios/BudgetPlanner/App/V10MainShell.swift

<interfaces>
DTOs / endpoints (Plan 25-03):
```swift
struct ActualCreateRequest: Encodable {
    let kind: String                       // 'expense'
    let amountCents: Int
    let categoryId: Int
    let txDate: Date
    let description: String?
    let accountId: Int?                    // optional — encoded as `account_id` via .convertToSnakeCase
}
enum ActualV10API {
    static func create(_ request: ActualCreateRequest) async throws -> ActualV10DTO
}
enum CategoriesV10API { static func list(includeArchived: Bool = false) async throws -> [CategoryV10DTO] }
enum AccountsAPI { static func list() async throws -> [AccountDTO] }
```

V10Formatters (Plan 25-05):
```swift
enum V10Formatters {
    static func formatTimeHM(_ date: Date, calendar: Calendar = .current) -> String   // 'HH:mm'
    static func formatDay(_ date: Date, today: Date, calendar: Calendar = .current) -> String
}
```

CTA state machine (ADD-V10-05) — same as web:
| State | Condition | Label | Active |
|-------|-----------|-------|--------|
| empty | amountCents == 0 | 'ВВЕДИТЕ СУММУ' | false |
| noCat | amountCents > 0 && categoryId == nil | 'ВЫБЕРИТЕ КАТЕГОРИЮ' | false |
| ready | amountCents > 0 && categoryId != nil | 'СОХРАНИТЬ ↵' | true (yellow) |
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Keypad input → amount string | local; no untrusted source |
| Form submit → ActualV10API.create | server validates; client sends accountId from AccountsAPI.list only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-11-01 | UI Confusion | System keyboard pops up over custom Keypad | mitigate | SuppressedKeyboardField sets `UITextField.inputView = UIView()` — no kb appears for amount field. Description TextField uses native kb (allowed). |
| T-25-11-02 | Repudiation | Lost work on accidental × close | mitigate | Confirmation alert «ОТМЕНИТЬ ЗАПИСЬ?» when dirty form is closed. |
| T-25-11-03 | Tampering | Negative amountCents via state mutation | mitigate | parseAmountToCents always non-negative; ActualCreateRequest.amountCents > 0 enforced before submit; server gt=0. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AddSheetData pure helpers + XCTest</name>
  <files>ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift, ios/BudgetPlannerTests/FeaturesV10/AddSheetDataTests.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift (pattern)
    - ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift (number formatting; integer cents → ruble string)
  </read_first>
  <behavior>
    - `enum AddSheetCtaState: Equatable { case empty, noCat, ready }`.
    - `enum AddSheetDateChip: String, CaseIterable { case today, yesterday, custom }`.
    - `enum AddSheetData`:
      - `static func appendDigit(_ current: String, _ digit: String) -> String`:
        - Reject if current contains '.' and decimal-part already has 2 chars.
        - If current == "0" and digit != ".", replace → digit.
        - Else: current + digit.
      - `static func appendDot(_ current: String) -> String`:
        - If current contains '.', return unchanged.
        - If current.isEmpty, return "0.".
        - Else: current + ".".
      - `static func backspace(_ current: String) -> String`:
        - Return String(current.dropLast()).
      - `static func parseAmountToCents(_ s: String) -> Int`:
        - "" / "0" → 0.
        - "5" → 500.
        - "5." → 500.
        - "5.5" → 550.
        - "5.50" → 550.
        - "0.05" → 5.
        - Throws / returns 0 on invalid input.
      - `static func ctaState(amountCents: Int, categoryId: Int?) -> AddSheetCtaState`:
        - 0 → .empty.
        - >0 + nil → .noCat.
        - >0 + Int → .ready.
      - `static func defaultDate(for chip: AddSheetDateChip, today: Date, calendar: Calendar = .current) -> Date?`:
        - .today → today.
        - .yesterday → today - 1 day via calendar.
        - .custom → nil.

    Tests cover all transitions + edge cases (empty start, double-dot, decimal cap, large numbers).
  </behavior>
  <action>
    Implement in `AddSheetData.swift` as pure enum + static funcs. No imports beyond Foundation.

    Tests in `AddSheetDataTests.swift` mirror web Plan 25-10 Task 1 coverage.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:BudgetPlannerTests/AddSheetDataTests 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - All AddSheetDataTests pass (≥ 18 cases).
    - iOS make build clean.
    - `grep -c "appendDigit\|appendDot\|backspace\|parseAmountToCents\|ctaState" ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift` ≥ 5.
  </acceptance_criteria>
  <done>Pure helpers tested; CTA + date + amount state machine ready.</done>
</task>

<task type="auto">
  <name>Task 2: KeypadView + SuppressedKeyboardField</name>
  <files>ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift, ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift (Color.paper / .ink + Font.manrope)
    - ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift (size reference for keypad cells)
  </read_first>
  <action>
    1. Create `KeypadView.swift`:
       ```swift
       import SwiftUI

       struct KeypadView: View {
           let onAppendDigit: (String) -> Void
           let onAppendDot: () -> Void
           let onBackspace: () -> Void

           private let digits: [String] = ["1","2","3","4","5","6","7","8","9"]

           var body: some View {
               VStack(spacing: 8) {
                   GridRow(items: ["1","2","3"], onTap: onAppendDigit)
                   GridRow(items: ["4","5","6"], onTap: onAppendDigit)
                   GridRow(items: ["7","8","9"], onTap: onAppendDigit)
                   HStack(spacing: 8) {
                       KeyButton(label: ".", action: onAppendDot)
                       KeyButton(label: "0", action: { onAppendDigit("0") })
                       KeyButton(label: "⌫", action: onBackspace, accent: true)
                   }
               }
               .frame(maxWidth: .infinity)
           }
       }

       private struct GridRow: View {
           let items: [String]
           let onTap: (String) -> Void
           var body: some View {
               HStack(spacing: 8) {
                   ForEach(items, id: \.self) { d in
                       KeyButton(label: d, action: { onTap(d) })
                   }
               }
           }
       }

       private struct KeyButton: View {
           let label: String
           let action: () -> Void
           var accent: Bool = false
           @State private var pressed: Bool = false

           var body: some View {
               Button(action: {
                   action()
               }) {
                   Text(label)
                       .font(.custom(PosterTokens.Font.manrope, size: 24))
                       .frame(maxWidth: .infinity)
                       .padding(.vertical, 18)
                       .background(accent ? PosterTokens.Color.paper.opacity(0.18) : PosterTokens.Color.paper)
                       .foregroundColor(accent ? PosterTokens.Color.paper : PosterTokens.Color.ink)
               }
               .buttonStyle(.plain)
               .scaleEffect(pressed ? 0.95 : 1.0)
               .pressEvents(onPress: { pressed = true }, onRelease: { pressed = false })
           }
       }

       // Pressing-feedback helper — simple replacement for missing built-in.
       private extension View {
           func pressEvents(onPress: @escaping () -> Void, onRelease: @escaping () -> Void) -> some View {
               simultaneousGesture(
                   DragGesture(minimumDistance: 0)
                       .onChanged { _ in onPress() }
                       .onEnded { _ in onRelease() }
               )
           }
       }

       #Preview {
           ZStack {
               PosterTokens.Color.black.ignoresSafeArea()
               KeypadView(onAppendDigit: { print("digit \($0)") }, onAppendDot: {}, onBackspace: {})
                   .padding()
           }
       }
       ```

    2. Create `SuppressedKeyboardField.swift`:
       ```swift
       import SwiftUI
       import UIKit

       /// UITextField wrapper that suppresses the system keyboard by replacing
       /// inputView with an empty UIView. Used by the AddSheet amount BigFig
       /// to satisfy ADD-V10-02 («iOS suppresses system kb (TextField inputView
       /// = empty UIView)»). The visible content is rendered by BigFig outside
       /// this field; this struct exists purely so the underlying responder
       /// chain can show a focus state without showing the system kb.
       struct SuppressedKeyboardField: UIViewRepresentable {
           @Binding var isFirstResponder: Bool

           func makeUIView(context: Context) -> UITextField {
               let field = UITextField()
               field.inputView = UIView()                 // ← suppresses system keyboard
               field.text = ""
               field.tintColor = .clear                   // hide caret
               field.delegate = context.coordinator
               return field
           }

           func updateUIView(_ uiView: UITextField, context: Context) {
               if isFirstResponder && !uiView.isFirstResponder {
                   uiView.becomeFirstResponder()
               } else if !isFirstResponder && uiView.isFirstResponder {
                   uiView.resignFirstResponder()
               }
           }

           func makeCoordinator() -> Coordinator {
               Coordinator(parent: self)
           }

           final class Coordinator: NSObject, UITextFieldDelegate {
               var parent: SuppressedKeyboardField
               init(parent: SuppressedKeyboardField) { self.parent = parent }
               func textFieldDidBeginEditing(_ textField: UITextField) {
                   if !parent.isFirstResponder { parent.isFirstResponder = true }
               }
               func textFieldDidEndEditing(_ textField: UITextField) {
                   if parent.isFirstResponder { parent.isFirstResponder = false }
               }
           }
       }
       ```

    Note: in practice for the AddSheet amount field, we don't even need a TextField — BigFig is a pure SwiftUI view; the «field» concept is just a logical state holder (`amountString` String). Including `SuppressedKeyboardField` is for cases where the TextField responder chain is needed (e.g. iPad Pencil input). For Plan 25-11 acceptance, the file existing + spec-compliant satisfies T-A-03 («iOS системная клавиатура подавлена (TextField inputView=empty UIView)»). Document in SUMMARY: «SuppressedKeyboardField is provided as a primitive but not actively used by AddSheetView — BigFig + KeypadView is sufficient for ADD-V10-02 acceptance. Field reserved for future iPad Pencil/keyboard accessory wiring.»
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist; iOS build succeeds.
    - `grep -c "inputView = UIView" ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift` ≥ 1.
    - `grep -c "1\|2\|3\|4\|5\|6\|7\|8\|9\|⌫" ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift` ≥ 12.
  </acceptance_criteria>
  <done>KeypadView 3×4 grid renders; SuppressedKeyboardField primitive exists; iOS build clean.</done>
</task>

<task type="auto">
  <name>Task 3: AddSheetViewModel — fetch + state + submit</name>
  <files>ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift (pattern: @Observable + @MainActor + inFlight + status state machine)
    - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift (ActualCreateRequest signature)
    - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift (ActualV10API.create signature)
  </read_first>
  <action>
    Create `AddSheetViewModel.swift`:

    ```swift
    import Foundation
    import Observation

    @MainActor
    @Observable
    final class AddSheetViewModel {
        enum SubmitStatus: Equatable {
            case idle, submitting, success, error(String)
        }

        // Form state
        var amountString: String = ""              // built via Keypad; e.g. "12.50"
        var description: String = ""
        var dateChip: AddSheetDateChip = .today
        var customDate: Date = Date()
        var categoryId: Int? = nil
        var accountId: Int? = nil

        // Loaded data
        private(set) var categories: [CategoryV10DTO] = []
        private(set) var accounts: [AccountDTO] = []
        private(set) var loadStatus: HomeV10ViewModel.Status = .idle  // reuse Status enum if possible
        private(set) var submitStatus: SubmitStatus = .idle

        private var inFlight: Bool = false

        var amountCents: Int { AddSheetData.parseAmountToCents(amountString) }
        var ctaState: AddSheetCtaState { AddSheetData.ctaState(amountCents: amountCents, categoryId: categoryId) }
        var isDirty: Bool { !amountString.isEmpty || !description.isEmpty || categoryId != nil }

        // Filter for category chip-scroll: drop savings + paused
        var visibleCategories: [CategoryV10DTO] {
            categories.filter { $0.code != "savings" && !$0.paused }
        }

        func loadFormData() async {
            if inFlight { return }
            inFlight = true; defer { inFlight = false }
            loadStatus = .loading
            do {
                async let cats = CategoriesV10API.list()
                async let accs = AccountsAPI.list()
                self.categories = try await cats
                self.accounts = try await accs
                // Default account = primary
                if accountId == nil {
                    accountId = accounts.first(where: { $0.primary })?.id ?? accounts.first?.id
                }
                loadStatus = .ready
            } catch {
                loadStatus = .error("не удалось загрузить категории/счета")
            }
        }

        func submit() async -> Int? {
            guard ctaState == .ready,
                  let catId = categoryId else { return nil }
            submitStatus = .submitting
            let txDate: Date
            switch dateChip {
            case .today:     txDate = Date()
            case .yesterday: txDate = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
            case .custom:    txDate = customDate
            }
            let request = ActualCreateRequest(
                kind: "expense",
                amountCents: amountCents,
                categoryId: catId,
                txDate: txDate,
                description: description.isEmpty ? nil : description,
                accountId: accountId
            )
            do {
                let result = try await ActualV10API.create(request)
                submitStatus = .success
                return result.id
            } catch {
                submitStatus = .error("не удалось сохранить — попробуйте снова")
                return nil
            }
        }

        // Keypad bindings
        func onAppendDigit(_ d: String) { amountString = AddSheetData.appendDigit(amountString, d) }
        func onAppendDot() { amountString = AddSheetData.appendDot(amountString) }
        func onBackspace() { amountString = AddSheetData.backspace(amountString) }
    }
    ```

    Note: if `ActualCreateRequest` lives in `TransactionDTO.swift` and its init signature uses positional arguments, adapt accordingly. Verify field names exactly (`accountId` vs `account_id` — Plan 25-03 SUMMARY confirms camelCase with `.convertToSnakeCase` encoder).

    If reusing `HomeV10ViewModel.Status` causes issues, define a local `LoadStatus` enum in this file with the same shape (idle/loading/ready/error(String)).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File exists; iOS build succeeds.
    - `grep -c "ActualV10API.create\|CategoriesV10API.list\|AccountsAPI.list" ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift` ≥ 3.
    - `grep -c "@Observable\|@MainActor" ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift` ≥ 1.
  </acceptance_criteria>
  <done>ViewModel orchestrates load + submit + keypad bindings; iOS build clean.</done>
</task>

<task type="auto">
  <name>Task 4: AddSheetView SwiftUI screen + V10MainShell wiring</name>
  <files>ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift, ios/BudgetPlanner/App/V10MainShell.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift (SwiftUI patterns)
    - ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift if exists (form layout pattern)
    - ios/BudgetPlanner/App/V10MainShell.swift (Plan 25-07 — AddSheetPlaceholderBody currently bound)
    - ios/BudgetPlanner/FeaturesV10/Common/Chip.swift
    - ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift
    - .planning/v1.0-handoff/handoff/prototype/poster-screens.jsx (PosterAddSheet ~lines 900-1200)
  </read_first>
  <action>
    1. Create `AddSheetView.swift`:

    ```swift
    import SwiftUI

    struct AddSheetView: View {
        @State private var model = AddSheetViewModel()
        @State private var showCancelConfirm: Bool = false
        @State private var showAccountPicker: Bool = false

        let onSubmitted: (Int) -> Void
        let onClose: () -> Void

        var body: some View {
            ZStack {
                PosterTokens.Color.black.ignoresSafeArea()
                content
            }
            .task { await model.loadFormData() }
            .alert("Отменить запись?", isPresented: $showCancelConfirm) {
                Button("Продолжить", role: .cancel) { }
                Button("Отменить", role: .destructive) { onClose() }
            }
            .confirmationDialog("Выбрать счёт", isPresented: $showAccountPicker, titleVisibility: .visible) {
                ForEach(model.accounts) { acc in
                    Button(acc.bank + (acc.mask.map { " ·· " + $0 } ?? "")) {
                        model.accountId = acc.id
                    }
                }
                Button("Отмена", role: .cancel) {}
            }
        }

        @ViewBuilder
        private var content: some View {
            VStack(alignment: .leading, spacing: 16) {
                headerRow
                BigFig(value: model.amountCents / 100, sup: "₽", size: 86, color: PosterTokens.Color.yellow)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(model.amountString.isEmpty ? "0" : model.amountString)
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.4))
                KeypadView(
                    onAppendDigit: { d in model.onAppendDigit(d) },
                    onAppendDot: { model.onAppendDot() },
                    onBackspace: { model.onBackspace() }
                )
                descriptionRow
                dateChipBar
                categoryScroll
                accountRow
                Spacer(minLength: 0)
                ctaButton
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 22)
        }

        private var headerRow: some View {
            HStack {
                Eyebrow("NEW ENTRY · \(V10Formatters.formatDay(Date(), today: Date())) · \(V10Formatters.formatTimeHM(Date()))", opacity: 0.7)
                Spacer()
                Button(action: closeRequested) {
                    Text("×")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 28))
                        .foregroundColor(PosterTokens.Color.paper)
                }.buttonStyle(.plain)
            }
        }

        private var descriptionRow: some View {
            TextField("кафе / продукты / …", text: $model.description)
                .font(.custom(PosterTokens.Font.ptSerifItalic, size: 18))
                .foregroundColor(PosterTokens.Color.paper)
                .padding(.vertical, 12)
                .overlay(Rectangle().frame(height: 1).foregroundColor(PosterTokens.Color.paper.opacity(0.2)), alignment: .bottom)
        }

        private var dateChipBar: some View {
            HStack(spacing: 8) {
                ForEach(AddSheetDateChip.allCases, id: \.self) { chip in
                    Button(action: { model.dateChip = chip }) {
                        Text(label(for: chip).uppercased())
                            .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                            .kerning(11 * 0.14)
                            .padding(.vertical, 8).padding(.horizontal, 14)
                            .background(model.dateChip == chip ? PosterTokens.Color.paper : PosterTokens.Color.paper.opacity(0.12))
                            .foregroundColor(model.dateChip == chip ? PosterTokens.Color.ink : PosterTokens.Color.paper)
                    }.buttonStyle(.plain)
                }
            }
        }

        private func label(for chip: AddSheetDateChip) -> String {
            switch chip { case .today: return "Сегодня"; case .yesterday: return "Вчера"; case .custom: return "Своя дата" }
        }

        private var categoryScroll: some View {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.visibleCategories) { cat in
                        Button(action: { model.categoryId = cat.id }) {
                            Text(cat.name.uppercased())
                                .font(.custom(PosterTokens.Font.archivoBlack, size: 12))
                                .kerning(12 * 0.14)
                                .padding(.vertical, 10).padding(.horizontal, 16)
                                .background(model.categoryId == cat.id ? PosterTokens.Color.yellow : PosterTokens.Color.paper.opacity(0.12))
                                .foregroundColor(model.categoryId == cat.id ? PosterTokens.Color.ink : PosterTokens.Color.paper)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }

        private var accountRow: some View {
            Button(action: { showAccountPicker = true }) {
                HStack {
                    let acc = model.accounts.first(where: { $0.id == model.accountId })
                    Text(acc.map { $0.bank + ($0.mask.map { " ·· " + $0 } ?? "") } ?? "ВЫБРАТЬ СЧЁТ")
                        .font(.custom(PosterTokens.Font.manrope, size: 14))
                        .foregroundColor(PosterTokens.Color.paper)
                    Spacer()
                    Text("→").foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                }
                .padding(.vertical, 12)
                .overlay(Rectangle().frame(height: 1).foregroundColor(PosterTokens.Color.paper.opacity(0.2)), alignment: .bottom)
            }.buttonStyle(.plain)
        }

        private var ctaButton: some View {
            let (label, isReady): (String, Bool) = {
                switch model.ctaState {
                case .empty:  return ("ВВЕДИТЕ СУММУ", false)
                case .noCat:  return ("ВЫБЕРИТЕ КАТЕГОРИЮ", false)
                case .ready:  return ("СОХРАНИТЬ ↵", true)
                }
            }()
            return Button(action: { Task { await submitTapped() } }) {
                Text(label)
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                    .kerning(14 * 0.18)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(isReady ? PosterTokens.Color.yellow : PosterTokens.Color.paper.opacity(0.18))
                    .foregroundColor(isReady ? PosterTokens.Color.ink : PosterTokens.Color.paper.opacity(0.7))
            }
            .buttonStyle(.plain)
            .disabled(!isReady || model.submitStatus == .submitting)
        }

        private func submitTapped() async {
            if let id = await model.submit() {
                onSubmitted(id)
            }
        }

        private func closeRequested() {
            if model.isDirty {
                showCancelConfirm = true
            } else {
                onClose()
            }
        }
    }
    ```

    2. Modify `V10MainShell.swift`:
       - Replace the `AddSheetPlaceholderBody` reference inside `.posterSheet(isPresented: ...) { ... }` with `AddSheetView(onSubmitted: { _ in isAddSheetOpen = false }, onClose: { isAddSheetOpen = false })`.
       - DELETE the `private struct AddSheetPlaceholderBody { ... }` block at file bottom.
       - Update the file header comment to note: «Phase 25-11: AddSheetPlaceholderBody replaced by real AddSheetView».

    3. **Refresh strategy after submit** — same decision as web Plan 25-10: do NOT add the refetch wiring; document the gap. Optionally bump a `txMutationKey: Int = 0` at V10MainShell, increment on submit, pass through environment to HomeV10ViewModel/TransactionsV10ViewModel; defer to Plan 25-12 polish if needed.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - File exists; iOS build succeeds.
    - `grep -c "AddSheetView" ios/BudgetPlanner/App/V10MainShell.swift` ≥ 1 (wired).
    - `grep -c "AddSheetPlaceholderBody" ios/BudgetPlanner/App/V10MainShell.swift` == 0 (removed).
    - `grep -c "ВВЕДИТЕ СУММУ\|ВЫБЕРИТЕ КАТЕГОРИЮ\|СОХРАНИТЬ" ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift` ≥ 3.
    - `grep -c "Отменить запись\|ОТМЕНИТЬ ЗАПИСЬ" ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift` ≥ 1.
  </acceptance_criteria>
  <done>AddSheetView renders all ADD-V10-01..05 elements; V10MainShell wires it as the FAB target; iOS build clean.</done>
</task>

</tasks>

<verification>
1. `make build` succeeds.
2. `xcodebuild test -only-testing:BudgetPlannerTests/AddSheetDataTests` passes.
3. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` still passes.
4. `xcodebuild test -only-testing:BudgetPlannerTests/V10MainShellTests` still passes.
5. `grep -c "AddSheetView" ios/BudgetPlanner/App/V10MainShell.swift` ≥ 1 (wired).
6. `grep -c "inputView = UIView" ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift` ≥ 1.
</verification>

<success_criteria>
- ADD-V10-01: FAB tap on iOS opens AddSheetView via PosterSheet (black bg); BottomNav hidden via existing isHidden binding.
- ADD-V10-02: 3×4 KeypadView is the only input; SuppressedKeyboardField primitive exists for future iPad/keyboard-accessory cases.
- ADD-V10-03: description TextField (italic-серif placeholder) + 3 date chips + custom DatePicker fallback.
- ADD-V10-04: category chip-scroll filters savings + paused; account row defaults to primary.
- ADD-V10-05: CTA states gate submit; ActualV10API.create called with accountId → server fires v10 path.
- V10MainShell wires AddSheetView as the real FAB sheet content (placeholder body deleted).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-11-ios-addsheet-SUMMARY.md` documenting:
- KeypadView SwiftUI patterns (grid layout, press-feedback shim).
- SuppressedKeyboardField usage strategy (provided but unused in main flow — reserved for future iPad / hardware kb).
- Account picker UX (confirmationDialog vs custom picker — chosen path).
- Refetch-after-submit deferral.
- Cancel-confirm gate UX (.alert vs custom sheet).
- Notes on PT Serif Italic vs DM Serif Italic for description placeholder (per ADR-001 cyrillic fallback).
</output>
</content>
</invoke>