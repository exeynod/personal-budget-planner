// Phase 26-03 Task 1 (RED): unit specs for CategoryDetailData pure compute
// helpers. Symmetric to web Plan 26-02 Task 1 coverage.
//
// All helpers are stateless (`enum CategoryDetailData`), no SwiftUI imports —
// asserted directly via XCTest. The 12+ cases below cover every code path
// described in the plan's <behavior> section:
//   - computeOverPercent  (3 cases)
//   - computeUnderPercent (4 cases)
//   - computeBarSegments  (3 cases)
//   - filterActualsForCategory (2 cases)
//   - computeFactForCategory (3 cases — sums abs(amount) only for kind=expense)
//
// DTO fixtures use the JSON-decoded pattern from HomeDataTests (Plan 25-05) so
// no test-only init drift creeps into ActualV10DTO / CategoryV10DTO.

import XCTest
@testable import BudgetPlanner

final class CategoryDetailDataTests: XCTestCase {

    // MARK: - Fixtures

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
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    // MARK: - computeOverPercent

    func test_computeOverPercent_returns_50_when_fact_is_50_percent_above_plan() {
        XCTAssertEqual(CategoryDetailData.computeOverPercent(factCents: 15_000, planCents: 10_000), 50)
    }

    func test_computeOverPercent_returns_zero_when_fact_equals_plan() {
        XCTAssertEqual(CategoryDetailData.computeOverPercent(factCents: 10_000, planCents: 10_000), 0)
    }

    func test_computeOverPercent_returns_15_when_fact_is_15_percent_above_plan() {
        XCTAssertEqual(CategoryDetailData.computeOverPercent(factCents: 11_500, planCents: 10_000), 15)
    }

    func test_computeOverPercent_returns_zero_when_plan_is_zero() {
        XCTAssertEqual(CategoryDetailData.computeOverPercent(factCents: 10_000, planCents: 0), 0)
    }

    // MARK: - computeUnderPercent

    func test_computeUnderPercent_returns_75_when_fact_is_75_percent_of_plan() {
        XCTAssertEqual(CategoryDetailData.computeUnderPercent(factCents: 7_500, planCents: 10_000), 75)
    }

    func test_computeUnderPercent_returns_zero_when_no_fact() {
        XCTAssertEqual(CategoryDetailData.computeUnderPercent(factCents: 0, planCents: 10_000), 0)
    }

    func test_computeUnderPercent_returns_100_when_fact_equals_plan() {
        XCTAssertEqual(CategoryDetailData.computeUnderPercent(factCents: 10_000, planCents: 10_000), 100)
    }

    func test_computeUnderPercent_returns_zero_when_plan_is_zero() {
        XCTAssertEqual(CategoryDetailData.computeUnderPercent(factCents: 5_000, planCents: 0), 0)
    }

    // MARK: - computeBarSegments

    func test_computeBarSegments_under_budget_no_tick() {
        let s = CategoryDetailData.computeBarSegments(factCents: 7_500, planCents: 10_000)
        XCTAssertEqual(s.fillRatio, 0.75, accuracy: 0.0001)
        XCTAssertNil(s.tickAt)
    }

    func test_computeBarSegments_over_budget_tick_at_plan_over_fact() {
        let s = CategoryDetailData.computeBarSegments(factCents: 15_000, planCents: 10_000)
        XCTAssertEqual(s.fillRatio, 1.0, accuracy: 0.0001)
        XCTAssertNotNil(s.tickAt)
        XCTAssertEqual(s.tickAt!, 0.6667, accuracy: 0.001)
    }

    func test_computeBarSegments_zero_plan_with_fact_full_with_tick_at_zero() {
        let s = CategoryDetailData.computeBarSegments(factCents: 10_000, planCents: 0)
        XCTAssertEqual(s.fillRatio, 1.0, accuracy: 0.0001)
        XCTAssertNotNil(s.tickAt)
        XCTAssertEqual(s.tickAt!, 0.0, accuracy: 0.0001)
    }

    func test_computeBarSegments_zero_fact_zero_fill_no_tick() {
        let s = CategoryDetailData.computeBarSegments(factCents: 0, planCents: 10_000)
        XCTAssertEqual(s.fillRatio, 0.0, accuracy: 0.0001)
        XCTAssertNil(s.tickAt)
    }

    // MARK: - filterActualsForCategory

    func test_filterActualsForCategory_returns_only_matching_rows() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: 100),
            makeActual(id: 2, categoryId: 2, amountCents: 200),
            makeActual(id: 3, categoryId: 1, amountCents: 300),
        ]
        let filtered = CategoryDetailData.filterActualsForCategory(acts, categoryId: 1)
        XCTAssertEqual(filtered.count, 2)
        XCTAssertEqual(filtered.map(\.id), [1, 3])
    }

    func test_filterActualsForCategory_returns_empty_when_no_match() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: 100),
        ]
        XCTAssertTrue(CategoryDetailData.filterActualsForCategory(acts, categoryId: 99).isEmpty)
    }

    // MARK: - computeFactForCategory

    func test_computeFactForCategory_sums_abs_only_for_expense_kind() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: 100, kind: "expense"),
            makeActual(id: 2, categoryId: 1, amountCents: 200, kind: "income"),
            makeActual(id: 3, categoryId: 1, amountCents:  50, kind: "roundup"),
            makeActual(id: 4, categoryId: 1, amountCents: 300, kind: "deposit"),
            makeActual(id: 5, categoryId: 1, amountCents: 150, kind: "expense"),
        ]
        // Only kind=expense: 100 + 150 = 250
        XCTAssertEqual(CategoryDetailData.computeFactForCategory(acts, categoryId: 1), 250)
    }

    func test_computeFactForCategory_uses_abs_for_negative_amounts() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -500, kind: "expense"),
            makeActual(id: 2, categoryId: 1, amountCents:  300, kind: "expense"),
        ]
        // abs(-500) + abs(300) = 800
        XCTAssertEqual(CategoryDetailData.computeFactForCategory(acts, categoryId: 1), 800)
    }

    func test_computeFactForCategory_returns_zero_for_no_matching_category() {
        let acts = [
            makeActual(id: 1, categoryId: 2, amountCents: 1000, kind: "expense"),
        ]
        XCTAssertEqual(CategoryDetailData.computeFactForCategory(acts, categoryId: 1), 0)
    }
}
