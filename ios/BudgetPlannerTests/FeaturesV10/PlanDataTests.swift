// Phase 26-05 Task 1 (RED): unit specs for PlanData pure compute helpers
// + SubscriptionV10DTO + PlanMonthItem JSON-decode round-trip.
//
// Symmetric to web Plan 26-04 Task 2 coverage (`computePlan.test.ts`).
// All helpers stateless on `enum PlanData` — asserted directly via XCTest.
// JSON fixture pattern mirrors HomeDataTests (Plan 25-05) and
// CategoryDetailDataTests (Plan 26-03) so DTO drift is caught here too.
//
// 18+ cases cover the full behaviour table in the plan:
//   - computeSurplus            (3 cases — positive / zero / negative)
//   - computeIsOverflow         (2 cases — boundary at 0)
//   - computeRolloverAggregates (5 cases — misc bucket / savings bucket /
//                                paused excluded / savings code excluded /
//                                isOver = 0 contribution)
//   - computeRegularsList       (3 cases — monthly only, day_of_month
//                                non-nil, sort by day_of_month)
//   - applyPlanEdit             (3 cases — replace existing, add new,
//                                immutability of original array)
//   - plansFromCategories       (2 cases — savings filter, paused filter)

import XCTest
@testable import BudgetPlanner

final class PlanDataTests: XCTestCase {

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

    private func makeCategory(
        id: Int,
        name: String = "Cat",
        code: String? = nil,
        planCents: Int = 0,
        rollover: String = "misc",
        paused: Bool = false
    ) -> CategoryV10DTO {
        let codeJSON = code.map { "\"\($0)\"" } ?? "null"
        let json = """
        {
          "id": \(id),
          "name": "\(name)",
          "kind": "expense",
          "is_archived": false,
          "sort_order": 0,
          "created_at": null,
          "code": \(codeJSON),
          "plan_cents": \(planCents),
          "ord": null,
          "rollover": "\(rollover)",
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
        kind: String = "expense"
    ) -> ActualV10DTO {
        let json = """
        {
          "id": \(id),
          "period_id": 1,
          "kind": "\(kind)",
          "amount_cents": \(amountCents),
          "description": null,
          "category_id": \(categoryId),
          "tx_date": "2026-05-09",
          "source": "mini_app",
          "created_at": null,
          "account_id": null,
          "parent_txn_id": null
        }
        """.data(using: .utf8)!
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    private func makeSub(
        id: Int,
        name: String = "Sub",
        amountCents: Int = 50000,
        cycle: String = "monthly",
        categoryId: Int = 1,
        dayOfMonth: Int? = nil,
        postedTxnId: Int? = nil
    ) -> SubscriptionV10DTO {
        let dom = dayOfMonth.map(String.init) ?? "null"
        let posted = postedTxnId.map(String.init) ?? "null"
        let json = """
        {
          "id": \(id),
          "name": "\(name)",
          "amount_cents": \(amountCents),
          "cycle": "\(cycle)",
          "next_charge_date": "2026-05-15",
          "category_id": \(categoryId),
          "notify_days_before": 2,
          "is_active": true,
          "day_of_month": \(dom),
          "account_id": null,
          "posted_txn_id": \(posted)
        }
        """.data(using: .utf8)!
        return try! dec.decode(SubscriptionV10DTO.self, from: json)
    }

    // MARK: - computeSurplus

    func test_computeSurplus_positive_when_income_exceeds_plan_sum() {
        let plans = [
            PlanMonthItem(categoryId: 1, planCents: 30_000_00),
            PlanMonthItem(categoryId: 2, planCents: 20_000_00),
        ]
        XCTAssertEqual(
            PlanData.computeSurplus(incomeCents: 100_000_00, plans: plans),
            50_000_00
        )
    }

    func test_computeSurplus_zero_when_income_equals_plan_sum() {
        let plans = [PlanMonthItem(categoryId: 1, planCents: 100_000_00)]
        XCTAssertEqual(
            PlanData.computeSurplus(incomeCents: 100_000_00, plans: plans),
            0
        )
    }

    func test_computeSurplus_negative_when_plan_exceeds_income() {
        let plans = [
            PlanMonthItem(categoryId: 1, planCents: 60_000_00),
            PlanMonthItem(categoryId: 2, planCents: 50_000_00),
        ]
        XCTAssertEqual(
            PlanData.computeSurplus(incomeCents: 100_000_00, plans: plans),
            -10_000_00
        )
    }

    // MARK: - computeIsOverflow

    func test_computeIsOverflow_true_for_negative_surplus() {
        XCTAssertTrue(PlanData.computeIsOverflow(-1))
    }

    func test_computeIsOverflow_false_for_zero_surplus() {
        XCTAssertFalse(PlanData.computeIsOverflow(0))
    }

    // MARK: - computeRolloverAggregates

    func test_computeRolloverAggregates_misc_bucket_sums_misc_remainders() {
        let cats = [
            makeCategory(id: 1, planCents: 10_000, rollover: "misc"),
            makeCategory(id: 2, planCents: 5_000, rollover: "misc"),
        ]
        let plans = PlanData.plansFromCategories(cats)
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 4_000),  // remainder = 6_000
            makeActual(id: 2, categoryId: 2, amountCents: 1_000),  // remainder = 4_000
        ]
        let agg = PlanData.computeRolloverAggregates(
            categories: cats, plans: plans, actuals: actuals
        )
        XCTAssertEqual(agg.miscCents, 10_000)
        XCTAssertEqual(agg.savingsCents, 0)
    }

    func test_computeRolloverAggregates_savings_bucket_sums_savings_remainders() {
        let cats = [
            makeCategory(id: 1, planCents: 10_000, rollover: "savings"),
        ]
        let plans = PlanData.plansFromCategories(cats)
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 3_000),  // remainder = 7_000
        ]
        let agg = PlanData.computeRolloverAggregates(
            categories: cats, plans: plans, actuals: actuals
        )
        XCTAssertEqual(agg.miscCents, 0)
        XCTAssertEqual(agg.savingsCents, 7_000)
    }

    func test_computeRolloverAggregates_excludes_paused_categories() {
        let cats = [
            makeCategory(id: 1, planCents: 10_000, rollover: "misc", paused: true),
        ]
        let plans = [PlanMonthItem(categoryId: 1, planCents: 10_000)]
        let agg = PlanData.computeRolloverAggregates(
            categories: cats, plans: plans, actuals: []
        )
        XCTAssertEqual(agg.miscCents, 0)
    }

    func test_computeRolloverAggregates_excludes_savings_code_category() {
        let cats = [
            makeCategory(id: 1, code: "savings", planCents: 99_000, rollover: "savings"),
        ]
        let plans = [PlanMonthItem(categoryId: 1, planCents: 99_000)]
        let agg = PlanData.computeRolloverAggregates(
            categories: cats, plans: plans, actuals: []
        )
        XCTAssertEqual(agg.savingsCents, 0)
    }

    func test_computeRolloverAggregates_over_budget_contributes_zero_to_aggregate() {
        // Fact > plan: remainder clamped to 0 (no negative contribution).
        let cats = [
            makeCategory(id: 1, planCents: 5_000, rollover: "misc"),
        ]
        let plans = [PlanMonthItem(categoryId: 1, planCents: 5_000)]
        let actuals = [
            makeActual(id: 1, categoryId: 1, amountCents: 8_000),  // over by 3_000
        ]
        let agg = PlanData.computeRolloverAggregates(
            categories: cats, plans: plans, actuals: actuals
        )
        XCTAssertEqual(agg.miscCents, 0)
        XCTAssertEqual(agg.savingsCents, 0)
    }

    // MARK: - computeRegularsList

    func test_computeRegularsList_includes_monthly_with_day_of_month() {
        let cats = [makeCategory(id: 7, name: "Connectivity")]
        let subs = [
            makeSub(id: 1, name: "Internet", amountCents: 80000, categoryId: 7, dayOfMonth: 5),
        ]
        let rows = PlanData.computeRegularsList(subs: subs, categories: cats)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].id, 1)
        XCTAssertEqual(rows[0].dayOfMonth, 5)
        XCTAssertEqual(rows[0].categoryName, "Connectivity")
        XCTAssertEqual(rows[0].amountCents, 80000)
    }

    func test_computeRegularsList_excludes_yearly_and_nil_day_of_month() {
        let cats = [makeCategory(id: 7)]
        let subs = [
            makeSub(id: 1, cycle: "yearly", categoryId: 7, dayOfMonth: 5),
            makeSub(id: 2, cycle: "monthly", categoryId: 7, dayOfMonth: nil),
            makeSub(id: 3, cycle: "monthly", categoryId: 7, dayOfMonth: 12),
        ]
        let rows = PlanData.computeRegularsList(subs: subs, categories: cats)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].id, 3)
    }

    func test_computeRegularsList_sorted_by_day_of_month_ascending() {
        let cats = [makeCategory(id: 7)]
        let subs = [
            makeSub(id: 1, categoryId: 7, dayOfMonth: 25),
            makeSub(id: 2, categoryId: 7, dayOfMonth: 5),
            makeSub(id: 3, categoryId: 7, dayOfMonth: 15),
        ]
        let rows = PlanData.computeRegularsList(subs: subs, categories: cats)
        XCTAssertEqual(rows.map(\.dayOfMonth), [5, 15, 25])
    }

    // MARK: - applyPlanEdit

    func test_applyPlanEdit_replaces_existing_category() {
        let plans = [
            PlanMonthItem(categoryId: 1, planCents: 10_000),
            PlanMonthItem(categoryId: 2, planCents: 20_000),
        ]
        let updated = PlanData.applyPlanEdit(plans, categoryId: 1, newCents: 99_999)
        XCTAssertEqual(updated.count, 2)
        XCTAssertEqual(updated.first(where: { $0.categoryId == 1 })?.planCents, 99_999)
        XCTAssertEqual(updated.first(where: { $0.categoryId == 2 })?.planCents, 20_000)
    }

    func test_applyPlanEdit_appends_new_category_when_missing() {
        let plans = [PlanMonthItem(categoryId: 1, planCents: 10_000)]
        let updated = PlanData.applyPlanEdit(plans, categoryId: 5, newCents: 30_000)
        XCTAssertEqual(updated.count, 2)
        XCTAssertEqual(updated.last?.categoryId, 5)
        XCTAssertEqual(updated.last?.planCents, 30_000)
    }

    func test_applyPlanEdit_does_not_mutate_input_array() {
        let plans = [PlanMonthItem(categoryId: 1, planCents: 10_000)]
        _ = PlanData.applyPlanEdit(plans, categoryId: 1, newCents: 99_999)
        // Original unchanged (Swift arrays are value types — sanity check helper purity).
        XCTAssertEqual(plans[0].planCents, 10_000)
    }

    // MARK: - plansFromCategories

    func test_plansFromCategories_filters_savings_code() {
        let cats = [
            makeCategory(id: 1, code: nil, planCents: 1000),
            makeCategory(id: 2, code: "savings", planCents: 9999),
            makeCategory(id: 3, code: "food", planCents: 2000),
        ]
        let plans = PlanData.plansFromCategories(cats)
        XCTAssertEqual(plans.map(\.categoryId).sorted(), [1, 3])
    }

    func test_plansFromCategories_filters_paused_categories() {
        let cats = [
            makeCategory(id: 1, planCents: 1000, paused: false),
            makeCategory(id: 2, planCents: 2000, paused: true),
        ]
        let plans = PlanData.plansFromCategories(cats)
        XCTAssertEqual(plans.map(\.categoryId), [1])
    }

    // MARK: - DTO round-trip (regression guard)

    func test_subscription_v10_dto_decodes_with_full_v10_ext() {
        let json = """
        {
          "id": 42,
          "name": "Netflix",
          "amount_cents": 79900,
          "cycle": "monthly",
          "next_charge_date": "2026-05-20",
          "category_id": 8,
          "notify_days_before": 1,
          "is_active": true,
          "day_of_month": 20,
          "account_id": 3,
          "posted_txn_id": 1234
        }
        """.data(using: .utf8)!
        let s = try! dec.decode(SubscriptionV10DTO.self, from: json)
        XCTAssertEqual(s.id, 42)
        XCTAssertEqual(s.amountCents, 79900)
        XCTAssertEqual(s.cycle, .monthly)
        XCTAssertEqual(s.dayOfMonth, 20)
        XCTAssertEqual(s.accountId, 3)
        XCTAssertEqual(s.postedTxnId, 1234)
    }

    func test_subscription_v10_dto_decodes_when_v10_ext_missing() {
        // Older backend builds may not emit day_of_month / account_id /
        // posted_txn_id — defensive decode keeps them nil.
        let json = """
        {
          "id": 1,
          "name": "Legacy",
          "amount_cents": 10000,
          "cycle": "yearly",
          "next_charge_date": "2026-12-31",
          "category_id": 4,
          "notify_days_before": 7,
          "is_active": true
        }
        """.data(using: .utf8)!
        let s = try! dec.decode(SubscriptionV10DTO.self, from: json)
        XCTAssertNil(s.dayOfMonth)
        XCTAssertNil(s.accountId)
        XCTAssertNil(s.postedTxnId)
    }
}
