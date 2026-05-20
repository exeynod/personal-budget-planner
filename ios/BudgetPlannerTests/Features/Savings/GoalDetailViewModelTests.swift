import XCTest

@testable import BudgetPlanner

/// Phase 62 Plan 03 / Phase 67 Plan 07 — unit + behavioural tests for
/// `GoalDetailViewModel`.
///
/// State-machine + backdoor coverage as before. Money-mutation behaviour
/// (deposit / deleteGoal) and the load cross-tenant guard now run through the
/// injectable `GoalDetailViewModel.API` seam (P1-4 / R2) — no real network.
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

    // MARK: - deposit validation guard (IN-03 / CR-01)

    func test_deposit_invalidDraft_returnsFalse_noSubmittingSideEffect() async {
        let spy = APISpy()
        let vm = GoalDetailViewModel(goalId: 1, api: spy.makeAPI())
        let ok = await vm.deposit(amountCents: 0, accountId: 1, goalId: 1)
        XCTAssertFalse(ok)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.mutationError)
        XCTAssertEqual(spy.depositCalls, 0)
    }

    func test_deposit_zeroAccount_returnsFalse() async {
        let spy = APISpy()
        let vm = GoalDetailViewModel(goalId: 1, api: spy.makeAPI())
        let ok = await vm.deposit(amountCents: 5000, accountId: 0, goalId: 1)
        XCTAssertFalse(ok)
        XCTAssertFalse(vm.submitting)
        XCTAssertEqual(spy.depositCalls, 0)
    }

    // MARK: - P1-4: deposit behaviour via seam

    func test_deposit_success_reloads_updatesHero_returnsTrue() async {
        let spy = APISpy()
        // post-deposit reload sees a goal with grown currentCents (hero refresh).
        spy.goals = [makeGoal(id: 7, currentCents: 80_000)]
        spy.accounts = [makeAccount(id: 1)]
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())
        vm.mutationError = "stale"

        let ok = await vm.deposit(amountCents: 5000, accountId: 1, goalId: 7)

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.depositCalls, 1)
        XCTAssertEqual(spy.listCalls, 1, "успех депозита перезагружает (T-62-05)")
        XCTAssertNil(vm.mutationError)
        XCTAssertEqual(vm.goal?.currentCents, 80_000, "reload освежил hero")
        XCTAssertFalse(vm.submitting)
    }

    func test_deposit_failure_setsFixedRuCopy_returnsFalse() async {
        let spy = APISpy()
        spy.depositShouldThrow = true
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        let ok = await vm.deposit(amountCents: 5000, accountId: 1, goalId: 7)

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось пополнить")
        XCTAssertFalse(vm.submitting)
    }

    func test_deposit_submittingGuard_blocksSecondCall() async {
        let spy = APISpy()
        spy.blockMutations = true
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        let first = Task { await vm.deposit(amountCents: 5000, accountId: 1, goalId: 7) }
        while spy.depositCalls == 0 { await Task.yield() }

        let second = await vm.deposit(amountCents: 5000, accountId: 1, goalId: 7)
        XCTAssertFalse(second, "submitting-guard блокирует реентрант (T-67-07-01)")
        XCTAssertEqual(spy.depositCalls, 1)

        spy.releaseGate()
        _ = await first.value
        XCTAssertFalse(vm.submitting)
    }

    // MARK: - P1-4: deleteGoal behaviour via seam

    func test_deleteGoal_success_returnsTrue() async {
        let spy = APISpy()
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        let ok = await vm.deleteGoal()

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.deleteCalls, 1)
        XCTAssertNil(vm.mutationError)
    }

    func test_deleteGoal_failure_setsFixedRuCopy_returnsFalse() async {
        let spy = APISpy()
        spy.deleteShouldThrow = true
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        let ok = await vm.deleteGoal()

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось удалить цель")
    }

    // MARK: - P1-4: load cross-tenant / missing id → "Цель не найдена"

    func test_load_goalNotFound_setsErrorCopy() async {
        let spy = APISpy()
        // list returns a different goal id → filter miss (cross-tenant / missing).
        spy.goals = [makeGoal(id: 99)]
        spy.accounts = [makeAccount(id: 1)]
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        await vm.load()

        XCTAssertEqual(vm.status, .error("Цель не найдена"))
        XCTAssertNil(vm.goal)
    }

    func test_load_found_setsReady() async {
        let spy = APISpy()
        spy.goals = [makeGoal(id: 7)]
        spy.accounts = [makeAccount(id: 1)]
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        await vm.load()

        XCTAssertEqual(vm.status, .ready)
        XCTAssertEqual(vm.goal?.id, 7)
        XCTAssertEqual(vm.accounts.count, 1)
    }

    func test_load_throws_setsLoadErrorCopy() async {
        let spy = APISpy()
        spy.listShouldThrow = true
        let vm = GoalDetailViewModel(goalId: 7, api: spy.makeAPI())

        await vm.load()

        XCTAssertEqual(vm.status, .error("Не удалось загрузить цель"))
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

    // MARK: - Seam spy

    private struct StubError: Error {}

    private final class APISpy: @unchecked Sendable {
        var goals: [GoalDTO] = []
        var accounts: [AccountDTO] = []

        var listCalls = 0
        var depositCalls = 0
        var deleteCalls = 0

        var listShouldThrow = false
        var depositShouldThrow = false
        var deleteShouldThrow = false

        var blockMutations = false
        private var gate: CheckedContinuation<Void, Never>?

        func makeAPI() -> GoalDetailViewModel.API {
            GoalDetailViewModel.API(
                goalsList: {
                    self.listCalls += 1
                    if self.listShouldThrow { throw StubError() }
                    return self.goals
                },
                accountsList: { self.accounts },
                postDeposit: { _, _, _ in
                    self.depositCalls += 1
                    await self.blockIfNeeded()
                    if self.depositShouldThrow { throw StubError() }
                },
                goalsDelete: { _ in
                    self.deleteCalls += 1
                    if self.deleteShouldThrow { throw StubError() }
                }
            )
        }

        private func blockIfNeeded() async {
            guard blockMutations else { return }
            blockMutations = false
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                self.gate = c
            }
        }

        func releaseGate() {
            gate?.resume()
            gate = nil
        }
    }

    // MARK: - Fixtures

    private func makeGoal(id: Int, currentCents: Int = 25_000) -> GoalDTO {
        GoalDTO(
            id: id,
            name: "Goal \(id)",
            targetCents: 100_000,
            currentCents: currentCents,
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
