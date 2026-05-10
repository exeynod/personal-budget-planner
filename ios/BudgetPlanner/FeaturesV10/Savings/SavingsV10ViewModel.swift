// Phase 27-08 Task 2: SavingsV10ViewModel — data loader + mutation glue
// for SavingsV10View (SAV-V10-01..04).
//
// Symmetric to web Plan 27-03 SavingsMount. Pattern reused from
// Plan 26-07 SubscriptionsV10ViewModel:
//   - @MainActor @Observable with Status state machine (idle/loading/ready/error).
//   - inFlight re-entrancy guard on load().
//   - silent-on-failure mutations (Phase 28 polish wires PosterToast).
//   - sheet state via discriminated SheetMode enum (mirrors web's
//     `{kind:'none'} | {kind:'newGoal'} | {kind:'deposit', goalId}` —
//     iOS uses an `Int?` carry on the .deposit case for the optional
//     pre-selected goal).
//
// Mutations (SAV-V10-02..04):
//   - toggleRoundup / selectBase  → optimistic snapshot mutation +
//                                   PATCH /savings/config; on failure
//                                   reload() to re-sync from server.
//                                   T-27-08-01 mitigation: UI Chip-row
//                                   only emits 10/50/100; backend
//                                   Pydantic Literal rejects others.
//   - createGoal                  → POST /goals; on success refetch.
//   - deposit                     → POST /savings/deposit; on success
//                                   refetch.
//
// All async paths catch and degrade silently (matching web's
// window.alert pattern that Plan 28 will upgrade to PosterToast).

import Foundation
import Observation

@MainActor
@Observable
final class SavingsV10ViewModel {

    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    /// Discriminated sheet state — eliminates the multi-boolean
    /// inconsistency class of bug. `.deposit(goalId:)` carries an
    /// optional pre-selected goal so a goal-card tap can flow directly
    /// into a pre-filled DepositSheet.
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
    private var inFlight: Bool = false

    // MARK: - Load

    /// Parallel-fetch snapshot + accounts. Re-entrant calls are no-ops.
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
            status = .error("Не удалось загрузить копилку")
        }
    }

    // MARK: - Mutations (SAV-V10-02..04)

    /// Optimistic toggle for roundup_enabled. PATCHes /savings/config
    /// with only `roundupEnabled` set; backend echoes the full config
    /// which we use to reconcile any drift. On failure, reload the
    /// whole snapshot to recover (T-27-08-* defence-in-depth).
    func toggleRoundup(_ enabled: Bool) async {
        guard let snap = snapshot else { return }
        // Optimistic local update — flip the flag; keep base unchanged.
        snapshot = SavingsSummaryDTO(
            totalCents: snap.totalCents,
            monthInCents: snap.monthInCents,
            config: SavingsConfigDTO(
                roundupEnabled: enabled,
                roundupBase: snap.config.roundupBase
            ),
            goals: snap.goals
        )
        do {
            let cfg = try await SavingsAPI.patchConfig(roundupEnabled: enabled)
            // Reflect server-canonical config (in case backend coerced).
            if let s = snapshot {
                snapshot = SavingsSummaryDTO(
                    totalCents: s.totalCents,
                    monthInCents: s.monthInCents,
                    config: cfg,
                    goals: s.goals
                )
            }
        } catch {
            await load()  // Re-sync from server.
        }
    }

    /// Optimistic base selection (10/50/100 ₽). Same pattern as toggle.
    /// T-27-08-01: only the UI Chip-row calls this; values constrained
    /// to {10, 50, 100} at the call site; backend Pydantic rejects
    /// any other value with 422 as a second layer.
    func selectBase(_ base: Int) async {
        guard let snap = snapshot else { return }
        snapshot = SavingsSummaryDTO(
            totalCents: snap.totalCents,
            monthInCents: snap.monthInCents,
            config: SavingsConfigDTO(
                roundupEnabled: snap.config.roundupEnabled,
                roundupBase: base
            ),
            goals: snap.goals
        )
        do {
            let cfg = try await SavingsAPI.patchConfig(roundupBase: base)
            if let s = snapshot {
                snapshot = SavingsSummaryDTO(
                    totalCents: s.totalCents,
                    monthInCents: s.monthInCents,
                    config: cfg,
                    goals: s.goals
                )
            }
        } catch {
            await load()
        }
    }

    /// POST /goals — create a new goal. Validates draft via
    /// SavingsData.isValidGoalDraft; on success closes the sheet and
    /// refetches so the new goal appears in the list.
    func createGoal(name: String, targetCents: Int, due: Date?) async {
        guard SavingsData.isValidGoalDraft(name: name, targetCents: targetCents) else { return }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await GoalsAPI.create(
                GoalCreateRequest(name: name, targetCents: targetCents, due: due)
            )
            sheet = .none
            await load()
        } catch {
            // Silent for v1.0 — Phase 28 polish wires PosterToast.
        }
    }

    /// POST /savings/deposit — record a deposit. Validates draft via
    /// SavingsData.isValidDepositDraft (account_id required per backend
    /// Field(gt=0)); on success closes the sheet and refetches.
    func deposit(amountCents: Int, accountId: Int, goalId: Int?) async {
        guard SavingsData.isValidDepositDraft(amountCents: amountCents, accountId: accountId)
        else { return }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await SavingsAPI.postDeposit(
                amountCents: amountCents,
                accountId: accountId,
                goalId: goalId
            )
            sheet = .none
            await load()
        } catch {
            // Silent for v1.0.
        }
    }
}
