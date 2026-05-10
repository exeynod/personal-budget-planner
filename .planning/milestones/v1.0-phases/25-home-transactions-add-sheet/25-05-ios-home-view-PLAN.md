---
phase: 25-home-transactions-add-sheet
plan: 5
type: execute
wave: 3
depends_on: [3]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift
  - ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift
autonomous: true
requirements:
  - HOME-V10-01
  - HOME-V10-02
  - HOME-V10-03
  - HOME-V10-04
  - HOME-V10-05
  - HOME-V10-06

must_haves:
  truths:
    - "iOS HomeView (coral bg) renders eyebrow VOL.NN/MONTH YYYY · N ДНЕЙ + italic Дневной темп — + BigFig with count-up symmetric to web."
    - "Wallet link tappable + plan-bar tappable + category rows tappable; pushes via PosterRouter from environment."
    - "Category list filtered (code != 'savings' AND paused = false), sorted by act/plan DESC, plan_cents DESC; staggered animation per posterRowIn delay = 0.08 + i*0.045s."
    - "OVER plate visible when act > plan."
    - "V10Formatters module mirrors web format.ts: formatDay / formatTimeHM / formatPeriodEyebrow / pluralDays."
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift"
      provides: "Static formatters mirror of web format.ts"
      min_lines: 70
    - path: "ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift"
      provides: "SwiftUI HomeView component"
      min_lines: 140
    - path: "ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift"
      provides: "@Observable @MainActor model fetching /me + /accounts + /categories + /actual"
      min_lines: 90
    - path: "ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift"
      provides: "Pure compute helpers (Swift) + CategoryAggregateRow struct"
      min_lines: 80
  key_links:
    - from: "HomeViewModel"
      to: "AccountsAPI / CategoriesV10API / ActualV10API / PeriodsAPI (existing)"
      via: "async let parallel fetches"
      pattern: "async let .*= AccountsAPI.list|CategoriesV10API.list|ActualV10API.list"
    - from: "HomeView"
      to: "PosterRouter via @Environment(\\.posterRouter)"
      via: "router.push(...) on tap gestures"
      pattern: "@Environment\\(\\.posterRouter\\)"
    - from: "HomeView category row"
      to: "PosterAnimations.posterRowIn / posterBarFill (from Phase 23-06)"
      via: "modifier(...) with staggered delay"
      pattern: "delay.*0.08.*0.045"
---

<objective>
Build iOS HomeView covering HOME-V10-01..06 — symmetric to web Plan 25-04. Coral hero, count-up daily pace, wallet link, plan bar, sorted category list with stagger, OVER plate, push routes.

Purpose: deliver V10 entry-point screen on iOS; enables iOS wiring in Plan 25-10.
Output: V10Formatters helpers + HomeView + HomeViewModel + HomeData pure helpers + placeholders + 1 XCTest file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift
@ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift
@ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift
@ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
@ios/BudgetPlanner/FeaturesV10/Common/Plate.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/RubleFormatter.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift

<interfaces>
<!-- Wave 1 + 2 outputs that this plan consumes. -->

From Plan 25-03 iOS:
```swift
struct AccountDTO: Decodable, Identifiable, Equatable {
    let id: Int; let bank: String; let mask: String?; let kind: AccountKind
    let balanceCents: Int; let primary: Bool; let createdAt: Date?
}
struct CategoryV10DTO: Decodable, Identifiable, Equatable {
    let id: Int; let name: String; let kind: CategoryKind; let code: String?
    let isArchived: Bool; let sortOrder: Int; let planCents: Int
    let rollover: CategoryRollover; let paused: Bool; let parentId: Int?
    let ord: Int; let createdAt: Date?
}
struct ActualV10DTO: Decodable, Identifiable, Equatable {
    let id: Int; let periodId: Int; let kind: ActualKindV10
    let amountCents: Int; let description: String?; let categoryId: Int
    let txDate: Date; let source: ActualSource; let createdAt: Date?
    let accountId: Int?; let parentTxnId: Int?
}
enum ActualKindV10: String, Decodable { case expense, income, roundup, deposit }
enum AccountsAPI { static func list() async throws -> [AccountDTO] }
enum CategoriesV10API { static func list(includeArchived: Bool = false) async throws -> [CategoryV10DTO] }
enum ActualV10API {
    static func list(periodId: Int, kind: ActualKindV10? = nil, categoryId: Int? = nil) async throws -> [ActualV10DTO]
    static func create(_ request: ActualCreateRequest) async throws -> ActualV10DTO
}
```

From existing PeriodsAPI (v0.x):
```swift
enum PeriodsAPI {
    static func current() async throws -> PeriodDTO?  // 404 → nil
}
struct PeriodDTO: Decodable, Identifiable {
    let id: Int; let periodStart: Date; let periodEnd: Date; ...
}
```

From PosterTokens:
```swift
PosterTokens.Color.coral / .paper / .yellow / .ink / .black / .cobalt
```

PosterRouter (Phase 23):
```swift
@MainActor @Observable final class PosterRouter {
    func push(_ view: some View)
    func pop()
}
@Environment(\.posterRouter) var router  // optional
```

PosterAnimations (Phase 23-06): provides `.posterRowIn`, `.posterBarFill`, etc. Read PosterAnimations.swift to confirm exact API.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API responses → HomeView state | Server-validated; trust after Phase 11 RLS gate |
| Tap gesture → router.push | local dispatch, no untrusted input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-05-01 | Information Disclosure | Showing system 'savings' category in user-facing list | mitigate | Filter `cat.code != "savings" && !cat.paused` in computeCategoryAggregates. Asserted in HomeDataTests. |
| T-25-05-02 | Tampering | Negative dailyPace from future tx_date | mitigate | `max(0, ...)` clamp in computeDailyPace; covered by tests. |
| T-25-05-03 | Denial of Service | Concurrent reload on rapid tab switching | mitigate | inFlight guard in HomeViewModel.reload (mirror OnboardingMountModel pattern). |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: V10Formatters + HomeData (pure compute) + tests</name>
  <files>ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift, ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift, ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift</files>
  <behavior>
    V10Formatters static struct:
    - V10Formatters.formatDay(date: Date, today: Date, calendar: Calendar = .current) → String. Same rules as web formatDay: «Сегодня» / «Вчера» / «N {month_genitive_ru}».
    - V10Formatters.formatTimeHM(date: Date, calendar: Calendar = .current) → "HH:mm" zero-padded.
    - V10Formatters.formatPeriodEyebrow(date: Date, calendar: Calendar = .current) → "VOL.NN / MONTH YYYY · X ДЕНЬ/ДНЯ/ДНЕЙ".
    - V10Formatters.pluralDays(_ n: Int) → "ДЕНЬ" | "ДНЯ" | "ДНЕЙ".
    - Constants: monthsEn = ["JAN","FEB",...,"DEC"]; monthsRuGenitive = ["января",...,"декабря"].

    HomeData:
    - struct CategoryAggregateRow { let id: Int; let name: String; let code: String?; let ord: Int; let planCents: Int; let factCents: Int; let ratio: Double; let isOver: Bool }
    - HomeData.computeDailyPace(planTotalCents:Int, factTotalExpenseCents:Int, daysLeft:Int) → Int. Formula: max(0, (plan - fact) / max(1, daysLeft)).
    - HomeData.computeSurplus(planTotalCents:Int, factTotalExpenseCents:Int) → Int (signed).
    - HomeData.computeWalletTotal(_ accounts: [AccountDTO]) → Int.
    - HomeData.computeCategoryAggregates(categories: [CategoryV10DTO], actuals: [ActualV10DTO]) → [CategoryAggregateRow]. Filter: code != "savings" && !paused. Per-cat fact = sum of actuals where categoryId == cat.id && kind == .expense.
    - HomeData.sortForHome(_ rows: [CategoryAggregateRow]) → [CategoryAggregateRow]. Primary ratio DESC, secondary planCents DESC.
    - HomeData.planTotal(_ filtered: [CategoryV10DTO]) → Int (sum planCents).

    Tests in HomeDataTests cover same scenarios as web Plan 25-04 Task 1 (mirror coverage).
  </behavior>
  <action>
    1. Read existing `RubleFormatter.swift` and `PluralRu.swift` for ru-RU pluralisation patterns; reuse if `pluralDays` exists, else extend.

    2. Implement `V10Formatters.swift` as plain enum-with-static-funcs:
       ```swift
       enum V10Formatters {
           static let monthsEn = ["JAN","FEB",...]
           static let monthsRuGenitive = ["января",...]
           static func pluralDays(_ n: Int) -> String { /* mod10/100 rules */ }
           static func formatDay(_ date: Date, today: Date, calendar: Calendar = .current) -> String { ... }
           static func formatTimeHM(_ date: Date, calendar: Calendar = .current) -> String { ... }
           static func formatPeriodEyebrow(_ date: Date, calendar: Calendar = .current) -> String { ... }
       }
       ```

    3. Implement `HomeData.swift`:
       ```swift
       struct CategoryAggregateRow: Identifiable, Equatable { ... }
       enum HomeData {
           static func computeDailyPace(...) -> Int
           static func computeSurplus(...) -> Int
           static func computeWalletTotal(_ accounts: [AccountDTO]) -> Int
           static func computeCategoryAggregates(categories: [CategoryV10DTO], actuals: [ActualV10DTO]) -> [CategoryAggregateRow]
           static func sortForHome(_ rows: [CategoryAggregateRow]) -> [CategoryAggregateRow]
           static func planTotal(_ filtered: [CategoryV10DTO]) -> Int
       }
       ```

    4. Tests in XCTest: mirror web cases (empty, paused, savings filter, sort tie-break, ratio = +inf when planCents = 0 && factCents > 0).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:BudgetPlannerTests/HomeDataTests 2>&1 | tail -20</automated>
  </verify>
  <done>All HomeDataTests + V10FormattersTests pass; pure functions stable for HomeView consumption.</done>
</task>

<task type="auto">
  <name>Task 2: HomeViewModel (data loader) + HomePlaceholders</name>
  <files>ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift, ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift</files>
  <action>
    Create `HomeViewModel.swift`:
    ```swift
    @MainActor
    @Observable
    final class HomeViewModel {
        enum Status { case idle, loading, ready, error(String) }
        private(set) var status: Status = .idle
        private(set) var eyebrow: String = ""
        private(set) var dailyPaceCents: Int = 0
        private(set) var daysLeft: Int = 0
        private(set) var walletCents: Int = 0
        private(set) var surplusCents: Int = 0
        private(set) var categoryRows: [CategoryAggregateRow] = []
        private var inFlight = false

        func load() async {
            if inFlight { return }
            inFlight = true; defer { inFlight = false }
            status = .loading
            do {
                async let accounts = AccountsAPI.list()
                async let categories = CategoriesV10API.list()
                async let period = PeriodsAPI.current()
                let (accs, cats, per) = try await (accounts, categories, period)
                let acts: [ActualV10DTO]
                if let pid = per?.id { acts = try await ActualV10API.list(periodId: pid) }
                else { acts = [] }
                // compute via HomeData
                let now = Date()
                let aggregates = HomeData.sortForHome(HomeData.computeCategoryAggregates(categories: cats, actuals: acts))
                let filtered = cats.filter { $0.code != "savings" && !$0.paused }
                let plan = HomeData.planTotal(filtered)
                let fact = aggregates.reduce(0) { $0 + $1.factCents }
                // daysLeft from period.periodEnd OR from end-of-month
                let cal = Calendar.current
                let end = per?.periodEnd ?? cal.endOfMonth(for: now)
                self.daysLeft = max(0, cal.dateComponents([.day], from: now, to: end).day ?? 0) + 1  // include today
                self.dailyPaceCents = HomeData.computeDailyPace(planTotalCents: plan, factTotalExpenseCents: fact, daysLeft: daysLeft)
                self.surplusCents = HomeData.computeSurplus(planTotalCents: plan, factTotalExpenseCents: fact)
                self.walletCents = HomeData.computeWalletTotal(accs)
                self.eyebrow = V10Formatters.formatPeriodEyebrow(now)
                self.categoryRows = aggregates
                self.status = .ready
            } catch {
                self.status = .error("не удалось загрузить главный экран")
            }
        }
    }
    ```

    Add Calendar.endOfMonth helper inline OR in V10Formatters.

    Create `HomePlaceholders.swift` with simple SwiftUI Views for push routes (until Phase 26/27 lands real screens):
    ```swift
    struct AccountsListPlaceholderView: View { var body: some View { ... «WIP — Accounts list (Phase 27)» ... } }
    struct PlanViewPlaceholderView: View { ... «WIP — PLAN мая (Phase 26)» }
    struct CategoryDetailPlaceholderView: View { let categoryId: Int; var body: some View { ... } }
    struct TransactionsViewPlaceholderView: View { ... «WIP — Transactions (Plan 25-07)» }   // replaced in 25-07
    ```
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -10</automated>
  </verify>
  <done>iOS build clean; ViewModel compiles; placeholders compile.</done>
</task>

<task type="auto">
  <name>Task 3: HomeView SwiftUI component</name>
  <files>ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift</files>
  <action>
    Create `HomeView.swift` rendering same elements as web HomeView (Plan 25-04 Task 2). Layout per prototype/poster-screens.jsx PosterHome lines 202-299. Use:
    - `PosterTokens.Color.coral.ignoresSafeArea()` for background.
    - `Eyebrow("VOL.NN / MAY YYYY · N ДНЕЙ", opacity: 0.7)` from FeaturesV10/Common/Eyebrow.swift.
    - `Mass("Дневной темп —", italic: true, size: 28)` opacity 0.75 paper.
    - `BigFig(value: model.dailyPaceCents, sup: "₽", size: 88, color: .paper)` — count-up via existing component.
    - Wallet link: HStack mono small text + tappable «X ₽ →» with dashed underline (use `.overlay` with .bottom alignment + `Rectangle().frame(height:1).stroke(...)` or custom `.background(GeometryReader{...})` for dashed effect; or simpler: keep solid 1px alpha for v1.0 dev — match prototype as close as possible).
    - Plan-bar: HStack on rgba(0,0,0,0.22) overlay; `.onTapGesture { router?.push(PlanViewPlaceholderView()) }`.
    - КАТЕГОРИИ section header + ВСЕ ОПЕРАЦИИ → tappable.
    - ForEach(model.categoryRows.indices) — apply `.posterRowIn(delay: 0.08 + Double(i)*0.045)` modifier (from PosterAnimations.swift) + bar with `.posterBarFill(...)`. Read PosterAnimations to confirm modifier name; if not present, use inline `.transition(.opacity.combined(with: .offset(y:8)))` + `.animation(.easeOut(duration:0.45).delay(...), value: ...)`.
    - For each row: HStack of ord (mono) + name (bold uppercase) + (OVER plate if isOver) + pct mono + chevron.
    - Below row name: bar 3px, GeometryReader to compute width = ratio*100% min 100%. Color = paper (normal) or yellow (isOver). For isOver: add 1px-tall plan-position tick.
    - Below bar: «{factCents}₽ ... из {planCents}» mono small.

    Bind model load on `.task { await model.load() }`. Show:
    - `.idle/.loading` → progress ring.
    - `.error(msg)` → ErrorPlate with retry button.
    - `.ready` → main content (described above).

    Tap routing:
    ```swift
    @Environment(\.posterRouter) private var router
    // Wallet link: router?.push(AccountsListPlaceholderView())
    // Plan bar: router?.push(PlanViewPlaceholderView())
    // Row tap: router?.push(CategoryDetailPlaceholderView(categoryId: row.id))
    // ВСЕ ОПЕРАЦИИ: router?.push(TransactionsViewPlaceholderView())  -> replaced in 25-09 wiring
    ```

    Add `#Preview("HomeView · ready")` with seeded mock data.

    DO NOT modify V10MainShell.swift here — Plan 25-10 wires HomeView into the shell.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -15</automated>
  </verify>
  <done>iOS make build clean; #Preview renders without errors; ready state shows all elements per prototype.</done>
</task>

</tasks>

<verification>
1. `make build` succeeds.
2. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` passes.
3. `grep -c "code != \"savings\"\|paused" ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift` ≥ 1.
4. `grep -c "router?.push\|posterRouter" ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift` ≥ 4 (4 push routes).
</verification>

<success_criteria>
- HomeView renders all 6 HOME-V10-* requirements symmetric to web.
- HomeData pure compute helpers tested.
- Push routes wired through PosterRouter environment.
- v0.6 features untouched; V10MainShell.swift not modified yet (Plan 25-10 wires it).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-05-ios-home-view-SUMMARY.md` with: SwiftUI patterns chosen for dashed underline + bar + stagger; deviations from web (e.g. font fallback, safe area).
</output>
