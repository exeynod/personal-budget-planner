// Phase 70-05 (D / R6) — behavioural specs for the shared `SubscriptionsStore`.
//
// Exercises load + mutations + re-entrancy via the injected stub `API` seam —
// zero network. Mirrors the v06 VM's WR-04 spy harness but targets the shared
// store directly, asserting the ported superset:
//   - submitting-guard (T-63-01) blocks re-entrant mutations;
//   - reload-on-success (T-63-04);
//   - WR-06 stale-4xx reload on post/unpost failure;
//   - WR-01 reloadPending coalesce when load() in flight;
//   - loadsCategoriesAccounts flag gates cats/accounts/reschedule.

import XCTest

@testable import BudgetPlanner

@MainActor
final class SubscriptionsStoreTests: XCTestCase {

    // MARK: - Fixtures

    private func makeSub(
        id: Int,
        name: String = "Netflix",
        amountCents: Int = 100_00,
        cycle: String = "monthly",
        nextChargeDate: String = "2026-05-15",
        isActive: Bool = true,
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

    private func makeCategory(id: Int, name: String = "Подписки", archived: Bool = false) -> CategoryDTO {
        let dict: [String: Any] = [
            "id": id,
            "name": name,
            "kind": "expense",
            "is_archived": archived,
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

    /// Mutable counters + behaviour for the injectable API-seam (WR-04).
    private final class APISpy: @unchecked Sendable {
        var subs: [SubscriptionV10DTO] = []
        var categories: [CategoryDTO] = []
        var accounts: [AccountDTO] = []
        var listCalls = 0
        var listCatsCalls = 0
        var listAccsCalls = 0
        var postCalls = 0
        var unpostCalls = 0
        var deleteCalls = 0
        var patchCalls = 0
        var rescheduleCalls = 0

        var postShouldThrow = false
        var unpostShouldThrow = false
        var deleteShouldThrow = false
        var patchShouldThrow = false

        /// First mutation suspends on a continuation, holding `submitting == true`
        /// so the test can assert the re-entrancy guard.
        var blockMutations = false
        private var gate: CheckedContinuation<Void, Never>?

        /// First listSubs suspends (load in flight) so the test can assert the
        /// WR-01 reloadPending coalesce path.
        var blockList = false
        private var listGate: CheckedContinuation<Void, Never>?

        func makeAPI() -> SubscriptionsStore.API {
            SubscriptionsStore.API(
                listSubs: {
                    self.listCalls += 1
                    await self.blockListIfNeeded()
                    return self.subs
                },
                listCategories: {
                    self.listCatsCalls += 1
                    return self.categories
                },
                listAccounts: {
                    self.listAccsCalls += 1
                    return self.accounts
                },
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
        let store = SubscriptionsStore(loadsCategoriesAccounts: true)
        XCTAssertEqual(store.status, .idle)
        XCTAssertEqual(store.subscriptions.count, 0)
        XCTAssertEqual(store.categories.count, 0)
        XCTAssertEqual(store.accounts.count, 0)
        XCTAssertFalse(store.submitting)
    }

    // MARK: - Load (v06 path: loadsCategoriesAccounts == true)

    func test_load_v06Path_fetchesAllSortsFiltersAndReschedules() async {
        let spy = APISpy()
        spy.subs = [makeSub(id: 2), makeSub(id: 1)]
        spy.categories = [makeCategory(id: 1), makeCategory(id: 2, archived: true)]
        spy.accounts = [makeAccount(id: 1, primary: true)]
        let store = SubscriptionsStore(
            api: spy.makeAPI(),
            loadsCategoriesAccounts: true,
            sort: { SubscriptionsDomain.sortV06($0) }
        )

        await store.load()

        XCTAssertEqual(store.status, .ready)
        XCTAssertEqual(spy.listCalls, 1)
        XCTAssertEqual(spy.listCatsCalls, 1)
        XCTAssertEqual(spy.listAccsCalls, 1)
        XCTAssertEqual(store.subscriptions.count, 2)
        // archived category filtered out
        XCTAssertEqual(store.categories.count, 1)
        XCTAssertEqual(store.accounts.count, 1)
        XCTAssertEqual(spy.rescheduleCalls, 1, "v06 load reschedules notifications")
    }

    // MARK: - Load (V10 path: loadsCategoriesAccounts == false)

    func test_load_v10Path_fetchesSubsOnly_noCatsAccountsReschedule() async {
        let spy = APISpy()
        spy.subs = [makeSub(id: 1)]
        spy.categories = [makeCategory(id: 1)]
        spy.accounts = [makeAccount(id: 1)]
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        await store.load()

        XCTAssertEqual(store.status, .ready)
        XCTAssertEqual(spy.listCalls, 1)
        XCTAssertEqual(spy.listCatsCalls, 0, "V10 does not fetch categories")
        XCTAssertEqual(spy.listAccsCalls, 0, "V10 does not fetch accounts")
        XCTAssertEqual(spy.rescheduleCalls, 0, "V10 does not reschedule")
        XCTAssertEqual(store.subscriptions.count, 1)
        XCTAssertEqual(store.categories.count, 0)
        XCTAssertEqual(store.accounts.count, 0)
    }

    func test_load_failure_setsErrorStatus() async {
        let spy = APISpy()
        let store = SubscriptionsStore(
            api: SubscriptionsStore.API(
                listSubs: { throw StubError() },
                listCategories: { [] },
                listAccounts: { [] },
                reschedule: { _ in },
                post: { _ in },
                unpost: { _ in },
                delete: { _ in },
                patch: { _, _ in }
            ),
            loadsCategoriesAccounts: false
        )
        _ = spy

        await store.load()

        XCTAssertEqual(store.status, .error("Не удалось загрузить подписки"))
    }

    // MARK: - Mutations: success reloads (T-63-04)

    func test_post_success_reloads_returnsTrue() async {
        let spy = APISpy()
        spy.subs = [makeSub(id: 1, postedTxnId: 7)]
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.post(1)

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.postCalls, 1)
        XCTAssertEqual(spy.listCalls, 1, "success reloads (T-63-04)")
        XCTAssertFalse(store.submitting)
    }

    func test_post_failure_reloads_returnsFalse_WR06() async {
        let spy = APISpy()
        spy.postShouldThrow = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.post(1)

        XCTAssertFalse(ok)
        XCTAssertEqual(spy.listCalls, 1, "WR-06: failure path also reloads")
        XCTAssertFalse(store.submitting)
    }

    func test_unpost_failure_reloads_returnsFalse_WR06() async {
        let spy = APISpy()
        spy.unpostShouldThrow = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.unpost(1)

        XCTAssertFalse(ok)
        XCTAssertEqual(spy.listCalls, 1)
    }

    func test_delete_success_reloads_returnsTrue() async {
        let spy = APISpy()
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.delete(1)

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.deleteCalls, 1)
        XCTAssertEqual(spy.listCalls, 1)
    }

    func test_delete_failure_returnsFalse_noReload() async {
        let spy = APISpy()
        spy.deleteShouldThrow = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.delete(1)

        XCTAssertFalse(ok)
        XCTAssertEqual(spy.listCalls, 0, "delete failure does not reload (verbatim v06)")
    }

    func test_patch_success_reloads_returnsTrue() async {
        let spy = APISpy()
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.patch(id: 1, payload: SubscriptionV10UpdateRequest(accountId: 3))

        XCTAssertTrue(ok)
        XCTAssertEqual(spy.patchCalls, 1)
        XCTAssertEqual(spy.listCalls, 1)
    }

    func test_patch_failure_returnsFalse_noReload() async {
        let spy = APISpy()
        spy.patchShouldThrow = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let ok = await store.patch(id: 1, payload: SubscriptionV10UpdateRequest(dayOfMonth: 5))

        XCTAssertFalse(ok)
        XCTAssertEqual(spy.listCalls, 0, "patch failure does not reload (verbatim v06)")
    }

    // MARK: - Submitting guard (T-63-01)

    func test_post_submittingGuard_blocksSecondCall() async {
        let spy = APISpy()
        spy.blockMutations = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let first = Task { await store.post(1) }
        while spy.postCalls == 0 { await Task.yield() }

        let second = await store.post(1)
        XCTAssertFalse(second)
        XCTAssertEqual(spy.postCalls, 1, "guard blocks second network call")

        spy.releaseGate()
        _ = await first.value
        XCTAssertFalse(store.submitting)
    }

    func test_delete_submittingGuard_blocksSecondCall() async {
        let spy = APISpy()
        spy.blockMutations = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let first = Task { await store.delete(1) }
        while spy.deleteCalls == 0 { await Task.yield() }

        let second = await store.delete(1)
        XCTAssertFalse(second)
        XCTAssertEqual(spy.deleteCalls, 1)

        spy.releaseGate()
        _ = await first.value
    }

    // MARK: - WR-01: reloadPending coalesce when load() in flight

    func test_load_coalescesPendingReload_whenInFlight() async {
        let spy = APISpy()
        spy.subs = [makeSub(id: 1)]
        spy.blockList = true
        let store = SubscriptionsStore(api: spy.makeAPI(), loadsCategoriesAccounts: false)

        let first = Task { await store.load() }
        while spy.listCalls == 0 { await Task.yield() }

        // Second load while first in flight: must not be silently dropped
        // (WR-01) — sets reloadPending and returns immediately.
        await store.load()
        XCTAssertEqual(spy.listCalls, 1, "second load skipped but remembered")

        spy.releaseListGate()
        await first.value

        while spy.listCalls < 2 || store.status != .ready { await Task.yield() }
        XCTAssertEqual(spy.listCalls, 2, "pending reload re-invoked, not lost")
        XCTAssertEqual(store.status, .ready)
    }
}
