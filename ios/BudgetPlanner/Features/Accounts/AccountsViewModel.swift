import Foundation
import Observation

/// Phase 60 (v06 Native Rebuild): ViewModel для AccountsView.
///
/// Stub-структура (Plan 60-01). Полная реализация load() / sumBalances /
/// createAccount() — Plan 60-02. NewAccountSheet integration — Plan 60-03.
///
/// Pattern: parallel to AccountsListV10ViewModel (FeaturesV10), но v06 native
/// shell. Никакого V10 styling / poster-tokens.
@MainActor
@Observable
final class AccountsViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    enum SheetMode: Equatable {
        case none
        case newAccount
    }

    private(set) var status: Status = .idle
    private(set) var accounts: [AccountDTO] = []
    var sheet: SheetMode = .none
    private(set) var submitting: Bool = false

    /// Indicates last-created account id (for ScrollViewReader.scrollTo).
    /// Set by createAccount() on success; cleared after consumption.
    var lastCreatedAccountId: Int? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    // MARK: - Load (filled in 60-02)
    func load() async {
        // Plan 60-02 fills this body.
    }

    // MARK: - Mutations (filled in 60-03)
    func createAccount(
        bank: String,
        kind: AccountKind,
        mask: String?,
        balanceCents: Int,
        primary: Bool
    ) async -> Bool {
        // Plan 60-03 fills this body. Returns true on success.
        return false
    }

    // MARK: - Derived
    var sumBalancesCents: Int {
        accounts.reduce(0) { $0 + $1.balanceCents }
    }

    var accountCount: Int { accounts.count }
}
