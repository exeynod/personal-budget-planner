// Phase 63 Plan 02 — unit specs for `SubscriptionsViewModel`.
//
// Exercises the state machine, derived getters, status equatable and the
// clear helpers via the `#if DEBUG` `_setStateForTesting` backdoor — no
// network calls (sibling Savings pattern: VM has no injectable network seam,
// so coverage targets state/derived/validation rather than HTTP).
//
// Note (Plan 63-02): the pure-helper ViewData specs already live in
// `BudgetPlannerTests/Features/Management/SubscriptionsViewDataTests.swift`
// (18 tests, Phase 63-01). Swift forbids two source files sharing a basename
// in one target, so this plan adds the *ViewModel* suite under
// `Features/Subscriptions/` and leaves the existing ViewData suite in place
// (it already satisfies the ≥4 ViewData requirement). Combined ≥10 holds.

import XCTest

@testable import BudgetPlanner

@MainActor
final class SubscriptionsViewModelTests: XCTestCase {

    // MARK: - Fixtures

    private func makeSub(
        id: Int,
        name: String = "Netflix",
        amountCents: Int = 100_00,
        cycle: String = "monthly",
        nextChargeDate: String = "2026-05-15",
        isActive: Bool = true,
        dayOfMonth: Int? = nil,
        postedTxnId: Int? = nil
    ) -> SubscriptionV10DTO {
        var dict: [String: Any] = [
            "id": id,
            "name": name,
            "amount_cents": amountCents,
            "cycle": cycle,
            "next_charge_date": nextChargeDate,
            "category_id": 1,
            "notify_days_before": 0,
            "is_active": isActive,
        ]
        if let dom = dayOfMonth { dict["day_of_month"] = dom }
        if let ptid = postedTxnId { dict["posted_txn_id"] = ptid }
        let data = try! JSONSerialization.data(withJSONObject: dict)

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(SubscriptionV10DTO.self, from: data)
    }

    private func makeCategory(id: Int, name: String = "Подписки") -> CategoryDTO {
        let dict: [String: Any] = [
            "id": id,
            "name": name,
            "kind": "expense",
            "is_archived": false,
            "sort_order": 0,
        ]
        let data = try! JSONSerialization.data(withJSONObject: dict)
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(CategoryDTO.self, from: data)
    }

    private func makeAccount(id: Int, primary: Bool = false) -> AccountDTO {
        AccountDTO(
            id: id, bank: "Bank-\(id)", mask: "00\(id)", kind: .card,
            balanceCents: 0, primary: primary, createdAt: Date(timeIntervalSince1970: 0))
    }

    private struct StubError: Error {}

    /// Mutable counters + behaviour для injectable API-seam (WR-04).
    private final class APISpy: @unchecked Sendable {
        var subs: [SubscriptionV10DTO] = []
        var listCalls = 0
        var postCalls = 0
        var unpostCalls = 0
        var deleteCalls = 0
        var patchCalls = 0
        var rescheduleCalls = 0

        var postShouldThrow = false
        var unpostShouldThrow = false
        var deleteShouldThrow = false
        var patchShouldThrow = false
        var listShouldThrow = false

        /// Когда true — первая мутация подвешивается на continuation, удерживая
        /// `submitting == true`, чтобы тест мог проверить re-entrancy guard.
        var blockMutations = false
        private var gate: CheckedContinuation<Void, Never>?

        /// Когда true — первый listSubs подвешивается (load в полёте), чтобы
        /// тест мог проверить WR-01 coalesce пути reloadPending.
        var blockList = false
        private var listGate: CheckedContinuation<Void, Never>?

        func makeAPI(
            categories: [CategoryDTO] = [],
            accounts: [AccountDTO] = []
        ) -> SubscriptionsViewModel.API {
            SubscriptionsViewModel.API(
                listSubs: {
                    self.listCalls += 1
                    await self.blockListIfNeeded()
                    if self.listShouldThrow { throw StubError() }
                    return self.subs
                },
                listCategories: { categories },
                listAccounts: { accounts },
                reschedule: { _ in self.rescheduleCalls += 1 },
                post: { _ in
                    self.postCalls += 1
                    await self.blockIfNeeded()
                    if self.postShouldThrow { throw StubError() }
                },
                unpost: { _ in
                    self.unpostCalls += 1
                    await self.blockIfNeeded()
                    if self.unpostShouldThrow { throw StubError() }
                },
                delete: { _ in
                    self.deleteCalls += 1
                    await self.blockIfNeeded()
                    if self.deleteShouldThrow { throw StubError() }
                },
                patch: { _, _ in
                    self.patchCalls += 1
                    await self.blockIfNeeded()
                    if self.patchShouldThrow { throw StubError() }
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

        private func blockListIfNeeded() async {
            guard blockList else { return }
            blockList = false
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                self.listGate = c
            }
        }

        func releaseGate() {
            gate?.resume()
            gate = nil
        }

        func releaseListGate() {
            listGate?.resume()
            listGate = nil
        }
    }

    // MARK: - Initial state

    func test_initialState_idleEmpty() {
        let vm = SubscriptionsViewModel()
        XCTAssertEqual(vm.status, .idle)
        XCTAssertEqual(vm.subscriptions.count, 0)
        XCTAssertEqual(vm.categories.count, 0)
        XCTAssertEqual(vm.accounts.count, 0)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.mutationError)
    }

    // MARK: - Derived getters

    func test_derivedGetters_empty_returnDefaults() {
        let vm = SubscriptionsViewModel()
        XCTAssertEqual(vm.activeCount, 0)
        XCTAssertEqual(vm.monthlyLoadCents, 0)
    }

    func test_derivedGetters_withState() {
        let vm = SubscriptionsViewModel()
        let subs = [
            makeSub(id: 1, amountCents: 300_00, cycle: "monthly", isActive: true),
            makeSub(id: 2, amountCents: 900_00, cycle: "monthly", isActive: false),
        ]
        vm._setStateForTesting(subscriptions: subs)
        XCTAssertEqual(vm.activeCount, 1)
        // только активная monthly 300_00 учтена
        XCTAssertEqual(vm.monthlyLoadCents, 300_00)
    }

    // MARK: - Status equatable

    func test_status_equatable_distinguishesErrorMessages() {
        XCTAssertEqual(SubscriptionsViewModel.Status.error("A"), .error("A"))
        XCTAssertNotEqual(SubscriptionsViewModel.Status.error("A"), .error("B"))
        XCTAssertNotEqual(SubscriptionsViewModel.Status.idle, .loading)
        XCTAssertNotEqual(SubscriptionsViewModel.Status.ready, .idle)
    }

    // MARK: - Mutation error copy

    func test_clearMutationError_setsNil() {
        let vm = SubscriptionsViewModel()
        vm.mutationError = "Не удалось провести подписку"
        XCTAssertNotNil(vm.mutationError)
        vm.clearMutationError()
        XCTAssertNil(vm.mutationError)
    }

    // MARK: - Submitting guard surface (T-63-01)

    func test_submitting_initialFalse() {
        let vm = SubscriptionsViewModel()
        XCTAssertFalse(vm.submitting)
    }

    // MARK: - DEBUG backdoor

    func test_setStateForTesting_populatesAll() {
        let vm = SubscriptionsViewModel()
        vm._setStateForTesting(
            subscriptions: [makeSub(id: 1), makeSub(id: 2)],
            categories: [makeCategory(id: 1)],
            accounts: [makeAccount(id: 1, primary: true)],
            status: .ready
        )
        XCTAssertEqual(vm.subscriptions.count, 2)
        XCTAssertEqual(vm.categories.count, 1)
        XCTAssertEqual(vm.accounts.count, 1)
        XCTAssertEqual(vm.status, .ready)
        XCTAssertEqual(vm.accounts.first?.primary, true)
    }

    func test_setStateForTesting_canSetErrorStatus() {
        let vm = SubscriptionsViewModel()
        vm._setStateForTesting(status: .error("boom"))
        XCTAssertEqual(vm.status, .error("boom"))
    }

    // MARK: - Posted derived (badge surface, T-63 row badge)

    func test_postedState_reflectedInSubscriptions() {
        let vm = SubscriptionsViewModel()
        vm._setStateForTesting(subscriptions: [
            makeSub(id: 1, postedTxnId: nil),
            makeSub(id: 2, postedTxnId: 99),
        ])
        XCTAssertFalse(SubscriptionsViewData.isPosted(vm.subscriptions[0]))
        XCTAssertTrue(SubscriptionsViewData.isPosted(vm.subscriptions[1]))
    }

    // MARK: - WR-04: mutation behaviour via injectable seam

    func test_post_success_clearsErrorAndReloads() async {
        let spy = APISpy()
        spy.subs = [makeSub(id: 1, postedTxnId: 7)]
        let vm = SubscriptionsViewModel(api: spy.makeAPI())
        vm.mutationError = "stale"

        let ok = await vm.post(makeSub(id: 1))

        XCTAssertTrue(ok)
        XCTAssertNil(vm.mutationError)
        XCTAssertEqual(spy.postCalls, 1)
        XCTAssertEqual(spy.listCalls, 1, "успех мутации перезагружает (T-63-04)")
        XCTAssertFalse(vm.submitting)
    }

    func test_post_failure_setsFixedRuCopy_andReloads_WR06() async {
        let spy = APISpy()
        spy.postShouldThrow = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        let ok = await vm.post(makeSub(id: 1))

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось провести подписку")
        // WR-06: failure-путь тоже перезагружает, чтобы убрать stale badge.
        XCTAssertEqual(spy.listCalls, 1)
        XCTAssertFalse(vm.submitting)
    }

    func test_unpost_failure_setsFixedRuCopy_andReloads_WR06() async {
        let spy = APISpy()
        spy.unpostShouldThrow = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        let ok = await vm.unpost(makeSub(id: 1, postedTxnId: 9))

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось отменить проведение")
        XCTAssertEqual(spy.listCalls, 1)
    }

    func test_delete_success_clearsErrorAndReloads() async {
        let spy = APISpy()
        let vm = SubscriptionsViewModel(api: spy.makeAPI())
        vm.mutationError = "stale"

        await vm.delete(makeSub(id: 1))

        XCTAssertNil(vm.mutationError)
        XCTAssertEqual(spy.deleteCalls, 1)
        XCTAssertEqual(spy.listCalls, 1)
    }

    func test_delete_failure_setsFixedRuCopy() async {
        let spy = APISpy()
        spy.deleteShouldThrow = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        await vm.delete(makeSub(id: 1))

        XCTAssertEqual(vm.mutationError, "Не удалось удалить подписку")
    }

    func test_patchById_failure_setsFixedRuCopy_returnsFalse() async {
        let spy = APISpy()
        spy.patchShouldThrow = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        let ok = await vm.patchById(1, payload: SubscriptionV10UpdateRequest(dayOfMonth: 5))

        XCTAssertFalse(ok)
        XCTAssertEqual(vm.mutationError, "Не удалось сохранить подписку")
    }

    func test_patchById_success_returnsTrue_andReloads() async {
        let spy = APISpy()
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        let ok = await vm.patchById(1, payload: SubscriptionV10UpdateRequest(accountId: 3))

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.patchCalls, 1)
        XCTAssertEqual(spy.listCalls, 1)
    }

    // MARK: - WR-04: submitting guard (T-63-01) blocks re-entrant mutation

    func test_post_submittingGuard_blocksSecondCall() async {
        let spy = APISpy()
        spy.blockMutations = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        // Первый post подвисает внутри стаба (submitting == true).
        let first = Task { await vm.post(self.makeSub(id: 1)) }
        // Дать первому Task войти в стаб и установить submitting.
        while spy.postCalls == 0 { await Task.yield() }

        // Re-entrant post должен немедленно вернуть false без 2-го вызова сети.
        let second = await vm.post(makeSub(id: 1))
        XCTAssertFalse(second)
        XCTAssertEqual(spy.postCalls, 1, "guard не пускает второй network-вызов")

        spy.releaseGate()
        _ = await first.value
        XCTAssertFalse(vm.submitting)
    }

    func test_delete_submittingGuard_blocksSecondCall() async {
        let spy = APISpy()
        spy.blockMutations = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        let first = Task { await vm.delete(self.makeSub(id: 1)) }
        while spy.deleteCalls == 0 { await Task.yield() }

        await vm.delete(makeSub(id: 1))
        XCTAssertEqual(spy.deleteCalls, 1)

        spy.releaseGate()
        await first.value
    }

    // MARK: - WR-01: pending reload coalesced when load() in flight

    func test_load_coalescesPendingReload_whenInFlight() async {
        let spy = APISpy()
        spy.subs = [makeSub(id: 1)]
        spy.blockList = true
        let vm = SubscriptionsViewModel(api: spy.makeAPI())

        // load #1 подвисает внутри listSubs (inFlight == true).
        let first = Task { await vm.load() }
        while spy.listCalls == 0 { await Task.yield() }

        // load #2 во время первого: НЕ должен молча теряться (WR-01) —
        // ставит reloadPending и возвращается немедленно (2-го list пока нет).
        await vm.load()
        XCTAssertEqual(spy.listCalls, 1, "второй load skip-нут, но запомнен")

        // Отпускаем первый: его defer перевызывает load() из-за reloadPending,
        // который снова дёрнет listSubs (blockList уже сброшен → не блокирует).
        spy.releaseListGate()
        await first.value

        // Дать перевызванному reload (Task в defer load #1) полностью
        // завершиться: ждём 2-го list-вызова И возврата в .ready.
        while spy.listCalls < 2 || vm.status != .ready { await Task.yield() }
        XCTAssertEqual(spy.listCalls, 2, "pending reload перевызван, не потерян")
        XCTAssertEqual(vm.status, .ready)
    }
}
