import XCTest

@testable import BudgetPlanner

/// Phase 62 Plan 02 — unit tests for `SavingsViewModel`.
///
/// Exercises the state machine, derived getters, sheet toggling and the
/// clear helpers via the `#if DEBUG` `_setStateForTesting` backdoor — no
/// network calls (mutation-path integration smoke lands in 62-04).
@MainActor
final class SavingsViewModelTests: XCTestCase {

    // MARK: - Initial state

    func test_initialState_idleEmpty() {
        let vm = SavingsViewModel()
        XCTAssertEqual(vm.status, .idle)
        XCTAssertNil(vm.snapshot)
        XCTAssertEqual(vm.accounts.count, 0)
        XCTAssertEqual(vm.sheet, .none)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.mutationError)
        XCTAssertNil(vm.lastCreatedGoalId)
    }

    // MARK: - Derived getters

    func test_derivedGetters_nilSnapshot_returnDefaults() {
        let vm = SavingsViewModel()
        XCTAssertEqual(vm.totalCents, 0)
        XCTAssertEqual(vm.monthInCents, 0)
        XCTAssertEqual(vm.goals.count, 0)
        XCTAssertFalse(vm.roundupEnabled)
        XCTAssertEqual(vm.roundupBase, 50)
    }

    func test_derivedGetters_withSnapshot_returnsValues() {
        let vm = SavingsViewModel()
        let snap = makeSnapshot(
            total: 50000, monthIn: 12000, roundupEnabled: true, base: 100,
            goals: [makeGoal(id: 1)])
        vm._setStateForTesting(snapshot: snap, accounts: [])
        XCTAssertEqual(vm.totalCents, 50000)
        XCTAssertEqual(vm.monthInCents, 12000)
        XCTAssertEqual(vm.goals.count, 1)
        XCTAssertTrue(vm.roundupEnabled)
        XCTAssertEqual(vm.roundupBase, 100)
    }

    // MARK: - Status equatable

    func test_status_equatable_distinguishesErrorMessages() {
        XCTAssertEqual(SavingsViewModel.Status.error("A"), SavingsViewModel.Status.error("A"))
        XCTAssertNotEqual(SavingsViewModel.Status.error("A"), SavingsViewModel.Status.error("B"))
        XCTAssertNotEqual(SavingsViewModel.Status.idle, SavingsViewModel.Status.loading)
    }

    // MARK: - SheetMode equatable + toggling

    func test_sheetMode_toggling() {
        let vm = SavingsViewModel()
        XCTAssertEqual(vm.sheet, .none)
        vm.sheet = .newGoal
        XCTAssertEqual(vm.sheet, .newGoal)
        vm.sheet = .deposit(goalId: nil)
        XCTAssertEqual(vm.sheet, .deposit(goalId: nil))
        vm.sheet = .deposit(goalId: 42)
        XCTAssertEqual(vm.sheet, .deposit(goalId: 42))
        XCTAssertNotEqual(
            SavingsViewModel.SheetMode.deposit(goalId: nil),
            SavingsViewModel.SheetMode.deposit(goalId: 42))
        vm.sheet = .none
        XCTAssertEqual(vm.sheet, .none)
    }

    // MARK: - Clear helpers

    func test_clearMutationError_setsNil() {
        let vm = SavingsViewModel()
        vm.mutationError = "Не удалось создать цель"
        XCTAssertNotNil(vm.mutationError)
        vm.clearMutationError()
        XCTAssertNil(vm.mutationError)
    }

    func test_clearLastCreatedGoalId_setsNil() {
        let vm = SavingsViewModel()
        vm.lastCreatedGoalId = 42
        XCTAssertNotNil(vm.lastCreatedGoalId)
        vm.clearLastCreatedGoalId()
        XCTAssertNil(vm.lastCreatedGoalId)
    }

    // MARK: - DEBUG backdoor

    func test_setStateForTesting_storesSnapshotAndAccounts() {
        let vm = SavingsViewModel()
        let acct = AccountDTO(
            id: 1, bank: "Test", mask: nil, kind: .cash, balanceCents: 1000, primary: true,
            createdAt: nil)
        let snap = makeSnapshot(total: 100, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        vm._setStateForTesting(snapshot: snap, accounts: [acct])
        XCTAssertEqual(vm.snapshot, snap)
        XCTAssertEqual(vm.accounts.count, 1)
        XCTAssertEqual(vm.accounts.first?.id, 1)
    }

    func test_setStateForTesting_canSetStatus() {
        let vm = SavingsViewModel()
        vm._setStateForTesting(status: .ready)
        XCTAssertEqual(vm.status, .ready)
    }

    // MARK: - Submitting flag (T-62-04 surface verification)

    func test_submitting_initialFalse() {
        let vm = SavingsViewModel()
        XCTAssertFalse(vm.submitting)
    }

    // MARK: - Goals derived from snapshot (T-62-05 surface)

    func test_goals_readsFromSnapshot() {
        let vm = SavingsViewModel()
        let snap = makeSnapshot(
            total: 0, monthIn: 0, roundupEnabled: false, base: 50,
            goals: [makeGoal(id: 1, name: "Goal-1"), makeGoal(id: 2, name: "Goal-2")])
        vm._setStateForTesting(snapshot: snap, accounts: [])
        XCTAssertEqual(vm.goals.count, 2)
        XCTAssertEqual(vm.goals.map(\.id), [1, 2])
    }

    // MARK: - Helpers

    private func makeSnapshot(
        total: Int, monthIn: Int, roundupEnabled: Bool, base: Int, goals: [GoalDTO]
    ) -> SavingsSummaryDTO {
        SavingsSummaryDTO(
            totalCents: total,
            monthInCents: monthIn,
            config: SavingsConfigDTO(roundupEnabled: roundupEnabled, roundupBase: base),
            goals: goals
        )
    }

    private func makeGoal(id: Int, name: String = "Test", due: Date? = nil) -> GoalDTO {
        GoalDTO(
            id: id,
            name: name,
            targetCents: 100_000,
            currentCents: 0,
            due: due,
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }
}
