import Foundation
import Observation

/// Phase 62 — SavingsViewModel для v06 SavingsView (master).
///
/// Plan 62-02 реализация:
///   - load(): async let parallel fetch SavingsAPI.summary + AccountsAPI.list
///   - toggleRoundup / selectBase: optimistic snapshot rebuild + PATCH;
///     failure → load() reload
///   - createGoal: submitting guard → validate → POST → load → lastCreatedGoalId
///   - deleteGoal: submitting guard → DELETE → load
///   - deposit: submitting guard → validate → POST → load
///
/// Threat-model:
///   - T-62-03 (Information Disclosure): catch блоки → filtered Russian
///     copy («Не удалось ...»); raw Swift error → ТОЛЬКО print() в Xcode.
///   - T-62-04 (Concurrency): submitting flag guard на mutation paths.
///   - T-62-05 (Stale-state): full reload после mutation успеха.
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

    /// Set by createGoal() on success — может triggerить scroll/highlight
    /// в SavingsView. Cleared after consumption.
    var lastCreatedGoalId: Int? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    // MARK: - Load

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        do {
            async let snapTask = SavingsAPI.summary()
            async let accsTask = AccountsAPI.list()
            let (snap, accs) = try await (snapTask, accsTask)
            self.snapshot = snap
            self.accounts = accs
            status = .ready
        } catch {
            print("[SavingsViewModel] load failed: \(error)")
            status = .error("Не удалось загрузить копилку")
        }
    }

    // MARK: - Mutations

    /// Optimistic toggle. На failure → reload (T-62-05).
    func toggleRoundup(_ enabled: Bool) async {
        guard let snap = snapshot else { return }
        snapshot = SavingsSummaryDTO(
            totalCents: snap.totalCents,
            monthInCents: snap.monthInCents,
            config: SavingsConfigDTO(roundupEnabled: enabled, roundupBase: snap.config.roundupBase),
            goals: snap.goals
        )
        do {
            let cfg = try await SavingsAPI.patchConfig(roundupEnabled: enabled)
            if let s = snapshot {
                snapshot = SavingsSummaryDTO(
                    totalCents: s.totalCents, monthInCents: s.monthInCents, config: cfg,
                    goals: s.goals)
            }
        } catch {
            print("[SavingsViewModel] toggleRoundup failed: \(error)")
            mutationError = "Не удалось обновить округление"
            await load()
        }
    }

    /// Optimistic base selection. UI ограничивает {10,50,100} (CONTEXT T-62-01).
    func selectBase(_ base: Int) async {
        guard let snap = snapshot else { return }
        snapshot = SavingsSummaryDTO(
            totalCents: snap.totalCents,
            monthInCents: snap.monthInCents,
            config: SavingsConfigDTO(roundupEnabled: snap.config.roundupEnabled, roundupBase: base),
            goals: snap.goals
        )
        do {
            let cfg = try await SavingsAPI.patchConfig(roundupBase: base)
            if let s = snapshot {
                snapshot = SavingsSummaryDTO(
                    totalCents: s.totalCents, monthInCents: s.monthInCents, config: cfg,
                    goals: s.goals)
            }
        } catch {
            print("[SavingsViewModel] selectBase failed: \(error)")
            mutationError = "Не удалось обновить округление"
            await load()
        }
    }

    /// Create new goal. Submitting guard (T-62-04) + validate + POST + reload (T-62-05).
    @discardableResult
    func createGoal(name: String, targetCents: Int, due: Date?) async -> Bool {
        guard !submitting else { return false }
        guard SavingsViewData.isValidGoalDraft(name: name, targetCents: targetCents) else {
            return false
        }
        submitting = true
        defer { submitting = false }
        do {
            let created = try await GoalsAPI.create(
                GoalCreateRequest(
                    name: name.trimmingCharacters(in: .whitespaces), targetCents: targetCents,
                    due: due)
            )
            mutationError = nil
            await load()
            lastCreatedGoalId = created.id
            sheet = .none
            return true
        } catch {
            print("[SavingsViewModel] createGoal failed: \(error)")
            mutationError = "Не удалось создать цель"
            sheet = .none
            return false
        }
    }

    /// Delete goal. Submitting guard + DELETE + reload.
    func deleteGoal(id: Int) async {
        guard !submitting else { return }
        submitting = true
        defer { submitting = false }
        do {
            try await GoalsAPI.delete(id: id)
            mutationError = nil
            await load()
        } catch {
            print("[SavingsViewModel] deleteGoal failed: \(error)")
            mutationError = "Не удалось удалить цель"
        }
    }

    /// Deposit. Submitting guard + validate + POST + reload.
    @discardableResult
    func deposit(amountCents: Int, accountId: Int, goalId: Int?) async -> Bool {
        guard !submitting else { return false }
        guard SavingsViewData.isValidDepositDraft(amountCents: amountCents, accountId: accountId)
        else { return false }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await SavingsAPI.postDeposit(
                amountCents: amountCents, accountId: accountId, goalId: goalId)
            mutationError = nil
            await load()
            sheet = .none
            return true
        } catch {
            print("[SavingsViewModel] deposit failed: \(error)")
            mutationError = "Не удалось пополнить"
            sheet = .none
            return false
        }
    }

    // MARK: - Helpers

    func clearMutationError() { self.mutationError = nil }
    func clearLastCreatedGoalId() { self.lastCreatedGoalId = nil }

    // MARK: - Derived

    var totalCents: Int { snapshot?.totalCents ?? 0 }
    var monthInCents: Int { snapshot?.monthInCents ?? 0 }
    var goals: [GoalDTO] { snapshot?.goals ?? [] }
    var roundupEnabled: Bool { snapshot?.config.roundupEnabled ?? false }
    var roundupBase: Int { snapshot?.config.roundupBase ?? 50 }

    // MARK: - DEBUG backdoor

    #if DEBUG
    func _setStateForTesting(
        snapshot: SavingsSummaryDTO? = nil,
        accounts: [AccountDTO] = [],
        status: Status = .ready
    ) {
        self.snapshot = snapshot
        self.accounts = accounts
        self.status = status
    }
    #endif
}
