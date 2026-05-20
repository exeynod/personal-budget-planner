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
            balanceCents: 0, primary: primary, createdAt: nil)
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
}
