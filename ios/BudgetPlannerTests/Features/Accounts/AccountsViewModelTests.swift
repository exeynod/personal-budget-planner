// Phase 60-02 Task 3: unit tests for AccountsViewModel state machine +
// derived properties.
//
// Scope:
//   - initial state (idle / empty accounts / sheet=.none / submitting=false
//     / lastCreatedAccountId=nil).
//   - sumBalancesCents (Σ balanceCents, including signed values).
//   - accountCount (length of accounts).
//   - clearLastCreatedAccountId() bookkeeping.
//   - Status equatable (distinct error messages).
//   - SheetMode equatable / toggling.
//   - Status equatable for .ready / .loading reflexive equality.
//
// Threat-model (T-60-03 Information Disclosure): tests do NOT directly
// exercise network-failure path (no APIClient mocking available); the
// load() guard is verified by code review (grep gates already enforce
// `Не удалось загрузить счета` literal + 0 occurrences of raw error
// description). Smoke for actual .error state — manual via 60-VERIFICATION
// or by killing backend before опен экрана.
//
// Fixture pattern: JSON-decode through .convertFromSnakeCase decoder so
// the DTO wire contract (camelCase camera-ready field names) is exercised
// the same way as in production via APIClient.shared.decoder.

import XCTest

@testable import BudgetPlanner

@MainActor
final class AccountsViewModelTests: XCTestCase {

    // MARK: - Helpers

    private func makeAccount(
        id: Int,
        bank: String = "Т-Банк",
        kind: String = "card",
        mask: String? = nil,
        balanceCents: Int = 0,
        primary: Bool = false
    ) -> AccountDTO {
        var fields: [String] = [
            "\"id\": \(id)",
            "\"bank\": \"\(bank)\"",
            "\"kind\": \"\(kind)\"",
            "\"balance_cents\": \(balanceCents)",
            "\"primary\": \(primary ? "true" : "false")",
        ]
        if let mask {
            fields.append("\"mask\": \"\(mask)\"")
        } else {
            fields.append("\"mask\": null")
        }
        fields.append("\"created_at\": null")
        let json = "{\(fields.joined(separator: ","))}".data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(AccountDTO.self, from: json)
    }

    // MARK: - Test 1: initial state

    func test_initialState_idleEmpty() {
        let vm = AccountsViewModel()
        XCTAssertEqual(vm.status, .idle)
        XCTAssertTrue(vm.accounts.isEmpty)
        XCTAssertEqual(vm.sheet, .none)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.lastCreatedAccountId)
        XCTAssertNil(vm.createError)
    }

    // MARK: - Test 2: sumBalancesCents sums all (incl. negative)

    func test_sumBalancesCents_sumsAllAccounts() {
        let vm = AccountsViewModel()
        vm._setAccountsForTesting([
            makeAccount(id: 1, balanceCents: 1000),
            makeAccount(id: 2, balanceCents: 2500),
            makeAccount(id: 3, balanceCents: -300),
        ])
        XCTAssertEqual(vm.sumBalancesCents, 3200)
    }

    // MARK: - Test 3: sumBalancesCents empty → 0

    func test_sumBalancesCents_emptyReturnsZero() {
        let vm = AccountsViewModel()
        XCTAssertEqual(vm.sumBalancesCents, 0)
    }

    // MARK: - Test 4: accountCount returns length

    func test_accountCount_returnsLength() {
        let vm = AccountsViewModel()
        vm._setAccountsForTesting([
            makeAccount(id: 1),
            makeAccount(id: 2),
            makeAccount(id: 3),
        ])
        XCTAssertEqual(vm.accountCount, 3)
    }

    // MARK: - Test 5: clearLastCreatedAccountId() bookkeeping

    func test_clearLastCreatedAccountId_setsNil() {
        let vm = AccountsViewModel()
        vm.lastCreatedAccountId = 42
        XCTAssertEqual(vm.lastCreatedAccountId, 42)
        vm.clearLastCreatedAccountId()
        XCTAssertNil(vm.lastCreatedAccountId)
    }

    // MARK: - Test 6: Status equatable distinguishes error messages

    func test_status_equatable_distinguishesErrorMessages() {
        XCTAssertNotEqual(
            AccountsViewModel.Status.error("foo"),
            AccountsViewModel.Status.error("bar")
        )
        XCTAssertEqual(AccountsViewModel.Status.ready, .ready)
        XCTAssertEqual(AccountsViewModel.Status.loading, .loading)
        XCTAssertEqual(AccountsViewModel.Status.idle, .idle)
    }

    // MARK: - Test 7: SheetMode toggling

    func test_sheetMode_toggling() {
        let vm = AccountsViewModel()
        XCTAssertEqual(vm.sheet, .none)
        vm.sheet = .newAccount
        XCTAssertEqual(vm.sheet, .newAccount)
        vm.sheet = .none
        XCTAssertEqual(vm.sheet, .none)
    }

    // MARK: - Test 8: clearCreateError sets nil (Plan 60-03)

    /// Заменяет старый `test_createAccount_stubReturnsFalseUntil_60_03` —
    /// Plan 60-03 заменил stub-body реальной реализацией. Network success/
    /// failure path не покрываем (нет APIClient mock), но lifecycle
    /// `createError` setter/clearer проверяем напрямую.
    func test_clearCreateError_setsNil() {
        let vm = AccountsViewModel()
        XCTAssertNil(vm.createError)
        vm.createError = "Не удалось создать счёт. Проверьте подключение и попробуйте ещё раз."
        XCTAssertEqual(vm.createError, "Не удалось создать счёт. Проверьте подключение и попробуйте ещё раз.")
        vm.clearCreateError()
        XCTAssertNil(vm.createError)
    }

    // MARK: - Test 9: sumBalancesCents — single primary account

    func test_sumBalancesCents_singlePrimary() {
        let vm = AccountsViewModel()
        vm._setAccountsForTesting([
            makeAccount(id: 1, bank: "Т-Банк", kind: "card", mask: "0420", balanceCents: 123_456, primary: true),
        ])
        XCTAssertEqual(vm.sumBalancesCents, 123_456)
        XCTAssertEqual(vm.accountCount, 1)
    }
}
