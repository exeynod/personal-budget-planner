// Phase 59-01 — ViewModel migrated to V10 surface (ActualV10DTO + CategoryV10DTO).
// The View body below references the old types and will not compile until
// Plan 59-02 rewrites the body. Build broken on `main` is acceptable WITHIN
// this plan's commit boundary because plan 59-02 is the immediate next wave
// and lands atomically (ROADMAP.md Phase 59 single-feature delivery).
//
// Data layer:
//   - Actuals: ActualV10API.list → [ActualV10DTO] (4-valued ActualKindV10).
//   - Categories: CategoriesV10API.list → [CategoryV10DTO] (own kind reuses
//     CommonDTO.CategoryKind — 2-valued; backend schema not yet widened).
//   - Planned: PlannedAPI.list → [PlannedDTO] stays legacy (D-01 — no
//     PlannedV10API exists; backend not yet outlined).
//   - Delete: ActualAPI.delete (shared route, used by V10 too) + PlannedAPI.delete.
//
// Threat-model mitigations:
//   - T-59-02 (Tampering / Concurrency): `inFlight` guard at top of load()
//     and deleteActual()/deletePlanned() — re-entrant calls become no-ops.
//   - T-59-03 (Information Disclosure): catch blocks NEVER surface
//     raw `error` description text to user-visible state. Fixed Russian copy
//     ("не удалось загрузить транзакции" / "не удалось удалить операцию").
//     Full error printed to console for Xcode debugging.
//
// Notification observer (DEBT-02 pattern from V10): on init() subscribe to
// `.txnCreated`, on deinit removeObserver. Triggered by AddSheetViewModel
// after successful POST /actual so the registry reflects the new row.

import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class TransactionsViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case error(String)
    }

    private(set) var state: LoadState = .idle
    var period: PeriodDTO?
    var actuals: [ActualV10DTO] = []
    var planned: [PlannedDTO] = []
    var categories: [CategoryV10DTO] = []

    var subTab: TxSubTab = .history
    /// 2-valued segment driver (Расходы / Доходы). The synthetic «Сбережения»
    /// 3rd segment is encoded via `savingsSegmentSelected` — when true, the
    /// kind segment is conceptually overridden to «Savings» and the filter
    /// switches to `.roundup | .deposit` rows.
    var kind: CategoryKind = .expense
    /// Synthetic 3rd UI segment («Сбережения»). Only meaningful in the
    /// `.history` subtab — in `.plan` it forces empty result per D-02.
    var savingsSegmentSelected: Bool = false
    var categoryFilter: Int?

    /// Banner-style transient error from a failed delete attempt (T-59-02).
    /// Keep delete failures separate from the page-level `state` machine —
    /// replacing `state` with `.error` after a failed delete would render a
    /// fullscreen error and lose the existing list. Pattern mirrors
    /// `TransactionsV10ViewModel.deleteError` (Phase 25-09 WR-25-09).
    var deleteError: String? = nil

    /// Calendar used for day grouping. `Europe/Moscow` per project convention
    /// (cycle TZ in CLAUDE.md). Stored so previews / tests can inject a
    /// fixed-TZ calendar without mutating the singleton.
    @ObservationIgnored
    var calendar: Calendar = TransactionsViewModel.defaultCalendar()

    /// Concurrency guard (T-59-02 mitigation). Re-entrant `load()` / delete
    /// calls become no-ops while a request is in flight. Mirrors
    /// `TransactionsV10ViewModel.inFlight` (Phase 25-09 T-25-09-03).
    @ObservationIgnored
    private var inFlight: Bool = false

    @ObservationIgnored
    private var txnCreatedObserver: NSObjectProtocol?

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    // MARK: - Observer lifecycle (DEBT-02 pattern)

    init() {
        self.txnCreatedObserver = NotificationCenter.default.addObserver(
            forName: .txnCreated,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.load()
            }
        }
    }

    deinit {
        if let observer = txnCreatedObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Load (T-59-02 mitigation)

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        state = .loading

        do {
            // Period may legitimately 404 mid-onboarding; wrap inline since
            // `async let` variables cannot be passed to helper funcs in
            // current Swift concurrency. Mirrors HomeV10ViewModel pattern.
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }

            // Categories load regardless of period existence — they drive
            // the filter Menu even on an empty period.
            let cats = try await CategoriesV10API.list()

            // Actuals + Planned depend on a period — fetch only if we
            // resolved one. Parallel via async let.
            let acts: [ActualV10DTO]
            let plans: [PlannedDTO]
            if let pid = per?.id {
                async let actualsTask = ActualV10API.list(periodId: pid)
                async let plannedTask = PlannedAPI.list(periodId: pid)
                acts = try await actualsTask
                plans = try await plannedTask
            } else {
                acts = []
                plans = []
            }

            self.period = per
            self.categories = cats.filter { !$0.isArchived }
            self.actuals = acts.sorted { lhs, rhs in
                // Newest first regardless of grouping — within-day sort key
                // is `createdAt ?? txDate` DESC (mirrors V10 pattern).
                let l = lhs.createdAt ?? lhs.txDate
                let r = rhs.createdAt ?? rhs.txDate
                return l > r
            }
            self.planned = plans.sorted { $0.id < $1.id }
            self.state = .loaded
        } catch {
            // T-59-03 mitigation — fixed Russian copy, no raw error
            // description leak to user-visible state. Full error to Xcode
            // console only via print().
            print("[TransactionsViewModel] load failed: \(error)")
            self.state = .error("не удалось загрузить транзакции")
        }
    }

    // MARK: - Filtering (D-02 — 3-segment kind UI)

    func category(_ id: Int) -> CategoryV10DTO? {
        categories.first { $0.id == id }
    }

    /// Map an actual's 4-valued kind to a 2-valued UI bucket.
    /// `.expense` and `.roundup` → `.expense` (roundup visible in Расходы).
    /// `.income` → `.income`.
    /// `.deposit` → `.income` (safety bucket; normally filtered out when
    ///   `savingsSegmentSelected == false`).
    private func bucketKind(_ k: ActualKindV10) -> CategoryKind {
        switch k {
        case .expense, .roundup: return .expense
        case .income, .deposit: return .income
        }
    }

    var filteredActuals: [ActualV10DTO] {
        if savingsSegmentSelected && subTab == .history {
            return actuals.filter { a in
                (a.kind == .roundup || a.kind == .deposit)
                    && (categoryFilter == nil || a.categoryId == categoryFilter)
            }
        }
        return actuals.filter { a in
            // Exclude deposit from Расходы / Доходы — it only appears under
            // «Сбережения». Roundup stays bucketed into expense per D-02.
            if a.kind == .deposit { return false }
            return bucketKind(a.kind) == self.kind
                && (categoryFilter == nil || a.categoryId == categoryFilter)
        }
    }

    var filteredPlanned: [PlannedDTO] {
        // D-02: «Сбережения» in History + switching to План → empty/fallback.
        if savingsSegmentSelected && subTab == .plan { return [] }
        return planned.filter { p in
            p.kind == kind
                && (categoryFilter == nil || p.categoryId == categoryFilter)
        }
    }

    var visibleCategories: [CategoryV10DTO] {
        if subTab == .history && savingsSegmentSelected {
            let used = Set(
                actuals
                    .filter { $0.kind == .roundup || $0.kind == .deposit }
                    .map(\.categoryId)
            )
            return categories.filter { used.contains($0.id) }
        }
        if subTab == .history {
            let used = Set(
                actuals
                    .filter { $0.kind != .deposit && bucketKind($0.kind) == self.kind }
                    .map(\.categoryId)
            )
            return categories.filter { $0.kind == self.kind && used.contains($0.id) }
        }
        // .plan
        let used = Set(planned.filter { $0.kind == self.kind }.map(\.categoryId))
        return categories.filter { $0.kind == self.kind && used.contains($0.id) }
    }

    /// Day grouping via shared V10 helper (reuse — TransactionsData lives in
    /// the same BudgetPlanner module). Calendar TZ = Europe/Moscow.
    var dayGroups: [TxDayGroup] {
        TransactionsData.groupByDay(filteredActuals, today: Date(), calendar: calendar)
    }

    // MARK: - Delete (T-59-02 + T-59-03)

    func deleteActual(id: Int) async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        do {
            try await ActualAPI.delete(id: id)
            self.deleteError = nil
            // Release the guard before full reload so load() can proceed.
            inFlight = false
            await load()
        } catch {
            print("[TransactionsViewModel] deleteActual failed: \(error)")
            self.deleteError = "не удалось удалить операцию"
        }
    }

    func deletePlanned(id: Int) async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        do {
            try await PlannedAPI.delete(id: id)
            self.deleteError = nil
            inFlight = false
            await load()
        } catch {
            print("[TransactionsViewModel] deletePlanned failed: \(error)")
            self.deleteError = "не удалось удалить операцию"
        }
    }

    func clearDeleteError() {
        self.deleteError = nil
    }
}

enum TxSubTab: String, CaseIterable, Identifiable {
    case history = "История"
    case plan = "План"
    var id: String { rawValue }
}

/// Transactions screen — native iOS 26 layout.
///   - NavigationStack + large title "Транзакции"
///   - .toolbar Picker для подтаба История/План + Menu для фильтра категории
///   - Расходы/Доходы — segmented Picker в Section
///   - History → List(.insetGrouped) с Section per-day
///   - Plans → List(.insetGrouped) с Section per-category
///   - swipeActions для delete + tap row → editor sheet
struct TransactionsView: View {
    @State private var viewModel = TransactionsViewModel()

    var body: some View {
        // Phase 59-01 — UI rebuild handed off to Plan 59-02. The placeholder
        // body below keeps the file parseable Swift against the new V10
        // ViewModel surface (filteredActuals/visibleCategories/dayGroups +
        // ActualV10DTO / CategoryV10DTO types) without re-wiring the full
        // 3-segment kind picker, swipe-to-delete, confirmationDialog,
        // editor sheets and per-day sections — those land in 59-02 as a
        // single atomic UI rewrite.
        NavigationStack {
            content
                .navigationTitle("Транзакции")
        }
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle, .loading:
            ProgressView().controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .error(let msg):
            ContentUnavailableView {
                Label("Не удалось загрузить", systemImage: "exclamationmark.triangle")
            } description: {
                Text(msg)
            } actions: {
                Button("Повторить") { Task { await viewModel.load() } }
                    .buttonStyle(.borderedProminent)
            }
        case .loaded:
            // Placeholder list — full 3-segment picker / per-day sections /
            // swipe-to-delete / category filter Menu / editor sheets land
            // in Plan 59-02.
            List {
                if let err = viewModel.deleteError {
                    Section {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text(err).font(.callout)
                            Spacer()
                            Button("Скрыть") { viewModel.clearDeleteError() }
                                .buttonStyle(.borderless)
                        }
                    }
                }
                if viewModel.subTab == .history {
                    historyPlaceholder
                } else {
                    plannedPlaceholder
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await viewModel.load() }
        }
    }

    @ViewBuilder
    private var historyPlaceholder: some View {
        let groups = viewModel.dayGroups
        if groups.isEmpty {
            Section {
                ContentUnavailableView(
                    "Пусто",
                    systemImage: "tray",
                    description: Text("UI rebuild in Plan 59-02")
                )
                .listRowBackground(Color.clear)
            }
        } else {
            ForEach(groups) { group in
                Section(header: Text(group.dateLabel)) {
                    ForEach(group.rows) { row in
                        Text(row.description ?? viewModel.category(row.categoryId)?.name ?? "—")
                            .font(.callout)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var plannedPlaceholder: some View {
        let plans = viewModel.filteredPlanned
        if plans.isEmpty {
            Section {
                ContentUnavailableView(
                    "Пусто",
                    systemImage: "tray",
                    description: Text("UI rebuild in Plan 59-02")
                )
                .listRowBackground(Color.clear)
            }
        } else {
            ForEach(plans) { p in
                Text(p.description ?? viewModel.category(p.categoryId)?.name ?? "—")
                    .font(.callout)
            }
        }
    }
}
