import SwiftUI

// Native iOS CategoryDetail — pushed drill-down from the Home category list.
//
// Parity port of the web `NativeCategoryDetailView` (frontend/src/screensV10/
// CategoryDetail/NativeCategoryDetailView.tsx). Closes the iOS parity gap where
// Home rows were non-tappable and no native detail surfaced the v1.1 4-level
// plan↔fact ladder.
//
// Ladder (expense convention «+ = good»):
//   - Лимит         = per-period plan limit for this category (BalanceCategoryRow.plannedCents)
//   - Запланировано = Σ |amount| of this category's UNPOSTED planned rows
//                     (postedTxnId == nil && source != .subscriptionAuto — same
//                     anti-double-count filter as the Home ladder / web
//                     `unpostedByCategory`)
//   - Факт          = Σ realised actual (expense kind) for this category
//   - В запасе      = Лимит − Факт  (positive = good)
//
// Money is BIGINT kopecks throughout; rendered via MoneyFormatter. Material is
// `.regularMaterial` (Liquid Glass), matching the Home hero card.

/// Hashable navigation value pushed from the Home category list. Carries
/// everything the detail needs from `BalanceCategoryRow` so we don't have to
/// re-resolve the category server-side. `periodId` scopes the operation/planned
/// fetches.
struct CategoryDetailRoute: Hashable {
    let categoryId: Int
    let name: String
    let kind: CategoryKind
    let plannedCents: Int
    let actualCents: Int
    let periodId: Int
}

@MainActor
@Observable
final class CategoryLadderViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(actuals: [ActualV10DTO], plannedUnpostedCents: Int)
        case error(String)
    }

    private(set) var state: LoadState = .idle

    func load(route: CategoryDetailRoute) async {
        state = .loading
        do {
            // Category-scoped fetches (server filters by category_id). Planned is
            // cheap (already cached per period by Home), actuals scoped to this
            // category only.
            async let actualsTask = ActualV10API.list(
                periodId: route.periodId, categoryId: route.categoryId)
            async let plannedTask = PlannedAPI.list(
                periodId: route.periodId, categoryId: route.categoryId)
            let (actuals, planned) = try await (actualsTask, plannedTask)

            // Per-category «Запланировано» — Σ |amount| of UNPOSTED planned rows,
            // excluding subscription_auto (anti-double-count). Mirrors web
            // `unpostedByCategory(planned).get(categoryId)`.
            var unposted = 0
            for p in planned {
                if p.postedTxnId != nil { continue }
                if p.source == .subscriptionAuto { continue }
                unposted += Swift.abs(p.amountCents)
            }

            state = .loaded(actuals: actuals, plannedUnpostedCents: unposted)
        } catch {
            #if DEBUG
            print("CategoryDetailView.load error: \(error)")
            #endif
            state = .error(error.userFacingRu)
        }
    }
}

struct CategoryLadderView: View {
    let route: CategoryDetailRoute

    @State private var viewModel = CategoryLadderViewModel()

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: route.name)
    }

    var body: some View {
        content
            .navigationTitle(route.name)
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load(route: route) }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle, .loading:
            ProgressView().controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loaded(let actuals, let plannedUnposted):
            CategoryDetailList(
                route: route,
                visual: visual,
                actuals: actuals,
                plannedUnpostedCents: plannedUnposted,
                onRefresh: { await viewModel.load(route: route) }
            )

        case .error(let message):
            ContentUnavailableView {
                Label("Не удалось загрузить", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Повторить") { Task { await viewModel.load(route: route) } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

// MARK: - List

private struct CategoryDetailList: View {
    let route: CategoryDetailRoute
    let visual: Tokens.Categories.Visual
    let actuals: [ActualV10DTO]
    let plannedUnpostedCents: Int
    var onRefresh: (() async -> Void)? = nil

    /// «Факт» — Σ expense-kind actuals for this category. The category-scoped
    /// list may include roundup/deposit/income kinds; the ladder Факт level is
    /// expense-scoped (mirrors `computeFactForCategory` on web, which sums all
    /// rows, but here the category kind drives it — see `factCents`).
    private var factCents: Int {
        // For an expense category, Факт = Σ expense actuals; for income, Σ income.
        let targetKind: ActualKindV10 = route.kind == .income ? .income : .expense
        return actuals
            .filter { $0.kind == targetKind }
            .reduce(0) { $0 + $1.amountCents }
    }

    private var planCents: Int { route.plannedCents }

    /// «В запасе» = Лимит − Факт for expense; for income «Сверх» = Факт − План.
    private var surplusCents: Int {
        route.kind == .income ? factCents - planCents : planCents - factCents
    }

    private var dayGroups: [DayGroup] {
        DayGroup.group(actuals)
    }

    var body: some View {
        List {
            Section {
                SummaryCard(
                    route: route,
                    visual: visual,
                    factCents: factCents,
                    plannedUnpostedCents: plannedUnpostedCents,
                    surplusCents: surplusCents
                )
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            Section("Операции по категории") {
                if dayGroups.isEmpty {
                    Text("Операций пока нет")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(dayGroups) { group in
                        ForEach(group.rows) { tx in
                            CategoryOperationRow(actual: tx, categoryName: route.name, visual: visual)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await onRefresh?() }
    }
}

// MARK: - Summary card (icon + fact + 4-level ladder + progress bar)

private struct SummaryCard: View {
    let route: CategoryDetailRoute
    let visual: Tokens.Categories.Visual
    let factCents: Int
    let plannedUnpostedCents: Int
    let surplusCents: Int

    private var planCents: Int { route.plannedCents }
    private var isOver: Bool { factCents > planCents }
    private var surplusPositive: Bool { surplusCents >= 0 }

    /// Fill ratio capped at 1.0 (over-budget surfaced via colour, not >100% bar).
    private var fillRatio: Double {
        guard planCents > 0 else { return factCents > 0 ? 1.0 : 0.0 }
        return Swift.min(1.0, Double(factCents) / Double(planCents))
    }

    private var ladderCells: [DetailLadderCell] {
        var cells: [DetailLadderCell] = []
        if route.kind == .income {
            cells.append(DetailLadderCell(label: "План", value: planCents, color: .primary))
            cells.append(DetailLadderCell(label: "Факт", value: factCents, color: .primary))
            cells.append(
                DetailLadderCell(
                    label: "Сверх", value: surplusCents,
                    color: surplusPositive ? .green : .red, signed: true))
        } else {
            cells.append(DetailLadderCell(label: "Лимит", value: planCents, color: .primary))
            cells.append(
                DetailLadderCell(
                    label: "Запланировано", value: plannedUnpostedCents, color: .primary))
            cells.append(DetailLadderCell(label: "Факт", value: factCents, color: .primary))
            cells.append(
                DetailLadderCell(
                    label: "В запасе", value: surplusCents,
                    color: surplusPositive ? .green : .red, signed: true))
        }
        return cells
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Head: icon + name + fact headline
            HStack(spacing: 12) {
                Image(systemName: visual.icon)
                    .font(.title3)
                    .foregroundStyle(visual.color)
                    .frame(width: 40, height: 40)
                    .background(
                        visual.color.opacity(0.15),
                        in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(route.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text(MoneyFormatter.format(cents: factCents))
                            .font(.title2.monospacedDigit().weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text("₽")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }

            // 4-level ladder
            HStack(spacing: 12) {
                ForEach(ladderCells) { cell in
                    DetailMetricCell(
                        label: cell.label, value: cell.value, color: cell.color,
                        signed: cell.signed)
                }
            }

            // Progress bar (capped 100%, over-budget tint).
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.18))
                    Capsule()
                        .fill(isOver ? Color.red : visual.color)
                        .frame(width: geo.size.width * fillRatio)
                }
            }
            .frame(height: 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            .regularMaterial,
            in: RoundedRectangle(cornerRadius: Tokens.Radius.large, style: .continuous))
    }
}

private struct DetailLadderCell: Identifiable {
    let id = UUID()
    let label: String
    let value: Int
    let color: Color
    var signed: Bool = false
}

private struct DetailMetricCell: View {
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
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(formatted)
                .font(.subheadline.monospacedDigit().weight(.semibold))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Operation row

private struct CategoryOperationRow: View {
    let actual: ActualV10DTO
    let categoryName: String
    let visual: Tokens.Categories.Visual

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: visual.icon)
                .font(.body)
                .foregroundStyle(visual.color)
                .frame(width: 28, height: 28)
                .background(
                    visual.color.opacity(0.15),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous))

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

            Text(amountText)
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(amountColor)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
    }

    private var titleText: String {
        if let d = actual.description, !d.isEmpty { return d }
        return categoryName
    }

    private var metaLine: String {
        actual.source == .bot ? "из бота" : categoryName
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

// MARK: - Day grouping

/// One day-bucket of operations, newest-first, with a stable id for ForEach.
private struct DayGroup: Identifiable {
    let id: Date
    let rows: [ActualV10DTO]

    /// Group by `txDate` (business date, MSK), newest day first; within a day,
    /// newest createdAt first (falling back to txDate). Mirrors web groupByDay.
    static func group(_ actuals: [ActualV10DTO]) -> [DayGroup] {
        let buckets = Dictionary(grouping: actuals) { $0.txDate.date }
        return buckets
            .map { (day, rows) in
                let sorted = rows.sorted { lhs, rhs in
                    (lhs.createdAt ?? lhs.txDate.date) > (rhs.createdAt ?? rhs.txDate.date)
                }
                return DayGroup(id: day, rows: sorted)
            }
            .sorted { $0.id > $1.id }
    }
}
