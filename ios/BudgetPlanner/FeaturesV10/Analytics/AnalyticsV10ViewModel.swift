// Phase 27-10 Task 2: AnalyticsV10ViewModel — data loader + state machine
// for the iOS Analytics screen. Symmetric to web Plan 27-05
// `frontend/src/screensV10/Analytics/AnalyticsMount.tsx`.
//
// Loads categories + periods + top-categories + per-period actuals (curr +
// prev) in parallel via async-let, then derives bar / KPI rows through
// the AnalyticsData pure helpers.
//
// **Plan vs reality (Rule 3 deviation, mirrors web 27-05)**:
//   The plan draft asked for `ActualV10API.list(periodStart:periodEnd:)`.
//   The actual iOS API surface (Phase 25-03 `ActualV10API.list`) takes a
//   `periodId: Int` only. We resolve `periodId` by joining the selected
//   `MonthOption` with `PeriodsAPI.list()` on the YYYY-MM month prefix —
//   identical to web AnalyticsMount's listPeriods()-based approach.
//
// Threat-model anchors:
//   T-27-10-01 — top-categories cross-tenant: server-side RLS is enough.
//   T-27-10-02 — rapid month-switch fetch spam: `inFlight` guard.
//   T-27-10-03 — div-by-zero in computeAnalytics: helpers guard internally.

import Foundation
import Observation

@MainActor
@Observable
final class AnalyticsV10ViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    // MARK: - Public state (Observable)

    var status: Status = .idle
    var monthOptions: [AnalyticsData.MonthOption] = []
    var selectedMonth: AnalyticsData.MonthOption? = nil
    var groupMode: AnalyticsData.GroupMode = .day
    var actuals: [ActualV10DTO] = []
    var prevActuals: [ActualV10DTO] = []
    var categories: [CategoryV10DTO] = []
    var topCats: [TopCategoryItemDTO] = []
    var errorMessage: String? = nil

    // MARK: - Private

    /// T-27-10-02 — re-entrancy guard against rapid chip-switch fetch spam.
    private var inFlight: Bool = false

    /// Calendar pinned to UTC for deterministic grouping (matches the
    /// backend's `tx_date` storage). The Europe/Moscow TZ on the cycle
    /// scheduler does not apply to per-day analytics aggregation.
    @ObservationIgnored
    private let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC") ?? .current
        return c
    }()

    // MARK: - Init

    init(now: Date = Date()) {
        self.monthOptions = AnalyticsData.lastNMonths(now, 3, calendar: calendar)
        // Default selection: most recent month (rightmost chip).
        self.selectedMonth = monthOptions.last
    }

    // MARK: - Mutations

    /// Switch the visible period and reload. No-op when the same chip is
    /// re-tapped to avoid wasted fetches.
    func selectMonth(_ m: AnalyticsData.MonthOption) async {
        if selectedMonth?.id == m.id { return }
        selectedMonth = m
        await load()
    }

    /// Switch bar-chart bucketing. Pure UI state — no fetch needed.
    func selectGroup(_ g: AnalyticsData.GroupMode) {
        groupMode = g
    }

    /// Resolve the iOS PeriodDTO whose start month matches the chip.
    /// Returns nil when the period is not yet present on the server (e.g.
    /// looking at a future month before close-period created the row).
    private func resolvePeriodId(
        for option: AnalyticsData.MonthOption,
        in periods: [PeriodDTO]
    ) -> Int? {
        let prefix = String(option.periodStart.prefix(7))  // YYYY-MM
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM"
        f.timeZone = TimeZone(identifier: "UTC")
        return periods.first(where: {
            f.string(from: $0.periodStart) == prefix
        })?.id
    }

    // MARK: - Load

    /// Fetch every backing dataset in parallel and rebuild the view state.
    func load() async {
        guard let m = selectedMonth else { return }
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        errorMessage = nil

        do {
            // Parallel fan-out — all four endpoints are independent.
            async let catsTask = CategoriesV10API.list()
            async let topsTask = AnalyticsV10API.topCategories(range: "1M")
            async let periodsTask = PeriodsAPI.list()

            let (cats, tops, periods) = try await (catsTask, topsTask, periodsTask)

            self.categories = cats
            self.topCats = tops

            // Resolve per-period actuals via the period_id join.
            let curIdx = monthOptions.firstIndex(of: m) ?? 0
            let prevOption: AnalyticsData.MonthOption? =
                curIdx > 0 ? monthOptions[curIdx - 1] : nil

            let curPid = resolvePeriodId(for: m, in: periods)
            let prevPid = prevOption.flatMap { resolvePeriodId(for: $0, in: periods) }

            // Curr fetch — empty fallback when no matching period yet.
            if let pid = curPid {
                self.actuals = (try? await ActualV10API.list(periodId: pid)) ?? []
            } else {
                self.actuals = []
            }
            // Prev fetch — best-effort, never fails the screen.
            if let pid = prevPid {
                self.prevActuals = (try? await ActualV10API.list(periodId: pid)) ?? []
            } else {
                self.prevActuals = []
            }

            status = .ready
        } catch {
            errorMessage = "Не удалось загрузить аналитику"
            status = .error("Не удалось загрузить аналитику")
        }
    }

    // MARK: - Derived (computed at view time, no caching needed)

    var kpiSpent: (sumCents: Int, deltaCents: Int, deltaPct: Int) {
        AnalyticsData.computeKPISpent(curr: actuals, prev: prevActuals)
    }

    var kpiSaved: Int {
        AnalyticsData.computeKPISaved(actuals: actuals, categories: categories)
    }

    /// Bar-chart data + the matching plan (used for red-highlight). Plan
    /// is only meaningful in `.cat` mode; for day/week we pass 0 so the
    /// red gate is dormant by design (mirrors web behaviour).
    var barRows: [(label: String, sumCents: Int, planCents: Int)] {
        guard let m = selectedMonth else { return [] }
        switch groupMode {
        case .day:
            let f = DateFormatter()
            f.dateFormat = "d"
            f.timeZone = TimeZone(identifier: "UTC")
            let buckets = AnalyticsData.groupByDay(
                actuals,
                periodStart: parseDate(m.periodStart),
                periodEnd: parseDate(m.periodEnd)
            )
            return buckets.map { (f.string(from: $0.key), $0.sumCents, 0) }
        case .week:
            let buckets = AnalyticsData.groupByWeek(actuals, calendar: calendar)
            return buckets.map { ("W\($0.weekIdx)", $0.sumCents, 0) }
        case .cat:
            let buckets = AnalyticsData.groupByCategory(actuals, categories: categories)
            return buckets.prefix(8).map {
                ($0.name.uppercased(), $0.sumCents, $0.planCents)
            }
        }
    }

    private func parseDate(_ ymd: String) -> Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: ymd) ?? Date()
    }
}
