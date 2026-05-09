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

struct TransactionsView: View {
    @State private var viewModel = TransactionsViewModel()
    @State private var editingActual: ActualDTO?
    @State private var editingPlanned: PlannedDTO?

    var body: some View {
        ZStack {
            AuroraBackground()

            ScrollView {
                VStack(spacing: 12) {
                    titleRow
                    SegmentedTwoTabs(selection: $viewModel.subTab)
                    KindTabs(selection: $viewModel.kind)
                    if !viewModel.visibleCategories.isEmpty {
                        FilterChipsBar(
                            categories: viewModel.visibleCategories,
                            selected: $viewModel.categoryFilter
                        )
                    }
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 130)
            }
            .refreshable { await viewModel.load() }
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
    private var titleRow: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Транзакции")
                .font(.system(size: 28, weight: .bold))
                .tracking(-0.5)
                .foregroundStyle(Tokens.Ink.primary)
            Spacer()
            if let period = viewModel.period {
                Text(periodChipLabel(period))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Tokens.Ink.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .liquidGlassPill(radius: 12)
            }
        }
        .padding(.bottom, 4)
    }

    private func periodChipLabel(_ p: PeriodDTO) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "MMM"
        return f.string(from: p.periodStart)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView().padding(.top, 60)
        case .error(let msg):
            VStack(spacing: 12) {
                Text("Не удалось загрузить").font(.appTitle)
                Text(msg).font(.appBody).foregroundStyle(.secondary)
                Button("Повторить") { Task { await viewModel.load() } }
                    .buttonStyle(.borderedProminent)
                    .tint(Tokens.Accent.primary)
            }
            .padding(.top, 40)
        case .loaded:
            if viewModel.subTab == .history {
                HistoryGroupedList(
                    actuals: viewModel.filteredActuals,
                    categoryProvider: viewModel.category,
                    onTap: { editingActual = $0 },
                    onDelete: { id in
                        Task { await viewModel.deleteActual(id: id) }
                    }
                )
            } else {
                PlannedGroupedList(
                    planned: viewModel.filteredPlanned,
                    categoryProvider: viewModel.category,
                    onTap: { editingPlanned = $0 },
                    onDelete: { id in
                        Task { await viewModel.deletePlanned(id: id) }
                    }
                )
            }
        }
    }
}

// MARK: - Segmented two tabs (История/План)

struct SegmentedTwoTabs: View {
    @Binding var selection: TxSubTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(TxSubTab.allCases) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { selection = tab }
                } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(selection == tab ? Tokens.Ink.primary : Tokens.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background {
                            if selection == tab {
                                Color.white.opacity(0.92).clipShape(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                )
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .liquidGlass(radius: 18, blur: .systemThinMaterial)
    }
}

// MARK: - Kind tabs (Расходы/Доходы)

struct KindTabs: View {
    @Binding var selection: CategoryKind

    var body: some View {
        HStack(spacing: 0) {
            tabButton("Расходы", kind: .expense)
            tabButton("Доходы", kind: .income)
        }
        .padding(4)
        .liquidGlassPill(radius: 16)
    }

    private func tabButton(_ title: String, kind: CategoryKind) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { selection = kind }
        } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(selection == kind ? Tokens.Accent.primary : Tokens.Ink.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background {
                    if selection == kind {
                        Tokens.Accent.primary.opacity(0.18).clipShape(Capsule())
                    } else {
                        Color.clear
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Filter chips

struct FilterChipsBar: View {
    let categories: [CategoryDTO]
    @Binding var selected: Int?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                FilterChip(label: "Все", isSelected: selected == nil) {
                    selected = nil
                }
                ForEach(categories) { cat in
                    FilterChip(
                        label: cat.name,
                        isSelected: selected == cat.id,
                        accentColor: Tokens.Categories.visual(for: cat.name).color
                    ) {
                        selected = cat.id
                    }
                }
            }
            .padding(.vertical, 2)
        }
        .scrollClipDisabled()
    }
}

private struct FilterChip: View {
    let label: String
    let isSelected: Bool
    var accentColor: Color = Tokens.Ink.primary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isSelected ? .white : Tokens.Ink.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background {
                    if isSelected {
                        Tokens.Ink.primary.clipShape(Capsule())
                    } else {
                        ZStack {
                            LiquidGlass(style: .systemThinMaterial)
                            Color.white.opacity(0.5)
                        }
                        .clipShape(Capsule())
                    }
                }
                .overlay(
                    Capsule().strokeBorder(
                        isSelected ? Color.clear : Color.white.opacity(0.7),
                        lineWidth: 0.5
                    )
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - History grouped list

private struct HistoryGroupedList: View {
    let actuals: [ActualDTO]
    let categoryProvider: (Int) -> CategoryDTO?
    let onTap: (ActualDTO) -> Void
    let onDelete: (Int) -> Void

    private var grouped: [(date: Date, items: [ActualDTO], total: Int)] {
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

    var body: some View {
        if actuals.isEmpty {
            EmptyStateBlock(message: "Нет транзакций. Тапни + чтобы добавить.")
        } else {
            VStack(spacing: 16) {
                ForEach(grouped, id: \.date) { group in
                    DayGroupCard(
                        date: group.date,
                        total: group.total,
                        items: group.items,
                        categoryProvider: categoryProvider,
                        onTap: onTap,
                        onDelete: onDelete
                    )
                }
            }
        }
    }
}

private struct DayGroupCard: View {
    let date: Date
    let total: Int
    let items: [ActualDTO]
    let categoryProvider: (Int) -> CategoryDTO?
    let onTap: (ActualDTO) -> Void
    let onDelete: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(formatHeader(date).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(Tokens.Ink.secondary)
                Spacer()
                Text("−\(MoneyFormatter.format(cents: total)) ₽")
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Tokens.Ink.primary)
            }
            .padding(.horizontal, 8)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, actual in
                    ActualRow(
                        actual: actual,
                        category: categoryProvider(actual.categoryId),
                        isFirst: index == 0,
                        isLast: index == items.count - 1
                    )
                    .contentShape(Rectangle())
                    .onTapGesture { onTap(actual) }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { onDelete(actual.id) } label: {
                            Label("Удалить", systemImage: "trash")
                        }
                    }

                    if index < items.count - 1 {
                        Divider()
                            .overlay(Color.black.opacity(0.06))
                            .padding(.leading, 64)
                    }
                }
            }
            .liquidGlass(radius: 22, blur: .systemThinMaterial)
        }
    }

    private func formatHeader(_ d: Date) -> String {
        let cal = Calendar(identifier: .gregorian)
        if cal.isDateInToday(d) { return "Сегодня" }
        if cal.isDateInYesterday(d) { return "Вчера" }
        return DateFormatters.displayDayShort.string(from: d)
    }
}

private struct ActualRow: View {
    let actual: ActualDTO
    let category: CategoryDTO?
    let isFirst: Bool
    let isLast: Bool

    var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category?.name ?? "")
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(visual.color.opacity(0.18))
                Image(systemName: visual.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(visual.color)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(actual.description?.isEmpty == false ? actual.description! : (category?.name ?? "—"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Tokens.Ink.primary)
                    .lineLimit(1)
                Text(metaLine())
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(Tokens.Ink.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text("\(actual.kind == .expense ? "−" : "+")\(MoneyFormatter.format(cents: actual.amountCents)) ₽")
                .font(.system(size: 15, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(actual.kind == .income ? .green : Tokens.Ink.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func metaLine() -> String {
        let cat = category?.name ?? ""
        let source = actual.source == .bot ? "из бота" : nil
        let parts = [cat, source].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Planned grouped by category

private struct PlannedGroupedList: View {
    let planned: [PlannedDTO]
    let categoryProvider: (Int) -> CategoryDTO?
    let onTap: (PlannedDTO) -> Void
    let onDelete: (Int) -> Void

    private var grouped: [(category: CategoryDTO?, items: [PlannedDTO], total: Int)] {
        let groups = Dictionary(grouping: planned) { $0.categoryId }
        return groups
            .map { (
                category: categoryProvider($0.key),
                items: $0.value.sorted { $0.id < $1.id },
                total: $0.value.reduce(0) { $0 + $1.amountCents }
            ) }
            .sorted {
                ($0.category?.sortOrder ?? Int.max)
                < ($1.category?.sortOrder ?? Int.max)
            }
    }

    var body: some View {
        if planned.isEmpty {
            EmptyStateBlock(message: "Нет планов. Создай через FAB или применить шаблон в Меню.")
        } else {
            VStack(spacing: 16) {
                ForEach(grouped, id: \.category?.id) { group in
                    CategoryPlanGroup(
                        category: group.category,
                        total: group.total,
                        items: group.items,
                        onTap: onTap,
                        onDelete: onDelete
                    )
                }
            }
        }
    }
}

private struct CategoryPlanGroup: View {
    let category: CategoryDTO?
    let total: Int
    let items: [PlannedDTO]
    let onTap: (PlannedDTO) -> Void
    let onDelete: (Int) -> Void

    var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category?.name ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: visual.icon)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(visual.color)
                Text((category?.name ?? "—").uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(Tokens.Ink.secondary)
                Spacer()
                Text(MoneyFormatter.formatWithSymbol(cents: total))
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
            }
            .padding(.horizontal, 8)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { idx, plan in
                    HStack {
                        Text(plan.description?.isEmpty == false ? plan.description! : "Без описания")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(Tokens.Ink.primary)
                        Spacer()
                        Text(MoneyFormatter.format(cents: plan.amountCents))
                            .font(.system(size: 14, weight: .semibold))
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                    .onTapGesture { onTap(plan) }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { onDelete(plan.id) } label: {
                            Label("Удалить", systemImage: "trash")
                        }
                    }

                    if idx < items.count - 1 {
                        Divider()
                            .overlay(Color.black.opacity(0.06))
                            .padding(.horizontal, 14)
                    }
                }
            }
            .liquidGlass(radius: 18, blur: .systemThinMaterial)
        }
    }
}

private struct EmptyStateBlock: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.appBody)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .padding(.top, 40)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity)
    }
}
