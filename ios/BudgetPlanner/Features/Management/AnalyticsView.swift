import Charts
import SwiftUI

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
        defer { isLoading = false }
        do {
            async let topTask = AnalyticsAPI.topCategories(range: range)
            async let forecastTask: ForecastResponse? = try? await AnalyticsAPI.forecast()
            async let trendTask: TrendResponse? = try? await AnalyticsAPI.trend(range: range)
            self.topCategories = try await topTask
            self.forecast = await forecastTask
            self.trend = await trendTask
        } catch {
            #if DEBUG
            print("AnalyticsView.load error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }
}

private let RANGE_TABS: [(id: String, label: String)] = [
    ("1M", "1М"), ("3M", "3М"), ("6M", "6М"), ("12M", "12М"),
]

/// Analytics — native iOS Form-style layout.
///   - Top section: Picker(.segmented) для range
///   - Forecast section: balance + Chart (LineMark)
///   - Top categories section: native Chart (BarMark) или LabeledContent
struct AnalyticsView: View {
    @State private var viewModel = AnalyticsViewModel()

    var body: some View {
        List {
            Section {
                Picker("Период", selection: $viewModel.range) {
                    ForEach(RANGE_TABS, id: \.id) { t in
                        Text(t.label).tag(t.id)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
            }

            if viewModel.isLoading {
                Section { ProgressView() }
            }

            if let err = viewModel.errorMessage {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }

            forecastSection
            topCategoriesSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Аналитика")
        .task { await viewModel.load() }
        .onChange(of: viewModel.range) { _, _ in
            Task { await viewModel.load() }
        }
    }

    @ViewBuilder
    private var forecastSection: some View {
        Section {
            if let f = viewModel.forecast {
                LabeledContent("Прогноз баланса") {
                    Text(MoneyFormatter.formatWithSymbol(cents: f.projectedBalanceCents))
                        .monospacedDigit()
                        .foregroundStyle(f.projectedBalanceCents < 0 ? .red : .primary)
                }
                LabeledContent("Прогноз расходов") {
                    Text(MoneyFormatter.formatWithSymbol(cents: f.projectedExpenseCents))
                        .monospacedDigit()
                }
                LabeledContent("Сжигание/день") {
                    Text(MoneyFormatter.formatWithSymbol(cents: f.runRateCentsPerDay))
                        .monospacedDigit()
                }
                LabeledContent("Дней осталось") {
                    Text("\(f.daysRemaining)")
                        .monospacedDigit()
                }
            } else if !viewModel.isLoading {
                Text("Нет данных для прогноза")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            if let trend = viewModel.trend, trend.points.count > 1 {
                Chart {
                    ForEach(Array(trend.points.enumerated()), id: \.offset) { idx, point in
                        LineMark(
                            x: .value("Период", idx),
                            y: .value("Расход", Double(point.actualExpenseCents) / 100.0),
                            series: .value("series", "actual")
                        )
                        .foregroundStyle(Tokens.Accent.primary)
                        .interpolationMethod(.catmullRom)

                        LineMark(
                            x: .value("Период", idx),
                            y: .value("План", Double(point.plannedExpenseCents) / 100.0),
                            series: .value("series", "plan")
                        )
                        .foregroundStyle(Color.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4]))
                        .interpolationMethod(.catmullRom)
                    }
                }
                .frame(height: 180)
                .chartXAxis {
                    AxisMarks(values: .stride(by: 1)) { value in
                        if let idx = value.as(Int.self), idx < trend.points.count {
                            AxisValueLabel {
                                Text(monthLabel(for: trend.points[idx].periodStart))
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartYAxis {
                    AxisMarks(values: .automatic(desiredCount: 3))
                }
                .padding(.vertical, 8)
            }
        } header: {
            Text("Прогноз")
        } footer: {
            Text("Данные на основе текущего активного периода и истории расходов.")
        }
    }

    @ViewBuilder
    private var topCategoriesSection: some View {
        if let top = viewModel.topCategories, !top.categories.isEmpty {
            Section("Топ категорий") {
                ForEach(top.categories) { cat in
                    HStack(spacing: 12) {
                        let v = Tokens.Categories.visual(for: cat.categoryName)
                        Image(systemName: v.icon)
                            .foregroundStyle(v.color)
                            .frame(width: 24)
                        Text(cat.categoryName)
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(MoneyFormatter.formatWithSymbol(cents: cat.totalCents))
                            .monospacedDigit()
                            .foregroundStyle(.primary)
                    }
                }
            }
        } else if !viewModel.isLoading {
            Section {
                Text("Нет расходов за выбранный период.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Топ категорий")
            }
        }
    }

    private func monthLabel(for date: Date) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "ru_RU")
        fmt.dateFormat = "LLL"
        return String(fmt.string(from: date).prefix(3)).capitalized
    }
}
