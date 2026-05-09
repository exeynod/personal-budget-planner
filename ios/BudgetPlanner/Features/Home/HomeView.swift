import SwiftUI

@MainActor
@Observable
final class HomeViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(period: PeriodDTO, balance: BalanceResponse, categories: [CategoryDTO])
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
            let (period, cats) = try await (periodTask, categoriesTask)
            let balance = try await PeriodsAPI.balance(periodId: period.id)
            state = .loaded(period: period, balance: balance, categories: cats)
        } catch APIError.notFound {
            state = .noActivePeriod
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}

struct HomeView: View {
    @State private var viewModel = HomeViewModel()

    var body: some View {
        ZStack {
            AuroraBackground()

            ScrollView {
                VStack(spacing: Tokens.Spacing.md) {
                    contentView
                }
                .padding(.horizontal, Tokens.Spacing.base)
                .padding(.top, Tokens.Spacing.lg)
                .padding(.bottom, 120)
            }
            .refreshable { await viewModel.load() }
        }
        .task {
            await viewModel.load()
        }
    }

    @ViewBuilder
    private var contentView: some View {
        switch viewModel.state {
        case .idle, .loading:
            ProgressView().padding(.top, 80)
        case .loaded(let period, let balance, let categories):
            HeroCard(balance: balance, period: period, kind: viewModel.activeKind)
            HomeKindTabs(selection: $viewModel.activeKind)
            CategoriesList(
                balance: balance,
                categories: categories,
                kind: viewModel.activeKind
            )
        case .noActivePeriod:
            EmptyState(
                title: "Нет активного периода",
                subtitle: "Завершите onboarding, чтобы создать первый период."
            )
        case .error(let message):
            VStack(spacing: Tokens.Spacing.md) {
                Text("Не удалось загрузить").font(.appTitle)
                Text(message).font(.appBody).foregroundStyle(.secondary)
                Button("Повторить") { Task { await viewModel.load() } }
                    .buttonStyle(.borderedProminent)
                    .tint(Tokens.Accent.primary)
            }
            .padding(.top, 80)
        }
    }
}

// MARK: - HeroCard (porting frontend/src/components/HeroCard.tsx)

struct HeroCard: View {
    let balance: BalanceResponse
    let period: PeriodDTO
    let kind: CategoryKind

    private var amountCents: Int {
        period.status == .closed
        ? (period.endingBalanceCents ?? 0)
        : balance.balanceNowCents
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
        if delta > 0 { return Tokens.Accent.primary }
        if delta < 0 { return .red }
        return Tokens.Ink.secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(amountLabel.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.55)
                .foregroundStyle(Tokens.Ink.secondary)

            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(MoneyFormatter.format(cents: amountCents))
                    .font(.system(size: 46, weight: .bold))
                    .monospacedDigit()
                    .tracking(-1)
                    .foregroundStyle(Tokens.Ink.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text("₽")
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(Tokens.Ink.secondary)
            }
            .padding(.top, 2)

            HStack(spacing: 10) {
                MetricPill(kicker: "план", value: MoneyFormatter.format(cents: planned),
                           accent: false, color: Tokens.Ink.primary)
                MetricPill(kicker: "факт", value: MoneyFormatter.format(cents: actual),
                           accent: false, color: Tokens.Ink.primary)
                MetricPill(kicker: deltaLabel.lowercased(),
                           value: signedFormat(cents: delta),
                           accent: true, color: deltaColor)
            }
            .padding(.top, 14)
        }
        .padding(EdgeInsets(top: 22, leading: 22, bottom: 20, trailing: 22))
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(radius: 32)
    }

    private func signedFormat(cents: Int) -> String {
        let prefix = cents > 0 ? "+" : ""
        return prefix + MoneyFormatter.format(cents: cents)
    }
}

private struct MetricPill: View {
    let kicker: String
    let value: String
    let accent: Bool
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(kicker.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(Tokens.Ink.secondary)
            Text(value)
                .font(.system(size: 14, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .liquidGlassPill(radius: 16, accent: accent)
    }
}

// MARK: - Sub-tabs Расходы/Доходы

struct HomeKindTabs: View {
    @Binding var selection: CategoryKind

    var body: some View {
        HStack(spacing: 6) {
            tabButton("Расходы", kind: .expense)
            tabButton("Доходы", kind: .income)
        }
        .padding(4)
        .background(
            ZStack {
                LiquidGlass(style: .systemThinMaterial)
                Color.white.opacity(0.32)
            }
            .clipShape(Capsule())
        )
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.75), lineWidth: 0.5))
    }

    private func tabButton(_ title: String, kind: CategoryKind) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                selection = kind
            }
        } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(selection == kind ? Tokens.Ink.primary : Tokens.Ink.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background {
                    if selection == kind {
                        Tokens.Accent.primary.opacity(0.18).clipShape(Capsule())
                    } else {
                        Color.clear.clipShape(Capsule())
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Category list

private struct CategoriesList: View {
    let balance: BalanceResponse
    let categories: [CategoryDTO]
    let kind: CategoryKind

    var rows: [BalanceCategoryRow] {
        let filtered = balance.byCategory.filter { $0.kind == kind }
        let sortedById = Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0.sortOrder) })
        return filtered.sorted { lhs, rhs in
            (sortedById[lhs.categoryId] ?? Int.max) < (sortedById[rhs.categoryId] ?? Int.max)
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            ForEach(rows) { row in
                CategoryDashboardRow(row: row)
            }
            if rows.isEmpty {
                Text("Нет категорий").font(.appBody).foregroundStyle(.secondary).padding(.top, 24)
            }
        }
    }
}

struct CategoryDashboardRow: View {
    let row: BalanceCategoryRow

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: row.name)
    }

    private var hasPlan: Bool { row.plannedCents > 0 }

    private var progress: Double {
        guard hasPlan else { return 0 }
        return min(1.0, max(0.0, Double(row.actualCents) / Double(row.plannedCents)))
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(visual.color.opacity(0.18))
                Image(systemName: visual.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(visual.color)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(row.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Tokens.Ink.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if hasPlan {
                        HStack(spacing: 4) {
                            Text(MoneyFormatter.format(cents: row.actualCents))
                                .font(.system(size: 13, weight: .semibold))
                                .monospacedDigit()
                            Text("/")
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(Tokens.Ink.tertiary)
                            Text(MoneyFormatter.format(cents: row.plannedCents))
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(Tokens.Ink.secondary)
                                .monospacedDigit()
                        }
                    } else {
                        HStack(spacing: 6) {
                            Text(MoneyFormatter.format(cents: row.actualCents))
                                .font(.system(size: 13, weight: .semibold))
                                .monospacedDigit()
                            Text("Без плана")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Tokens.Accent.primary, in: Capsule())
                        }
                    }
                }

                if hasPlan {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(visual.color.opacity(0.15))
                                .frame(height: 3)
                            Capsule()
                                .fill(progress > 1.0 ? Color.red : visual.color)
                                .frame(width: geo.size.width * progress, height: 3)
                        }
                    }
                    .frame(height: 3)
                }
            }
        }
        .padding(12)
        .liquidGlass(radius: 14, blur: .systemThinMaterial)
    }
}

private struct EmptyState: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: Tokens.Spacing.md) {
            Image(systemName: "tray").font(.system(size: 36)).foregroundStyle(.secondary)
            Text(title).font(.appTitle)
            Text(subtitle).font(.appBody).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 80)
        .frame(maxWidth: .infinity)
    }
}
