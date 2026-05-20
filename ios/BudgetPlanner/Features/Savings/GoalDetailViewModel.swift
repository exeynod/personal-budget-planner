import Foundation
import Observation

/// Phase 62 — GoalDetailViewModel для v06 GoalDetailView.
///
/// Stub (Plan 62-01). Полная реализация load() / delete() / accounts
/// fetch — Plan 62-03.
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

    // MARK: - Load (filled in 62-03)
    func load() async {
        // Plan 62-03 fills this body.
    }

    // MARK: - Mutations (filled in 62-03)
    func deleteGoal() async -> Bool {
        // Plan 62-03 fills. Returns true on success (caller dismisses).
        return false
    }

    // MARK: - Helpers
    func clearMutationError() {
        self.mutationError = nil
    }
}
