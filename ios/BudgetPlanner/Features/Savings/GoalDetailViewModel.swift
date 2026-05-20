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

    let goalId: Int

    private(set) var status: Status = .idle
    private(set) var goal: GoalDTO?
    private(set) var accounts: [AccountDTO] = []
    private(set) var submitting: Bool = false

    /// Filtered Russian copy на delete failure (T-62-03).
    var mutationError: String? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    init(goalId: Int) {
        self.goalId = goalId
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
            async let goalsTask = GoalsAPI.list()
            async let accsTask = AccountsAPI.list()
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
    func deleteGoal() async -> Bool {
        // T-62-04: submitting guard prevents double-delete.
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await GoalsAPI.delete(id: goalId)
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
