import Foundation
import Observation

/// Phase 60 (v06 Native Rebuild): ViewModel для AccountsView.
///
/// Plan 60-01 заскаффолдил surface. Plan 60-02 заполняет `load()` +
/// `clearLastCreatedAccountId()` + `_setAccountsForTesting()` (#if DEBUG)
/// helpers. `createAccount(...)` остаётся stub — Plan 60-03 заполнит.
///
/// Threat-model:
///   - T-60-03 (Information Disclosure): catch блок НЕ присваивает raw
///     Swift error description к status. Фиксированная Russian copy
///     «Не удалось загрузить счета». Полный error печатается через
///     `print(...)` только в Xcode console.
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
    /// Set by createAccount() on success; cleared after consumption
    /// через `clearLastCreatedAccountId()`.
    var lastCreatedAccountId: Int? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    // MARK: - Load (Plan 60-02)

    /// GET /api/v1/accounts → `accounts`. Re-entrant guard через `inFlight`;
    /// status переходит .idle → .loading → .ready на success или .error на
    /// failure. T-60-03: фиксированная Russian copy, без raw error leak.
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        do {
            self.accounts = try await AccountsAPI.list()
            status = .ready
        } catch {
            print("[AccountsViewModel] load failed: \(error)")
            status = .error("Не удалось загрузить счета")
        }
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

    // MARK: - Helpers

    /// Reset последнего созданного account id (consumed by ScrollViewReader
    /// in AccountsView once the row has scrolled into view). Allows the same
    /// id to re-trigger `.onChange` if пользователь создаст этот же счёт
    /// снова после rapid create-delete (теоретически — backend hard-delete
    /// для accounts ещё не доступен, см. CONTEXT scope).
    func clearLastCreatedAccountId() {
        self.lastCreatedAccountId = nil
    }

    // MARK: - Derived

    var sumBalancesCents: Int {
        accounts.reduce(0) { $0 + $1.balanceCents }
    }

    var accountCount: Int { accounts.count }

    // MARK: - Test backdoor (#if DEBUG)

    #if DEBUG
    /// Test-only mutator для unit tests (AccountsViewModelTests). Позволяет
    /// заполнить `accounts` без сетевого вызова (`AccountsAPI.list` требует
    /// live backend) для проверки derived properties (`sumBalancesCents`,
    /// `accountCount`).
    func _setAccountsForTesting(_ list: [AccountDTO]) {
        self.accounts = list
    }
    #endif
}
