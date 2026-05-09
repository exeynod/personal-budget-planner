import SwiftUI

@MainActor
@Observable
final class TransactionsViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded
        case error(String)
    }

    private(set) var state: LoadState = .loading
    var period: PeriodDTO?
    var actuals: [ActualDTO] = []
    var planned: [PlannedDTO] = []
    var categories: [CategoryDTO] = []

    var subTab: TxSubTab = .history
    var kind: CategoryKind = .expense
    var categoryFilter: Int?

    func load() async {
        state = .loading
        do {
            async let periodTask = PeriodsAPI.current()
            async let categoriesTask = CategoriesAPI.list()
            let (period, cats) = try await (periodTask, categoriesTask)
            self.period = period
            self.categories = cats.filter { !$0.isArchived }

            async let actualsTask = ActualAPI.list(periodId: period.id)
            async let plannedTask = PlannedAPI.list(periodId: period.id)
            let (acts, plans) = try await (actualsTask, plannedTask)
            self.actuals = acts.sorted { $0.txDate > $1.txDate }
            self.planned = plans.sorted { $0.id < $1.id }

            state = .loaded
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func category(_ id: Int) -> CategoryDTO? {
        categories.first { $0.id == id }
    }

    var filteredActuals: [ActualDTO] {
        actuals.filter { actual in
            actual.kind == kind
                && (categoryFilter == nil || actual.categoryId == categoryFilter)
        }
    }

    var filteredPlanned: [PlannedDTO] {
        planned.filter { plan in
            plan.kind == kind
                && (categoryFilter == nil || plan.categoryId == categoryFilter)
        }
    }

    var visibleCategories: [CategoryDTO] {
        let usedIds: Set<Int>
        if subTab == .history {
            usedIds = Set(actuals.filter { $0.kind == kind }.map(\.categoryId))
        } else {
            usedIds = Set(planned.filter { $0.kind == kind }.map(\.categoryId))
        }
        return categories.filter { $0.kind == kind && usedIds.contains($0.id) }
    }

    func deleteActual(id: Int) async {
        do {
            try await ActualAPI.delete(id: id)
            actuals.removeAll { $0.id == id }
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func deletePlanned(id: Int) async {
        do {
            try await PlannedAPI.delete(id: id)
            planned.removeAll { $0.id == id }
        } catch {
            state = .error(error.localizedDescription)
        }
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
    @State private var editingActual: ActualDTO?
    @State private var editingPlanned: PlannedDTO?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Транзакции")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        categoryFilterMenu
                    }
                }
        }
        .task { await viewModel.load() }
        .sheet(item: $editingActual) { actual in
            TransactionEditor(
                mode: .editActual(actual),
                categories: viewModel.categories,
                onSaved: { await viewModel.load() }
            )
        }
        .sheet(item: $editingPlanned) { plan in
            TransactionEditor(
                mode: .editPlanned(plan),
                categories: viewModel.categories,
                onSaved: { await viewModel.load() }
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
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
            List {
                Section {
                    Picker("Подтаб", selection: $viewModel.subTab) {
                        ForEach(TxSubTab.allCases) { t in
                            Text(t.rawValue).tag(t)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowSeparator(.hidden)

                    Picker("Тип", selection: $viewModel.kind) {
                        Text("Расходы").tag(CategoryKind.expense)
                        Text("Доходы").tag(CategoryKind.income)
                    }
                    .pickerStyle(.segmented)
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
            Divider()
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
            Image(systemName: viewModel.categoryFilter == nil
                  ? "line.3.horizontal.decrease.circle"
                  : "line.3.horizontal.decrease.circle.fill")
        }
    }

    // MARK: - History

    @ViewBuilder
    private var historySections: some View {
        let actuals = viewModel.filteredActuals
        if actuals.isEmpty {
            emptySection(message: "Нет транзакций. Тапни + чтобы добавить.")
        } else {
            ForEach(historyGroups(actuals: actuals), id: \.date) { group in
                Section {
                    ForEach(group.items) { actual in
                        ActualRow(
                            actual: actual,
                            category: viewModel.category(actual.categoryId)
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { editingActual = actual }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await viewModel.deleteActual(id: actual.id) }
                            } label: {
                                Label("Удалить", systemImage: "trash")
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text(headerTitle(group.date))
                        Spacer()
                        Text(MoneyFormatter.formatWithSymbol(cents: group.total))
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private func historyGroups(actuals: [ActualDTO]) -> [(date: Date, items: [ActualDTO], total: Int)] {
        let cal = Calendar(identifier: .gregorian)
        let groups = Dictionary(grouping: actuals) { cal.startOfDay(for: $0.txDate) }
        return groups
            .map { (
                date: $0.key,
                items: $0.value.sorted { $0.txDate > $1.txDate },
                total: $0.value.reduce(0) { $0 + $1.amountCents }
            ) }
            .sorted { $0.date > $1.date }
    }

    private func headerTitle(_ d: Date) -> String {
        let cal = Calendar(identifier: .gregorian)
        if cal.isDateInToday(d) { return "Сегодня" }
        if cal.isDateInYesterday(d) { return "Вчера" }
        return DateFormatters.displayDayShort.string(from: d)
    }

    // MARK: - Planned

    @ViewBuilder
    private var plannedSections: some View {
        let plans = viewModel.filteredPlanned
        if plans.isEmpty {
            emptySection(message: "Нет планов. Создай через + или применить шаблон.")
        } else {
            ForEach(plannedGroups(plans: plans), id: \.id) { group in
                Section {
                    ForEach(group.items) { plan in
                        PlannedRow(plan: plan, category: viewModel.category(plan.categoryId))
                            .contentShape(Rectangle())
                            .onTapGesture { editingPlanned = plan }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await viewModel.deletePlanned(id: plan.id) }
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                            }
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

    private func plannedGroups(plans: [PlannedDTO]) -> [(id: Int, category: CategoryDTO?, items: [PlannedDTO], total: Int)] {
        let groups = Dictionary(grouping: plans) { $0.categoryId }
        return groups
            .map { (
                id: $0.key,
                category: viewModel.category($0.key),
                items: $0.value.sorted { $0.id < $1.id },
                total: $0.value.reduce(0) { $0 + $1.amountCents }
            ) }
            .sorted {
                ($0.category?.sortOrder ?? Int.max) < ($1.category?.sortOrder ?? Int.max)
            }
    }

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

// MARK: - Rows

private struct ActualRow: View {
    let actual: ActualDTO
    let category: CategoryDTO?

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category?.name ?? "")
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: visual.icon)
                .font(.body)
                .foregroundStyle(visual.color)
                .frame(width: 28, height: 28)
                .background(visual.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(actual.description?.isEmpty == false ? actual.description! : (category?.name ?? "—"))
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(metaLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text(amountText)
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(actual.kind == .income ? .green : .primary)
        }
        .padding(.vertical, 2)
    }

    private var metaLine: String {
        let cat = category?.name ?? ""
        let source = actual.source == .bot ? "из бота" : nil
        return [cat, source].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var amountText: String {
        let prefix = actual.kind == .income ? "+" : "−"
        return "\(prefix)\(MoneyFormatter.formatWithSymbol(cents: actual.amountCents))"
    }
}

private struct PlannedRow: View {
    let plan: PlannedDTO
    let category: CategoryDTO?

    var body: some View {
        HStack {
            Text(plan.description?.isEmpty == false ? plan.description! : "Без описания")
                .font(.body)
                .foregroundStyle(.primary)
            Spacer()
            Text(MoneyFormatter.format(cents: plan.amountCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
        }
        .padding(.vertical, 2)
    }
}
