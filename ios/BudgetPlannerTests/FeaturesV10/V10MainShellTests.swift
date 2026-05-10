// Phase 25-07: smoke / type-level tests for the V10 root shell.
//
// Scope (per plan):
//   - TXN-V10-06 acceptance: TabId enum has exactly 4 cases (no v0.6
//     Транзакции tab).
//   - ADD-V10-01 acceptance (smoke): BottomNavV10 with isHidden=true
//     compiles and produces a body without crashing.
//   - V10MainShell init() does not crash when constructed on the main
//     actor (covers the PosterRouter + OnboardingMountView wiring).
//
// Full UI state assertions (e.g. FAB tap → sheet open → nav hide) are
// deferred to Plan 25-12 acceptance / manual XCUI testing — those need
// a live SwiftUI host with simulated touches.

import SwiftUI
import XCTest

@testable import BudgetPlanner

final class V10MainShellTests: XCTestCase {

    // MARK: - TXN-V10-06: 4-tab + FAB layout, no transactions tab

    func test_TabId_has_only_four_tabs_excluding_transactions() {
        let allTabs = TabId.allCases.map { $0.rawValue }
        XCTAssertEqual(
            allTabs.count, 4,
            "TabId must have exactly 4 cases (Home/Savings/AI/Mgmt) — no Транзакции."
        )
        XCTAssertTrue(allTabs.contains("home"))
        XCTAssertTrue(allTabs.contains("savings"))
        XCTAssertTrue(allTabs.contains("ai"))
        XCTAssertTrue(allTabs.contains("mgmt"))
        XCTAssertFalse(
            allTabs.contains("transactions"),
            "v0.6 transactions tab must NOT appear in V10 BottomNav."
        )
    }

    // MARK: - ADD-V10-01: BottomNavV10 hides when isHidden=true

    @MainActor
    func test_BottomNavV10_compiles_with_isHidden_true() {
        // Smoke test: SwiftUI tree introspection requires ViewInspector or a
        // live host; we instead verify the modifier composition compiles and
        // the initializer accepts the isHidden flag without crashing.
        var active: TabId = .home
        let binding = Binding(get: { active }, set: { active = $0 })
        let nav = BottomNavV10(active: binding, isHidden: true, onFab: {})
        // Touching `.body` is enough to surface compile-time misuse and
        // runtime preconditions in the wrapper (e.g. force-unwraps).
        _ = nav.body
        XCTAssertTrue(true, "BottomNavV10 with isHidden=true rendered without crash.")
    }

    @MainActor
    func test_BottomNavV10_compiles_with_isHidden_false() {
        var active: TabId = .savings
        let binding = Binding(get: { active }, set: { active = $0 })
        let nav = BottomNavV10(active: binding, isHidden: false, onFab: {})
        _ = nav.body
        XCTAssertTrue(true, "BottomNavV10 with isHidden=false rendered without crash.")
    }

    // MARK: - V10MainShell composition smoke test

    @MainActor
    func test_V10MainShell_init_does_not_crash() {
        // V10MainShell.init builds a PosterRouter rooted at OnboardingMountView,
        // which in turn creates an OnboardingMountModel pointing at the live
        // MeV10API.shared. Construction is enough — we don't trigger reload here.
        let _ = V10MainShell()
        XCTAssertTrue(true, "V10MainShell initialized without crash.")
    }
}
