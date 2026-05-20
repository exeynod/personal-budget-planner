import XCTest

@testable import BudgetPlanner

/// Phase 62 Plan 03 — unit tests for `GoalDetailViewModel`.
///
/// Exercises the state machine, the `#if DEBUG` `_setStateForTesting`
/// backdoor and clear helper — no network calls.
///
/// Network paths (`load()` / `deleteGoal()`) call the concrete
/// `GoalsAPI` / `AccountsAPI` enums directly — there is no injectable API
/// seam to stub (same constraint documented in 62-REVIEW WR-06). So we
/// assert the state-machine + backdoor only; success/failure round-trips
/// are covered by the verifier's live-env smoke.
@MainActor
final class GoalDetailViewModelTests: XCTestCase {

    // MARK: - Initial state

    func test_initialState_idle() {
        let vm = GoalDetailViewModel(goalId: 1)
        XCTAssertEqual(vm.status, .idle)
        XCTAssertNil(vm.goal)
        XCTAssertEqual(vm.accounts.count, 0)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.mutationError)
        XCTAssertEqual(vm.goalId, 1)
    }

    // MARK: - Backdoor / ready render path

    func test_setStateForTesting_readyRendersGoal() {
        let vm = GoalDetailViewModel(goalId: 7)
        let goal = makeGoal(id: 7)
        vm._setStateForTesting(goal: goal, accounts: [makeAccount(id: 1)], status: .ready)
        XCTAssertEqual(vm.status, .ready)
        XCTAssertNotNil(vm.goal)
        XCTAssertEqual(vm.goal?.id, 7)
        XCTAssertEqual(vm.accounts.count, 1)
    }

    // MARK: - clearMutationError

    func test_clearMutationError() {
        let vm = GoalDetailViewModel(goalId: 1)
        vm.mutationError = "Не удалось удалить цель"
        XCTAssertNotNil(vm.mutationError)
        vm.clearMutationError()
        XCTAssertNil(vm.mutationError)
    }

    // MARK: - Status equatable

    func test_status_equatable() {
        XCTAssertEqual(GoalDetailViewModel.Status.ready, GoalDetailViewModel.Status.ready)
        XCTAssertEqual(
            GoalDetailViewModel.Status.error("a"), GoalDetailViewModel.Status.error("a"))
        XCTAssertNotEqual(
            GoalDetailViewModel.Status.error("a"), GoalDetailViewModel.Status.error("b"))
        XCTAssertNotEqual(GoalDetailViewModel.Status.idle, GoalDetailViewModel.Status.loading)
    }

    // MARK: - Fixtures

    private func makeGoal(id: Int) -> GoalDTO {
        GoalDTO(
            id: id,
            name: "Goal \(id)",
            targetCents: 100_000,
            currentCents: 25_000,
            due: nil,
            createdAt: Date(timeIntervalSince1970: 1000)
        )
    }

    private func makeAccount(id: Int) -> AccountDTO {
        AccountDTO(
            id: id,
            bank: "Т-Банк",
            mask: "1234",
            kind: .card,
            balanceCents: 500_000,
            primary: true,
            createdAt: Date(timeIntervalSince1970: 1000)
        )
    }
}
