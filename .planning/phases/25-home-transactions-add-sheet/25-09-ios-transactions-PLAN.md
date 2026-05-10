---
phase: 25-home-transactions-add-sheet
plan: 9
type: execute
wave: 2
depends_on: [3, 5, 7]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift
  - ios/BudgetPlannerTests/FeaturesV10/TransactionsDataTests.swift
autonomous: true
gap_closure: true
requirements:
  - TXN-V10-01
  - TXN-V10-02
  - TXN-V10-03
  - TXN-V10-04
  - TXN-V10-05

must_haves:
  truths:
    - "iOS TransactionsV10View renders cobalt bg + eyebrow «SECTION II» + Mass italic «Реестр.» + eyebrow «N ЗАПИСЕЙ · X ₽» (TXN-V10-01)."
    - "Single-select chip-bar (Все / Кафе / Продукты / Транспорт / Подписки / Копилка) filters via @State selection (TXN-V10-02)."
    - "Day-grouped sections via V10Formatters.formatDay (Сегодня/Вчера/«N мая»), each header DM Serif italic 28pt with day-sum on right (TXN-V10-03)."
    - "Each row: time mono · name · «cat · BANK MASK» mono · amount mono with U+2212 (TXN-V10-04)."
    - "Roundup rows show inline yellow plate «↻ ОКРУГЛ.», deposit rows «→ КОПИЛКА» (TXN-V10-04)."
    - "Tap row → edit sheet via PosterSheet (stub editor; real Phase 26); swipe-left → confirm-sheet «УДАЛИТЬ ОПЕРАЦИЮ?» → DELETE /actual/{id} (TXN-V10-05)."
    - "TransactionsViewPlaceholderView superseded — HomeV10View's «ВСЕ ОПЕРАЦИИ →» pushes TransactionsV10View instead (T-T-01)."
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift"
      provides: "SwiftUI registry view (cobalt bg, header, filter chips, day-grouped List, swipe-delete, edit sheet)"
      min_lines: 200
    - path: "ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift"
      provides: "@Observable @MainActor model: parallel fetch + reload + filter state + delete"
      min_lines: 80
    - path: "ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift"
      provides: "Pure helpers: applyFilterChip, groupByDay, computeHeaderSummary, formatTxAmount, tagFor"
      min_lines: 80
  key_links:
    - from: "TransactionsV10ViewModel"
      to: "ActualV10API.list / CategoriesV10API.list / AccountsAPI.list / PeriodsAPI.current"
      via: "async let parallel fetches"
      pattern: "async let .*= ActualV10API.list|CategoriesV10API.list|AccountsAPI.list"
    - from: "HomePlaceholders.swift TransactionsViewPlaceholderView"
      to: "Updated to push TransactionsV10View (renamed/redirected)"
      via: "Body swap"
      pattern: "TransactionsV10View"
    - from: "TransactionsV10View row delete"
      to: "ActualAPI.delete (existing v0.x DELETE /actual/{id})"
      via: "ViewModel.delete(_:) → APIClient"
      pattern: "ActualAPI.delete\\|deleteActual"
---

<objective>
Build iOS Transactions registry symmetric to web Plan 25-08 (TXN-V10-01..05). Cobalt push-stack screen with day-grouping, single-select chip filter, formatted rows with roundup/deposit spec-tags, swipe-left delete, edit sheet trigger. Wire it as the real target for HomeV10View's «ВСЕ ОПЕРАЦИИ →» push (replacing TransactionsViewPlaceholderView).

Purpose: close TXN-V10-01..05 on iOS (entirely absent in Phase 25 to date).
Output: 3 new SwiftUI source files + 1 modified HomePlaceholders + 1 XCTest file.
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
@ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift
@ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
@ios/BudgetPlanner/FeaturesV10/Common/Plate.swift
@ios/BudgetPlanner/FeaturesV10/Common/Chip.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift
@ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift
@ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift
@ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
@ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
@ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift
@ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift

<interfaces>
<!-- Wave-1/2/3 outputs the executor consumes. -->

DTOs (Plan 25-03):
```swift
struct ActualV10DTO: Decodable, Identifiable, Equatable {
    let id: Int; let periodId: Int; let kind: ActualKindV10
    let amountCents: Int; let description: String?; let categoryId: Int
    let txDate: Date; let source: ActualSource; let createdAt: Date?
    let accountId: Int?; let parentTxnId: Int?
}
enum ActualKindV10: String, Decodable { case expense, income, roundup, deposit }
struct CategoryV10DTO: Decodable, Identifiable, Equatable { ... code: String?; ... }
struct AccountDTO: Decodable, Identifiable, Equatable { ... bank: String; mask: String?; ... }
```

API Endpoints:
```swift
enum ActualV10API {
    static func list(periodId: Int, kind: ActualKindV10? = nil, categoryId: Int? = nil) async throws -> [ActualV10DTO]
    static func create(_ request: ActualCreateRequest) async throws -> ActualV10DTO
}
// EXISTING v0.x ActualAPI (verify if it exposes delete):
enum ActualAPI {
    static func delete(_ id: Int) async throws    // verify in TransactionsAPI.swift; if absent, add a thin wrapper to ActualV10API
}
enum CategoriesV10API { static func list(includeArchived: Bool = false) async throws -> [CategoryV10DTO] }
enum AccountsAPI { static func list() async throws -> [AccountDTO] }
enum PeriodsAPI { static func current() async throws -> PeriodDTO?  /* 404 → nil pattern from HomeV10ViewModel */ }
```

V10Formatters (Plan 25-05):
```swift
enum V10Formatters {
    static func formatDay(_ date: Date, today: Date, calendar: Calendar = .current) -> String  // 'Сегодня'/'Вчера'/'7 мая'
    static func formatTimeHM(_ date: Date, calendar: Calendar = .current) -> String           // 'HH:mm'
}
```

PosterRouter / PosterSheet:
```swift
@Environment(\.posterRouter) var router: PosterRouter?
extension View {
    func posterSheet<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View
}
```

Filter chip mapping (per CONTEXT specifics — same as web Plan 25-08):
| Chip label | Filter logic |
|------------|--------------|
| Все | no filter |
| Кафе | category.code == "cafe" |
| Продукты | category.code == "food" |
| Транспорт | category.code == "transit" |
| Подписки | category.code == "subs" |
| Копилка | kind in [.roundup, .deposit] |
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API responses → ViewModel state | server-validated; trust after RLS gate |
| Swipe-left delete → ActualAPI.delete | confirmation alert required (T-25-09-02) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-09-01 | Tampering | Filter chip mapping showing wrong code | mitigate | Hardcoded enum-to-code mapping; tests assert each chip yields expected count. |
| T-25-09-02 | Repudiation | Swipe-left fires DELETE without confirm | mitigate | Wrap swipeAction with `.confirmationDialog("Удалить операцию?", isPresented:)`; only on confirm tap → call ViewModel.delete. |
| T-25-09-03 | Concurrency | Multiple reload/delete in flight | mitigate | inFlight guard + reload after delete only when delete returns success. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TransactionsData pure helpers + XCTest</name>
  <files>ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift, ios/BudgetPlannerTests/FeaturesV10/TransactionsDataTests.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift (formatDay / formatTimeHM)
    - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift (ActualV10DTO + ActualKindV10)
    - ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
    - ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift (pattern for pure helpers + test layout)
    - ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift (JSON-fixture-decoding pattern for DTOs without public init)
    - ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift (number formatting with U+202F)
  </read_first>
  <behavior>
    - `enum TransactionFilterChip: String, CaseIterable { case all, cafe, food, transit, subs, savings }` with computed `var label: String` returning Russian label (Все/Кафе/Продукты/Транспорт/Подписки/Копилка).
    - `struct TxDayGroup: Identifiable, Equatable { let id: String; let dateLabel: String; let dateKey: String; let rows: [ActualV10DTO]; let sumCents: Int }`. id = dateKey.
    - `enum TransactionsData`:
      - `static func applyFilterChip(_ actuals: [ActualV10DTO], categories: [CategoryV10DTO], chip: TransactionFilterChip) -> [ActualV10DTO]`.
        - .all → full list.
        - .cafe → rows where `categories.first(where: { $0.id == a.categoryId })?.code == "cafe"`.
        - .food / .transit / .subs → similar.
        - .savings → `kind == .roundup || kind == .deposit`.
      - `static func groupByDay(_ actuals: [ActualV10DTO], today: Date, calendar: Calendar = .current) -> [TxDayGroup]`.
        - Group by `formatDay(a.txDate, today)` (use the provided calendar so tests are deterministic).
        - Sort groups by max txDate DESC.
        - Within group, sort rows by createdAt DESC (use txDate as tiebreaker if createdAt nil).
        - sumCents = sum of `abs(amountCents)` per group.
      - `static func computeHeaderSummary(_ actuals: [ActualV10DTO]) -> (count: Int, sumCents: Int)`.
      - `static func formatTxAmount(_ amountCents: Int) -> String`.
        - Negative → `"−" + RubleFormatter.format(cents: abs(amount)) + " ₽"` (use U+2212 = "\u{2212}").
        - Positive → `"+" + RubleFormatter.format(cents: amount) + " ₽"`.
        - Zero → `"0 ₽"`.
      - `static func tagFor(_ tx: ActualV10DTO) -> TxTag?`.
        - Returns `.roundup` if kind == .roundup; `.deposit` if kind == .deposit; nil otherwise.
        - `enum TxTag { case roundup, deposit }`.

    Tests in `TransactionsDataTests.swift`:
    - applyFilterChip: 6 cases, one per chip; build categories+actuals via JSON-decode pattern from HomeDataTests.
    - groupByDay: empty → empty; mixed-day → correct grouping + sorting + sum.
    - computeHeaderSummary: empty + non-empty.
    - formatTxAmount: negative (assert U+2212 char), positive (+), zero, large (1M+).
    - tagFor: each kind value returns expected tag (or nil).
  </behavior>
  <action>
    Implement in `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift` as pure enum + static funcs. No imports beyond Foundation + project DTOs/formatters.

    Use `RubleFormatter.format(cents:)` from FeaturesV10/Onboarding/ for the underlying number formatting (U+202F separators).

    For tests use JSON-fixture-decoding pattern from HomeDataTests (decode actuals via JSONDecoder with snake_case strategy).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:BudgetPlannerTests/TransactionsDataTests 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - All TransactionsDataTests pass (≥ 15 cases).
    - `grep -c "u{2212}\|U+2212\|−" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift` ≥ 1.
    - iOS make build clean.
  </acceptance_criteria>
  <done>Pure helpers + types exported; XCTest covers happy + edge cases.</done>
</task>

<task type="auto">
  <name>Task 2: TransactionsV10ViewModel — fetch + filter state + delete</name>
  <files>ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift (HomeV10ViewModel pattern: @Observable + @MainActor + inFlight guard + status state machine)
    - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift (verify ActualAPI.delete exists or check ActualV10API)
    - ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift / AccountsAPI.swift
  </read_first>
  <action>
    Create `TransactionsV10ViewModel.swift`:

    ```swift
    import Foundation
    import Observation

    @MainActor
    @Observable
    final class TransactionsV10ViewModel {
        enum Status: Equatable {
            case idle, loading, ready, error(String)
        }

        private(set) var status: Status = .idle
        private(set) var actuals: [ActualV10DTO] = []
        private(set) var categories: [CategoryV10DTO] = []
        private(set) var accounts: [AccountDTO] = []

        var chip: TransactionFilterChip = .all          // observed, mutable

        private var inFlight: Bool = false

        // Computed (re-runs on observers when chip / actuals / categories change)
        var filteredActuals: [ActualV10DTO] {
            TransactionsData.applyFilterChip(actuals, categories: categories, chip: chip)
        }
        var dayGroups: [TxDayGroup] {
            TransactionsData.groupByDay(filteredActuals, today: Date())
        }
        var headerSummary: (count: Int, sumCents: Int) {
            TransactionsData.computeHeaderSummary(filteredActuals)
        }

        func load() async {
            if inFlight { return }
            inFlight = true; defer { inFlight = false }
            status = .loading
            do {
                async let cats = CategoriesV10API.list()
                async let accs = AccountsAPI.list()
                let per: PeriodDTO?
                do { per = try await PeriodsAPI.current() } catch { per = nil }
                let acts: [ActualV10DTO]
                if let pid = per?.id { acts = try await ActualV10API.list(periodId: pid) }
                else { acts = [] }
                self.categories = try await cats
                self.accounts = try await accs
                self.actuals = acts
                self.status = .ready
            } catch {
                self.status = .error("не удалось загрузить транзакции")
            }
        }

        func delete(_ tx: ActualV10DTO) async {
            do {
                try await ActualAPI.delete(tx.id)        // existing v0.x endpoint; if absent add wrapper to ActualV10API
                await load()                             // reload to reflect updated registry
            } catch {
                self.status = .error("не удалось удалить операцию")
            }
        }
    }
    ```

    **Verify ActualAPI.delete exists**: grep `static func delete` in `ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift`. If absent, add to `ActualV10API`:
    ```swift
    extension ActualV10API {
        static func delete(_ id: Int) async throws {
            try await APIClient.shared.requestVoid("DELETE", "/actual/\(id)")
        }
    }
    ```
    (Use the void-return APIClient method — check existing patterns; if APIClient only has `request`, ignore the return value via `let _: EmptyResponse = try await ...`).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File exists; `grep -c "@Observable\|@MainActor" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift` ≥ 1.
    - `grep -c "ActualV10API.list\|CategoriesV10API.list\|AccountsAPI.list" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift` ≥ 3.
    - iOS build succeeds.
  </acceptance_criteria>
  <done>ViewModel loads/deletes via API; status state machine; iOS build clean.</done>
</task>

<task type="auto">
  <name>Task 3: TransactionsV10View SwiftUI screen + swap into HomePlaceholders</name>
  <files>ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift, ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift (SwiftUI patterns: ZStack + colored bg + ScrollView + section headers + stagger animations + PosterRouter env)
    - ios/BudgetPlanner/FeaturesV10/Common/Chip.swift (Chip props: active, label, onTap)
    - ios/BudgetPlanner/FeaturesV10/Common/Plate.swift (Plate props: tone)
    - ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift (.posterSheet modifier)
    - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift (current TransactionsViewPlaceholderView body)
    - .planning/v1.0-handoff/handoff/prototype/poster-screens.jsx (PosterTransactions reference layout)
  </read_first>
  <action>
    1. Create `TransactionsV10View.swift`:

    ```swift
    import SwiftUI

    struct TransactionsV10View: View {
        @State private var model = TransactionsV10ViewModel()
        @State private var editingTx: ActualV10DTO? = nil
        @State private var pendingDeleteTx: ActualV10DTO? = nil
        @Environment(\.posterRouter) private var router

        var body: some View {
            ZStack {
                PosterTokens.Color.cobalt.ignoresSafeArea()
                content
            }
            .task { await model.load() }
            .posterSheet(isPresented: Binding(get: { editingTx != nil }, set: { if !$0 { editingTx = nil } })) {
                EditPlaceholderSheet(tx: editingTx, onClose: { editingTx = nil })
            }
            .confirmationDialog(
                "Удалить операцию?",
                isPresented: Binding(get: { pendingDeleteTx != nil }, set: { if !$0 { pendingDeleteTx = nil } }),
                titleVisibility: .visible
            ) {
                Button("Удалить", role: .destructive) {
                    if let tx = pendingDeleteTx {
                        Task { await model.delete(tx) }
                    }
                    pendingDeleteTx = nil
                }
                Button("Отмена", role: .cancel) { pendingDeleteTx = nil }
            }
        }

        @ViewBuilder
        private var content: some View {
            switch model.status {
            case .idle, .loading:
                LoadingPlate()
            case .error(let msg):
                ErrorPlate(message: msg) { Task { await model.load() } }
            case .ready:
                readyContent
            }
        }

        private var readyContent: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
                    headerRow
                    Mass("Реестр.", italic: true, size: 88)
                        .foregroundColor(PosterTokens.Color.paper)
                    Eyebrow("\(model.headerSummary.count) ЗАПИСЕЙ · \(RubleFormatter.format(cents: model.headerSummary.sumCents)) ₽", opacity: 0.65)
                    chipBar
                    if model.dayGroups.isEmpty {
                        emptyState
                    } else {
                        ForEach(model.dayGroups) { group in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(group.dateLabel)
                                        .font(.custom(PosterTokens.Font.dmSerifItalic, size: 28))
                                        .foregroundColor(PosterTokens.Color.paper)
                                    Spacer()
                                    Text("\(RubleFormatter.format(cents: group.sumCents)) ₽")
                                        .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                                        .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                                }
                                ForEach(group.rows) { tx in
                                    TxRow(
                                        tx: tx,
                                        category: model.categories.first { $0.id == tx.categoryId },
                                        account: model.accounts.first { $0.id == tx.accountId }
                                    )
                                    .onTapGesture { editingTx = tx }
                                    .swipeActions(edge: .trailing) {
                                        Button(role: .destructive) {
                                            pendingDeleteTx = tx
                                        } label: {
                                            Label("Удалить", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.top, 56)
                .padding(.bottom, 90)
            }
        }

        private var headerRow: some View {
            HStack {
                if let r = router, r.canPop {
                    Button(action: { r.pop() }) {
                        Text("← НАЗАД")
                            .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                            .kerning(11 * 0.14)
                            .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
                    }.buttonStyle(.plain)
                }
                Eyebrow("SECTION II", opacity: 0.65)
                Spacer()
            }
        }

        private var chipBar: some View {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(TransactionFilterChip.allCases, id: \.self) { chip in
                        Button(action: { model.chip = chip }) {
                            Text(chip.label.uppercased())
                                .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                                .kerning(11 * 0.14)
                                .padding(.vertical, 8).padding(.horizontal, 14)
                                .background(model.chip == chip ? PosterTokens.Color.paper : PosterTokens.Color.paper.opacity(0.12))
                                .foregroundColor(model.chip == chip ? PosterTokens.Color.cobalt : PosterTokens.Color.paper)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }

        private var emptyState: some View {
            VStack(alignment: .leading, spacing: 12) {
                Mass("Реестр пуст —", italic: true, size: 36)
                    .foregroundColor(PosterTokens.Color.paper)
                Text("добавьте первую трату через FAB")
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
            }
            .padding(.top, 32)
        }
    }

    private struct TxRow: View {
        let tx: ActualV10DTO
        let category: CategoryV10DTO?
        let account: AccountDTO?

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Text(V10Formatters.formatTimeHM(tx.createdAt ?? tx.txDate))
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                    .frame(width: 44, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(tx.description ?? category?.name ?? "—")
                            .font(.custom(PosterTokens.Font.manrope, size: 16))
                            .foregroundColor(PosterTokens.Color.paper)
                        if let tag = TransactionsData.tagFor(tx) {
                            switch tag {
                            case .roundup: TagPlate(text: "↻ ОКРУГЛ.", bg: PosterTokens.Color.yellow, fg: PosterTokens.Color.ink)
                            case .deposit: TagPlate(text: "→ КОПИЛКА", bg: PosterTokens.Color.paper, fg: PosterTokens.Color.cobalt)
                            }
                        }
                    }
                    if let cat = category, let acc = account {
                        Text("\(cat.name) · \(acc.bank.uppercased())\(acc.mask.map { " " + $0 } ?? "")")
                            .font(.custom(PosterTokens.Font.jetBrainsMono, size: 10))
                            .foregroundColor(PosterTokens.Color.paper.opacity(0.5))
                    }
                }
                Spacer()
                Text(TransactionsData.formatTxAmount(tx.amountCents))
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 14))
                    .foregroundColor(tx.amountCents >= 0 ? PosterTokens.Color.yellow : PosterTokens.Color.paper)
            }
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
    }

    private struct TagPlate: View {
        let text: String
        let bg: Color
        let fg: Color
        var body: some View {
            Text(text)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 9))
                .kerning(9 * 0.14)
                .padding(.vertical, 2).padding(.horizontal, 5)
                .background(bg).foregroundColor(fg)
        }
    }

    private struct LoadingPlate: View {
        var body: some View {
            VStack { Spacer(); ProgressView().tint(PosterTokens.Color.paper); Spacer() }
        }
    }

    private struct ErrorPlate: View {
        let message: String
        let onRetry: () -> Void
        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                Spacer()
                Eyebrow("ОШИБКА", opacity: 0.65)
                Mass(message, italic: false, size: 28).foregroundColor(PosterTokens.Color.paper)
                Button("ПОВТОРИТЬ", action: onRetry)
                    .foregroundColor(PosterTokens.Color.cobalt)
                    .padding(.vertical, 14).padding(.horizontal, 22)
                    .background(PosterTokens.Color.paper)
                Spacer()
            }
            .padding(.horizontal, PosterTokens.Space.s22)
        }
    }

    private struct EditPlaceholderSheet: View {
        let tx: ActualV10DTO?
        let onClose: () -> Void
        var body: some View {
            ZStack {
                PosterTokens.Color.paper.ignoresSafeArea()
                VStack(alignment: .leading, spacing: 14) {
                    Eyebrow("РЕДАКТИРОВАТЬ · #\(tx?.id ?? 0)", opacity: 0.7)
                    Mass("Editor —", italic: true, size: 36).foregroundColor(PosterTokens.Color.ink)
                    Text("WIP — TransactionEditor poster retrofit shipped in Phase 26.")
                        .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
                    Spacer()
                    Button("ЗАКРЫТЬ", action: onClose)
                        .foregroundColor(PosterTokens.Color.paper)
                        .padding(.vertical, 14).frame(maxWidth: .infinity)
                        .background(PosterTokens.Color.ink)
                }
                .padding(.horizontal, 22).padding(.top, 56)
            }
        }
    }

    extension TransactionFilterChip {
        var label: String {
            switch self {
            case .all: return "Все"
            case .cafe: return "Кафе"
            case .food: return "Продукты"
            case .transit: return "Транспорт"
            case .subs: return "Подписки"
            case .savings: return "Копилка"
            }
        }
    }
    ```

    2. Modify `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift`:
       - Replace the `TransactionsViewPlaceholderView` body with a single line returning `TransactionsV10View()`:
         ```swift
         struct TransactionsViewPlaceholderView: View {
             // Phase 25-09: superseded — now renders the real TransactionsV10View.
             var body: some View { TransactionsV10View() }
         }
         ```
       - Keep the type name `TransactionsViewPlaceholderView` so HomeV10View's existing `router?.push(TransactionsViewPlaceholderView())` callsite continues to work without modification (zero-touch swap).
       - Add header comment noting the supersession.

    3. **Verify PosterTokens.Font.dmSerifItalic exists** — grep `dmSerifItalic\|dmSerif` in `PosterTokens.swift`. If named differently (e.g. `dmSerifDisplay`), use the actual name. If absent (cyrillic fallback per ADR-001), use `ptSerifItalic` instead.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - File `TransactionsV10View.swift` exists; iOS build succeeds.
    - `grep -c "↻ ОКРУГЛ.\|→ КОПИЛКА" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift` ≥ 2.
    - `grep -c "Все\|Кафе\|Продукты\|Транспорт\|Подписки\|Копилка" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift` ≥ 6.
    - `grep -c "TransactionsV10View" ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` ≥ 1 (swap-in confirmed).
    - `grep -c "swipeActions\|posterSheet\|confirmationDialog" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift` ≥ 3.
  </acceptance_criteria>
  <done>iOS Transactions screen renders all TXN-V10-01..05 elements; HomePlaceholders swap is zero-touch (HomeV10View still pushes TransactionsViewPlaceholderView() but that now resolves to the real view); build clean.</done>
</task>

</tasks>

<verification>
1. `make build` succeeds.
2. `xcodebuild test -only-testing:BudgetPlannerTests/TransactionsDataTests` passes.
3. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` still passes.
4. `grep -c "TransactionsV10View" ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` ≥ 1 (swap-in).
5. `grep -c "swipeActions" ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift` ≥ 1 (TXN-V10-05 swipe-delete).
</verification>

<success_criteria>
- TXN-V10-01: cobalt bg + Mass italic «Реестр.» + eyebrow header on iOS.
- TXN-V10-02: 6 filter chips functional (single-select via @State).
- TXN-V10-03: day-grouped sections with DM Serif italic 28px headers + day-sum.
- TXN-V10-04: rows with U+2212 negatives + roundup/deposit inline plates.
- TXN-V10-05: row tap → edit sheet stub via PosterSheet; swipe-left → confirmationDialog → ActualAPI.delete.
- HomeV10View «ВСЕ ОПЕРАЦИИ →» (which pushes TransactionsViewPlaceholderView) now lands on the real iOS Transactions screen.
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-09-ios-transactions-SUMMARY.md` documenting:
- DTO-to-row layout decisions.
- Edit sheet strategy (stub now → real Phase 26).
- Swipe-delete UX (confirmationDialog gate).
- DM Serif vs PT Serif fallback for day-group headers (cyrillic per ADR-001).
- Stagger animation choice for rows (or omitted if SwiftUI swipeActions interferes).
</output>
</content>
</invoke>