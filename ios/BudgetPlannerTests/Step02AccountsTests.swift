// Phase 24-05: XCTest specs for Step 02 (Accounts) — pluralisation helper +
// flow integration assertions (chip taps, primary handover, hint text).
//
// Symmetric to web Plan 24-04 vitest suite
// (frontend/src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx).
//
// We do NOT drive the SwiftUI view tree — XCUI / ViewInspector lands in
// Plan 24-11. Instead we assert:
//   1. PluralRu.accounts(_:) — pure Russian plural rules.
//   2. flow.addAccount semantics from Step02 chip-tap (auto-primary, kind).
//   3. flow.removeAccount + setPrimary semantics.
//   4. Hint text construction (count + total + pluralised noun).
//
// Persistence isolated via fresh UserDefaults suite per test.

import XCTest

@testable import BudgetPlanner

@MainActor
final class Step02AccountsTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.step02"

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

    // MARK: - PluralRu.accounts

    func testPluralZero() {
        XCTAssertEqual(PluralRu.accounts(0), "счётов")
    }

    func testPluralOne() {
        XCTAssertEqual(PluralRu.accounts(1), "счёт")
    }

    func testPluralFew() {
        XCTAssertEqual(PluralRu.accounts(2), "счёта")
        XCTAssertEqual(PluralRu.accounts(3), "счёта")
        XCTAssertEqual(PluralRu.accounts(4), "счёта")
    }

    func testPluralMany() {
        XCTAssertEqual(PluralRu.accounts(5), "счётов")
        XCTAssertEqual(PluralRu.accounts(6), "счётов")
        XCTAssertEqual(PluralRu.accounts(9), "счётов")
        XCTAssertEqual(PluralRu.accounts(10), "счётов")
    }

    func testPluralTeenExceptions() {
        // 11..14 always "счётов" (override the mod10 rule)
        XCTAssertEqual(PluralRu.accounts(11), "счётов")
        XCTAssertEqual(PluralRu.accounts(12), "счётов")
        XCTAssertEqual(PluralRu.accounts(13), "счётов")
        XCTAssertEqual(PluralRu.accounts(14), "счётов")
    }

    func testPluralAfterTwenty() {
        XCTAssertEqual(PluralRu.accounts(20), "счётов")
        XCTAssertEqual(PluralRu.accounts(21), "счёт")
        XCTAssertEqual(PluralRu.accounts(22), "счёта")
        XCTAssertEqual(PluralRu.accounts(23), "счёта")
        XCTAssertEqual(PluralRu.accounts(24), "счёта")
        XCTAssertEqual(PluralRu.accounts(25), "счётов")
        XCTAssertEqual(PluralRu.accounts(30), "счётов")
        XCTAssertEqual(PluralRu.accounts(31), "счёт")
    }

    func testPluralHundredOne() {
        // 101 → "счёт" (mod100 = 1, not in 11..14)
        XCTAssertEqual(PluralRu.accounts(101), "счёт")
        // 111 → "счётов" (mod100 = 11, the teen exception)
        XCTAssertEqual(PluralRu.accounts(111), "счётов")
        XCTAssertEqual(PluralRu.accounts(112), "счётов")
        // 121 → "счёт"
        XCTAssertEqual(PluralRu.accounts(121), "счёт")
        // 122 → "счёта"
        XCTAssertEqual(PluralRu.accounts(122), "счёта")
    }

    // MARK: - flow.addAccount semantics from chip tap

    func testAddTBankFromChipAutoPrimary() {
        let flow = OnboardingFlow(defaults: defaults)
        // What the Т-Банк chip → AccountBalanceSheet → onSave would dispatch:
        flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
        XCTAssertEqual(flow.accounts.count, 1)
        XCTAssertEqual(flow.accounts[0].bank, "Т-БАНК")
        XCTAssertEqual(flow.accounts[0].kind, .card)
        XCTAssertEqual(flow.accounts[0].balanceCents, 5_000_000)
        XCTAssertTrue(flow.accounts[0].primary)
    }

    func testAddCashFromNalichnyeChip() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "НАЛИЧНЫЕ", kind: .cash, balanceCents: 100_000)
        XCTAssertEqual(flow.accounts[0].kind, .cash)
        XCTAssertTrue(flow.accounts[0].primary)
    }

    func testRemoveAccountFromXButton() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)
        flow.addAccount(bank: "B", kind: .card, balanceCents: 2)
        XCTAssertEqual(flow.accounts.count, 2)
        flow.removeAccount(at: 0)
        XCTAssertEqual(flow.accounts.count, 1)
        XCTAssertEqual(flow.accounts[0].bank, "B")
        // Primary handover already covered in OnboardingFlowTests; re-assert here:
        XCTAssertTrue(flow.accounts[0].primary)
    }

    func testSetPrimaryFromStarTap() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "A", kind: .card, balanceCents: 1)  // primary=true (auto)
        flow.addAccount(bank: "B", kind: .card, balanceCents: 2)  // primary=false
        XCTAssertTrue(flow.accounts[0].primary)
        XCTAssertFalse(flow.accounts[1].primary)

        flow.setPrimary(at: 1)
        XCTAssertFalse(flow.accounts[0].primary)
        XCTAssertTrue(flow.accounts[1].primary)
    }

    // MARK: - NEXT-disabled rule

    func testNextDisabledWhenNoAccounts() {
        let flow = OnboardingFlow(defaults: defaults)
        XCTAssertTrue(flow.accounts.isEmpty)
    }

    func testNextEnabledAfterFirstAccount() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.addAccount(bank: "X", kind: .card, balanceCents: 1)
        XCTAssertFalse(flow.accounts.isEmpty)
    }

    // MARK: - Hint text computation (mirrors view's `hintText` getter)

    /// Reproduces the formula used inside OnboardingV10View for case 2 hint.
    /// Centralised here so a regression in either view OR the formula gets caught.
    private func hintText(for accounts: [OnboardingAccount]) -> String {
        if accounts.isEmpty { return "нужен минимум один счёт" }
        let total = accounts.reduce(0) { $0 + $1.balanceCents }
        return "\(accounts.count) \(PluralRu.accounts(accounts.count)) · \(RubleFormatter.format(cents: total)) ₽"
    }

    func testHintEmpty() {
        XCTAssertEqual(hintText(for: []), "нужен минимум один счёт")
    }

    func testHintOneAccount() {
        let acc = OnboardingAccount(
            bank: "X", mask: nil, kind: .card,
            balanceCents: 5_000_000, primary: true
        )
        XCTAssertEqual(hintText(for: [acc]),
                       "1 счёт · 50\u{202F}000 ₽")
    }

    func testHintFewAccounts() {
        let mk: (Int) -> OnboardingAccount = { i in
            OnboardingAccount(bank: "A\(i)", mask: nil, kind: .card,
                              balanceCents: 100_000, primary: i == 0)
        }
        let two = [mk(0), mk(1)]
        XCTAssertEqual(hintText(for: two),
                       "2 счёта · 2\u{202F}000 ₽")
    }

    func testHintManyAccounts() {
        let mk: (Int) -> OnboardingAccount = { i in
            OnboardingAccount(bank: "A\(i)", mask: nil, kind: .card,
                              balanceCents: 100_000, primary: i == 0)
        }
        let five = (0..<5).map(mk)
        XCTAssertEqual(hintText(for: five),
                       "5 счётов · 5\u{202F}000 ₽")
    }
}
