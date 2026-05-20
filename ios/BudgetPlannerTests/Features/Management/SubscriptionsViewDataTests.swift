// Phase 63 Plan 01 (RED→GREEN) — unit specs for SubscriptionsViewData pure
// compute helpers (Foundation-only, no SwiftUI runtime).
//
// Covers every <behavior> path:
//   - computeActiveCount          (active filter)
//   - computeMonthlyLoadCents     (monthly full + yearly /12 integer)
//   - sortForDisplay              (nextChargeDate ASC)
//   - formatCadenceRu             (monthly+day / monthly+nil / yearly)
//   - isPosted                    (postedTxnId nil vs set)
//   - isValidDraft                (name / amount / category / submitting)
//
// DTO fixtures decode from wire JSON (mirrors SubscriptionsDataTests) so no
// test-only init drift creeps into SubscriptionV10DTO's custom decoder.

import XCTest

@testable import BudgetPlanner

final class SubscriptionsViewDataTests: XCTestCase {

    // MARK: - Fixtures

    private func makeSub(
        id: Int,
        name: String = "Netflix",
        amountCents: Int = 100_00,
        cycle: String = "monthly",
        nextChargeDate: String = "2026-05-15",
        isActive: Bool = true,
        dayOfMonth: Int? = nil,
        postedTxnId: Int? = nil
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
        if let ptid = postedTxnId { dict["posted_txn_id"] = ptid }
        let data = try! JSONSerialization.data(withJSONObject: dict)

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(SubscriptionV10DTO.self, from: data)
    }

    // MARK: - computeActiveCount

    func test_computeActiveCount_countsOnlyActive() {
        let subs = [
            makeSub(id: 1, isActive: true),
            makeSub(id: 2, isActive: false),
            makeSub(id: 3, isActive: true),
        ]
        XCTAssertEqual(SubscriptionsViewData.computeActiveCount(subs), 2)
    }

    func test_computeActiveCount_empty_returnsZero() {
        XCTAssertEqual(SubscriptionsViewData.computeActiveCount([]), 0)
    }

    // MARK: - computeMonthlyLoadCents

    func test_monthlyLoad_monthlyFullAmount() {
        let subs = [makeSub(id: 1, amountCents: 500_00, cycle: "monthly")]
        XCTAssertEqual(SubscriptionsViewData.computeMonthlyLoadCents(subs), 500_00)
    }

    func test_monthlyLoad_yearlyDividedBy12_integer() {
        // 1200_00 / 12 = 100_00
        let subs = [makeSub(id: 1, amountCents: 1200_00, cycle: "yearly")]
        XCTAssertEqual(SubscriptionsViewData.computeMonthlyLoadCents(subs), 100_00)
    }

    func test_monthlyLoad_yearlyIntegerTruncation() {
        // 100_00 / 12 = 833 (integer truncation, no float)
        let subs = [makeSub(id: 1, amountCents: 100_00, cycle: "yearly")]
        XCTAssertEqual(SubscriptionsViewData.computeMonthlyLoadCents(subs), 833)
    }

    func test_monthlyLoad_excludesInactive() {
        let subs = [
            makeSub(id: 1, amountCents: 300_00, cycle: "monthly", isActive: true),
            makeSub(id: 2, amountCents: 900_00, cycle: "monthly", isActive: false),
        ]
        XCTAssertEqual(SubscriptionsViewData.computeMonthlyLoadCents(subs), 300_00)
    }

    func test_monthlyLoad_mixedCycles() {
        let subs = [
            makeSub(id: 1, amountCents: 200_00, cycle: "monthly"),
            makeSub(id: 2, amountCents: 1200_00, cycle: "yearly"),  // → 100_00
        ]
        XCTAssertEqual(SubscriptionsViewData.computeMonthlyLoadCents(subs), 300_00)
    }

    // MARK: - sortForDisplay

    func test_sortForDisplay_byNextChargeDateAsc() {
        let subs = [
            makeSub(id: 1, nextChargeDate: "2026-06-01"),
            makeSub(id: 2, nextChargeDate: "2026-05-10"),
            makeSub(id: 3, nextChargeDate: "2026-05-20"),
        ]
        let sorted = SubscriptionsViewData.sortForDisplay(subs)
        XCTAssertEqual(sorted.map(\.id), [2, 3, 1])
    }

    // MARK: - formatCadenceRu

    func test_formatCadenceRu_monthlyWithDay() {
        XCTAssertEqual(
            SubscriptionsViewData.formatCadenceRu(cycle: .monthly, dayOfMonth: 15),
            "ежемесячно, 15 числа"
        )
    }

    func test_formatCadenceRu_monthlyNoDay() {
        XCTAssertEqual(
            SubscriptionsViewData.formatCadenceRu(cycle: .monthly, dayOfMonth: nil),
            "ежемесячно"
        )
    }

    func test_formatCadenceRu_yearly() {
        XCTAssertEqual(
            SubscriptionsViewData.formatCadenceRu(cycle: .yearly, dayOfMonth: nil),
            "ежегодно"
        )
        // yearly игнорирует dayOfMonth
        XCTAssertEqual(
            SubscriptionsViewData.formatCadenceRu(cycle: .yearly, dayOfMonth: 10),
            "ежегодно"
        )
    }

    // MARK: - isPosted

    func test_isPosted_nilTxn_false() {
        XCTAssertFalse(SubscriptionsViewData.isPosted(makeSub(id: 1, postedTxnId: nil)))
    }

    func test_isPosted_setTxn_true() {
        XCTAssertTrue(SubscriptionsViewData.isPosted(makeSub(id: 1, postedTxnId: 42)))
    }

    // MARK: - isValidDraft

    func test_isValidDraft_allValid_true() {
        XCTAssertTrue(
            SubscriptionsViewData.isValidDraft(
                name: "Netflix", amountCents: 500_00, categoryId: 1, submitting: false))
    }

    func test_isValidDraft_emptyName_false() {
        XCTAssertFalse(
            SubscriptionsViewData.isValidDraft(
                name: "   ", amountCents: 500_00, categoryId: 1, submitting: false))
    }

    func test_isValidDraft_zeroAmount_false() {
        XCTAssertFalse(
            SubscriptionsViewData.isValidDraft(
                name: "Netflix", amountCents: 0, categoryId: 1, submitting: false))
    }

    func test_isValidDraft_nilCategory_false() {
        XCTAssertFalse(
            SubscriptionsViewData.isValidDraft(
                name: "Netflix", amountCents: 500_00, categoryId: nil, submitting: false))
    }

    func test_isValidDraft_submitting_false() {
        XCTAssertFalse(
            SubscriptionsViewData.isValidDraft(
                name: "Netflix", amountCents: 500_00, categoryId: 1, submitting: true))
    }
}
