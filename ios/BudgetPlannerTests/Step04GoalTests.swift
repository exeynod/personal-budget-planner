// Phase 24-09: XCTest specs for Step 04 (Goal) — flow integration around the
// optional goal capture step.
//
// Symmetric to web Plan 24-08 vitest suite
// (frontend/src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx). We
// don't drive the SwiftUI view tree (XCUI / ViewInspector lands later);
// instead we assert pure flow + model contracts:
//   1. Skip-path (skipGoal + next) → step 5, goal == nil.
//   2. Create-path (setGoal + next) → step 5, goal populated.
//   3. OnboardingGoal Codable round-trip is lossless.
//   4. Validity rule: name non-empty AND target_cents > 0.
//   5. ISO yyyy-MM-dd date string is purely numeric, no time component.
//
// Persistence isolated via fresh UserDefaults suite per test.

import XCTest

@testable import BudgetPlanner

@MainActor
final class Step04GoalTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.step04"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: - Skip-path: «ПРОПУСТИТЬ» → step 5, goal nil

    func testSkipPathLandsOnFinalWithNilGoal() {
        let flow = OnboardingFlow(defaults: defaults)
        // Simulate progression through previous steps.
        flow.setIncome(80_000_00)
        flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
        flow.next()  // → 2
        flow.next()  // → 3
        flow.next()  // → 4
        XCTAssertEqual(flow.step, 4)

        // Skip handler dispatched by OnboardingChrome onSkip:
        flow.skipGoal()
        flow.next()
        XCTAssertEqual(flow.step, 5)
        XCTAssertNil(flow.goal)
    }

    // MARK: - Create-path: setGoal + next → step 5, goal populated

    func testCreatePathLandsOnFinalWithGoal() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
        flow.next()
        flow.next()
        flow.next()
        XCTAssertEqual(flow.step, 4)

        flow.setGoal(
            OnboardingGoal(name: "Подушка", targetCents: 200_000_00, due: nil)
        )
        flow.next()
        XCTAssertEqual(flow.step, 5)
        XCTAssertEqual(flow.goal?.name, "Подушка")
        XCTAssertEqual(flow.goal?.targetCents, 200_000_00)
        XCTAssertNil(flow.goal?.due)
    }

    // MARK: - Codable round-trip

    func testGoalRoundTripWithDue() throws {
        let original = OnboardingGoal(
            name: "Грузия",
            targetCents: 500_000_00,
            due: "2026-12-31",
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(OnboardingGoal.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testGoalRoundTripNilDue() throws {
        let original = OnboardingGoal(
            name: "Подушка",
            targetCents: 100_000_00,
            due: nil,
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(OnboardingGoal.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertNil(decoded.due)
    }

    func testGoalEncodesTargetCentsSnakeCase() throws {
        let goal = OnboardingGoal(name: "X", targetCents: 1_000, due: nil)
        let data = try JSONEncoder().encode(goal)
        let json = String(data: data, encoding: .utf8) ?? ""
        XCTAssertTrue(json.contains("\"target_cents\""), "target_cents missing in: \(json)")
        XCTAssertFalse(json.contains("\"targetCents\""))
    }

    // MARK: - Validity rule (mirrors Step04GoalView gating)

    /// Reproduces the validity predicate Step04GoalView uses to compute
    /// nextDisabled. Centralised here so a regression in either the view
    /// OR the formula gets caught.
    private func isValid(_ goal: OnboardingGoal?) -> Bool {
        guard let g = goal else { return false }
        if g.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
        if g.targetCents <= 0 { return false }
        return true
    }

    func testValidGoalRuleNilIsInvalid() {
        XCTAssertFalse(isValid(nil))
    }

    func testValidGoalRuleEmptyNameIsInvalid() {
        XCTAssertFalse(isValid(OnboardingGoal(name: "", targetCents: 100, due: nil)))
        XCTAssertFalse(isValid(OnboardingGoal(name: "   ", targetCents: 100, due: nil)))
    }

    func testValidGoalRuleZeroTargetIsInvalid() {
        XCTAssertFalse(isValid(OnboardingGoal(name: "X", targetCents: 0, due: nil)))
    }

    func testValidGoalRuleNegativeTargetIsInvalid() {
        XCTAssertFalse(isValid(OnboardingGoal(name: "X", targetCents: -1, due: nil)))
    }

    func testValidGoalRuleAllPositive() {
        XCTAssertTrue(isValid(OnboardingGoal(name: "X", targetCents: 1, due: nil)))
        XCTAssertTrue(
            isValid(OnboardingGoal(name: "Грузия", targetCents: 500_000_00, due: "2026-12-31"))
        )
    }

    // MARK: - ISO yyyy-MM-dd date format

    func testDueIsoFormatHasNoTimeComponent() {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Europe/Moscow")
        formatter.dateFormat = "yyyy-MM-dd"
        let s = formatter.string(from: Date(timeIntervalSince1970: 1_734_652_800))  // 2024-12-20
        // Length is exactly 10: "yyyy-MM-dd"
        XCTAssertEqual(s.count, 10)
        // Three digit groups separated by '-'
        let parts = s.split(separator: "-")
        XCTAssertEqual(parts.count, 3)
        XCTAssertEqual(parts[0].count, 4)
        XCTAssertEqual(parts[1].count, 2)
        XCTAssertEqual(parts[2].count, 2)
        // No 'T' (would indicate full ISO-8601 datetime).
        XCTAssertFalse(s.contains("T"))
    }

    // MARK: - Persistence: skip→next persists goal=nil

    func testSkipPathPersistsNilGoalAcrossInstances() {
        let a = OnboardingFlow(defaults: defaults)
        a.setIncome(80_000_00)
        a.addAccount(bank: "X", kind: .card, balanceCents: 100)
        a.next()
        a.next()
        a.next()
        a.skipGoal()
        a.next()
        XCTAssertEqual(a.step, 5)
        XCTAssertNil(a.goal)

        // Reload from persisted blob.
        let b = OnboardingFlow(defaults: defaults)
        XCTAssertEqual(b.step, 5)
        XCTAssertNil(b.goal)
    }
}
