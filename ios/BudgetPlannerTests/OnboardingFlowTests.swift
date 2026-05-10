// Phase 24-01: XCTest specs for OnboardingFlow + OnboardingDraft round-trip.
// Mirrors the web vitest suite (tests/onboardingReducer.test.ts +
// tests/useOnboardingDraft.test.ts) so behaviour stays in lock-step.
//
// Persistence isolation: every test passes a fresh
// `UserDefaults(suiteName:)` so we never touch the standard suite.

import XCTest

@testable import BudgetPlanner

@MainActor
final class OnboardingFlowTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.flow"

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

    // MARK: - Initial state

    func testInitialStateMatchesContract() {
        let flow = OnboardingFlow(defaults: defaults)
        XCTAssertEqual(flow.step, 1)
        XCTAssertEqual(flow.incomeCents, 0)
        XCTAssertTrue(flow.accounts.isEmpty)
        XCTAssertTrue(flow.categoryPlans.isEmpty)
        XCTAssertNil(flow.goal)
        XCTAssertNil(flow.savingsConfig)
    }

    // MARK: - Accounts

    func testAddAccountAutoPrimary() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "Т-Банк", kind: .card, balanceCents: 100)
        XCTAssertEqual(flow.accounts.count, 1)
        XCTAssertTrue(flow.accounts[0].primary)
    }

    func testSecondAccountIsNotPrimary() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)
        flow.addAccount(bank: "B", kind: .card, balanceCents: 2)
        XCTAssertEqual(flow.accounts.map(\.primary), [true, false])
    }

    func testRemoveAccountPrimaryHandoff() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)
        flow.addAccount(bank: "B", kind: .card, balanceCents: 2)
        flow.removeAccount(at: 0)
        XCTAssertEqual(flow.accounts.count, 1)
        XCTAssertEqual(flow.accounts[0].bank, "B")
        XCTAssertTrue(flow.accounts[0].primary)
    }

    func testRemoveNonPrimaryKeepsPrimary() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)
        flow.addAccount(bank: "B", kind: .card, balanceCents: 2)
        flow.removeAccount(at: 1)
        XCTAssertEqual(flow.accounts.count, 1)
        XCTAssertEqual(flow.accounts[0].bank, "A")
        XCTAssertTrue(flow.accounts[0].primary)
    }

    func testRemoveAccountBadIndexIsNoOp() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)
        flow.removeAccount(at: 99)
        XCTAssertEqual(flow.accounts.count, 1)
    }

    func testSetPrimaryEnforcesSinglePrimary() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)
        flow.addAccount(bank: "B", kind: .card, balanceCents: 2)
        flow.setPrimary(at: 1)
        XCTAssertFalse(flow.accounts[0].primary)
        XCTAssertTrue(flow.accounts[1].primary)
        XCTAssertEqual(flow.accounts.filter(\.primary).count, 1)
    }

    // MARK: - Income + plan

    func testSetIncomeAutoAllocatesPlan() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        // food share 0.20 → 80_000_00 * 0.20 = 1_600_000 cents (16_000_00).
        XCTAssertEqual(flow.categoryPlans["food"], 1_600_000)
        // cafe share 0.10 → 80_000_00 * 0.10 = 800_000 cents.
        XCTAssertEqual(flow.categoryPlans["cafe"], 800_000)
        // All 8 codes populated.
        XCTAssertEqual(flow.categoryPlans.count, 8)
    }

    func testSetIncomeClampsNegative() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(-500)
        XCTAssertEqual(flow.incomeCents, 0)
    }

    func testSetIncomeDoesNotOverwriteUserPlan() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.setPlan(code: "food", cents: 5_000_00)
        flow.setIncome(100_000_00)
        XCTAssertEqual(flow.incomeCents, 100_000_00)
        XCTAssertEqual(flow.categoryPlans["food"], 5_000_00)
    }

    func testSetPlanIgnoresUnknownCode() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setPlan(code: "gambling", cents: 9999)
        XCTAssertNil(flow.categoryPlans["gambling"])
        XCTAssertTrue(flow.categoryPlans.isEmpty)
    }

    func testSetPlanClampsNegative() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setPlan(code: "food", cents: -1)
        XCTAssertEqual(flow.categoryPlans["food"], 0)
    }

    // MARK: - Step transitions

    func testNextCapsAtFive() {
        let flow = OnboardingFlow(defaults: defaults)
        for _ in 0..<10 { flow.next() }
        XCTAssertEqual(flow.step, 5)
    }

    func testBackFloorsAtOne() {
        let flow = OnboardingFlow(defaults: defaults)
        for _ in 0..<5 { flow.next() }
        for _ in 0..<10 { flow.back() }
        XCTAssertEqual(flow.step, 1)
    }

    func testResetReturnsInitialState() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(5_000_00)
        flow.addAccount(bank: "X", kind: .cash, balanceCents: 1)
        flow.next()
        flow.reset()
        XCTAssertEqual(flow.step, 1)
        XCTAssertEqual(flow.incomeCents, 0)
        XCTAssertTrue(flow.accounts.isEmpty)
        XCTAssertTrue(flow.categoryPlans.isEmpty)
    }

    // MARK: - Codable round-trip

    func testDraftRoundTripLossless() throws {
        var draft = OnboardingDraft.initial
        draft.step = 3
        draft.incomeCents = 100_000_00
        draft.accounts = [
            OnboardingAccount(
                bank: "Т-Банк",
                mask: "1234",
                kind: .card,
                balanceCents: 50_000_00,
                primary: true,
            )
        ]
        draft.categoryPlans = ["food": 2_000_00, "cafe": 1_000_00]
        draft.goal = OnboardingGoal(
            name: "Отпуск",
            targetCents: 200_000_00,
            due: "2026-12-31",
        )
        draft.savingsConfig = OnboardingSavingsConfig(roundupEnabled: true, base: 50)

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(OnboardingDraft.self, from: data)
        XCTAssertEqual(decoded, draft)
    }

    func testDraftWireKeysAreSnakeCase() throws {
        // Set goal + savings_config so all 6 top-level keys serialise
        // (Optional nil-valued fields are dropped by the synthesized
        // Encodable encoder when the value is nil and the property is
        // typed as Optional with no explicit handling).
        let draft = OnboardingDraft(
            step: 1,
            incomeCents: 100,
            accounts: [
                OnboardingAccount(
                    bank: "X",
                    mask: nil,
                    kind: .card,
                    balanceCents: 50,
                    primary: true,
                )
            ],
            categoryPlans: [:],
            goal: OnboardingGoal(name: "G", targetCents: 1, due: "2026-12-31"),
            savingsConfig: OnboardingSavingsConfig(roundupEnabled: false, base: 10),
        )
        let data = try JSONEncoder().encode(draft)
        let json = String(data: data, encoding: .utf8) ?? ""
        XCTAssertTrue(json.contains("\"income_cents\""), "income_cents missing in: \(json)")
        XCTAssertTrue(json.contains("\"balance_cents\""), "balance_cents missing in: \(json)")
        XCTAssertTrue(json.contains("\"category_plans\""), "category_plans missing in: \(json)")
        XCTAssertTrue(json.contains("\"savings_config\""), "savings_config missing in: \(json)")
        XCTAssertTrue(json.contains("\"target_cents\""), "target_cents missing in: \(json)")
        XCTAssertTrue(json.contains("\"roundup_enabled\""), "roundup_enabled missing in: \(json)")
        // Negative checks — no camelCase variants leaked through.
        XCTAssertFalse(json.contains("\"incomeCents\""))
        XCTAssertFalse(json.contains("\"balanceCents\""))
        XCTAssertFalse(json.contains("\"savingsConfig\""))
        XCTAssertFalse(json.contains("\"roundupEnabled\""))
    }

    // MARK: - Persistence

    func testPersistAndLoadAcrossInstances() {
        let a = OnboardingFlow(defaults: defaults)
        a.setIncome(123_45)
        a.addAccount(bank: "Сбер", kind: .card, balanceCents: 999_00)
        a.next()
        XCTAssertEqual(a.step, 2)

        // Spawn a fresh instance using the same UserDefaults suite — it
        // must rebuild from the persisted blob.
        let b = OnboardingFlow(defaults: defaults)
        XCTAssertEqual(b.step, 2)
        XCTAssertEqual(b.incomeCents, 123_45)
        XCTAssertEqual(b.accounts.count, 1)
        XCTAssertEqual(b.accounts[0].bank, "Сбер")
        XCTAssertTrue(b.accounts[0].primary)
    }

    func testClearDraftRemovesPersistedBlob() {
        let a = OnboardingFlow(defaults: defaults)
        a.setIncome(50_000_00)
        XCTAssertNotNil(defaults.data(forKey: OnboardingFlow.draftKey))
        a.clearDraft()
        XCTAssertNil(defaults.data(forKey: OnboardingFlow.draftKey))
    }

    func testSanitiserRejectsBadStep() throws {
        // Write a hand-crafted JSON with step=99 directly to the suite,
        // bypassing OnboardingFlow.persist().
        let badJSON = """
            {
              "step": 99,
              "income_cents": 0,
              "accounts": [],
              "category_plans": {},
              "goal": null,
              "savings_config": null
            }
            """
        let data = badJSON.data(using: .utf8)!
        defaults.set(data, forKey: OnboardingFlow.draftKey)

        let flow = OnboardingFlow(defaults: defaults)
        // Sanitiser rejects → falls back to INITIAL.
        XCTAssertEqual(flow.step, 1)
        XCTAssertEqual(flow.incomeCents, 0)
    }

    func testSanitiserSelfHealsMalformedJSON() {
        // Garbage bytes → load returns nil + key cleared.
        let trash = "{not json".data(using: .utf8)!
        defaults.set(trash, forKey: OnboardingFlow.draftKey)
        let flow = OnboardingFlow(defaults: defaults)
        XCTAssertEqual(flow.step, 1)
        // Self-healed:
        XCTAssertNil(defaults.data(forKey: OnboardingFlow.draftKey))
        _ = flow  // silence unused warning
    }

    func testSanitiserDropsUnknownCategoryCodes() throws {
        let dirty = """
            {
              "step": 2,
              "income_cents": 1000,
              "accounts": [],
              "category_plans": {"food": 100, "gambling": 9999, "cafe": 50},
              "goal": null,
              "savings_config": null
            }
            """
        defaults.set(dirty.data(using: .utf8)!, forKey: OnboardingFlow.draftKey)
        let flow = OnboardingFlow(defaults: defaults)
        XCTAssertEqual(flow.categoryPlans["food"], 100)
        XCTAssertEqual(flow.categoryPlans["cafe"], 50)
        XCTAssertNil(flow.categoryPlans["gambling"])
    }

    // MARK: - Wire body shape

    func testToAPIBodyStripsStep() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(50_000_00)
        flow.addAccount(bank: "X", kind: .card, balanceCents: 1)
        flow.next()
        flow.next()
        XCTAssertEqual(flow.step, 3)

        let body = flow.toAPIBody()
        XCTAssertEqual(body.incomeCents, 50_000_00)
        XCTAssertEqual(body.accounts.count, 1)
        // step is not exposed on OnboardingAPIBody at all — confirmed by
        // type-system at compile time. Nothing else to assert here.
        _ = body
    }

    func testToAPIBodyOmitsNullGoal() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(50_000_00)
        flow.addAccount(bank: "X", kind: .card, balanceCents: 1)
        let body = flow.toAPIBody()
        XCTAssertNil(body.goal)
        XCTAssertNil(body.savingsConfig)
    }

    func testToAPIBodyEmitsGoalWhenSet() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(50_000_00)
        flow.addAccount(bank: "X", kind: .card, balanceCents: 1)
        flow.setGoal(OnboardingGoal(name: "Отпуск", targetCents: 100_000, due: nil))
        let body = flow.toAPIBody()
        XCTAssertNotNil(body.goal)
        XCTAssertEqual(body.goal?.name, "Отпуск")
        XCTAssertEqual(body.goal?.targetCents, 100_000)
        XCTAssertNil(body.goal?.due)
    }
}
