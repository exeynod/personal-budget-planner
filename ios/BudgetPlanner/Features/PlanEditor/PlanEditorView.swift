import SwiftUI

/// Phase 61: PlanEditorView — master list editor месячного плана.
///
/// 61-02 реализация:
///   - List(.insetGrouped) с 4 рендер-состояниями (loading / error /
///     ready+empty / ready+content).
///   - Ready+content layout:
///     • Hero Section (без header): «Остаток к распределению» —
///       surplus = income − Σ(expense.plan_cents); positive green «+»,
///       negative red «−».
///     • Aggregates Section («Rollover»): 2 rows «→ Прочее» / «→ Накопления»
///       с MoneyFormatter trailing.
///     • Section «Расходы»: ForEach expense cats → PlanCategoryRow с
///       NavigationLink(value: PlanEditorRoute.row(categoryId: c.id)).
///     • Section «Доходы»: same pattern (если income категории есть).
///   - .navigationDestination(for: PlanEditorRoute.self) — push на
///     PlanRowEditorView с onSaved closure injection (optimistic refresh
///     через viewModel.applyOptimisticUpdate).
///
/// `PlanEditorRoute` (typed enum) избегает collision с AccountsView's
/// `Int.self` binding в shared ManagementView NavigationStack. Когда user
/// находится на /accounts, Int-binding уже занят AccountDetailView push'ем —
/// поэтому PlanEditor использует свой typed enum.
struct PlanEditorView: View {
    @State private var viewModel = PlanEditorViewModel()

    var body: some View {
        List {
            switch viewModel.status {
            case .idle, .loading:
                loadingSection
            case .error(let msg):
                errorSection(msg)
            case .ready:
                if viewModel.categories.isEmpty {
                    emptySection
                } else {
                    heroSection
                    aggregatesSection
                    let split = PlanEditorData.sortCategoriesForDisplay(viewModel.categories)
                    if !split.expense.isEmpty {
                        categoriesSection(title: "Расходы", cats: split.expense)
                    }
                    if !split.income.isEmpty {
                        categoriesSection(title: "Доходы", cats: split.income)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("План месяца")
        .navigationDestination(for: PlanEditorRoute.self) { route in
            switch route {
            case .row(let categoryId):
                PlanRowEditorView(categoryId: categoryId) { updated in
                    viewModel.applyOptimisticUpdate(updated)
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    // MARK: - State sections

    private var loadingSection: some View {
        Section {
            ProgressView()
                .frame(maxWidth: .infinity)
        }
    }

    private func errorSection(_ msg: String) -> some View {
        Section {
            Label(msg, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
        }
    }

    private var emptySection: some View {
        Section {
            ContentUnavailableView(
                "Категорий нет",
                systemImage: "list.bullet",
                description: Text("Создайте категории в «Категории»")
            )
            .listRowBackground(Color.clear)
        }
    }

    // MARK: - Hero (surplus)

    private var heroSection: some View {
        let surplus = PlanEditorData.computeSurplus(
            incomeCents: viewModel.incomeCents,
            categories: viewModel.categories
        )
        return Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("Остаток к распределению")
                    .font(.caption)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(
                        "\(surplus >= 0 ? "+" : "−")"
                        + MoneyFormatter.format(cents: Swift.abs(surplus))
                    )
                    .font(.title.monospacedDigit().weight(.semibold))
                    .foregroundStyle(surplus >= 0 ? .green : .red)
                    Text("₽").foregroundStyle(.secondary)
                    Spacer()
                }
                Text(surplusSubtitle)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }

    /// «<income> ₽ − <sumPlan> ₽» — explanatory math hint под Hero.
    private var surplusSubtitle: String {
        let income = MoneyFormatter.format(cents: viewModel.incomeCents)
        let sumPlan = viewModel.categories
            .filter { !$0.isArchived && !$0.paused && $0.kind == .expense }
            .reduce(0) { $0 + $1.planCents }
        return "\(income) ₽ − \(MoneyFormatter.format(cents: sumPlan)) ₽"
    }

    // MARK: - Aggregates

    private var aggregatesSection: some View {
        let agg = PlanEditorData.computeRolloverAggregates(
            categories: viewModel.categories,
            actuals: viewModel.actuals
        )
        return Section("Rollover") {
            aggregateRow(
                title: "→ Прочее",
                iconName: "tray.fill",
                cents: agg.miscCents
            )
            aggregateRow(
                title: "→ Накопления",
                iconName: "tray.full.fill",
                cents: agg.savingsCents
            )
        }
    }

    private func aggregateRow(title: String, iconName: String, cents: Int) -> some View {
        HStack(spacing: 12) {
            Image(systemName: iconName)
                .foregroundStyle(Tokens.Accent.primary)
                .frame(width: 28)
            Text(title)
                .font(.body)
                .foregroundStyle(.primary)
            Spacer()
            HStack(spacing: 4) {
                Text(MoneyFormatter.format(cents: cents))
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.primary)
                Text("₽").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Categories sections

    private func categoriesSection(
        title: String,
        cats: [CategoryV10DTO]
    ) -> some View {
        Section(title) {
            ForEach(cats) { c in
                NavigationLink(value: PlanEditorRoute.row(categoryId: c.id)) {
                    PlanCategoryRow(
                        category: c,
                        factCents: PlanEditorData.factCentsByCategory(
                            viewModel.actuals,
                            categoryId: c.id
                        )
                    )
                }
            }
        }
    }
}

// MARK: - Row

private struct PlanCategoryRow: View {
    let category: CategoryV10DTO
    let factCents: Int

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: rolloverIcon)
                .foregroundStyle(rolloverColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(category.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                if category.paused {
                    Text("приостановлено")
                        .font(.caption.italic())
                        .foregroundStyle(.secondary)
                } else {
                    Text("факт: \(MoneyFormatter.format(cents: factCents)) ₽")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: 2) {
                    Text(MoneyFormatter.format(cents: category.planCents))
                        .font(.body.monospacedDigit())
                        .foregroundStyle(.primary)
                    Text("₽").foregroundStyle(.secondary)
                }
            }
        }
    }

    private var rolloverIcon: String {
        switch category.rollover {
        case .savings: return "arrow.up.circle.fill"
        case .misc: return "circle.dotted"
        }
    }

    private var rolloverColor: Color {
        switch category.rollover {
        case .savings: return .orange
        case .misc: return .secondary
        }
    }
}
