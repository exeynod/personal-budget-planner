import XCTest

@testable import BudgetPlanner

/// Phase 64 Plan 01 — unit specs for the TransactionEditor account picker
/// pure logic (`AccountPickerLogic`, ADD-V10-04).
///
/// `TransactionEditor` is a `struct View`, so the default-account selection
/// and row-label formatting are extracted into `AccountPickerLogic` static
/// functions and exercised here directly (no SwiftUI / network seam). The
/// editor calls the same functions, so these tests pin the production
/// behaviour (single source of truth).
final class TransactionEditorAccountTests: XCTestCase {

    // MARK: - Fixtures

    private func makeAccount(
        id: Int,
        bank: String = "Bank",
        mask: String? = nil,
        primary: Bool = false
    ) -> AccountDTO {
        AccountDTO(
            id: id, bank: bank, mask: mask, kind: .card,
            balanceCents: 0, primary: primary, createdAt: nil)
    }

    // MARK: - defaultAccountId

    func test_defaultAccountId_primaryPresent_returnsPrimaryNotFirst() {
        // primary is the 2nd element — must win over the first by order.
        let accounts = [
            makeAccount(id: 1, primary: false),
            makeAccount(id: 2, primary: true),
            makeAccount(id: 3, primary: false),
        ]
        XCTAssertEqual(AccountPickerLogic.defaultAccountId(accounts), 2)
    }

    func test_defaultAccountId_noPrimary_returnsFirst() {
        let accounts = [
            makeAccount(id: 10, primary: false),
            makeAccount(id: 11, primary: false),
        ]
        XCTAssertEqual(AccountPickerLogic.defaultAccountId(accounts), 10)
    }

    func test_defaultAccountId_empty_returnsNil() {
        XCTAssertNil(AccountPickerLogic.defaultAccountId([]))
    }

    // MARK: - label

    func test_label_bankWithMask_includesDotMask() {
        let a = makeAccount(id: 1, bank: "Тинькофф", mask: "1234")
        XCTAssertEqual(AccountPickerLogic.label(a), "Тинькофф ·1234")
    }

    func test_label_bankWithoutMask_bankOnly() {
        let a = makeAccount(id: 1, bank: "Тинькофф", mask: nil)
        XCTAssertEqual(AccountPickerLogic.label(a), "Тинькофф")
    }

    func test_label_emptyMask_appendsDotEmpty() {
        // Defensive: an empty (non-nil) mask still appends the separator —
        // documents current behaviour so a future change is intentional.
        let a = makeAccount(id: 1, bank: "Альфа", mask: "")
        XCTAssertEqual(AccountPickerLogic.label(a), "Альфа ·")
    }
}
