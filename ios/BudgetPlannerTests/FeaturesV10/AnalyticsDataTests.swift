// Phase 27-10 Task 1: AnalyticsData unit specs + TopCategoryItemDTO
// JSON-decode round-trip. Symmetric to web Plan 27-05 coverage in
// `frontend/src/screensV10/Analytics/__tests__/computeAnalytics.test.ts`.
//
// 14+ cases covering the full helper surface:
//   - lastNMonths             (3 cases — count, sort, label format)
//   - groupByDay              (2 cases — bucketing + filter to expense)
//   - groupByWeek             (2 cases — week 1..5 partition + sum)
//   - groupByCategory         (2 cases — DESC sort + missing cat fallback)
//   - computeKPISpent         (3 cases — delta sign / zero prev / pct)
//   - computeKPISaved         (2 cases — savings code + paused exclusion)
//   - shouldHighlightRed      (3 cases — under / boundary / no plan)
//   - computePct              (3 cases — clamp / no plan / round)
//   - TopCategoryItemDTO      (2 cases — pctOfPlan computed / nil)

import XCTest

@testable import BudgetPlanner

final class AnalyticsDataTests: XCTestCase {

    // MARK: - Fixtures

    private let dec: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        d.dateDecodingStrategy = .formatted(fmt)
        return d
    }()

    private let utcCal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private func makeCategory(
        id: Int,
        name: String = "Cat",
        code: String = "food",
        planCents: Int = 0,
        paused: Bool = false
    ) -> CategoryV10DTO {
        // code/ord/created_at are required on the wire (Phase 69 B4) — supply
        // valid values so the now-non-optional decode does not throw.
        let json = """
            {
              "id": \(id),
              "name": "\(name)",
              "kind": "expense",
              "is_archived": false,
              "sort_order": 0,
              "created_at": "2026-05-09",
              "code": "\(code)",
              "plan_cents": \(planCents),
              "ord": "01",
              "rollover": "misc",
              "paused": \(paused),
              "parent_id": null
            }
            """.data(using: .utf8)!
        return try! dec.decode(CategoryV10DTO.self, from: json)
    }

    private func makeActual(
        id: Int,
        categoryId: Int,
        amountCents: Int,
        kind: String = "expense",
        date: String = "2026-05-09"
    ) -> ActualV10DTO {
        let json = """
            {
              "id": \(id),
              "period_id": 1,
              "kind": "\(kind)",
              "amount_cents": \(amountCents),
              "description": null,
              "category_id": \(categoryId),
              "tx_date": "\(date)",
              "source": "mini_app",
              "created_at": null,
              "account_id": null,
              "parent_txn_id": null
            }
            """.data(using: .utf8)!
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    private func date(_ ymd: String) -> Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: ymd)!
    }

    // MARK: - lastNMonths

    func test_lastNMonths_3_returns_three_options_sorted_ascending() {
        let now = date("2026-05-15")
        let opts = AnalyticsData.lastNMonths(now, 3, calendar: utcCal)
        XCTAssertEqual(opts.count, 3)
        XCTAssertEqual(opts.map(\.month), [3, 4, 5])
        XCTAssertEqual(opts.map(\.year), [2026, 2026, 2026])
    }

    func test_lastNMonths_label_format_uses_russian_short_month_and_two_digit_year() {
        let now = date("2026-05-15")
        let opts = AnalyticsData.lastNMonths(now, 3, calendar: utcCal)
        XCTAssertEqual(opts.map(\.label), ["МАР 26", "АПР 26", "МАЙ 26"])
    }

    func test_lastNMonths_period_start_and_end_for_may() {
        let now = date("2026-05-15")
        let opts = AnalyticsData.lastNMonths(now, 1, calendar: utcCal)
        XCTAssertEqual(opts.first?.periodStart, "2026-05-01")
        XCTAssertEqual(opts.first?.periodEnd, "2026-05-31")
    }

    // MARK: - groupByDay

    func test_groupByDay_buckets_by_date_and_sorts_ascending() {
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 1_000, date: "2026-05-09"),
            makeActual(id: 2, categoryId: 1, amountCents: 2_000, date: "2026-05-09"),
            makeActual(id: 3, categoryId: 1, amountCents: 5_000, date: "2026-05-01"),
        ]
        let buckets = AnalyticsData.groupByDay(
            actuals,
            periodStart: BusinessDate(date("2026-05-01")),
            periodEnd: BusinessDate(date("2026-05-31"))
        )
        XCTAssertEqual(buckets.count, 2)
        XCTAssertEqual(buckets[0].sumCents, 5_000)  // May 1
        XCTAssertEqual(buckets[1].sumCents, 3_000)  // May 9 (1k + 2k)
    }

    func test_groupByDay_excludes_income_and_outside_period() {
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 9_000, kind: "income", date: "2026-05-09"),
            makeActual(id: 2, categoryId: 1, amountCents: 1_000, date: "2026-04-15"),
        ]
        let buckets = AnalyticsData.groupByDay(
            actuals,
            periodStart: BusinessDate(date("2026-05-01")),
            periodEnd: BusinessDate(date("2026-05-31"))
        )
        XCTAssertEqual(buckets.count, 0)
    }

    // MARK: - groupByWeek

    func test_groupByWeek_partitions_day_1_through_31_into_five_buckets() {
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 100, date: "2026-05-01"),  // wk1
            makeActual(id: 2, categoryId: 1, amountCents: 200, date: "2026-05-07"),  // wk1
            makeActual(id: 3, categoryId: 1, amountCents: 400, date: "2026-05-08"),  // wk2
            makeActual(id: 4, categoryId: 1, amountCents: 800, date: "2026-05-15"),  // wk3
            makeActual(id: 5, categoryId: 1, amountCents: 1600, date: "2026-05-22"),  // wk4
            makeActual(id: 6, categoryId: 1, amountCents: 3200, date: "2026-05-29"),  // wk5
        ]
        let buckets = AnalyticsData.groupByWeek(actuals, calendar: utcCal)
        XCTAssertEqual(buckets.map(\.weekIdx), [1, 2, 3, 4, 5])
        XCTAssertEqual(buckets[0].sumCents, 300)  // 100 + 200
        XCTAssertEqual(buckets[4].sumCents, 3200)
    }

    func test_groupByWeek_excludes_non_expense_kinds() {
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 9_000, kind: "income", date: "2026-05-09"),
            makeActual(id: 2, categoryId: 1, amountCents: 100, date: "2026-05-09"),
        ]
        let buckets = AnalyticsData.groupByWeek(actuals, calendar: utcCal)
        XCTAssertEqual(buckets.count, 1)
        XCTAssertEqual(buckets[0].sumCents, 100)
    }

    // MARK: - groupByCategory

    func test_groupByCategory_sums_by_category_and_sorts_desc() {
        let cats = [
            makeCategory(id: 1, name: "Food", planCents: 50_000),
            makeCategory(id: 2, name: "Transport", planCents: 20_000),
        ]
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 5_000),
            makeActual(id: 2, categoryId: 2, amountCents: 9_000),
            makeActual(id: 3, categoryId: 1, amountCents: 7_000),
        ]
        let buckets = AnalyticsData.groupByCategory(actuals, categories: cats)
        XCTAssertEqual(buckets.count, 2)
        XCTAssertEqual(buckets[0].categoryId, 1)
        XCTAssertEqual(buckets[0].sumCents, 12_000)
        XCTAssertEqual(buckets[0].planCents, 50_000)
        XCTAssertEqual(buckets[1].categoryId, 2)
        XCTAssertEqual(buckets[1].sumCents, 9_000)
    }

    func test_groupByCategory_unknown_category_id_uses_fallback_name() {
        let actuals = [
            makeActual(id: 1, categoryId: 99, amountCents: 1_000)
        ]
        let buckets = AnalyticsData.groupByCategory(actuals, categories: [])
        XCTAssertEqual(buckets.count, 1)
        XCTAssertEqual(buckets[0].name, "?")
    }

    // MARK: - computeKPISpent

    func test_computeKPISpent_positive_delta_when_more_spent_this_month() {
        let curr = [makeActual(id: 1, categoryId: 1, amountCents: 10_000)]
        let prev = [makeActual(id: 2, categoryId: 1, amountCents: 8_000)]
        let kpi = AnalyticsData.computeKPISpent(curr: curr, prev: prev)
        XCTAssertEqual(kpi.sumCents, 10_000)
        XCTAssertEqual(kpi.deltaCents, 2_000)
        XCTAssertEqual(kpi.deltaPct, 25)
    }

    func test_computeKPISpent_zero_prev_returns_zero_pct() {
        let curr = [makeActual(id: 1, categoryId: 1, amountCents: 5_000)]
        let kpi = AnalyticsData.computeKPISpent(curr: curr, prev: [])
        XCTAssertEqual(kpi.sumCents, 5_000)
        XCTAssertEqual(kpi.deltaCents, 5_000)
        XCTAssertEqual(kpi.deltaPct, 0)
    }

    func test_computeKPISpent_excludes_income_from_sum() {
        let curr = [
            makeActual(id: 1, categoryId: 1, amountCents: 10_000, kind: "income"),
            makeActual(id: 2, categoryId: 1, amountCents: 3_000),
        ]
        let kpi = AnalyticsData.computeKPISpent(curr: curr, prev: [])
        XCTAssertEqual(kpi.sumCents, 3_000)
    }

    // MARK: - computeKPISaved

    func test_computeKPISaved_excludes_savings_code_and_paused_categories() {
        let cats = [
            makeCategory(id: 1, name: "Food", planCents: 10_000),
            makeCategory(id: 2, name: "Sav", code: "savings", planCents: 99_000),
            makeCategory(id: 3, name: "Old", planCents: 5_000, paused: true),
        ]
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 4_000)  // remainder 6_000
        ]
        let saved = AnalyticsData.computeKPISaved(actuals: actuals, categories: cats)
        XCTAssertEqual(saved, 6_000)
    }

    func test_computeKPISaved_clamps_negative_remainder_to_zero() {
        let cats = [makeCategory(id: 1, planCents: 5_000)]
        let actuals = [makeActual(id: 1, categoryId: 1, amountCents: 8_000)]
        let saved = AnalyticsData.computeKPISaved(actuals: actuals, categories: cats)
        XCTAssertEqual(saved, 0)
    }

    // MARK: - shouldHighlightRed

    func test_shouldHighlightRed_true_at_or_above_75_percent() {
        XCTAssertTrue(AnalyticsData.shouldHighlightRed(barSum: 75, barPlan: 100))
        XCTAssertTrue(AnalyticsData.shouldHighlightRed(barSum: 90, barPlan: 100))
    }

    func test_shouldHighlightRed_false_below_threshold() {
        XCTAssertFalse(AnalyticsData.shouldHighlightRed(barSum: 50, barPlan: 100))
    }

    func test_shouldHighlightRed_returns_false_when_plan_zero_or_negative_T_27_10_03() {
        XCTAssertFalse(AnalyticsData.shouldHighlightRed(barSum: 1_000_000, barPlan: 0))
        XCTAssertFalse(AnalyticsData.shouldHighlightRed(barSum: 1_000_000, barPlan: -5))
    }

    // MARK: - computePct

    func test_computePct_clamps_to_100() {
        XCTAssertEqual(AnalyticsData.computePct(sum: 10_000, plan: 5_000), 100)
    }

    func test_computePct_returns_zero_when_plan_nonpositive_T_27_10_03() {
        XCTAssertEqual(AnalyticsData.computePct(sum: 5_000, plan: 0), 0)
        XCTAssertEqual(AnalyticsData.computePct(sum: 5_000, plan: -10), 0)
    }

    func test_computePct_rounds_to_nearest_int() {
        // 333 / 1000 = 33.3% → 33; 336 / 1000 = 33.6% → 34
        XCTAssertEqual(AnalyticsData.computePct(sum: 333, plan: 1_000), 33)
        XCTAssertEqual(AnalyticsData.computePct(sum: 336, plan: 1_000), 34)
    }

    // MARK: - TopCategoryItemDTO decode

    func test_topCategoryItem_decode_computes_pct_of_plan_clamped() {
        let json = """
            {"category_id": 1, "name": "Food", "actual_cents": 4000, "planned_cents": 10000}
            """.data(using: .utf8)!
        let item = try! dec.decode(TopCategoryItemDTO.self, from: json)
        XCTAssertEqual(item.categoryId, 1)
        XCTAssertEqual(item.categoryName, "Food")
        XCTAssertEqual(item.sumCents, 4000)
        XCTAssertEqual(item.planCents, 10000)
        XCTAssertEqual(item.pctOfPlan, 40.0)
    }

    func test_topCategoryItem_decode_pct_nil_when_plan_zero_T_27_10_03() {
        let json = """
            {"category_id": 7, "name": "Misc", "actual_cents": 5000, "planned_cents": 0}
            """.data(using: .utf8)!
        let item = try! dec.decode(TopCategoryItemDTO.self, from: json)
        XCTAssertNil(item.pctOfPlan)
        XCTAssertEqual(item.planCents, 0)
    }
}
