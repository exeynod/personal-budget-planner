// Phase 70-04 (Workstream D / R6) — merged unit specs for the shared
// `SubscriptionsDomain` compute layer.
//
// Combines the two old suites verbatim, repointed at the shared namespace:
//   - SubscriptionsDataTests      (V10, 14 cases) → *V10 variants + shared
//   - SubscriptionsViewDataTests  (v06)            → *V06 variants + shared
//
// Both shells' divergent helpers are asserted here so the named per-shell
// variants can never silently drift (T-70-04-01 mitigation).
//
// DTO fixtures decode from wire JSON (mirrors the old suites) so no test-only
// init drift creeps into SubscriptionV10DTO's custom decoder.

import XCTest

@testable import BudgetPlanner

final class SubscriptionsDomainTests: XCTestCase {

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

    private func mskCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    // MARK: - Shared: activeCount

    func test_activeCount_counts_is_active_true_only() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, isActive: true),
            makeSub(id: 2, name: "Netflix", amountCents: 89_900, isActive: false),
            makeSub(id: 3, name: "iCloud", amountCents: 7_900, isActive: true),
        ]
        XCTAssertEqual(SubscriptionsDomain.activeCount(subs), 2)
    }

    func test_activeCount_returns_zero_for_all_inactive() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, isActive: false),
            makeSub(id: 2, name: "Netflix", amountCents: 89_900, isActive: false),
        ]
        XCTAssertEqual(SubscriptionsDomain.activeCount(subs), 0)
    }

    func test_activeCount_empty_returnsZero() {
        XCTAssertEqual(SubscriptionsDomain.activeCount([]), 0)
    }

    // MARK: - V10: monthlyTotalV10

    func test_monthlyTotalV10_sums_only_active_monthly() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", isActive: true),
            makeSub(id: 2, name: "Netflix", amountCents: 89_900, cycle: "monthly", isActive: false),
            makeSub(id: 3, name: "iCloud", amountCents: 7_900, cycle: "monthly", isActive: true),
            makeSub(id: 4, name: "Domain", amountCents: 120_000, cycle: "yearly", isActive: true),
        ]
        XCTAssertEqual(SubscriptionsDomain.monthlyTotalV10(subs), 29_900 + 7_900)
    }

    func test_monthlyTotalV10_returns_zero_when_no_monthly_active() {
        let subs = [
            makeSub(id: 1, name: "Domain", amountCents: 120_000, cycle: "yearly", isActive: true)
        ]
        XCTAssertEqual(SubscriptionsDomain.monthlyTotalV10(subs), 0)
    }

    func test_monthlyTotalV10_excludes_inactive_monthly() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", isActive: false)
        ]
        XCTAssertEqual(SubscriptionsDomain.monthlyTotalV10(subs), 0)
    }

    // MARK: - V10: yearlyTotalAnnualizedV10

    func test_yearlyTotalAnnualizedV10_combines_monthly_x12_plus_yearly_active() {
        let subs = [
            makeSub(id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", isActive: true),
            makeSub(id: 2, name: "iCloud", amountCents: 7_900, cycle: "monthly", isActive: true),
            makeSub(id: 3, name: "Domain", amountCents: 120_000, cycle: "yearly", isActive: true),
            makeSub(id: 4, name: "Stale", amountCents: 999_999, cycle: "yearly", isActive: false),
        ]
        let monthlyAnnual = (29_900 + 7_900) * 12
        XCTAssertEqual(
            SubscriptionsDomain.yearlyTotalAnnualizedV10(subs), monthlyAnnual + 120_000)
    }

    func test_yearlyTotalAnnualizedV10_returns_zero_when_empty() {
        XCTAssertEqual(SubscriptionsDomain.yearlyTotalAnnualizedV10([]), 0)
    }

    // MARK: - V06: monthlyLoadCentsV06

    func test_monthlyLoadCentsV06_monthlyFullAmount() {
        let subs = [makeSub(id: 1, amountCents: 500_00, cycle: "monthly")]
        XCTAssertEqual(SubscriptionsDomain.monthlyLoadCentsV06(subs), 500_00)
    }

    func test_monthlyLoadCentsV06_yearlyDividedBy12_integer() {
        // 1200_00 / 12 = 100_00
        let subs = [makeSub(id: 1, amountCents: 1200_00, cycle: "yearly")]
        XCTAssertEqual(SubscriptionsDomain.monthlyLoadCentsV06(subs), 100_00)
    }

    func test_monthlyLoadCentsV06_yearlyIntegerTruncation() {
        // 100_00 / 12 = 833 (integer truncation, no float)
        let subs = [makeSub(id: 1, amountCents: 100_00, cycle: "yearly")]
        XCTAssertEqual(SubscriptionsDomain.monthlyLoadCentsV06(subs), 833)
    }

    func test_monthlyLoadCentsV06_excludesInactive() {
        let subs = [
            makeSub(id: 1, amountCents: 300_00, cycle: "monthly", isActive: true),
            makeSub(id: 2, amountCents: 900_00, cycle: "monthly", isActive: false),
        ]
        XCTAssertEqual(SubscriptionsDomain.monthlyLoadCentsV06(subs), 300_00)
    }

    func test_monthlyLoadCentsV06_mixedCycles() {
        let subs = [
            makeSub(id: 1, amountCents: 200_00, cycle: "monthly"),
            makeSub(id: 2, amountCents: 1200_00, cycle: "yearly"),  // → 100_00
        ]
        XCTAssertEqual(SubscriptionsDomain.monthlyLoadCentsV06(subs), 300_00)
    }

    // MARK: - V10: cadenceRuV10

    func test_cadenceRuV10_monthly_with_day_returns_kazhdoe_N_chislo() {
        let cal = mskCalendar()
        let sub = makeSub(
            id: 1, name: "Spotify", amountCents: 29_900, cycle: "monthly", dayOfMonth: 15)
        XCTAssertEqual(SubscriptionsDomain.cadenceRuV10(sub, calendar: cal), "каждое 15 число")
    }

    func test_cadenceRuV10_monthly_without_day_returns_ezhemesyachno() {
        let cal = mskCalendar()
        let sub = makeSub(
            id: 1, name: "Netflix", amountCents: 89_900, cycle: "monthly", dayOfMonth: nil)
        XCTAssertEqual(SubscriptionsDomain.cadenceRuV10(sub, calendar: cal), "ежемесячно")
    }

    func test_cadenceRuV10_yearly_returns_day_plus_genitive_month() {
        let cal = mskCalendar()
        // 2026-05-09 → "9 мая"
        let sub = makeSub(
            id: 1, name: "Domain", amountCents: 120_000, cycle: "yearly",
            nextChargeDate: "2026-05-09")
        XCTAssertEqual(SubscriptionsDomain.cadenceRuV10(sub, calendar: cal), "9 мая")
    }

    func test_cadenceRuV10_yearly_handles_december() {
        let cal = mskCalendar()
        // 2026-12-31 → "31 декабря"
        let sub = makeSub(
            id: 1, name: "AWS", amountCents: 500_000, cycle: "yearly",
            nextChargeDate: "2026-12-31")
        XCTAssertEqual(SubscriptionsDomain.cadenceRuV10(sub, calendar: cal), "31 декабря")
    }

    // MARK: - V06: cadenceRuV06

    func test_cadenceRuV06_monthlyWithDay() {
        XCTAssertEqual(
            SubscriptionsDomain.cadenceRuV06(cycle: .monthly, dayOfMonth: 15),
            "ежемесячно, 15 числа"
        )
    }

    func test_cadenceRuV06_monthlyNoDay() {
        XCTAssertEqual(
            SubscriptionsDomain.cadenceRuV06(cycle: .monthly, dayOfMonth: nil),
            "ежемесячно"
        )
    }

    func test_cadenceRuV06_yearly() {
        XCTAssertEqual(
            SubscriptionsDomain.cadenceRuV06(cycle: .yearly, dayOfMonth: nil),
            "ежегодно"
        )
        // yearly игнорирует dayOfMonth
        XCTAssertEqual(
            SubscriptionsDomain.cadenceRuV06(cycle: .yearly, dayOfMonth: 10),
            "ежегодно"
        )
    }

    // MARK: - V10: sortV10 (active-first / amount-DESC / name-ASC)

    func test_sortV10_active_first_then_inactive() {
        let subs = [
            makeSub(id: 1, name: "Inactive", amountCents: 999_999, isActive: false),
            makeSub(id: 2, name: "Active", amountCents: 100, isActive: true),
        ]
        let sorted = SubscriptionsDomain.sortV10(subs)
        XCTAssertEqual(sorted.map { $0.id }, [2, 1])
    }

    func test_sortV10_within_active_orders_by_amount_DESC() {
        let subs = [
            makeSub(id: 1, name: "Cheap", amountCents: 100, isActive: true),
            makeSub(id: 2, name: "Mid", amountCents: 5_000, isActive: true),
            makeSub(id: 3, name: "Pricy", amountCents: 100_000, isActive: true),
        ]
        let sorted = SubscriptionsDomain.sortV10(subs)
        XCTAssertEqual(sorted.map { $0.id }, [3, 2, 1])
    }

    func test_sortV10_amount_tie_breaks_by_name_ASC() {
        let subs = [
            makeSub(id: 1, name: "Zebra", amountCents: 1_000, isActive: true),
            makeSub(id: 2, name: "Apple", amountCents: 1_000, isActive: true),
            makeSub(id: 3, name: "Mango", amountCents: 1_000, isActive: true),
        ]
        let sorted = SubscriptionsDomain.sortV10(subs)
        XCTAssertEqual(sorted.map { $0.name }, ["Apple", "Mango", "Zebra"])
    }

    // MARK: - V06: sortV06 (nextChargeDate ASC)

    func test_sortV06_byNextChargeDateAsc() {
        let subs = [
            makeSub(id: 1, nextChargeDate: "2026-06-01"),
            makeSub(id: 2, nextChargeDate: "2026-05-10"),
            makeSub(id: 3, nextChargeDate: "2026-05-20"),
        ]
        let sorted = SubscriptionsDomain.sortV06(subs)
        XCTAssertEqual(sorted.map(\.id), [2, 3, 1])
    }

    // MARK: - Shared: isPosted

    func test_isPosted_nilTxn_false() {
        XCTAssertFalse(SubscriptionsDomain.isPosted(makeSub(id: 1, postedTxnId: nil)))
    }

    func test_isPosted_setTxn_true() {
        XCTAssertTrue(SubscriptionsDomain.isPosted(makeSub(id: 1, postedTxnId: 42)))
    }

    // MARK: - Shared: isValidDraft

    func test_isValidDraft_allValid_true() {
        XCTAssertTrue(
            SubscriptionsDomain.isValidDraft(
                name: "Netflix", amountCents: 500_00, categoryId: 1, submitting: false))
    }

    func test_isValidDraft_emptyName_false() {
        XCTAssertFalse(
            SubscriptionsDomain.isValidDraft(
                name: "   ", amountCents: 500_00, categoryId: 1, submitting: false))
    }

    func test_isValidDraft_zeroAmount_false() {
        XCTAssertFalse(
            SubscriptionsDomain.isValidDraft(
                name: "Netflix", amountCents: 0, categoryId: 1, submitting: false))
    }

    func test_isValidDraft_nilCategory_false() {
        XCTAssertFalse(
            SubscriptionsDomain.isValidDraft(
                name: "Netflix", amountCents: 500_00, categoryId: nil, submitting: false))
    }

    func test_isValidDraft_submitting_false() {
        XCTAssertFalse(
            SubscriptionsDomain.isValidDraft(
                name: "Netflix", amountCents: 500_00, categoryId: 1, submitting: true))
    }
}
