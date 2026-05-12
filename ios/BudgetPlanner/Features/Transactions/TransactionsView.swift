// Phase 59-01 — ViewModel migrated to V10 surface (ActualV10DTO + CategoryV10DTO).
// Phase 59-02 — View body rewritten against the V10 ViewModel surface
// (subtabs in toolbar(.principal), 3-segment kind picker in first Section,
// category filter Menu in toolbar(.topBarTrailing), ActualV10DTO rows with
// roundup mini-icon, tap-to-edit bridge to legacy TransactionEditor).
// NOTE on field naming: 59-01 SUMMARY documents `state` is the kept name;
// the field is renamed to `status` in 59-02 per Plan 59-02 <interfaces>
// (line 86) to align with `TransactionsV10ViewModel.status`.
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

    private(set) var status: LoadState = .idle
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
    /// Keep delete failures separate from the page-level `status` machine —
    /// replacing `status` with `.error` after a failed delete would render a
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

        status = .loading

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
            self.status = .loaded
        } catch {
            // T-59-03 mitigation — fixed Russian copy, no raw error
            // description leak to user-visible state. Full error to Xcode
            // console only via print().
            print("[TransactionsViewModel] load failed: \(error)")
            self.status = .error("не удалось загрузить транзакции")
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

/// Transactions screen — native iOS 26 layout (Phase 59-02 rewrite).
///   - NavigationStack + large title «Транзакции»
///   - Subtabs (История / План) — segmented Picker в .toolbar(.principal)
///   - Kind picker (Расходы / Доходы / Сбережения) — segmented Picker в
///     header первой Section. В План — 2-segment (без «Сбережения»).
///   - Category filter — Menu в .toolbar(.topBarTrailing) с иконкой
///     `line.3.horizontal.decrease.circle` (filled при активном фильтре).
///   - History → List(.insetGrouped) с Section per-day (день + сумма).
///   - Plans → List(.insetGrouped) с Section per-category.
///   - Tap row → editor sheet (bridge через `legacyActualDTO(from:)`
///     для совместимости с TransactionEditor; roundup/deposit — display-only).
///   - swipe-to-delete + confirmationDialog + banner — лендит в 59-03.
///   - Persistence отсутствует (D-03): subTab=.history, kind=.expense,
///     savingsSegmentSelected=false, categoryFilter=nil при cold start.
struct TransactionsView: View {
    @State private var viewModel = TransactionsViewModel()
    @State private var legacyEditingActual: ActualDTO?
    @State private var editingPlanned: PlannedDTO?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Транзакции")
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        subTabPicker
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        categoryFilterMenu
                    }
                }
        }
        .task { await viewModel.load() }
        .sheet(item: $legacyEditingActual) { legacyActual in
            TransactionEditor(
                mode: .editActual(legacyActual),
                categories: legacyCategories,
                onSaved: { await viewModel.load() }
            )
        }
        .sheet(item: $editingPlanned) { plan in
            TransactionEditor(
                mode: .editPlanned(plan),
                categories: legacyCategories,
                onSaved: { await viewModel.load() }
            )
        }
    }

    // MARK: - Legacy DTO bridge (D-05)

    /// Bridge `[CategoryV10DTO] → [CategoryDTO]` so the legacy
    /// `TransactionEditor` (Phase 64 will rewrite it) keeps working
    /// unchanged. Maps only the v0.x field subset CategoryDTO needs;
    /// the v1.0 fields (planCents / rollover / paused / parentId / code /
    /// ord) are dropped here intentionally.
    private var legacyCategories: [CategoryDTO] {
        viewModel.categories.map { v in
            CategoryDTO(
                id: v.id,
                name: v.name,
                kind: v.kind,
                isArchived: v.isArchived,
                sortOrder: v.sortOrder,
                createdAt: v.createdAt
            )
        }
    }

    /// Bridge an `ActualV10DTO` to the legacy `ActualDTO` shape consumed by
    /// TransactionEditor.editActual. Returns nil for `.roundup` / `.deposit`
    /// because the legacy `CategoryKind` enum is 2-valued and the editor
    /// doesn't understand the 4-valued kinds — rows for those kinds are
    /// display-only this phase (D-02 + scope guard).
    private func legacyActualDTO(from v: ActualV10DTO) -> ActualDTO? {
        let legacyKind: CategoryKind
        switch v.kind {
        case .expense: legacyKind = .expense
        case .income: legacyKind = .income
        case .roundup, .deposit: return nil
        }
        return ActualDTO(
            id: v.id,
            periodId: v.periodId,
            kind: legacyKind,
            amountCents: v.amountCents,
            description: v.description,
            categoryId: v.categoryId,
            txDate: v.txDate,
            source: v.source,
            createdAt: v.createdAt
        )
    }

    // MARK: - Toolbar pieces

    private var subTabPicker: some View {
        Picker("Подтаб", selection: $viewModel.subTab) {
            ForEach(TxSubTab.allCases) { t in
                Text(t.rawValue).tag(t)
            }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 280)
        .onChange(of: viewModel.subTab) { _, newValue in
            // D-02: Сбережения сегмент существует только в .history.
            // Авто-сбрасываем при переключении в .plan, иначе kindPicker
            // в .plan не имеет валидного 3-го сегмента (tag=2 не виден).
            if newValue == .plan && viewModel.savingsSegmentSelected {
                viewModel.savingsSegmentSelected = false
                viewModel.categoryFilter = nil
            }
        }
    }

    private var categoryFilterMenu: some View {
        Menu {
            Button {
                viewModel.categoryFilter = nil
            } label: {
                if viewModel.categoryFilter == nil {
                    Label("Все категории", systemImage: "checkmark")
                } else {
                    Text("Все категории")
                }
            }
            ForEach(viewModel.visibleCategories) { cat in
                Button {
                    viewModel.categoryFilter = cat.id
                } label: {
                    if viewModel.categoryFilter == cat.id {
                        Label(cat.name, systemImage: "checkmark")
                    } else {
                        Text(cat.name)
                    }
                }
            }
        } label: {
            let active = (viewModel.categoryFilter != nil)
            Image(
                systemName: active
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease.circle"
            )
            .accessibilityLabel("Фильтр по категории")
        }
    }

    // MARK: - Kind picker binding (3-segment в .history, 2-segment в .plan)

    private var kindSegmentBinding: Binding<Int> {
        Binding<Int>(
            get: {
                if viewModel.savingsSegmentSelected { return 2 }
                return viewModel.kind == .expense ? 0 : 1
            },
            set: { idx in
                switch idx {
                case 0:
                    viewModel.kind = .expense
                    viewModel.savingsSegmentSelected = false
                case 1:
                    viewModel.kind = .income
                    viewModel.savingsSegmentSelected = false
                case 2:
                    // Сбережения — synthetic segment. Сохраняем kind=.expense
                    // в качестве visual fallback, чтобы categoryFilter и
                    // visibleCategories логика оставалась консистентной
                    // (visibleCategories смотрит на savingsSegmentSelected
                    // первым).
                    viewModel.savingsSegmentSelected = true
                    viewModel.kind = .expense
                default:
                    break
                }
                // D-03 — sane defaults: reset filter при смене сегмента.
                viewModel.categoryFilter = nil
            }
        )
    }

    @ViewBuilder
    private var kindPicker: some View {
        Picker("Тип", selection: kindSegmentBinding) {
            Text("Расходы").tag(0)
            Text("Доходы").tag(1)
            if viewModel.subTab == .history {
                Text("Сбережения").tag(2)
            }
        }
        .pickerStyle(.segmented)
    }

    // MARK: - Content state machine

    @ViewBuilder
    private var content: some View {
        switch viewModel.status {
        case .idle, .loading:
            loadingView
        case .error:
            errorView(currentStatusErrorMessage)
        case .loaded:
            loadedList
        }
    }

    /// Pull the error message out of `viewModel.status` for the
    /// errorView call. Centralising it here keeps the `case .error`
    /// pattern free of nested let-binding and lets `errorView(_:)`
    /// remain a plain `String -> some View` helper.
    private var currentStatusErrorMessage: String {
        if case .error(let msg) = viewModel.status { return msg }
        return ""
    }

    private var loadingView: some View {
        ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ msg: String) -> some View {
        ContentUnavailableView {
            Label("Не удалось загрузить", systemImage: "exclamationmark.triangle")
        } description: {
            Text(msg)
        } actions: {
            Button("Повторить") {
                Task { await viewModel.load() }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var loadedList: some View {
        List {
            // Banner для transient delete-ошибок (T-59-02 / WR-25-09 pattern).
            // Live даже в minimal-stub после 59-01 — оставляем как ready
            // surface для swipe-to-delete в 59-03.
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

            Section {
                kindPicker
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                    .listRowSeparator(.hidden)
            }

            if viewModel.subTab == .history {
                historySections
            } else {
                plannedSections
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.load() }
    }

    // MARK: - History sections (day-grouped)

    @ViewBuilder
    private var historySections: some View {
        if viewModel.dayGroups.isEmpty {
            emptySection(message: emptyHistoryMessage)
        } else {
            ForEach(viewModel.dayGroups) { group in
                Section {
                    ForEach(group.rows) { actual in
                        ActualRow(
                            actual: actual,
                            category: viewModel.category(actual.categoryId)
                        )
                        .contentShape(Rectangle())
                        .onTapGesture {
                            // .expense / .income → bridge → editor sheet.
                            // .roundup / .deposit → display-only no-op (D-02).
                            if let bridged = legacyActualDTO(from: actual) {
                                legacyEditingActual = bridged
                            }
                        }
                        // swipeActions добавит 59-03 (delete + confirmDialog).
                    }
                } header: {
                    HStack {
                        Text(group.dateLabel)
                        Spacer()
                        Text(MoneyFormatter.formatWithSymbol(cents: group.sumCents))
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private var emptyHistoryMessage: String {
        if viewModel.savingsSegmentSelected {
            return "Нет операций по копилке. Roundup и пополнения появятся здесь."
        }
        return "Нет операций. Добавьте трату или измените фильтры."
    }

    // MARK: - Plan sections (category-grouped)

    @ViewBuilder
    private var plannedSections: some View {
        let plans = viewModel.filteredPlanned
        if viewModel.savingsSegmentSelected {
            // Этот ветвь нерeachable через UI (subTabPicker сбрасывает
            // savingsSegmentSelected при переходе в .plan), но
            // оставляем для state-safety если порядок setter'ов
            // в kindSegmentBinding изменится в будущем.
            emptySection(message: "Планирование сбережений — в разделе Копилка (Phase 62).")
        } else if plans.isEmpty {
            emptySection(message: "Нет планов. Создайте через + или примените шаблон.")
        } else {
            ForEach(plannedGroups(plans: plans), id: \.id) { group in
                Section {
                    ForEach(group.items) { plan in
                        PlannedRow(plan: plan, category: group.category)
                            .contentShape(Rectangle())
                            .onTapGesture { editingPlanned = plan }
                        // swipeActions для planned delete — out of scope (59-03 / deferred).
                    }
                } header: {
                    HStack {
                        Text(group.category?.name ?? "—")
                        Spacer()
                        Text(MoneyFormatter.formatWithSymbol(cents: group.total))
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private struct PlannedGroup {
        let id: Int
        let category: CategoryV10DTO?
        let items: [PlannedDTO]
        let total: Int
    }

    private func plannedGroups(plans: [PlannedDTO]) -> [PlannedGroup] {
        let grouped = Dictionary(grouping: plans) { $0.categoryId }
        return
            grouped
            .map { key, rows -> PlannedGroup in
                PlannedGroup(
                    id: key,
                    category: viewModel.category(key),
                    items: rows.sorted { $0.id < $1.id },
                    total: rows.reduce(0) { $0 + $1.amountCents }
                )
            }
            .sorted {
                ($0.category?.sortOrder ?? Int.max) < ($1.category?.sortOrder ?? Int.max)
            }
    }

    // MARK: - Empty section helper

    private func emptySection(message: String) -> some View {
        Section {
            ContentUnavailableView(
                "Пусто",
                systemImage: "tray",
                description: Text(message)
            )
            .listRowBackground(Color.clear)
        }
    }
}

// MARK: - ActualRow (V10)

/// Row для `ActualV10DTO`. Renders:
///   - leading category icon (Tokens.Categories.visual)
///   - title (description / category name) + meta line (category · source)
///   - trailing amount (signed by kind, monospacedDigit, semibold)
///   - mini-icon `arrow.up.forward` рядом с amount для .roundup (D-02).
private struct ActualRow: View {
    let actual: ActualV10DTO
    let category: CategoryV10DTO?

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category?.name ?? "")
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: visual.icon)
                .font(.body)
                .foregroundStyle(visual.color)
                .frame(width: 28, height: 28)
                .background(
                    visual.color.opacity(0.15),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(titleText)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(metaLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            HStack(spacing: 4) {
                if actual.kind == .roundup {
                    Image(systemName: "arrow.up.forward")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Округление от родительской траты")
                }
                Text(amountText)
                    .font(.body.monospacedDigit().weight(.semibold))
                    .foregroundStyle(amountColor)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }

    private var titleText: String {
        if let d = actual.description, !d.isEmpty { return d }
        return category?.name ?? "—"
    }

    private var metaLine: String {
        let cat = category?.name ?? ""
        let source: String? = actual.source == .bot ? "из бота" : nil
        return [cat, source]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var amountText: String {
        let prefix: String
        switch actual.kind {
        case .income: prefix = "+"
        case .expense, .roundup, .deposit: prefix = "−"
        }
        return "\(prefix)\(MoneyFormatter.formatWithSymbol(cents: actual.amountCents))"
    }

    private var amountColor: Color {
        switch actual.kind {
        case .income: return .green
        case .expense: return .primary
        case .roundup: return .orange
        case .deposit: return .blue
        }
    }
}

// MARK: - PlannedRow (V10 — category bridges via CategoryV10DTO)

private struct PlannedRow: View {
    let plan: PlannedDTO
    let category: CategoryV10DTO?

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category?.name ?? "")
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: visual.icon)
                .font(.body)
                .foregroundStyle(visual.color)
                .frame(width: 28, height: 28)
                .background(
                    visual.color.opacity(0.15),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(titleText)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if let meta = metaLine {
                    Text(meta)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Text(MoneyFormatter.formatWithSymbol(cents: plan.amountCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
    }

    private var titleText: String {
        if let d = plan.description, !d.isEmpty { return d }
        return category?.name ?? "—"
    }

    private var metaLine: String? {
        switch plan.source {
        case .template: return "из шаблона"
        case .subscriptionAuto: return "подписка"
        case .manual: return nil
        }
    }
}
