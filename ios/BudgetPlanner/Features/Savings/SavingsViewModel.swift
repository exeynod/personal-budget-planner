import Foundation
import Observation

/// Phase 62 — SavingsViewModel для v06 SavingsView (master).
///
/// Plan 62-02 реализация:
///   - load(): async let parallel fetch SavingsAPI.summary + AccountsAPI.list
///   - toggleRoundup / selectBase: optimistic snapshot rebuild + PATCH;
///     failure → load() reload
///   - createGoal: submitting guard → validate → POST → load
///   - deleteGoal: submitting guard → DELETE → load
///   - deposit: submitting guard → validate → POST → load
///
/// Phase 67 Plan 07 (P1-4 / R2) — инъецируемый `API` struct-seam (эталон
/// `SubscriptionsViewModel.API`, default `.live`) + `reloadPending`-коалесинг
/// в load() (WR-01: reload после депозита не теряется при активном
/// pull-to-refresh). Мёртвый `lastCreatedGoalId`/`clearLastCreatedGoalId()`
/// (deferred из 67-05, без view-консьюмера) удалён.
///
/// Threat-model:
///   - T-62-03 (Information Disclosure): catch блоки → filtered Russian
///     copy («Не удалось ...»); raw Swift error → ТОЛЬКО print() в Xcode.
///   - T-62-04 (Concurrency): submitting flag guard на mutation paths.
///   - T-62-05 (Stale-state): full reload после mutation успеха.
///   - T-67-07-01 (Tampering / reentry): submitting-guard покрыт seam-тестами.
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

    /// Инъецируемый network-seam (P1-4 / R2 / WR-04). По умолчанию проксирует
    /// `SavingsAPI`/`AccountsAPI`/`GoalsAPI` static-методы — прод-поведение не
    /// меняется. Тесты подменяют closures на стабы, чтобы проверять
    /// submitting-guard / mutationError / reload-on-success / optimistic-revert
    /// без сети (эталон `SubscriptionsViewModel.API`).
    struct API {
        var summary: () async throws -> SavingsSummaryDTO
        var accountsList: () async throws -> [AccountDTO]
        var patchRoundupEnabled: (Bool) async throws -> SavingsConfigDTO
        var patchRoundupBase: (Int) async throws -> SavingsConfigDTO
        var postDeposit: (_ amountCents: Int, _ accountId: Int, _ goalId: Int?) async throws -> Void
        var goalsCreate: (GoalCreateRequest) async throws -> GoalDTO
        var goalsDelete: (Int) async throws -> Void

        static let live = API(
            summary: { try await SavingsAPI.summary() },
            accountsList: { try await AccountsAPI.list() },
            patchRoundupEnabled: { try await SavingsAPI.patchConfig(roundupEnabled: $0) },
            patchRoundupBase: { try await SavingsAPI.patchConfig(roundupBase: $0) },
            postDeposit: { amount, account, goal in
                _ = try await SavingsAPI.postDeposit(
                    amountCents: amount, accountId: account, goalId: goal)
            },
            goalsCreate: { try await GoalsAPI.create($0) },
            goalsDelete: { try await GoalsAPI.delete(id: $0) }
        )
    }

    @ObservationIgnored
    private let api: API

    init(api: API = .live) {
        self.api = api
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

    @ObservationIgnored
    private var inFlight: Bool = false

    /// WR-01: если mutation вызывает load() пока другой load() уже в полёте
    /// (например .refreshable / .task), reload не должен молча теряться.
    /// Флаг ставится при skip и перевызывает load() в defer текущего load().
    @ObservationIgnored
    private var reloadPending: Bool = false

    // MARK: - Load

    func load() async {
        if inFlight {
            reloadPending = true
            return
        }
        inFlight = true
        defer {
            inFlight = false
            if reloadPending {
                reloadPending = false
                Task { await load() }
            }
        }

        status = .loading
        do {
            async let snapTask = api.summary()
            async let accsTask = api.accountsList()
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
            let cfg = try await api.patchRoundupEnabled(enabled)
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
            let cfg = try await api.patchRoundupBase(base)
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
            _ = try await api.goalsCreate(
                GoalCreateRequest(
                    name: name.trimmingCharacters(in: .whitespaces), targetCents: targetCents,
                    due: due)
            )
            mutationError = nil
            await load()
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
            try await api.goalsDelete(id)
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
            try await api.postDeposit(amountCents, accountId, goalId)
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
