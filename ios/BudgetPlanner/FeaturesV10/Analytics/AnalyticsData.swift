// Phase 27-10 Task 1: AnalyticsData — pure compute helpers for the iOS
// Analytics screen. Symmetric to web Plan 27-05
// `frontend/src/screensV10/Analytics/computeAnalytics.ts`.
//
// All helpers are stateless static methods on `enum AnalyticsData` (mirror
// of the iOS PlanData / CategoryDetailData pattern). The View / VM wires
// them; the helpers are exhaustively unit-tested in
// `BudgetPlannerTests/FeaturesV10/AnalyticsDataTests.swift`.
//
// Threat-model anchors:
//   T-27-10-03 — `shouldHighlightRed` and `computePct` both guard
//                `plan <= 0` so the bar chart never renders NaN heights
//                or div-by-zero pct labels.

import Foundation

enum AnalyticsData {

    // MARK: - Period chips

    /// Russian 3-letter month abbreviations used by the chip labels.
    /// Symmetric to web `MONTHS_RU_SHORT` in computeAnalytics.ts.
    static let monthsRuShort: [String] = [
        "ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН",
        "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК",
    ]

    /// Bar-chart group mode. Selected via the second chip-row.
    enum GroupMode: Equatable {
        case day
        case week
        case cat
    }

    /// One option in the period chip row.
    struct MonthOption: Equatable, Identifiable, Hashable {
        let label: String  // «МАЙ 26»
        let year: Int
        let month: Int  // 1..12
        let periodStart: String  // YYYY-MM-01
        let periodEnd: String  // YYYY-MM-DD (last day)

        var id: String { periodStart }
    }

    /// Build the trailing-N month chip list, sorted ASCending (oldest → now).
    /// `now` is injected so tests are deterministic regardless of host TZ.
    static func lastNMonths(
        _ now: Date,
        _ n: Int,
        calendar: Calendar = .current
    ) -> [MonthOption] {
        var out: [MonthOption] = []
        let comps = calendar.dateComponents([.year, .month], from: now)
        let baseYear = comps.year ?? 2026
        let baseMonth = comps.month ?? 1
        for i in stride(from: n - 1, through: 0, by: -1) {
            let total = (baseYear * 12 + (baseMonth - 1)) - i
            let y = total / 12
            let m = (total % 12) + 1
            let yy = String(format: "%02d", y % 100)
            let label = "\(monthsRuShort[m - 1]) \(yy)"
            // Last day-of-month — calendar.range upperBound is exclusive
            // (1..32 for May), so subtract 1 for the inclusive last day.
            let firstOfMonth = calendar.date(
                from: DateComponents(year: y, month: m, day: 1)
            )!
            let lastDay = (calendar.range(of: .day, in: .month, for: firstOfMonth)?.upperBound ?? 32) - 1
            out.append(
                MonthOption(
                    label: label,
                    year: y,
                    month: m,
                    periodStart: String(format: "%04d-%02d-01", y, m),
                    periodEnd: String(format: "%04d-%02d-%02d", y, m, lastDay)
                ))
        }
        return out
    }

    // MARK: - Bar-chart bucketing

    /// One day bucket. `key` is the txDate business-date (MSK midnight).
    struct DayBucket: Equatable {
        let key: BusinessDate
        let sumCents: Int
    }

    /// Group expense actuals by day (MSK calendar day). Income / roundup /
    /// deposit kinds are excluded — analytics screen tracks spend.
    ///
    /// E2/R7: `periodStart` / `periodEnd` and `txDate` are all `BusinessDate`,
    /// so the inclusive range and the `Dictionary(grouping:by:)` key are direct
    /// BusinessDate operations — both anchored at MSK midnight. The grouping key
    /// is one-bucket-per-MSK-day (BusinessDate Hashable equates same-MSK-day),
    /// so buckets cannot fragment, and the inclusive `[periodStart, periodEnd]`
    /// selects exactly the same transactions as before.
    static func groupByDay(
        _ actuals: [ActualV10DTO],
        periodStart: BusinessDate,
        periodEnd: BusinessDate
    ) -> [DayBucket] {
        let filtered = actuals.filter {
            $0.kind == .expense && $0.txDate >= periodStart && $0.txDate <= periodEnd
        }
        let grouped = Dictionary(grouping: filtered, by: { $0.txDate })
        return
            grouped
            .map { DayBucket(key: $0.key, sumCents: $0.value.reduce(0) { $0 + abs($1.amountCents) }) }
            .sorted { $0.key < $1.key }
    }

    /// One week bucket. `weekIdx` is 1..5 within the calendar month.
    struct WeekBucket: Equatable {
        let weekIdx: Int
        let sumCents: Int
    }

    /// Group expense actuals by week-of-month (`(day + 6) / 7` → 1..5).
    /// Symmetric to web `groupActualsByWeek` (computeAnalytics.ts).
    static func groupByWeek(
        _ actuals: [ActualV10DTO],
        calendar: Calendar = Calendar(identifier: .gregorian)
    ) -> [WeekBucket] {
        let filtered = actuals.filter { $0.kind == .expense }
        var buckets: [Int: Int] = [:]
        // E2/R7: txDate is a BusinessDate anchored at MSK midnight. The
        // day-of-month for the week partition is the MSK calendar day, so read
        // the day component in Europe/Moscow (was UTC — which, against a
        // MSK-midnight instant, would read the previous calendar day). Bridge
        // txDate via `.date` for the Calendar read.
        var cal = calendar
        cal.timeZone = TimeZone(identifier: "Europe/Moscow") ?? cal.timeZone
        for t in filtered {
            let day = cal.component(.day, from: t.txDate.date)
            let weekIdx = (day + 6) / 7  // 1..5
            buckets[weekIdx, default: 0] += abs(t.amountCents)
        }
        return
            buckets
            .map { WeekBucket(weekIdx: $0.key, sumCents: $0.value) }
            .sorted { $0.weekIdx < $1.weekIdx }
    }

    /// One category bucket — used by the «КАТ.» group mode and as a
    /// helper for `computeKPISaved`.
    struct CategoryBucket: Equatable {
        let categoryId: Int
        let name: String
        let planCents: Int
        let sumCents: Int
    }

    /// Group expense actuals by category_id, sorted DESC by sum.
    /// Categories without any spend in the period are omitted.
    static func groupByCategory(
        _ actuals: [ActualV10DTO],
        categories: [CategoryV10DTO]
    ) -> [CategoryBucket] {
        let filtered = actuals.filter { $0.kind == .expense }
        let catMap = Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })
        var sums: [Int: Int] = [:]
        for t in filtered {
            sums[t.categoryId, default: 0] += abs(t.amountCents)
        }
        return
            sums
            .map { (cid, sum) -> CategoryBucket in
                let cat = catMap[cid]
                return CategoryBucket(
                    categoryId: cid,
                    name: cat?.name ?? "?",
                    planCents: cat?.planCents ?? 0,
                    sumCents: sum
                )
            }
            .sorted { $0.sumCents > $1.sumCents }
    }

    // MARK: - KPI plates

    /// Return tuple for the «ПОТРАЧЕНО» plate (Σ expense + month-on-month
    /// delta). Sign convention: `deltaCents > 0` means we spent MORE this
    /// month than last (red on UI); `deltaCents < 0` is good (green).
    /// `deltaPct` is rounded to nearest int; returns 0 when `prev` is 0.
    static func computeKPISpent(
        curr: [ActualV10DTO],
        prev: [ActualV10DTO]
    ) -> (sumCents: Int, deltaCents: Int, deltaPct: Int) {
        let sum: ([ActualV10DTO]) -> Int = { xs in
            xs.filter { $0.kind == .expense }.reduce(0) { $0 + abs($1.amountCents) }
        }
        let curSum = sum(curr)
        let prevSum = sum(prev)
        let delta = curSum - prevSum
        let pct: Int
        if prevSum == 0 {
            pct = 0
        } else {
            pct = Int((Double(delta) / Double(prevSum) * 100.0).rounded())
        }
        return (curSum, delta, pct)
    }

    /// «СЭКОНОМЛЕНО» plate: Σ of positive (plan − fact) remainders across
    /// non-paused, non-savings categories. Mirrors web `computeKPISaved`.
    /// Categories with no spend contribute their full plan to savings.
    static func computeKPISaved(
        actuals: [ActualV10DTO],
        categories: [CategoryV10DTO]
    ) -> Int {
        let buckets = groupByCategory(actuals, categories: categories)
        let factById = Dictionary(uniqueKeysWithValues: buckets.map { ($0.categoryId, $0.sumCents) })
        var saved = 0
        for c in categories {
            if c.code == "savings" { continue }
            let fact = factById[c.id] ?? 0
            saved += max(0, c.planCents - fact)
        }
        return saved
    }

    // MARK: - Bar chart highlight + percent helpers

    /// Highlight a bar red when its sum reaches ≥ `threshold` of its plan.
    /// T-27-10-03: `plan <= 0` is treated as «no plan» → never red.
    static func shouldHighlightRed(
        barSum: Int,
        barPlan: Int,
        threshold: Double = 0.75
    ) -> Bool {
        guard barPlan > 0 else { return false }
        return Double(barSum) / Double(barPlan) >= threshold
    }

    /// Clamp the (sum/plan) ratio to 0..100 percent.
    /// T-27-10-03: `plan <= 0` returns 0 (no division by zero).
    static func computePct(sum: Int, plan: Int) -> Int {
        guard plan > 0 else { return 0 }
        let raw = Double(sum) / Double(plan) * 100.0
        return max(0, min(100, Int(raw.rounded())))
    }
}
