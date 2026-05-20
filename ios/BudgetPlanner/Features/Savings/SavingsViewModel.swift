import Foundation
import Observation

/// Phase 62 — SavingsViewModel для v06 SavingsView (master list).
///
/// Stub (Plan 62-01). Полная реализация load() / toggleRoundup /
/// selectBase / createGoal / deleteGoal / deposit — Plan 62-02.
///
/// Pattern: parallel to V10 SavingsV10ViewModel (FeaturesV10), но v06
/// native shell — никакого poster-styling. Discriminated SheetMode для
/// dual-sheet state (new goal + deposit с optional pre-filled goalId).
@MainActor
@Observable
final class SavingsViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    /// Discriminated sheet state — устраняет multi-boolean
    /// inconsistency class of bug. `.deposit(goalId:)` carries optional
    /// pre-selected goal так goal-row tap может flow напрямую в
    /// pre-filled DepositSheet.
    enum SheetMode: Equatable {
        case none
        case newGoal
        case deposit(goalId: Int?)
    }

    // MARK: - State

    private(set) var status: Status = .idle
    private(set) var snapshot: SavingsSummaryDTO? = nil
    private(set) var accounts: [AccountDTO] = []

    var sheet: SheetMode = .none
    private(set) var submitting: Bool = false

    /// Filtered Russian copy на mutation failure (T-62-03 mitigation):
    /// «Не удалось создать цель», «Не удалось пополнить», «Не удалось
    /// удалить цель», «Не удалось обновить округление». UI читает в
    /// banner Section. Cleared автоматически на next successful mutation
    /// or manually через clearMutationError().
    var mutationError: String? = nil

    /// Set by createGoal() on success — triggers ScrollViewReader
    /// scrollTo в SavingsView. Cleared after consumption.
    var lastCreatedGoalId: Int? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    // MARK: - Load (filled in 62-02)
    func load() async {
        // Plan 62-02 fills this body.
    }

    // MARK: - Mutations (filled in 62-02)
    func toggleRoundup(_ enabled: Bool) async {
        // Plan 62-02 fills.
    }

    func selectBase(_ base: Int) async {
        // Plan 62-02 fills.
    }

    func createGoal(name: String, targetCents: Int, due: Date?) async -> Bool {
        // Plan 62-02 fills. Returns true on success.
        return false
    }

    func deleteGoal(id: Int) async {
        // Plan 62-02 fills.
    }

    func deposit(amountCents: Int, accountId: Int, goalId: Int?) async -> Bool {
        // Plan 62-02 fills. Returns true on success.
        return false
    }

    // MARK: - Helpers
    func clearMutationError() {
        self.mutationError = nil
    }

    func clearLastCreatedGoalId() {
        self.lastCreatedGoalId = nil
    }

    // MARK: - Derived
    var totalCents: Int { snapshot?.totalCents ?? 0 }
    var monthInCents: Int { snapshot?.monthInCents ?? 0 }
    var goals: [GoalDTO] { snapshot?.goals ?? [] }
    var roundupEnabled: Bool { snapshot?.config.roundupEnabled ?? false }
    var roundupBase: Int { snapshot?.config.roundupBase ?? 50 }
}
