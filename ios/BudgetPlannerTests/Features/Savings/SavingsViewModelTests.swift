import XCTest

@testable import BudgetPlanner

/// Phase 62 Plan 02 / Phase 67 Plan 07 — unit + behavioural tests for
/// `SavingsViewModel`.
///
/// State-machine / derived / sheet coverage runs through the `#if DEBUG`
/// `_setStateForTesting` backdoor. Money-mutation behaviour (deposit /
/// createGoal / deleteGoal / optimistic-revert / reloadPending) is exercised
/// via the injectable `SavingsViewModel.API` seam (P1-4 / R2) — mirror of the
/// `SubscriptionsViewModel` seam-test style. No real network.
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

    // MARK: - DEBUG backdoor

    func test_setStateForTesting_storesSnapshotAndAccounts() {
        let vm = SavingsViewModel()
        let acct = AccountDTO(
            id: 1, bank: "Test", mask: nil, kind: .cash, balanceCents: 1000, primary: true,
            createdAt: Date(timeIntervalSince1970: 0))
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

    // MARK: - P1-4 / R2: deposit behaviour via injectable seam

    func test_deposit_success_reloads_clearsSheet_returnsTrue() async {
        let spy = APISpy()
        spy.snapshot = makeSnapshot(total: 70000, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        let vm = SavingsViewModel(api: spy.makeAPI())
        vm.sheet = .deposit(goalId: 1)
        vm.mutationError = "stale"

        let ok = await vm.deposit(amountCents: 5000, accountId: 1, goalId: 1)

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.depositCalls, 1)
        XCTAssertEqual(spy.summaryCalls, 1, "успех депозита перезагружает (T-62-05)")
        XCTAssertEqual(vm.sheet, .none)
        XCTAssertNil(vm.mutationError)
        XCTAssertFalse(vm.submitting)
    }

    func test_deposit_success_reload_updatesHero() async {
        let spy = APISpy()
        spy.snapshot = makeSnapshot(total: 99999, monthIn: 4242, roundupEnabled: false, base: 50, goals: [])
        let vm = SavingsViewModel(api: spy.makeAPI())

        _ = await vm.deposit(amountCents: 5000, accountId: 1, goalId: nil)

        // reload pulled the spy snapshot → hero totals reflect new server state.
        XCTAssertEqual(vm.totalCents, 99999)
        XCTAssertEqual(vm.monthInCents, 4242)
    }

    func test_deposit_failure_setsFixedRuCopy_returnsFalse() async {
        let spy = APISpy()
        spy.depositShouldThrow = true
        let vm = SavingsViewModel(api: spy.makeAPI())

        let ok = await vm.deposit(amountCents: 5000, accountId: 1, goalId: 1)

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось пополнить")
        XCTAssertEqual(vm.sheet, .none)
        XCTAssertFalse(vm.submitting)
    }

    func test_deposit_invalidDraft_returnsFalse_noCall() async {
        let spy = APISpy()
        let vm = SavingsViewModel(api: spy.makeAPI())

        let ok = await vm.deposit(amountCents: 0, accountId: 1, goalId: 1)

        XCTAssertFalse(ok)
        XCTAssertEqual(spy.depositCalls, 0)
        XCTAssertFalse(vm.submitting)
    }

    func test_deposit_submittingGuard_blocksSecondCall() async {
        let spy = APISpy()
        spy.blockMutations = true
        let vm = SavingsViewModel(api: spy.makeAPI())

        let first = Task { await vm.deposit(amountCents: 5000, accountId: 1, goalId: 1) }
        while spy.depositCalls == 0 { await Task.yield() }

        let second = await vm.deposit(amountCents: 5000, accountId: 1, goalId: 1)
        XCTAssertFalse(second, "submitting-guard блокирует реентрант (T-67-07-01)")
        XCTAssertEqual(spy.depositCalls, 1, "второй network-вызов не пущен")

        spy.releaseGate()
        _ = await first.value
        XCTAssertFalse(vm.submitting)
    }

    // MARK: - P1-4: createGoal behaviour

    func test_createGoal_success_reloads_clearsSheet_returnsTrue() async {
        let spy = APISpy()
        spy.snapshot = makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        let vm = SavingsViewModel(api: spy.makeAPI())
        vm.sheet = .newGoal

        let ok = await vm.createGoal(name: "Машина", targetCents: 500_000, due: nil)

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.createCalls, 1)
        XCTAssertEqual(spy.summaryCalls, 1)
        XCTAssertEqual(vm.sheet, .none)
        XCTAssertNil(vm.mutationError)
    }

    func test_createGoal_invalidDraft_returnsFalse_noCall() async {
        let spy = APISpy()
        let vm = SavingsViewModel(api: spy.makeAPI())

        let ok = await vm.createGoal(name: "", targetCents: 0, due: nil)

        XCTAssertFalse(ok)
        XCTAssertEqual(spy.createCalls, 0)
        XCTAssertFalse(vm.submitting)
    }

    func test_createGoal_failure_setsFixedRuCopy_returnsFalse() async {
        let spy = APISpy()
        spy.createShouldThrow = true
        let vm = SavingsViewModel(api: spy.makeAPI())

        let ok = await vm.createGoal(name: "Машина", targetCents: 500_000, due: nil)

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось создать цель")
        XCTAssertEqual(vm.sheet, .none)
    }

    // MARK: - P1-4: deleteGoal behaviour

    func test_deleteGoal_success_reloads_clearsError() async {
        let spy = APISpy()
        spy.snapshot = makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        let vm = SavingsViewModel(api: spy.makeAPI())
        vm.mutationError = "stale"

        await vm.deleteGoal(id: 7)

        XCTAssertEqual(spy.deleteCalls, 1)
        XCTAssertEqual(spy.summaryCalls, 1)
        XCTAssertNil(vm.mutationError)
    }

    func test_deleteGoal_failure_setsFixedRuCopy() async {
        let spy = APISpy()
        spy.deleteShouldThrow = true
        let vm = SavingsViewModel(api: spy.makeAPI())

        await vm.deleteGoal(id: 7)

        XCTAssertEqual(vm.mutationError, "Не удалось удалить цель")
    }

    // MARK: - P1-4: optimistic-revert calls reload on failure

    func test_toggleRoundup_failure_revertsViaReload() async {
        let spy = APISpy()
        spy.patchEnabledShouldThrow = true
        spy.snapshot = makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        let vm = SavingsViewModel(api: spy.makeAPI())
        vm._setStateForTesting(
            snapshot: makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: []))

        await vm.toggleRoundup(true)

        XCTAssertEqual(vm.mutationError, "Не удалось обновить округление")
        XCTAssertEqual(spy.summaryCalls, 1, "optimistic-revert перезагружает (T-62-05)")
    }

    func test_selectBase_failure_revertsViaReload() async {
        let spy = APISpy()
        spy.patchBaseShouldThrow = true
        spy.snapshot = makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        let vm = SavingsViewModel(api: spy.makeAPI())
        vm._setStateForTesting(
            snapshot: makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: []))

        await vm.selectBase(100)

        XCTAssertEqual(vm.mutationError, "Не удалось обновить округление")
        XCTAssertEqual(spy.summaryCalls, 1)
    }

    // MARK: - WR-01: reloadPending coalesces a load() requested mid-flight

    func test_load_coalescesPendingReload_whenInFlight() async {
        let spy = APISpy()
        spy.snapshot = makeSnapshot(total: 0, monthIn: 0, roundupEnabled: false, base: 50, goals: [])
        spy.blockSummary = true
        let vm = SavingsViewModel(api: spy.makeAPI())

        let first = Task { await vm.load() }
        while spy.summaryCalls == 0 { await Task.yield() }

        // load #2 while #1 in flight → запоминается, не теряется.
        await vm.load()
        XCTAssertEqual(spy.summaryCalls, 1, "второй load skip-нут, но запомнен")

        spy.releaseSummaryGate()
        await first.value

        while spy.summaryCalls < 2 || vm.status != .ready { await Task.yield() }
        XCTAssertEqual(spy.summaryCalls, 2, "pending reload перевызван, не потерян")
        XCTAssertEqual(vm.status, .ready)
    }

    // MARK: - Seam spy

    private struct StubError: Error {}

    private final class APISpy: @unchecked Sendable {
        var snapshot = SavingsSummaryDTO(
            totalCents: 0, monthInCents: 0,
            config: SavingsConfigDTO(roundupEnabled: false, roundupBase: 50), goals: [])
        var accounts: [AccountDTO] = []

        var summaryCalls = 0
        var depositCalls = 0
        var createCalls = 0
        var deleteCalls = 0

        var depositShouldThrow = false
        var createShouldThrow = false
        var deleteShouldThrow = false
        var patchEnabledShouldThrow = false
        var patchBaseShouldThrow = false

        var blockMutations = false
        private var gate: CheckedContinuation<Void, Never>?

        var blockSummary = false
        private var summaryGate: CheckedContinuation<Void, Never>?

        func makeAPI() -> SavingsViewModel.API {
            SavingsViewModel.API(
                summary: {
                    self.summaryCalls += 1
                    await self.blockSummaryIfNeeded()
                    return self.snapshot
                },
                accountsList: { self.accounts },
                patchRoundupEnabled: { enabled in
                    if self.patchEnabledShouldThrow { throw StubError() }
                    return SavingsConfigDTO(roundupEnabled: enabled, roundupBase: 50)
                },
                patchRoundupBase: { base in
                    if self.patchBaseShouldThrow { throw StubError() }
                    return SavingsConfigDTO(roundupEnabled: false, roundupBase: base)
                },
                postDeposit: { _, _, _ in
                    self.depositCalls += 1
                    await self.blockIfNeeded()
                    if self.depositShouldThrow { throw StubError() }
                },
                goalsCreate: { req in
                    self.createCalls += 1
                    if self.createShouldThrow { throw StubError() }
                    return GoalDTO(
                        id: 999, name: req.name, targetCents: req.targetCents,
                        currentCents: 0, due: req.due, createdAt: Date(timeIntervalSince1970: 0))
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

        private func blockSummaryIfNeeded() async {
            guard blockSummary else { return }
            blockSummary = false
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                self.summaryGate = c
            }
        }

        func releaseGate() {
            gate?.resume()
            gate = nil
        }

        func releaseSummaryGate() {
            summaryGate?.resume()
            summaryGate = nil
        }
    }

    // MARK: - Fixtures

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
