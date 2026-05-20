import Foundation

/// Phase 64-01 — pure logic for the TransactionEditor account picker
/// (ADD-V10-04).
///
/// `TransactionEditor` is a `struct View`, so the default-account selection
/// and label-formatting rules are extracted here as static pure functions.
/// This gives a single source of truth that the editor calls AND that unit
/// tests exercise directly (no SwiftUI / network seam needed).
///
/// Sibling parity: matches the inline pattern in
/// `Features/Savings/SavingsDepositSheet.swift` (default = primary ?? first;
/// label = bank + " ·<mask>").
enum AccountPickerLogic {

    /// Default selected account: the user's primary account if present,
    /// otherwise the first account, otherwise nil (empty list).
    ///
    /// The backend already sorts primary-first, but selecting by the
    /// `primary` flag is order-independent and survives any future sort
    /// change.
    static func defaultAccountId(_ accounts: [AccountDTO]) -> Int? {
        accounts.first(where: { $0.primary })?.id ?? accounts.first?.id
    }

    /// Picker row label: bank name plus a masked tail when available,
    /// e.g. "Тинькофф ·1234" or just "Тинькофф".
    static func label(_ a: AccountDTO) -> String {
        a.bank + (a.mask.map { " ·\($0)" } ?? "")
    }
}
