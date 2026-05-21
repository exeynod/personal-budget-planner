// Phase 71 follow-up: unit tests for AccessFormatting — the pure, shared
// derivation layer behind BOTH the maximal-poster `AccessV10View` and the
// native v06 `AccessView`. Locking the formatting here is what guarantees
// the displayed user-list / AI-usage figures match EXACTLY between shells
// (Phase 70 R6 «shared domain logic, per-shell Views»).
//
// AI usage is USD: cents → "$X.XX" (two decimals), never ₽. % of cap is a
// whole-number floor of pct*100.

import XCTest

@testable import BudgetPlanner

final class AccessFormattingTests: XCTestCase {

    // MARK: - USD cents → string

    func testUsdTwoDecimals() {
        XCTAssertEqual(AccessFormatting.usd(0), "0.00")
        XCTAssertEqual(AccessFormatting.usd(5), "0.05")
        XCTAssertEqual(AccessFormatting.usd(120), "1.20")
        XCTAssertEqual(AccessFormatting.usd(500), "5.00")
        XCTAssertEqual(AccessFormatting.usd(123_45), "123.45")
    }

    func testUsdAmountPrefixesDollar() {
        XCTAssertEqual(AccessFormatting.usdAmount(0), "$0.00")
        XCTAssertEqual(AccessFormatting.usdAmount(120), "$1.20")
        XCTAssertEqual(AccessFormatting.usdAmount(500), "$5.00")
    }

    // MARK: - Spend / cap line (Настройки-symmetric)

    func testSpendOverCap() {
        XCTAssertEqual(
            AccessFormatting.spendOverCap(spendCents: 120, capCents: 500),
            "$1.20 / $5.00")
        XCTAssertEqual(
            AccessFormatting.spendOverCap(spendCents: 0, capCents: 0),
            "$0.00 / $0.00")
    }

    // MARK: - Percent of cap

    func testPctIntFloors() {
        XCTAssertEqual(AccessFormatting.pctInt(0.0), 0)
        XCTAssertEqual(AccessFormatting.pctInt(0.249), 24)
        XCTAssertEqual(AccessFormatting.pctInt(0.42), 42)
        XCTAssertEqual(AccessFormatting.pctInt(1.0), 100)
        XCTAssertEqual(AccessFormatting.pctInt(1.5), 150)
    }

    func testPctOfCapLine() {
        XCTAssertEqual(
            AccessFormatting.pctOfCapLine(pct: 0.42, capCents: 500),
            "42% / $5.00")
        XCTAssertEqual(
            AccessFormatting.pctOfCapLine(pct: 0.0, capCents: 0),
            "0% / $0.00")
    }

    // MARK: - Role label

    func testRoleLabelUppercases() {
        XCTAssertEqual(AccessFormatting.roleLabel("owner"), "OWNER")
        XCTAssertEqual(AccessFormatting.roleLabel("member"), "MEMBER")
        XCTAssertEqual(AccessFormatting.roleLabel("revoked"), "REVOKED")
    }
}
