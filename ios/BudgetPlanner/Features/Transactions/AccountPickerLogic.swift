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

/// Phase 64-02 (WR-03) — pure resolver for applying an AI category suggestion.
///
/// `TransactionEditor.applySuggestion` is a `struct View` method, so the
/// "is this suggestion safe to apply?" decision is extracted here as a pure
/// function for direct unit testing. A suggestion is applied ONLY when its
/// `categoryId` resolves to a currently-valid local category (present and
/// non-archived). Otherwise it is ignored — preventing the kind-filtered
/// Picker from holding an invisible/unverifiable selection while `canSave`
/// stays true.
enum AISuggestApply {

    /// Result of resolving a suggestion against the editor's local categories.
    struct Resolution: Equatable {
        /// The category id to select, or nil when the suggestion must be ignored.
        let categoryId: Int?
        /// The kind to switch to (actual modes), or nil when no change is needed.
        let alignKind: CategoryKind?
    }

    /// Decide how to apply `suggestion` given the local `categories`, the
    /// current `kind`, and whether the editor is in an actual mode.
    ///
    /// - Returns `.init(categoryId: nil, alignKind: nil)` when the suggestion
    ///   is missing, points at an unknown id, or points at an archived category
    ///   (ignore — do not mutate selection).
    /// - Otherwise returns the id to select and, for actual modes, the kind to
    ///   align so the category lands in the kind-filtered Picker.
    static func resolve(
        suggestion: SuggestCategoryDTO,
        categories: [CategoryDTO],
        currentKind: CategoryKind,
        isActual: Bool
    ) -> Resolution {
        guard let sid = suggestion.categoryId,
            let cat = categories.first(where: { $0.id == sid }),
            !cat.isArchived
        else {
            return Resolution(categoryId: nil, alignKind: nil)
        }
        let alignKind: CategoryKind? = (isActual && cat.kind != currentKind) ? cat.kind : nil
        return Resolution(categoryId: sid, alignKind: alignKind)
    }
}
