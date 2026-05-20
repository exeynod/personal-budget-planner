// Phase 59-01 Task 2: unit tests for TransactionsViewModel after the V10
// data-layer migration.
//
// Scope:
//   - filter logic: 2-valued kind segment + savingsSegmentSelected synthetic
//     3rd UI segment, categoryFilter intersection.
//   - visibleCategories: drift between History (uses actuals) and План
//     (uses planned) with the Savings override.
//   - dayGroups: delegation to TransactionsData.groupByDay with Europe/Moscow
//     calendar; sum / sort invariants.
//   - delete error surface: clearDeleteError() bookkeeping.
//   - Notification observer: posting .txnCreated triggers load() (status
//     transitions off .idle).
//
// Mirrors the JSON-decode fixture pattern from
// `BudgetPlannerTests/FeaturesV10/TransactionsDataTests.swift` so the DTO
// wire contract (snake_case + custom date decoder) is exercised the same
// way for fixture rows as it is in production.

import XCTest

@testable import BudgetPlanner

@MainActor
final class TransactionsViewModelTests: XCTestCase {

    // MARK: - shared calendar / fixtures

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ mi: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: mi))!
    }

    private func makeCategory(
        id: Int,
        name: String = "Кафе",
        kind: String = "expense",
        code: String? = nil
    ) -> CategoryV10DTO {
        var fields: [String] = [
            "\"id\": \(id)",
            "\"name\": \"\(name)\"",
            "\"kind\": \"\(kind)\"",
            "\"is_archived\": false",
            "\"sort_order\": 0",
            "\"plan_cents\": 0",
            "\"paused\": false",
            "\"rollover\": \"misc\"",
        ]
        if let code { fields.append("\"code\": \"\(code)\"") }
        let json = "{\(fields.joined(separator: ","))}".data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(CategoryV10DTO.self, from: json)
    }

    private func makeActual(
        id: Int,
        categoryId: Int,
        amountCents: Int,
        kind: String = "expense",
        txDate: Date,
        createdAt: Date? = nil
    ) -> ActualV10DTO {
        let isoFmt = ISO8601DateFormatter()
        isoFmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let txStr = isoFmt.string(from: txDate)
        let createdStr: String
        if let createdAt {
            createdStr = "\"\(isoFmt.string(from: createdAt))\""
        } else {
            createdStr = "null"
        }
        let json = """
            {
              "id": \(id),
              "period_id": 1,
              "kind": "\(kind)",
              "amount_cents": \(amountCents),
              "description": null,
              "category_id": \(categoryId),
              "tx_date": "\(txStr)",
              "source": "mini_app",
              "created_at": \(createdStr),
              "account_id": null,
              "parent_txn_id": null
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: str) { return d }
            let plain = DateFormatter()
            plain.dateFormat = "yyyy-MM-dd"
            plain.timeZone = TimeZone(identifier: "UTC")
            if let d = plain.date(from: str) { return d }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "bad date \(str)")
        }
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    private func makePlanned(
        id: Int,
        categoryId: Int,
        amountCents: Int,
        kind: String = "expense"
    ) -> PlannedDTO {
        let json = """
            {
              "id": \(id),
              "period_id": 1,
              "kind": "\(kind)",
              "amount_cents": \(amountCents),
              "description": null,
              "category_id": \(categoryId),
              "planned_date": null,
              "source": "manual",
              "subscription_id": null
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(PlannedDTO.self, from: json)
    }

    private func makeVM(
        actuals: [ActualV10DTO] = [],
        categories: [CategoryV10DTO] = [],
        planned: [PlannedDTO] = []
    ) -> TransactionsViewModel {
        let vm = TransactionsViewModel()
        vm.actuals = actuals
        vm.categories = categories
        vm.planned = planned
        // Pin TZ for deterministic day grouping in tests.
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        vm.calendar = c
        return vm
    }

    // MARK: - Test 1: initial state (behavior 1)

    func test_initialState_idleLoadingEmpty() {
        let vm = TransactionsViewModel()
        XCTAssertEqual(vm.status, .idle)
        XCTAssertTrue(vm.actuals.isEmpty)
        XCTAssertTrue(vm.categories.isEmpty)
        XCTAssertTrue(vm.planned.isEmpty)
        XCTAssertNil(vm.period)
        XCTAssertEqual(vm.subTab, .history)
        XCTAssertEqual(vm.kind, .expense)
        XCTAssertNil(vm.categoryFilter)
        XCTAssertNil(vm.deleteError)
        XCTAssertFalse(vm.savingsSegmentSelected)
    }

    // MARK: - Test 2: kind=expense returns expense + roundup (behavior 2)

    func test_filteredActuals_kindExpense_returnsExpenseAndRoundupRows() {
        let cats = [
            makeCategory(id: 1, name: "Кафе", kind: "expense"),
            makeCategory(id: 2, name: "Зарплата", kind: "income"),
            makeCategory(id: 3, name: "Копилка", kind: "expense"),
        ]
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 2, amountCents: 100_000, kind: "income", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 1, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9)),
            makeActual(id: 4, categoryId: 3, amountCents: -10_000, kind: "deposit", txDate: date(2026, 5, 9)),
        ]
        let vm = makeVM(actuals: acts, categories: cats)
        vm.kind = .expense
        vm.savingsSegmentSelected = false
        let ids = Set(vm.filteredActuals.map(\.id))
        XCTAssertEqual(ids, [1, 3], "expense bucket should contain expense + roundup, exclude income + deposit")
    }

    // MARK: - Test 3: kind=income returns income only, excludes deposit (behavior 2)

    func test_filteredActuals_kindIncome_returnsIncomeOnlyExcludesDeposit() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 2, amountCents: 100_000, kind: "income", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 3, amountCents: -10_000, kind: "deposit", txDate: date(2026, 5, 9)),
        ]
        let vm = makeVM(actuals: acts)
        vm.kind = .income
        vm.savingsSegmentSelected = false
        let ids = Set(vm.filteredActuals.map(\.id))
        XCTAssertEqual(ids, [2], "income bucket should contain income only — deposit hidden until Savings segment")
    }

    // MARK: - Test 4: Savings segment returns roundup + deposit (behavior 2)

    func test_filteredActuals_savingsSegment_returnsRoundupAndDeposit() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 2, amountCents: 100_000, kind: "income", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 1, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9)),
            makeActual(id: 4, categoryId: 3, amountCents: -10_000, kind: "deposit", txDate: date(2026, 5, 9)),
        ]
        let vm = makeVM(actuals: acts)
        vm.subTab = .history
        vm.savingsSegmentSelected = true
        // kind value is irrelevant when Savings is selected — assert both
        // sides of the kind switch behave the same.
        vm.kind = .expense
        let expenseIds = Set(vm.filteredActuals.map(\.id))
        vm.kind = .income
        let incomeIds = Set(vm.filteredActuals.map(\.id))
        XCTAssertEqual(expenseIds, [3, 4])
        XCTAssertEqual(incomeIds, [3, 4], "Savings segment ignores 2-valued kind")
    }

    // MARK: - Test 5: categoryFilter intersects with kind (behavior 3)

    func test_filteredActuals_categoryFilter_intersectsWithKind() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 2, amountCents: -50_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 1, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9)),
        ]
        let vm = makeVM(actuals: acts)
        vm.kind = .expense
        vm.categoryFilter = 1
        let ids = Set(vm.filteredActuals.map(\.id))
        XCTAssertEqual(ids, [1, 3], "categoryFilter narrows the kind bucket to a single category")
    }

    // MARK: - Test 6: filteredPlanned — Savings segment in .plan subtab → empty (behavior 4)

    func test_filteredPlanned_savingsSegmentInPlanSubtab_returnsEmpty() {
        let plans = [
            makePlanned(id: 1, categoryId: 1, amountCents: 30_000, kind: "expense"),
            makePlanned(id: 2, categoryId: 2, amountCents: 100_000, kind: "income"),
        ]
        let vm = makeVM(planned: plans)
        vm.subTab = .plan
        vm.savingsSegmentSelected = true
        XCTAssertTrue(
            vm.filteredPlanned.isEmpty,
            "Savings segment in План subtab returns no planned rows per D-02")
    }

    func test_filteredPlanned_normalKindFiltersByKind() {
        let plans = [
            makePlanned(id: 1, categoryId: 1, amountCents: 30_000, kind: "expense"),
            makePlanned(id: 2, categoryId: 2, amountCents: 100_000, kind: "income"),
        ]
        let vm = makeVM(planned: plans)
        vm.subTab = .plan
        vm.savingsSegmentSelected = false
        vm.kind = .expense
        XCTAssertEqual(vm.filteredPlanned.map(\.id), [1])
        vm.kind = .income
        XCTAssertEqual(vm.filteredPlanned.map(\.id), [2])
    }

    // MARK: - Test 7: visibleCategories — history kind=expense (behavior 5)

    func test_visibleCategories_history_returnsOnlyUsedKindMatch() {
        let cats = [
            makeCategory(id: 1, name: "Кафе", kind: "expense"),
            makeCategory(id: 2, name: "Зарплата", kind: "income"),
            makeCategory(id: 3, name: "Транспорт", kind: "expense"),
            makeCategory(id: 4, name: "Подарок", kind: "expense"),  // not used in actuals
        ]
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 3, amountCents: -10_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 2, amountCents: 100_000, kind: "income", txDate: date(2026, 5, 9)),
        ]
        let vm = makeVM(actuals: acts, categories: cats)
        vm.subTab = .history
        vm.kind = .expense
        vm.savingsSegmentSelected = false
        let ids = Set(vm.visibleCategories.map(\.id))
        XCTAssertEqual(
            ids, [1, 3],
            "visibleCategories includes only categories used by expense actuals — unused/income categories excluded")
    }

    func test_visibleCategories_history_savingsSegment_returnsRoundupDepositCats() {
        let cats = [
            makeCategory(id: 1, name: "Кафе", kind: "expense"),
            makeCategory(id: 5, name: "Копилка", kind: "expense"),
        ]
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 5, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 5, amountCents: -10_000, kind: "deposit", txDate: date(2026, 5, 9)),
        ]
        let vm = makeVM(actuals: acts, categories: cats)
        vm.subTab = .history
        vm.savingsSegmentSelected = true
        let ids = Set(vm.visibleCategories.map(\.id))
        XCTAssertEqual(
            ids, [5],
            "Savings segment visibleCategories shows only categories used by roundup/deposit rows")
    }

    // MARK: - Test 8: visibleCategories — plan kind=income (behavior 5)

    func test_visibleCategories_plan_returnsOnlyUsedKindMatch() {
        let cats = [
            makeCategory(id: 1, name: "Кафе", kind: "expense"),
            makeCategory(id: 2, name: "Зарплата", kind: "income"),
            makeCategory(id: 3, name: "Премия", kind: "income"),
        ]
        let plans = [
            makePlanned(id: 1, categoryId: 1, amountCents: 30_000, kind: "expense"),
            makePlanned(id: 2, categoryId: 2, amountCents: 100_000, kind: "income"),
        ]
        let vm = makeVM(categories: cats, planned: plans)
        vm.subTab = .plan
        vm.kind = .income
        vm.savingsSegmentSelected = false
        let ids = Set(vm.visibleCategories.map(\.id))
        XCTAssertEqual(
            ids, [2],
            "План subtab visibleCategories includes only income categories used in planned rows")
    }

    // MARK: - Test 9: dayGroups — three days in Moscow TZ, DESC order (behavior 6)

    func test_dayGroups_threeDaysInMoscowTZ_returnsSortedDesc() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -100, kind: "expense", txDate: date(2026, 5, 7)),
            makeActual(id: 2, categoryId: 1, amountCents: -200, kind: "expense", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 1, amountCents: -300, kind: "expense", txDate: date(2026, 5, 8)),
        ]
        let vm = makeVM(actuals: acts)
        vm.kind = .expense
        vm.savingsSegmentSelected = false
        let groups = vm.dayGroups
        XCTAssertEqual(groups.count, 3)
        XCTAssertEqual(
            groups.map(\.rows).map { $0.first!.id }, [2, 3, 1],
            "Groups sorted by max txDate DESC: 2026-05-09 → 2026-05-08 → 2026-05-07")
    }

    // MARK: - Test 10: dayGroups — sumCents = Σ|amountCents| per group (behavior 6)

    func test_dayGroups_sumsAbsoluteAmountsPerGroup() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9, 10)),
            makeActual(id: 2, categoryId: 1, amountCents: -100_000, kind: "expense", txDate: date(2026, 5, 9, 14)),
            makeActual(id: 3, categoryId: 1, amountCents: -50_000, kind: "expense", txDate: date(2026, 5, 8, 12)),
        ]
        let vm = makeVM(actuals: acts)
        vm.kind = .expense
        vm.savingsSegmentSelected = false
        let groups = vm.dayGroups
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups[0].sumCents, 125_000, "2026-05-09 bucket = |25_000| + |100_000|")
        XCTAssertEqual(groups[1].sumCents, 50_000, "2026-05-08 bucket = |50_000|")
    }

    // MARK: - Test 11: clearDeleteError() bookkeeping

    func test_clearDeleteError_setsErrorToNil() {
        let vm = TransactionsViewModel()
        vm.deleteError = "тест"
        vm.clearDeleteError()
        XCTAssertNil(vm.deleteError)
    }

    func test_initial_deleteError_isNil() {
        let vm = TransactionsViewModel()
        XCTAssertNil(vm.deleteError)
    }

    // MARK: - Test 12: Notification observer triggers load() (behavior 7)

    func test_notificationTxnCreated_triggersLoad() async {
        let vm = TransactionsViewModel()
        XCTAssertEqual(vm.status, .idle, "Initial status must be .idle before any load() call")

        // P2-12 (QA-F6): de-flaked — await the deterministic load-seam instead
        // of a 300ms timed wait. The observer calls load() then fires
        // `onNotificationLoadComplete`; we resume the continuation there, so
        // the assertion runs exactly once the reload has finished regardless
        // of machine speed. (load() fails against no backend → .error, which
        // still proves status moved off .idle.)
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            vm.onNotificationLoadComplete = { cont.resume() }
            NotificationCenter.default.post(name: .txnCreated, object: nil)
        }

        XCTAssertNotEqual(
            vm.status, .idle,
            "Notification observer should trigger load() and move status off .idle")
    }
}
