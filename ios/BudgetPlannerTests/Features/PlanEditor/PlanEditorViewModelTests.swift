// Phase 61-02 Task 2: unit tests для PlanEditorViewModel state + applyOptimisticUpdate.
//
// Scope:
//   - initial state (idle / categories=[] / actuals=[] / period=nil /
//     incomeCents=0)
//   - calendar.timeZone.identifier == "Europe/Moscow" (T-60-03 pattern reused)
//   - applyOptimisticUpdate replaces by id (success path)
//   - applyOptimisticUpdate unknown id no-op
//   - surplus integration через PlanEditorData (smoke что state surface
//     корректный для view-side compute)
//   - sort integration через PlanEditorData
//   - _setStateForTesting не флипает status (orthogonal — backdoor only)
//   - inFlight guard smoke: double-load не валится (live network — best-effort).
//
// T-61-03 mitigation: network mock не available — verification только grep
// (error.localizedDescription = 0; «Не удалось загрузить план месяца» = 1).
// Manual smoke .error state — 61-04 / human-verify.

import XCTest

@testable import BudgetPlanner

@MainActor
final class PlanEditorViewModelTests: XCTestCase {

    // MARK: - Fixture helper

    private func makeCategory(
        id: Int,
        name: String = "Test",
        kind: String = "expense",
        planCents: Int = 0
    ) -> CategoryV10DTO {
        // code/ord/created_at required on CategoryRead (Phase 69 B4).
        let json = """
            {
              "id": \(id),
              "name": "\(name)",
              "kind": "\(kind)",
              "is_archived": false,
              "sort_order": 0,
              "created_at": "2026-05-09",
              "code": "food",
              "ord": "01",
              "plan_cents": \(planCents),
              "rollover": "misc",
              "paused": false
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(CategoryV10DTO.self, from: json)
    }

    // MARK: - Test 1: initial state

    func test_initialState_idleEmpty() {
        let vm = PlanEditorViewModel()
        XCTAssertEqual(vm.status, .idle)
        XCTAssertTrue(vm.categories.isEmpty)
        XCTAssertTrue(vm.actuals.isEmpty)
        XCTAssertNil(vm.period)
        XCTAssertEqual(vm.incomeCents, 0)
    }

    // MARK: - Test 2: calendar TZ

    func test_calendar_isEuropeMoscow() {
        let vm = PlanEditorViewModel()
        XCTAssertEqual(vm.calendar.timeZone.identifier, "Europe/Moscow")
    }

    // MARK: - Test 3: applyOptimisticUpdate replaces by id

    func test_applyOptimisticUpdate_replacesCategory() {
        let vm = PlanEditorViewModel()
        let c1 = makeCategory(id: 1, planCents: 1_000)
        let c2 = makeCategory(id: 2, planCents: 2_000)
        vm._setStateForTesting(categories: [c1, c2])

        let updated = makeCategory(id: 2, planCents: 9_999)
        vm.applyOptimisticUpdate(updated)

        XCTAssertEqual(vm.categories.count, 2)
        XCTAssertEqual(vm.categories[0].planCents, 1_000)
        XCTAssertEqual(vm.categories[1].planCents, 9_999)
    }

    // MARK: - Test 4: applyOptimisticUpdate unknown id → no change

    func test_applyOptimisticUpdate_unknownIdNoChange() {
        let vm = PlanEditorViewModel()
        let c1 = makeCategory(id: 1, planCents: 1_000)
        vm._setStateForTesting(categories: [c1])

        let updated = makeCategory(id: 99, planCents: 9_999)
        vm.applyOptimisticUpdate(updated)

        XCTAssertEqual(vm.categories.count, 1)
        XCTAssertEqual(vm.categories[0].planCents, 1_000)
    }

    // MARK: - Test 5: surplus integration via PlanEditorData helper

    func test_surplus_throughHelper() {
        let vm = PlanEditorViewModel()
        let cats = [
            makeCategory(id: 1, kind: "expense", planCents: 30_000),
            makeCategory(id: 2, kind: "expense", planCents: 20_000),
        ]
        vm._setStateForTesting(categories: cats, incomeCents: 100_000)
        // View вызывает helper directly; smoke что state экспонирован для compute.
        XCTAssertEqual(vm.incomeCents, 100_000)
        XCTAssertEqual(vm.categories.count, 2)
        XCTAssertEqual(
            PlanEditorData.computeSurplus(
                incomeCents: vm.incomeCents,
                categories: vm.categories
            ),
            50_000
        )
    }

    // MARK: - Test 6: sortCategoriesForDisplay integration

    func test_sortedCategories_throughHelper() {
        let vm = PlanEditorViewModel()
        let cats = [
            makeCategory(id: 1, kind: "expense"),
            makeCategory(id: 2, kind: "income"),
            makeCategory(id: 3, kind: "expense"),
        ]
        vm._setStateForTesting(categories: cats)
        let r = PlanEditorData.sortCategoriesForDisplay(vm.categories)
        XCTAssertEqual(r.expense.count, 2)
        XCTAssertEqual(r.income.count, 1)
    }

    // MARK: - Test 7: _setStateForTesting не флипает status

    func test_setStateForTesting_doesNotFlipStatus() {
        let vm = PlanEditorViewModel()
        vm._setStateForTesting(
            categories: [makeCategory(id: 1)],
            incomeCents: 50_000
        )
        XCTAssertEqual(vm.status, .idle)
    }
}
