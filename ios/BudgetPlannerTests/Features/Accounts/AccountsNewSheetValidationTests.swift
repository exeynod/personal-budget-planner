// Phase 60-03 Task 4: unit tests for AccountsNewSheetValidation —
// pure validation helper extracted из AccountsNewSheet body чтобы тестировать
// canCreate + normaliseMask без живого SwiftUI runtime.
//
// Coverage matrix:
//   - canCreate:
//     - empty bank rejected (both "" и whitespace-only)
//     - kind=.card valid mask "1234" → passes
//     - kind=.card missing mask "" → fails
//     - kind=.card invalid mask length (3 / 5 digits) → fails
//     - kind=.card non-digit mask "12A4" → fails
//     - kind=.cash with mask irrelevant → passes (mask ignored)
//     - kind=.savings ignores mask → passes
//     - balanceCents < 0 → fails
//     - submitting=true forces false (even с valid form)
//   - normaliseMask:
//     - card + raw "1234" → "1234"
//     - card + raw "" → nil
//     - cash → nil (ignored на не-card)
//     - savings → nil
//
// Threat-model:
//   - T-60-02 (mask injection): canCreate тесты проверяют что только
//     4-digit pure-numeric mask проходит при kind == .card; UI layer
//     дополнительно truncate'ит keystroke до 4 цифр (defence-in-depth).

import XCTest

@testable import BudgetPlanner

final class AccountsNewSheetValidationTests: XCTestCase {

    // MARK: - canCreate

    func test_canCreate_emptyBank_returnsFalse() {
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "", kind: .cash, mask: "", balanceCents: 0, submitting: false
        ))
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "   ", kind: .cash, mask: "", balanceCents: 0, submitting: false
        ))
    }

    func test_canCreate_validCard_passes() {
        XCTAssertTrue(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "1234", balanceCents: 0, submitting: false
        ))
    }

    func test_canCreate_cardMissingMask_fails() {
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "", balanceCents: 0, submitting: false
        ))
    }

    func test_canCreate_cardInvalidMaskLength_fails() {
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "123", balanceCents: 0, submitting: false
        ))
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "12345", balanceCents: 0, submitting: false
        ))
    }

    func test_canCreate_cardInvalidMaskNonDigit_fails() {
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "12A4", balanceCents: 0, submitting: false
        ))
    }

    func test_canCreate_cashIgnoresMask() {
        XCTAssertTrue(AccountsNewSheetValidation.canCreate(
            bank: "Наличные", kind: .cash, mask: "", balanceCents: 0, submitting: false
        ))
        XCTAssertTrue(AccountsNewSheetValidation.canCreate(
            bank: "Наличные", kind: .cash, mask: "wat", balanceCents: 5000, submitting: false
        ))
    }

    func test_canCreate_savingsIgnoresMask() {
        XCTAssertTrue(AccountsNewSheetValidation.canCreate(
            bank: "Накопит. счёт", kind: .savings, mask: "", balanceCents: 100000, submitting: false
        ))
        XCTAssertTrue(AccountsNewSheetValidation.canCreate(
            bank: "Накопит. счёт", kind: .savings, mask: "9999", balanceCents: 100000, submitting: false
        ))
    }

    func test_canCreate_negativeBalance_fails() {
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "1234", balanceCents: -100, submitting: false
        ))
    }

    func test_canCreate_zeroBalance_passes() {
        // Empty balance → 0 (UI fallback); 0 — это валидный «открыл счёт, баланс уточню позже».
        XCTAssertTrue(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "1234", balanceCents: 0, submitting: false
        ))
    }

    func test_canCreate_submittingForcesFalse() {
        XCTAssertFalse(AccountsNewSheetValidation.canCreate(
            bank: "Т-Банк", kind: .card, mask: "1234", balanceCents: 0, submitting: true
        ))
    }

    // MARK: - normaliseMask

    func test_normaliseMask_cardWithMask_returnsValue() {
        XCTAssertEqual(
            AccountsNewSheetValidation.normaliseMask("1234", kind: .card),
            "1234"
        )
    }

    func test_normaliseMask_cardEmpty_returnsNil() {
        XCTAssertNil(AccountsNewSheetValidation.normaliseMask("", kind: .card))
    }

    func test_normaliseMask_cash_returnsNil() {
        XCTAssertNil(AccountsNewSheetValidation.normaliseMask("1234", kind: .cash))
    }

    func test_normaliseMask_savings_returnsNil() {
        XCTAssertNil(AccountsNewSheetValidation.normaliseMask("1234", kind: .savings))
    }
}
