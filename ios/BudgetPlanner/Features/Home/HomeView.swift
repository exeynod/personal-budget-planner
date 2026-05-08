import SwiftUI

@MainActor
@Observable
final class HomeViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(period: PeriodDTO, balance: BalanceResponse)
        case noActivePeriod
        case error(String)
    }

    private(set) var state: LoadState = .idle

    func load() async {
        state = .loading
        do {
            let period = try await PeriodsAPI.current()
            let balance = try await PeriodsAPI.balance(periodId: period.id)
            state = .loaded(period: period, balance: balance)
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
            AdaptiveBackground()

            ScrollView {
                VStack(spacing: Tokens.Spacing.lg) {
                    HStack {
                        Text("Главная")
                            .font(.appTitle)
                        Spacer()
                    }

                    contentView
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, Tokens.Spacing.xl)
                .padding(.top, Tokens.Spacing.lg)
                .padding(.bottom, 120)
            }
            .refreshable {
                await viewModel.load()
            }
        }
        .task {
            await viewModel.load()
        }
    }

    @ViewBuilder
    private var contentView: some View {
        switch viewModel.state {
        case .idle, .loading:
            VStack(spacing: Tokens.Spacing.lg) {
                ProgressView().padding(.top, 60)
            }
        case .loaded(let period, let balance):
            HeroCard(balance: balance, period: period)
            ForecastCard(balance: balance)
            TopCategoriesSection(balance: balance)
        case .noActivePeriod:
            VStack(spacing: Tokens.Spacing.md) {
                Text("Нет активного периода")
                    .font(.appTitle)
                Text("Завершите onboarding, чтобы создать первый период.")
                    .font(.appBody)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 80)
        case .error(let message):
            VStack(spacing: Tokens.Spacing.md) {
                Text("Не удалось загрузить данные")
                    .font(.appTitle)
                Text(message)
                    .font(.appBody)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Повторить") {
                    Task { await viewModel.load() }
                }
                .padding(.vertical, Tokens.Spacing.md)
                .padding(.horizontal, Tokens.Spacing.xl)
                .background(Tokens.Accent.primary, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
                .foregroundStyle(.white)
            }
            .padding(.top, 80)
        }
    }
}

struct HeroCard: View {
    let balance: BalanceResponse
    let period: PeriodDTO

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.md) {
            Text("Баланс периода")
                .font(.appLabel)
                .foregroundStyle(.secondary)

            Text(MoneyFormatter.formatWithSymbol(cents: balance.balanceNowCents))
                .font(.appHero)

            HStack(spacing: Tokens.Spacing.lg) {
                MetricColumn(title: "Расходы", actual: balance.actualTotalExpenseCents,
                             planned: balance.plannedTotalExpenseCents)
                MetricColumn(title: "Доходы", actual: balance.actualTotalIncomeCents,
                             planned: balance.plannedTotalIncomeCents)
            }
            .padding(.top, Tokens.Spacing.sm)

            HStack {
                Text(periodLabel)
                    .font(.appCaption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding(Tokens.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    private var periodLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.dateFormat = "d MMM"
        return "\(formatter.string(from: period.periodStart)) – \(formatter.string(from: period.periodEnd))"
    }
}

private struct MetricColumn: View {
    let title: String
    let actual: Int
    let planned: Int

    var delta: Int { planned - actual }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.appCaption)
                .foregroundStyle(.secondary)
            Text(MoneyFormatter.format(cents: actual))
                .font(.appNumber)
            Text("из \(MoneyFormatter.format(cents: planned))")
                .font(.appCaption)
                .foregroundStyle(.secondary)
        }
    }
}

struct ForecastCard: View {
    let balance: BalanceResponse

    var body: some View {
        let runRate = balance.actualTotalExpenseCents
        let budget = balance.plannedTotalExpenseCents
        let remainingBudget = max(0, budget - runRate)
        let isOver = runRate > budget

        return VStack(alignment: .leading, spacing: Tokens.Spacing.sm) {
            Text("Прогноз")
                .font(.appLabel)
                .foregroundStyle(.secondary)

            HStack {
                if isOver {
                    Text("Превышение лимита")
                        .font(.appBody.weight(.semibold))
                        .foregroundStyle(.red)
                } else {
                    Text("Осталось до конца периода")
                        .font(.appBody)
                }
                Spacer()
                Text(MoneyFormatter.formatWithSymbol(cents: remainingBudget))
                    .font(.appNumber)
                    .foregroundStyle(isOver ? .red : .primary)
            }
        }
        .padding(Tokens.Spacing.lg)
        .frame(maxWidth: .infinity)
        .glassCard()
    }
}

struct TopCategoriesSection: View {
    let balance: BalanceResponse

    var topRows: [BalanceCategoryRow] {
        balance.byCategory
            .filter { $0.kind == .expense && $0.actualCents > 0 }
            .sorted { $0.actualCents > $1.actualCents }
            .prefix(3)
            .map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.md) {
            Text("Топ категории")
                .font(.appLabel)
                .foregroundStyle(.secondary)

            if topRows.isEmpty {
                Text("Нет трат в этом периоде")
                    .font(.appBody)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, Tokens.Spacing.sm)
            } else {
                ForEach(topRows) { row in
                    DashboardCategoryRow(row: row)
                }
            }
        }
        .padding(Tokens.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

struct DashboardCategoryRow: View {
    let row: BalanceCategoryRow

    var body: some View {
        HStack(spacing: Tokens.Spacing.md) {
            Circle()
                .fill(Tokens.Categories.color(for: row.name))
                .frame(width: 10, height: 10)

            Text(row.name)
                .font(.appBody)

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(MoneyFormatter.format(cents: row.actualCents))
                    .font(.appNumber)
                Text(deltaLabel)
                    .font(.appCaption)
                    .foregroundStyle(deltaColor)
            }
        }
        .padding(.vertical, Tokens.Spacing.xs)
    }

    private var deltaLabel: String {
        let prefix = row.deltaCents >= 0 ? "+" : ""
        return "\(prefix)\(MoneyFormatter.format(cents: row.deltaCents))"
    }

    private var deltaColor: Color {
        row.deltaCents >= 0 ? .green : .red
    }
}
