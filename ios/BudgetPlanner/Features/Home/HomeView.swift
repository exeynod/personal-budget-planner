import SwiftUI

@MainActor
@Observable
final class HomeViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(
            period: PeriodDTO, balance: BalanceResponse, categories: [CategoryDTO],
            walletCents: Int, plannedUnpostedExpenseCents: Int)
        case noActivePeriod
        case error(String)
    }

    private(set) var state: LoadState = .idle
    var activeKind: CategoryKind = .expense

    func load() async {
        state = .loading
        do {
            async let periodTask = PeriodsAPI.current()
            async let categoriesTask = CategoriesAPI.list()
            async let accountsTask = AccountsAPI.list()
            let (period, cats, accounts) = try await (periodTask, categoriesTask, accountsTask)
            let balance = try await PeriodsAPI.balance(periodId: period.id)
            // v1.1 plan↔fact ladder: «Расписано» = Σ unposted planned amounts
            // (expense-scoped), excluding subscription_auto (anti-double-count)
            // and already-posted rows. Mirrors web `plannedUnpostedTotal`.
            let planned = (try? await PlannedAPI.list(periodId: period.id)) ?? []
            let plannedUnpostedExpense = HomeData.plannedUnpostedTotal(
                planned, kind: .expense)
            // Phase 71 BAL-1: headline "Остаток на счёте" is the wallet total
            // (Σ account balance_cents), matching the MP shell's "в кошельке"
            // (HomeData.computeWalletTotal) and the Счета screen. The period
            // balance_now (starting_balance + income − expense) is NOT the
            // wallet — v1.0 onboarding creates no starting balance, so it
            // collapses to pure period net and mislabels the headline.
            let walletCents = HomeData.computeWalletTotal(accounts)
            state = .loaded(
                period: period, balance: balance, categories: cats,
                walletCents: walletCents,
                plannedUnpostedExpenseCents: plannedUnpostedExpense)
        } catch APIError.notFound {
            state = .noActivePeriod
        } catch {
            #if DEBUG
            print("HomeView.load error: \(error)")
            #endif
            state = .error(error.userFacingRu)
        }
    }

    var loadedCategories: [CategoryDTO] {
        if case .loaded(_, _, let cats, _, _) = state { return cats }
        return []
    }
}

/// Home dashboard — native iOS 26 layout.
///   - NavigationStack + large title "Главная"
///   - Hero balance section (Section with custom header content)
///   - Расходы/Доходы segmented Picker
///   - Categories rows в `List(.insetGrouped)`
///   - "+" в toolbar открывает TransactionEditor sheet (FAB-replacement)
struct HomeView: View {
    @State private var viewModel = HomeViewModel()
    @State private var showingEditor = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Главная")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showingEditor = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Новая транзакция")
                    }
                }
        }
        .task {
            await viewModel.load()
            // Dev hook: forces TransactionEditor on launch (UI debugging).
            // xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner DEV_OPEN_TX_SHEET 1
            if UserDefaults.standard.bool(forKey: "DEV_OPEN_TX_SHEET") {
                showingEditor = true
            }
        }
        .sheet(isPresented: $showingEditor) {
            TransactionEditor(
                mode: .createActual,
                categories: viewModel.loadedCategories,
                onSaved: { await viewModel.load() }
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle, .loading:
            ProgressView().controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loaded(let period, let balance, let categories, let walletCents, let plannedUnposted):
            HomeList(
                balance: balance,
                period: period,
                categories: categories,
                walletCents: walletCents,
                plannedUnpostedExpenseCents: plannedUnposted,
                kind: $viewModel.activeKind,
                onRefresh: { await viewModel.load() }
            )

        case .noActivePeriod:
            // Phase 58: AppRouter гарантирует is_onboarded=true до этой ветки,
            // поэтому «Завершите onboarding» некорректно. Реальная причина —
            // worker close_period_job ещё не создал следующий период (или его
            // выкосил dev_seed). Backend `POST /actual` с lazy auto-create
            // (actual.py D-52) создаст период при первой трате, так что
            // подсказываем пользователю «+» как primary path.
            ContentUnavailableView {
                Label("Период ещё не открыт", systemImage: "calendar.badge.clock")
            } description: {
                Text(
                    "Новый месячный период создаётся автоматически после закрытия предыдущего или при первой трате. Добавьте операцию через «+» вверху или обновите экран."
                )
            } actions: {
                Button("Добавить трату") { showingEditor = true }
                    .buttonStyle(.borderedProminent)
                Button("Обновить") { Task { await viewModel.load() } }
                    .buttonStyle(.bordered)
            }

        case .error(let message):
            ContentUnavailableView {
                Label("Не удалось загрузить", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Повторить") { Task { await viewModel.load() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

// MARK: - List

private struct HomeList: View {
    let balance: BalanceResponse
    let period: PeriodDTO
    let categories: [CategoryDTO]
    let walletCents: Int
    /// v1.1 ladder «Расписано» — Σ unposted planned expense amounts.
    let plannedUnpostedExpenseCents: Int
    @Binding var kind: CategoryKind
    var onRefresh: (() async -> Void)? = nil

    var body: some View {
        List {
            Section {
                BalanceHeroRow(
                    balance: balance, period: period, walletCents: walletCents,
                    plannedUnpostedExpenseCents: plannedUnpostedExpenseCents, kind: kind)
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            Section {
                Picker("Тип", selection: $kind) {
                    Text("Расходы").tag(CategoryKind.expense)
                    Text("Доходы").tag(CategoryKind.income)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
            }

            Section("Категории") {
                let rows = filteredRows
                if rows.isEmpty {
                    Text("Нет категорий")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(rows) { row in
                        CategoryListRow(row: row)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await onRefresh?()
        }
    }

    private var filteredRows: [BalanceCategoryRow] {
        let sortedById = Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0.sortOrder) })
        return balance.byCategory
            .filter { $0.kind == kind }
            .sorted { (sortedById[$0.categoryId] ?? Int.max) < (sortedById[$1.categoryId] ?? Int.max) }
    }
}

// MARK: - Balance hero row

private struct BalanceHeroRow: View {
    let balance: BalanceResponse
    let period: PeriodDTO
    /// Phase 71 BAL-1: Σ account balance_cents (wallet total), the real figure
    /// behind the "Остаток на счёте" label — matches the MP shell's "в кошельке"
    /// and the Счета screen total.
    let walletCents: Int
    /// v1.1 ladder «Расписано» — Σ unposted planned expense amounts.
    let plannedUnpostedExpenseCents: Int
    let kind: CategoryKind

    private var amountCents: Int {
        // Closed period → "Итог периода" still shows the period ending balance
        // (a legitimate period figure, not the wallet). Active period → the
        // headline says "Остаток на счёте", so show the wallet total, not the
        // period net (balance_now), which mislabelled the figure (BAL-1).
        period.status == .closed
            ? (period.endingBalanceCents ?? 0)
            : walletCents
    }

    private var amountLabel: String {
        period.status == .closed ? "Итог периода" : "Остаток на счёте"
    }

    private var planned: Int {
        kind == .expense ? balance.plannedTotalExpenseCents : balance.plannedTotalIncomeCents
    }

    private var actual: Int {
        kind == .expense ? balance.actualTotalExpenseCents : balance.actualTotalIncomeCents
    }

    private var delta: Int {
        kind == .expense ? planned - actual : actual - planned
    }

    private var deltaLabel: String {
        kind == .expense ? "В запасе" : "Сверх"
    }

    private var deltaColor: Color {
        if delta > 0 { return .green }
        if delta < 0 { return .red }
        return .secondary
    }

    /// v1.1 plan↔fact ladder cells. Expense: Лимит / Расписано / Факт / В запасе.
    /// Income: План / Факт / Сверх (no «Расписано» — the ladder is expense-scoped,
    /// mirroring the web NativeHomeView).
    private var ladderCells: [LadderCell] {
        var cells: [LadderCell] = []
        if kind == .expense {
            cells.append(LadderCell(label: "Лимит", value: planned, color: .primary))
            cells.append(
                LadderCell(label: "Расписано", value: plannedUnpostedExpenseCents, color: .primary))
        } else {
            cells.append(LadderCell(label: "План", value: planned, color: .primary))
        }
        cells.append(LadderCell(label: "Факт", value: actual, color: .primary))
        cells.append(LadderCell(label: deltaLabel, value: delta, color: deltaColor, signed: true))
        return cells
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(amountLabel)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(MoneyFormatter.format(cents: amountCents))
                        .font(.system(.largeTitle, design: .default, weight: .bold).monospacedDigit())
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text("₽")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 12) {
                ForEach(ladderCells) { cell in
                    MetricCell(
                        label: cell.label, value: cell.value, color: cell.color,
                        signed: cell.signed)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.large, style: .continuous))
    }
}

/// One cell of the Home plan↔fact ladder.
private struct LadderCell: Identifiable {
    let id = UUID()
    let label: String
    let value: Int
    let color: Color
    var signed: Bool = false
}

private struct MetricCell: View {
    let label: String
    let value: Int
    let color: Color
    var signed: Bool = false

    private var formatted: String {
        let prefix = signed && value > 0 ? "+" : ""
        return prefix + MoneyFormatter.format(cents: value)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Text(formatted)
                .font(.subheadline.monospacedDigit().weight(.semibold))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Category row

private struct CategoryListRow: View {
    let row: BalanceCategoryRow

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: row.name)
    }

    private var hasPlan: Bool { row.plannedCents > 0 }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: visual.icon)
                .font(.body)
                .foregroundStyle(visual.color)
                .frame(width: 28, height: 28)
                .background(visual.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if hasPlan {
                    HStack(spacing: 4) {
                        Text(MoneyFormatter.format(cents: row.actualCents))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Text("/")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                        Text(MoneyFormatter.format(cents: row.plannedCents))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.tertiary)
                    }
                } else {
                    Text("Без плана")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 8)

            Text(MoneyFormatter.format(cents: row.actualCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
        }
        .padding(.vertical, 2)
    }
}
