import Foundation
import Observation

/// Phase 62 — GoalDetailViewModel для v06 GoalDetailView.
///
/// Plan 62-03 реализация:
///   - load(): inFlight re-entrancy guard + `async let` parallel
///     GoalsAPI.list() + AccountsAPI.list(); нет GET /goals/{id} →
///     list + filter by goalId (mirror AccountDetailViewModel pattern);
///   - deleteGoal(): submitting guard + GoalsAPI.delete; returns true
///     на success (caller dismisses), false + mutationError на failure.
///
/// Phase 67 Plan 07 (P1-4 / R2) — инъецируемый `API` struct-seam (эталон
/// `SubscriptionsViewModel.API`, default `.live`) → deposit/load/deleteGoal
/// тестируемы поведенчески без сети.
///
/// T-62-03 (Information Disclosure) — mitigation:
///   - cross-tenant / missing id collapses в одно сообщение «Цель
///     не найдена» (single message без existence leak);
///   - outer catch выдаёт фиксированный Russian copy «Не удалось
///     загрузить цель»; raw error → print().
@MainActor
@Observable
final class GoalDetailViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    /// Инъецируемый network-seam (P1-4 / R2). По умолчанию проксирует
    /// `GoalsAPI`/`AccountsAPI`/`SavingsAPI` static-методы — прод-поведение
    /// не меняется; тесты подменяют closures на стабы.
    struct API {
        var goalsList: () async throws -> [GoalDTO]
        var accountsList: () async throws -> [AccountDTO]
        var postDeposit: (_ amountCents: Int, _ accountId: Int, _ goalId: Int?) async throws -> Void
        var goalsDelete: (Int) async throws -> Void

        static let live = API(
            goalsList: { try await GoalsAPI.list() },
            accountsList: { try await AccountsAPI.list() },
            postDeposit: { amount, account, goal in
                _ = try await SavingsAPI.postDeposit(
                    amountCents: amount, accountId: account, goalId: goal)
            },
            goalsDelete: { try await GoalsAPI.delete(id: $0) }
        )
    }

    let goalId: Int

    @ObservationIgnored
    private let api: API

    private(set) var status: Status = .idle
    private(set) var goal: GoalDTO?
    private(set) var accounts: [AccountDTO] = []
    private(set) var submitting: Bool = false

    /// Filtered Russian copy на delete failure (T-62-03).
    var mutationError: String? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    init(goalId: Int, api: API = .live) {
        self.goalId = goalId
        self.api = api
    }

    // MARK: - Load
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            // Параллельно: goals + accounts. Нет GET /goals/{id} —
            // list + клиентский filter by goalId (mirror AccountDetail).
            async let goalsTask = api.goalsList()
            async let accsTask = api.accountsList()
            let (goals, accs) = try await (goalsTask, accsTask)

            // T-62-03 / IN-01: cross-tenant / missing id → single message
            // без existence leak. Этот guard finally USES goalId (свойство
            // остаётся live).
            guard let g = goals.first(where: { $0.id == goalId }) else {
                status = .error("Цель не найдена")
                return
            }
            self.goal = g
            self.accounts = accs
            status = .ready
        } catch {
            // T-62-03: filtered Russian copy; raw error → print only.
            print("[GoalDetailViewModel] load failed: \(error)")
            status = .error("Не удалось загрузить цель")
        }
    }

    // MARK: - Mutations

    /// Deposit (T-62-04): submitting guard prevents double-submit of a
    /// money mutation; validate (T-62-01 / WR-05) → POST → reload
    /// (T-62-05) so hero/progress освежается. Failure → filtered Russian
    /// copy в mutationError (WR-01); raw error → print only (T-62-03).
    @discardableResult
    func deposit(amountCents: Int, accountId: Int, goalId: Int?) async -> Bool {
        guard !submitting else { return false }
        guard SavingsViewData.isValidDepositDraft(amountCents: amountCents, accountId: accountId)
        else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await api.postDeposit(amountCents, accountId, goalId)
            mutationError = nil
            await load()
            return true
        } catch {
            print("[GoalDetailViewModel] deposit failed: \(error)")
            mutationError = "Не удалось пополнить"
            return false
        }
    }

    func deleteGoal() async -> Bool {
        // T-62-04: submitting guard prevents double-delete.
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await api.goalsDelete(goalId)
            return true
        } catch {
            // T-62-03: filtered Russian copy; raw error → print only.
            print("[GoalDetailViewModel] deleteGoal failed: \(error)")
            mutationError = "Не удалось удалить цель"
            return false
        }
    }

    // MARK: - Helpers
    func clearMutationError() {
        self.mutationError = nil
    }

    // MARK: - DEBUG test backdoor

    #if DEBUG
    /// Backdoor для unit tests (обход `private(set)`). Mirror 60-04 /
    /// SavingsViewModel pattern — позволяет инжектить state без network.
    func _setStateForTesting(
        goal: GoalDTO? = nil,
        accounts: [AccountDTO] = [],
        status: Status = .ready
    ) {
        self.goal = goal
        self.accounts = accounts
        self.status = status
    }
    #endif
}
