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
    private(set) var period: PeriodDTO?
    private(set) var actuals: [ActualDTO] = []
    private(set) var planned: [PlannedDTO] = []
    private(set) var categories: [CategoryDTO] = []

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

    func categoryName(_ id: Int) -> String {
        categories.first { $0.id == id }?.name ?? "—"
    }

    func category(_ id: Int) -> CategoryDTO? {
        categories.first { $0.id == id }
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

enum TransactionsSubTab: String, CaseIterable {
    case history = "История"
    case planned = "План"
}

struct TransactionsView: View {
    @State private var viewModel = TransactionsViewModel()
    @State private var subTab: TransactionsSubTab = .history
    @State private var showEditor = false
    @State private var editingActual: ActualDTO?
    @State private var editingPlanned: PlannedDTO?

    var body: some View {
        ZStack {
            AdaptiveBackground()

            VStack(spacing: 0) {
                header
                content
            }

            FAB { showEditor = true }
                .padding(.trailing, Tokens.Spacing.xl)
                .padding(.bottom, Tokens.Spacing.xl)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(isPresented: $showEditor) {
            TransactionEditor(
                mode: .createActual,
                categories: viewModel.categories,
                onSaved: { await viewModel.load() }
            )
        }
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
    private var header: some View {
        VStack(spacing: Tokens.Spacing.md) {
            HStack {
                Text("Транзакции")
                    .font(.appTitle)
                Spacer()
            }
            SubTabBar(selection: $subTab)
        }
        .padding(.horizontal, Tokens.Spacing.xl)
        .padding(.top, Tokens.Spacing.lg)
        .padding(.bottom, Tokens.Spacing.md)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .error(let msg):
            VStack(spacing: Tokens.Spacing.md) {
                Text("Не удалось загрузить").font(.appTitle)
                Text(msg).font(.appBody).foregroundStyle(.secondary)
                Button("Повторить") { Task { await viewModel.load() } }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded:
            if subTab == .history {
                HistoryListView(viewModel: viewModel, onEdit: { editingActual = $0 })
            } else {
                PlannedListView(viewModel: viewModel, onEdit: { editingPlanned = $0 })
            }
        }
    }
}

struct SubTabBar: View {
    @Binding var selection: TransactionsSubTab

    var body: some View {
        HStack(spacing: Tokens.Spacing.sm) {
            ForEach(TransactionsSubTab.allCases, id: \.self) { tab in
                Button {
                    selection = tab
                } label: {
                    Text(tab.rawValue)
                        .font(.appLabel.weight(selection == tab ? .semibold : .regular))
                        .foregroundStyle(selection == tab ? .white : .primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Tokens.Spacing.sm)
                        .background(
                            selection == tab ? Tokens.Accent.primary : Color.clear,
                            in: RoundedRectangle(cornerRadius: Tokens.Radius.md)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Tokens.Spacing.xs)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
    }
}

private struct HistoryListView: View {
    let viewModel: TransactionsViewModel
    let onEdit: (ActualDTO) -> Void

    var grouped: [(date: Date, items: [ActualDTO])] {
        let cal = Calendar(identifier: .gregorian)
        let groups = Dictionary(grouping: viewModel.actuals) { actual in
            cal.startOfDay(for: actual.txDate)
        }
        return groups
            .map { (date: $0.key, items: $0.value) }
            .sorted { $0.date > $1.date }
    }

    var body: some View {
        if viewModel.actuals.isEmpty {
            EmptyStateView(message: "Нет транзакций в этом периоде. Нажмите + чтобы добавить.")
        } else {
            ScrollView {
                LazyVStack(spacing: Tokens.Spacing.md) {
                    ForEach(grouped, id: \.date) { group in
                        VStack(alignment: .leading, spacing: Tokens.Spacing.sm) {
                            Text(DateFormatters.groupHeader.string(from: group.date).capitalized)
                                .font(.appCaption)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, Tokens.Spacing.xl)

                            VStack(spacing: 1) {
                                ForEach(group.items) { actual in
                                    ActualRow(
                                        actual: actual,
                                        category: viewModel.category(actual.categoryId)
                                    )
                                    .contentShape(Rectangle())
                                    .onTapGesture { onEdit(actual) }
                                    .swipeActions(edge: .trailing) {
                                        Button(role: .destructive) {
                                            Task { await viewModel.deleteActual(id: actual.id) }
                                        } label: {
                                            Label("Удалить", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                            .padding(.horizontal, Tokens.Spacing.lg)
                        }
                    }
                    Color.clear.frame(height: 100)
                }
                .padding(.top, Tokens.Spacing.sm)
            }
        }
    }
}

private struct ActualRow: View {
    let actual: ActualDTO
    let category: CategoryDTO?

    var body: some View {
        HStack(spacing: Tokens.Spacing.md) {
            Circle()
                .fill(Tokens.Categories.color(for: category?.name ?? ""))
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(category?.name ?? "—").font(.appBody)
                if let desc = actual.description, !desc.isEmpty {
                    Text(desc).font(.appCaption).foregroundStyle(.secondary).lineLimit(1)
                }
            }

            Spacer()

            Text(MoneyFormatter.formatWithSymbol(cents: actual.amountCents))
                .font(.appNumber)
                .foregroundStyle(actual.kind == .income ? .green : .primary)
        }
        .padding(.vertical, Tokens.Spacing.sm)
        .padding(.horizontal, Tokens.Spacing.md)
        .background(.ultraThinMaterial)
    }
}

private struct PlannedListView: View {
    let viewModel: TransactionsViewModel
    let onEdit: (PlannedDTO) -> Void

    var grouped: [(category: CategoryDTO?, items: [PlannedDTO])] {
        let groups = Dictionary(grouping: viewModel.planned) { $0.categoryId }
        return groups
            .map { (category: viewModel.category($0.key), items: $0.value) }
            .sorted { ($0.category?.sortOrder ?? 0) < ($1.category?.sortOrder ?? 0) }
    }

    var body: some View {
        if viewModel.planned.isEmpty {
            EmptyStateView(message: "Нет планов. Создайте первый через + или примените шаблон в Меню → Шаблон.")
        } else {
            ScrollView {
                LazyVStack(spacing: Tokens.Spacing.md) {
                    ForEach(grouped, id: \.category?.id) { group in
                        VStack(alignment: .leading, spacing: Tokens.Spacing.xs) {
                            HStack {
                                Circle()
                                    .fill(Tokens.Categories.color(for: group.category?.name ?? ""))
                                    .frame(width: 10, height: 10)
                                Text(group.category?.name ?? "—")
                                    .font(.appLabel.weight(.semibold))
                                Spacer()
                                Text(MoneyFormatter.formatWithSymbol(
                                    cents: group.items.reduce(0) { $0 + $1.amountCents }
                                ))
                                .font(.appNumber)
                            }
                            .padding(.horizontal, Tokens.Spacing.lg)

                            ForEach(group.items) { plan in
                                HStack {
                                    Text(plan.description ?? "Без описания")
                                        .font(.appBody)
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Text(MoneyFormatter.format(cents: plan.amountCents))
                                        .font(.appNumber)
                                }
                                .padding(.horizontal, Tokens.Spacing.lg)
                                .padding(.vertical, Tokens.Spacing.sm)
                                .background(.ultraThinMaterial)
                                .contentShape(Rectangle())
                                .onTapGesture { onEdit(plan) }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        Task { await viewModel.deletePlanned(id: plan.id) }
                                    } label: {
                                        Label("Удалить", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                    Color.clear.frame(height: 100)
                }
                .padding(.top, Tokens.Spacing.sm)
            }
        }
    }
}

private struct EmptyStateView: View {
    let message: String

    var body: some View {
        VStack(spacing: Tokens.Spacing.md) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.appBody)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Tokens.Spacing.xl)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct FAB: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Tokens.Accent.primary, in: Circle())
                .shadow(color: Tokens.Accent.primary.opacity(0.4), radius: 10, x: 0, y: 4)
        }
        .buttonStyle(.plain)
    }
}
