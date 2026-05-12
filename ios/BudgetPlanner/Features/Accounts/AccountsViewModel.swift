import Foundation
import Observation

/// Phase 60 (v06 Native Rebuild): ViewModel для AccountsView.
///
/// Plan 60-01 заскаффолдил surface. Plan 60-02 заполнил `load()` +
/// `clearLastCreatedAccountId()` + `_setAccountsForTesting()` (#if DEBUG).
/// Plan 60-03 заполняет `createAccount(...)` real implementation +
/// `createError: String?` state + `clearCreateError()` helper.
///
/// Threat-model:
///   - T-60-01 (Primary race): backend сериализует primary uniqueness в
///     одной транзакции (Phase 22 BE-02). На клиенте после create →
///     `load()` refetches → UI отображает actual server state. UI НЕ
///     пытается локально снимать primary с других accounts.
///   - T-60-03 (Information Disclosure): catch блоки НЕ присваивают raw
///     Swift error description ни к `status`, ни к `createError`.
///     Фиксированные Russian copy. Полный error печатается через
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

    /// User-visible inline banner copy на create failure (T-60-03 mitigation:
    /// фиксированная Russian copy, raw Swift error не светится). Cleared
    /// при следующем successful create (`createAccount` sets nil on success)
    /// ИЛИ вручную через `clearCreateError()` (xmark dismiss в banner).
    var createError: String? = nil

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

    // MARK: - Mutations (Plan 60-03)

    /// POST /api/v1/accounts → `AccountsAPI.create`. On success:
    /// - clears `createError`,
    /// - refetches via `load()` (T-60-01: backend сериализует primary
    ///   uniqueness и возвращает sorted list — primary first, id ASC),
    /// - устанавливает `lastCreatedAccountId` к id созданной записи (triggers
    ///   ScrollViewReader .onChange в AccountsView для scroll-to-new),
    /// - dismisses sheet (`sheet = .none`),
    /// - returns `true`.
    ///
    /// On failure:
    /// - sets `createError` к filtered Russian copy (T-60-03 — raw error
    ///   только в `print` для Xcode console),
    /// - dismisses sheet anyway — banner живёт в AccountsView outside sheet,
    /// - returns `false`.
    ///
    /// Caller (AccountsNewSheet) использует return value опционально —
    /// sheet dismissal управляется здесь (sheet = .none на обоих путях).
    func createAccount(
        bank: String,
        kind: AccountKind,
        mask: String?,
        balanceCents: Int,
        primary: Bool
    ) async -> Bool {
        submitting = true
        defer { submitting = false }

        // Normalize mask: nil если не card ИЛИ если empty string.
        let normalisedMask: String? = (kind == .card && mask?.isEmpty == false) ? mask : nil

        let request = AccountCreateRequest(
            bank: bank.trimmingCharacters(in: .whitespacesAndNewlines),
            kind: kind,
            mask: normalisedMask,
            balanceCents: balanceCents,
            primary: primary ? true : nil
        )

        do {
            let created = try await AccountsAPI.create(request)
            createError = nil
            // T-60-01: reload — backend сериализует primary uniqueness в одной
            // транзакции и возвращает sorted list (primary first, id ASC).
            await load()
            // Trigger ScrollViewReader .onChange в AccountsView → scrollTo.
            lastCreatedAccountId = created.id
            sheet = .none
            return true
        } catch {
            print("[AccountsViewModel] createAccount failed: \(error)")
            // T-60-03: filtered Russian copy, без raw Swift error description.
            createError = "Не удалось создать счёт. Проверьте подключение и попробуйте ещё раз."
            // Sheet dismisses anyway — banner живёт в AccountsView (CONTEXT D-4).
            sheet = .none
            return false
        }
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

    /// Скрыть inline createError banner (вызывается xmark кнопкой в banner
    /// или автоматически createAccount() на следующем successful create).
    func clearCreateError() {
        self.createError = nil
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
