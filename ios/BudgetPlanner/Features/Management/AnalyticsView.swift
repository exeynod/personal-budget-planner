import SwiftUI
import Charts

@MainActor
@Observable
final class AnalyticsViewModel {
    var topCategories: TopCategoriesResponse?
    var forecast: ForecastResponse?
    var trend: TrendResponse?
    var range: String = "1M"
    var isLoading: Bool = false
    var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let topTask = AnalyticsAPI.topCategories(range: range)
            async let forecastTask: ForecastResponse? = try? await AnalyticsAPI.forecast()
            async let trendTask: TrendResponse? = try? await AnalyticsAPI.trend(range: "3M")
            self.topCategories = try await topTask
            self.forecast = await forecastTask
            self.trend = await trendTask
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct AnalyticsView: View {
    @State private var viewModel = AnalyticsViewModel()

    var body: some View {
        ZStack {
            MeshDarkBackground()

            ScrollView {
                VStack(spacing: Tokens.Spacing.lg) {
                    Picker("Период", selection: $viewModel.range) {
                        Text("1М").tag("1M")
                        Text("3М").tag("3M")
                        Text("6М").tag("6M")
                        Text("12М").tag("12M")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: viewModel.range) { _, _ in
                        Task { await viewModel.load() }
                    }

                    if let f = viewModel.forecast {
                        ForecastSection(forecast: f)
                    }

                    if let trend = viewModel.trend, !trend.points.isEmpty {
                        TrendSection(trend: trend)
                    }

                    if let top = viewModel.topCategories, !top.categories.isEmpty {
                        TopCategoriesChart(top: top)
                    }
                }
                .padding(Tokens.Spacing.xl)
                .padding(.bottom, 60)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Аналитика")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }
}

private struct ForecastSection: View {
    let forecast: ForecastResponse

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.sm) {
            Text("Прогноз").font(.appLabel).foregroundStyle(.secondary)

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Расход на конец")
                        .font(.appCaption).foregroundStyle(.secondary)
                    Text(MoneyFormatter.formatWithSymbol(cents: forecast.projectedExpenseCents))
                        .font(.appNumber)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Баланс на конец")
                        .font(.appCaption).foregroundStyle(.secondary)
                    Text(MoneyFormatter.formatWithSymbol(cents: forecast.projectedBalanceCents))
                        .font(.appNumber)
                        .foregroundStyle(forecast.projectedBalanceCents >= 0 ? .green : .red)
                }
            }

            HStack(spacing: Tokens.Spacing.sm) {
                Label("\(MoneyFormatter.formatWithSymbol(cents: forecast.runRateCentsPerDay))/день",
                      systemImage: "speedometer")
                    .font(.appCaption).foregroundStyle(.secondary)
                Spacer()
                Label("\(forecast.daysRemaining) дн. осталось",
                      systemImage: "calendar")
                    .font(.appCaption).foregroundStyle(.secondary)
            }
        }
        .padding(Tokens.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

private struct TrendSection: View {
    let trend: TrendResponse

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.sm) {
            Text("Тренд расходов").font(.appLabel).foregroundStyle(.secondary)

            Chart(Array(trend.points.enumerated()), id: \.offset) { index, point in
                LineMark(
                    x: .value("Период", DateFormatters.displayDayShort.string(from: point.periodStart)),
                    y: .value("Факт", Double(point.actualExpenseCents) / 100.0)
                )
                .foregroundStyle(Tokens.Accent.primary)
                .symbol(Circle())

                LineMark(
                    x: .value("Период", DateFormatters.displayDayShort.string(from: point.periodStart)),
                    y: .value("План", Double(point.plannedExpenseCents) / 100.0)
                )
                .foregroundStyle(.gray)
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4]))
            }
            .frame(height: 200)
        }
        .padding(Tokens.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

private struct TopCategoriesChart: View {
    let top: TopCategoriesResponse

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.sm) {
            Text("Топ категорий").font(.appLabel).foregroundStyle(.secondary)

            Chart(top.categories) { row in
                BarMark(
                    x: .value("Сумма", Double(row.totalCents) / 100.0),
                    y: .value("Категория", row.categoryName)
                )
                .foregroundStyle(Tokens.Categories.color(for: row.categoryName))
            }
            .frame(height: CGFloat(top.categories.count) * 36 + 24)
        }
        .padding(Tokens.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}
