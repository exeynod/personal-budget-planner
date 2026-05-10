// Phase 25-12 — TXN-V10-06 acceptance lock (iOS XCTest mirror of the
// web TxV10TabDemote.test.tsx vitest suite).
//
// Asserts:
//   1. V10 TabId enum has exactly 4 cases (home/savings/ai/mgmt) — no
//      .transactions case (TXN-V10-06).
//   2. v0.6 AppTab enum still includes .transactions — regression guard
//      that Phase 25 only demotes the V10 nav, not the legacy v0.6 nav.
//   3. v0.6 AppTab.transactions has the «Транзакции» Russian label —
//      catches anyone renaming the case without removing the legacy nav.
//
// All assertions are enum-level (no SwiftUI host needed) — symmetric to
// the web suite's static-grep approach. Heavier UI assertions live in
// V10MainShellTests (Plan 25-07) and the Playwright spec (Task 3).

import XCTest

@testable import BudgetPlanner

final class TxV10TabDemoteTests: XCTestCase {

    // MARK: - V10 TabId — 4 cases, no .transactions (TXN-V10-06)

    func test_v10_TabId_has_exactly_four_cases_no_transactions() {
        let allTabs = TabId.allCases.map { $0.rawValue }
        XCTAssertEqual(
            allTabs.count, 4,
            "V10 TabId must have exactly 4 cases (home/savings/ai/mgmt) — no Транзакции."
        )
        XCTAssertEqual(
            Set(allTabs), Set(["home", "savings", "ai", "mgmt"]),
            "V10 TabId raw values must be exactly home/savings/ai/mgmt."
        )
        XCTAssertFalse(
            allTabs.contains("transactions"),
            "v0.6 transactions tab must NOT appear in V10 TabId."
        )
    }

    // MARK: - v0.6 AppTab — still has .transactions (regression guard)

    func test_v06_AppTab_still_includes_transactions() {
        // Phase 25 ONLY demotes the V10 BottomNav. The legacy v0.6 nav
        // (AppTab) must remain untouched so users on the v0.6 path still
        // see the Транзакции tab.
        let allV06Tabs = AppTab.allCases.map { $0.rawValue }
        XCTAssertTrue(
            allV06Tabs.contains("transactions"),
            "v0.6 AppTab.transactions must remain — Phase 25 only demotes the V10 nav, not v0.6."
        )
        // Belt-and-braces: assert the full v0.6 case set so that any
        // accidental renaming/removal beyond .transactions also breaks.
        XCTAssertEqual(
            Set(allV06Tabs), Set(["home", "transactions", "ai", "management"]),
            "v0.6 AppTab raw values must be exactly home/transactions/ai/management."
        )
    }

    func test_v06_AppTab_transactions_has_russian_label() {
        // Ensure the «Транзакции» label is still wired to AppTab.transactions
        // (catches accidental renames that keep the case but break the user-
        // visible label — same effect as a demotion from the user's view).
        XCTAssertEqual(AppTab.transactions.label, "Транзакции")
        XCTAssertEqual(AppTab.transactions.icon, "list.bullet")
    }
}
