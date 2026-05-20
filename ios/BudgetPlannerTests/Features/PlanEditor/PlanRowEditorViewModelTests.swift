// Phase 61-03 Task 1: unit tests для PlanRowEditorViewModel.
//
// Scope:
//   - Initial state (idle / category=nil / planCents=0 / rollover=.misc /
//     paused=false / submitting=false / saveError=nil / !isDirty).
//   - _setStateForTesting seeds editing state но НЕ flips status
//     (load() — единственный путь к .ready).
//   - isDirty matrix:
//     - false когда все 3 поля совпадают с category.
//     - true когда planCents отличается.
//     - true когда rollover отличается.
//     - true когда paused отличается.
//     - false когда category == nil (no anchor).
//   - onSaved closure: defaults nil; can be wired; invocation captures DTO.
//   - Status equatable: idle == idle; .error("a") != .error("b").
//   - save() early-return false когда category == nil (guard; no API call).
//
// Threat-model (T-61-03 Information Disclosure): full save success/failure
// path requires APIClient mock — covered manual smoke в 61-VERIFICATION.
// Здесь unit-level: structural guards + isDirty/state machine.
//
// Fixture: JSON-decode через `.convertFromSnakeCase` decoder — мирорит
// production wire contract (APIClient.shared.decoder).

import XCTest

@testable import BudgetPlanner

@MainActor
final class PlanRowEditorViewModelTests: XCTestCase {

    // MARK: - DTO factory

    private func makeCategory(
        id: Int,
        name: String = "Еда",
        kind: String = "expense",
        planCents: Int = 0,
        rollover: String = "misc",
        paused: Bool = false
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
              "rollover": "\(rollover)",
              "paused": \(paused ? "true" : "false")
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

    // MARK: - Initial state

    func test_initialState_idleZero() {
        let vm = PlanRowEditorViewModel(categoryId: 42)
        XCTAssertEqual(vm.status, .idle)
        XCTAssertNil(vm.category)
        XCTAssertEqual(vm.planCents, 0)
        XCTAssertEqual(vm.rollover, .misc)
        XCTAssertFalse(vm.paused)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.saveError)
        XCTAssertFalse(vm.isDirty)
        XCTAssertEqual(vm.categoryId, 42)
        XCTAssertNil(vm.onSaved)
    }

    // MARK: - _setStateForTesting

    func test_setStateForTesting_seedsEditingState() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let c = makeCategory(id: 1, planCents: 10_000, rollover: "savings", paused: true)
        vm._setStateForTesting(
            category: c,
            planCents: 50_000,
            rollover: .savings,
            paused: true
        )
        XCTAssertEqual(vm.category?.id, 1)
        XCTAssertEqual(vm.planCents, 50_000)
        XCTAssertEqual(vm.rollover, .savings)
        XCTAssertTrue(vm.paused)
    }

    func test_setStateForTesting_doesNotFlipStatus() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        vm._setStateForTesting(category: makeCategory(id: 1, planCents: 1000))
        // status MUST stay .idle — только load() переводит в .ready.
        XCTAssertEqual(vm.status, .idle)
    }

    // MARK: - isDirty matrix

    func test_isDirty_falseWhenAllMatch() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let c = makeCategory(id: 1, planCents: 10_000, rollover: "misc", paused: false)
        vm._setStateForTesting(
            category: c,
            planCents: 10_000,
            rollover: .misc,
            paused: false
        )
        XCTAssertFalse(vm.isDirty)
    }

    func test_isDirty_trueWhenPlanCentsChanged() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let c = makeCategory(id: 1, planCents: 10_000, rollover: "misc", paused: false)
        vm._setStateForTesting(
            category: c,
            planCents: 15_000,
            rollover: .misc,
            paused: false
        )
        XCTAssertTrue(vm.isDirty)
    }

    func test_isDirty_trueWhenRolloverChanged() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let c = makeCategory(id: 1, planCents: 10_000, rollover: "misc", paused: false)
        vm._setStateForTesting(
            category: c,
            planCents: 10_000,
            rollover: .savings,
            paused: false
        )
        XCTAssertTrue(vm.isDirty)
    }

    func test_isDirty_trueWhenPausedChanged() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let c = makeCategory(id: 1, planCents: 10_000, rollover: "misc", paused: false)
        vm._setStateForTesting(
            category: c,
            planCents: 10_000,
            rollover: .misc,
            paused: true
        )
        XCTAssertTrue(vm.isDirty)
    }

    func test_isDirty_falseWhenCategoryNil() {
        // Edge case: editing state mutated, но category не загружена → нет
        // anchor для diff. Защита от false-positive «грязного» state.
        let vm = PlanRowEditorViewModel(categoryId: 1)
        vm.planCents = 50_000
        vm.rollover = .savings
        vm.paused = true
        XCTAssertFalse(vm.isDirty)
    }

    func test_isDirty_trueWhenMultipleFieldsChanged() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let c = makeCategory(id: 1, planCents: 10_000, rollover: "misc", paused: false)
        vm._setStateForTesting(
            category: c,
            planCents: 25_000,
            rollover: .savings,
            paused: true
        )
        XCTAssertTrue(vm.isDirty)
    }

    // MARK: - onSaved closure contract (61-01 D-3)

    func test_onSaved_defaultsNil() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        XCTAssertNil(vm.onSaved)
    }

    func test_onSaved_canBeWiredAndInvoked() {
        let vm = PlanRowEditorViewModel(categoryId: 1)
        var captured: CategoryV10DTO?
        vm.onSaved = { c in captured = c }
        let c = makeCategory(id: 1, planCents: 12_345)
        vm.onSaved?(c)
        XCTAssertEqual(captured?.id, 1)
        XCTAssertEqual(captured?.planCents, 12_345)
    }

    // MARK: - Status equatable

    func test_status_equatable_distinctErrors() {
        XCTAssertEqual(PlanRowEditorViewModel.Status.idle, .idle)
        XCTAssertEqual(PlanRowEditorViewModel.Status.loading, .loading)
        XCTAssertEqual(PlanRowEditorViewModel.Status.ready, .ready)
        XCTAssertEqual(
            PlanRowEditorViewModel.Status.error("x"),
            PlanRowEditorViewModel.Status.error("x")
        )
        XCTAssertNotEqual(
            PlanRowEditorViewModel.Status.error("a"),
            PlanRowEditorViewModel.Status.error("b")
        )
        XCTAssertNotEqual(PlanRowEditorViewModel.Status.idle, .ready)
    }

    // MARK: - save() guards (smoke — без real API call)

    func test_save_earlyReturnFalseWhenCategoryNil() async {
        // Guard: save() без seeded category должен вернуть false без API
        // вызова и без state mutation (T-61-02 — defensive entry guard).
        let vm = PlanRowEditorViewModel(categoryId: 1)
        let ok = await vm.save()
        XCTAssertFalse(ok)
        XCTAssertNil(vm.saveError)
        XCTAssertFalse(vm.submitting)
        XCTAssertNil(vm.category)
    }
}
