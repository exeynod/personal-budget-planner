// Phase 26-07 Task 1 (RED): unit specs for SubscriptionsData pure compute
// helpers. Symmetric to web Plan 26-06 Task 1 coverage.
//
// All helpers are stateless (`enum SubscriptionsData`), no SwiftUI imports —
// asserted directly via XCTest. The 12+ cases below cover every code path
// described in the plan's <behavior> section:
//   - computeActiveCount             (2 cases)
//   - computeMonthlyTotal            (3 cases — only active monthly subs)
//   - computeYearlyTotalAnnualized   (2 cases — monthly*12 + Σ yearly active)
//   - formatCadenceRu                (4 cases — monthly+day, monthly+nil, yearly, yearly-edge)
//   - sortForDisplay                 (3 cases — active first, amount DESC, name ASC tiebreak)
//
// DTO fixtures use the JSON-decoded pattern (mirrors HomeDataTests / CategoryDetailDataTests
// from Plan 25-05 / 26-03) so no test-only init drift creeps into SubscriptionV10DTO.

import XCTest
@testable import BudgetPlanner

final class SubscriptionsDataTests: XCTestCase {

    // MARK: - Fixtures

    /// Decode a SubscriptionV10DTO from a wire JSON dict. `dayOfMonth` /
    /// `accountId` / `postedTxnId` are nil-by-default to mirror the legacy
    /// `SubscriptionRead` shape (the v1.0 backend extension may or may not be
    /// applied yet — Plan 26-05 ships the full extension; this fixture keeps
    /// the helpers usable in both environments).
    private func makeSub(
        id: Int,
        name: String,
        amountCents: Int,
        cycle: String = "monthly",
        nextChargeDate: String = "2026-05-15",
        isActive: Bool = true,
        dayOfMonth: Int? = nil
    ) -> SubscriptionV10DTO {
        var dict: [String: Any] = [
            "id": id,
            "name": name,
            "amount_cents": amountCents,
            "cycle": cycle,
            "next_charge_date": nextChargeDate,
            "category_id": 1,
            "notify_days_before": 0,
            "is_active": isActive,
        ]
        if let dom = dayOfMonth { dict["day_of_month"] = dom }
        let data = try! JSONSerialization.data(withJSONObject: dict)

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(SubscriptionV10DTO.self, from: data)
    }

    private func mskCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    // MARK: - computeActiveCount

    func test_computeActiveCount_counts_is_active_true_only() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, isActive: true),
            makeSub(id: 2, name: "Netflix", amountCents: 89_900, isActive: false),
            makeSub(id: 3, name: "iCloud",  amountCents: 7_900, isActive: true),
        ]
        XCTAssertEqual(SubscriptionsData.computeActiveCount(subs), 2)
    }

    func test_computeActiveCount_returns_zero_for_all_inactive() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, isActive: false),
            makeSub(id: 2, name: "Netflix", amountCents: 89_900, isActive: false),
        ]
        XCTAssertEqual(SubscriptionsData.computeActiveCount(subs), 0)
    }

    // MARK: - computeMonthlyTotal

    func test_computeMonthlyTotal_sums_only_active_monthly() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", isActive: true),
            makeSub(id: 2, name: "Netflix", amountCents: 89_900, cycle: "monthly", isActive: false),
            makeSub(id: 3, name: "iCloud",  amountCents: 7_900, cycle: "monthly", isActive: true),
            makeSub(id: 4, name: "Domain",  amountCents: 120_000, cycle: "yearly", isActive: true),
        ]
        XCTAssertEqual(SubscriptionsData.computeMonthlyTotal(subs), 29_900 + 7_900)
    }

    func test_computeMonthlyTotal_returns_zero_when_no_monthly_active() {
        let subs = [
            makeSub(id: 1, name: "Domain",  amountCents: 120_000, cycle: "yearly", isActive: true),
        ]
        XCTAssertEqual(SubscriptionsData.computeMonthlyTotal(subs), 0)
    }

    func test_computeMonthlyTotal_excludes_inactive_monthly() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", isActive: false),
        ]
        XCTAssertEqual(SubscriptionsData.computeMonthlyTotal(subs), 0)
    }

    // MARK: - computeYearlyTotalAnnualized

    func test_computeYearlyTotalAnnualized_combines_monthly_x12_plus_yearly_active() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", isActive: true),
            makeSub(id: 2, name: "iCloud",  amountCents: 7_900, cycle: "monthly", isActive: true),
            makeSub(id: 3, name: "Domain",  amountCents: 120_000, cycle: "yearly", isActive: true),
            makeSub(id: 4, name: "Stale",   amountCents: 999_999, cycle: "yearly", isActive: false),
        ]
        let monthlyAnnual = (29_900 + 7_900) * 12
        XCTAssertEqual(SubscriptionsData.computeYearlyTotalAnnualized(subs), monthlyAnnual + 120_000)
    }

    func test_computeYearlyTotalAnnualized_returns_zero_when_empty() {
        XCTAssertEqual(SubscriptionsData.computeYearlyTotalAnnualized([]), 0)
    }

    // MARK: - formatCadenceRu

    func test_formatCadenceRu_monthly_with_day_of_month_returns_kazhdoe_N_chislo() {
        let cal = mskCalendar()
        let sub = makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", dayOfMonth: 15)
        XCTAssertEqual(SubscriptionsData.formatCadenceRu(sub, calendar: cal), "каждое 15 число")
    }

    func test_formatCadenceRu_monthly_without_day_of_month_returns_ezhemesyachno() {
        let cal = mskCalendar()
        let sub = makeSub(id: 1, name: "Netflix", amountCents: 89_900, cycle: "monthly", dayOfMonth: nil)
        XCTAssertEqual(SubscriptionsData.formatCadenceRu(sub, calendar: cal), "ежемесячно")
    }

    func test_formatCadenceRu_yearly_returns_day_plus_genitive_month() {
        let cal = mskCalendar()
        // 2026-05-09 → "9 мая"
        let sub = makeSub(id: 1, name: "Domain", amountCents: 120_000, cycle: "yearly", nextChargeDate: "2026-05-09")
        XCTAssertEqual(SubscriptionsData.formatCadenceRu(sub, calendar: cal), "9 мая")
    }

    func test_formatCadenceRu_yearly_handles_december() {
        let cal = mskCalendar()
        // 2026-12-31 → "31 декабря"
        let sub = makeSub(id: 1, name: "AWS", amountCents: 500_000, cycle: "yearly", nextChargeDate: "2026-12-31")
        XCTAssertEqual(SubscriptionsData.formatCadenceRu(sub, calendar: cal), "31 декабря")
    }

    // MARK: - sortForDisplay

    func test_sortForDisplay_active_first_then_inactive() {
        let subs = [
            makeSub(id: 1, name: "Inactive", amountCents: 999_999, isActive: false),
            makeSub(id: 2, name: "Active",   amountCents: 100, isActive: true),
        ]
        let sorted = SubscriptionsData.sortForDisplay(subs)
        XCTAssertEqual(sorted.map { $0.id }, [2, 1])
    }

    func test_sortForDisplay_within_active_orders_by_amount_DESC() {
        let subs = [
            makeSub(id: 1, name: "Cheap", amountCents: 100, isActive: true),
            makeSub(id: 2, name: "Mid",   amountCents: 5_000, isActive: true),
            makeSub(id: 3, name: "Pricy", amountCents: 100_000, isActive: true),
        ]
        let sorted = SubscriptionsData.sortForDisplay(subs)
        XCTAssertEqual(sorted.map { $0.id }, [3, 2, 1])
    }

    func test_sortForDisplay_amount_tie_breaks_by_name_ASC() {
        let subs = [
            makeSub(id: 1, name: "Zebra", amountCents: 1_000, isActive: true),
            makeSub(id: 2, name: "Apple", amountCents: 1_000, isActive: true),
            makeSub(id: 3, name: "Mango", amountCents: 1_000, isActive: true),
        ]
        let sorted = SubscriptionsData.sortForDisplay(subs)
        XCTAssertEqual(sorted.map { $0.name }, ["Apple", "Mango", "Zebra"])
    }
}
