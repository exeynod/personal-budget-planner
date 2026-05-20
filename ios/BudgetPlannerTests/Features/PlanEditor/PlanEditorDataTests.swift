// Phase 61-02 Task 1: unit tests для PlanEditorData (5 pure helpers).
//
// Coverage (18+ cases):
//   - computeSurplus: empty / sums / excludes (paused, income kind) / negative
//   - sortCategoriesForDisplay: split by kind / archived / ord ASC / paused-to-end / name tie-break
//   - factCentsByCategory: sums abs / filters by id / mixed kinds
//   - computeRolloverAggregates: partitions misc/savings / excludes paused/savings/archived / over-budget clamps
//   - applyOptimisticUpdate: replaces by id / unknown id no-op / immutable input
//
// Fixture pattern: JSON-decode через `.convertFromSnakeCase` decoder — мирорит
// production wire contract (APIClient.shared.decoder).

import XCTest

@testable import BudgetPlanner

final class PlanEditorDataTests: XCTestCase {

    // MARK: - Fixture helpers

    private func makeCategory(
        id: Int,
        name: String = "Test",
        kind: String = "expense",
        planCents: Int = 0,
        ord: String = "01",
        rollover: String = "misc",
        paused: Bool = false,
        code: String = "food",
        isArchived: Bool = false
    ) -> CategoryV10DTO {
        // code/ord/created_at required on CategoryRead (Phase 69 B4).
        let fields: [String] = [
            "\"id\": \(id)",
            "\"name\": \"\(name)\"",
            "\"kind\": \"\(kind)\"",
            "\"is_archived\": \(isArchived ? "true" : "false")",
            "\"sort_order\": 0",
            "\"created_at\": \"2026-05-09\"",
            "\"plan_cents\": \(planCents)",
            "\"rollover\": \"\(rollover)\"",
            "\"paused\": \(paused ? "true" : "false")",
            "\"code\": \"\(code)\"",
            "\"ord\": \"\(ord)\"",
        ]
        let json = "{\(fields.joined(separator: ","))}".data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(CategoryV10DTO.self, from: json)
    }

    private let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func makeActual(
        id: Int,
        categoryId: Int,
        amountCents: Int,
        kind: String = "expense"
    ) -> ActualV10DTO {
        let dateStr = iso8601.string(from: Date())
        let json: [String: Any] = [
            "id": id,
            "period_id": 1,
            "kind": kind,
            "amount_cents": amountCents,
            "description": "x",
            "category_id": categoryId,
            "tx_date": dateStr,
            "source": "mini_app",
            "created_at": dateStr,
            "account_id": NSNull(),
            "parent_txn_id": NSNull(),
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        dec.dateDecodingStrategy = .custom { d in
            let str = try d.singleValueContainer().decode(String.self)
            if let dd = f.date(from: str) { return dd }
            let f2 = ISO8601DateFormatter()
            f2.formatOptions = [.withInternetDateTime]
            return f2.date(from: str) ?? Date()
        }
        return try! dec.decode(ActualV10DTO.self, from: data)
    }

    // MARK: - computeSurplus

    func test_computeSurplus_emptyCategoriesReturnsIncome() {
        XCTAssertEqual(
            PlanEditorData.computeSurplus(incomeCents: 100_000, categories: []),
            100_000
        )
    }

    func test_computeSurplus_sumsExpensePlans() {
        let cats = [
            makeCategory(id: 1, kind: "expense", planCents: 30_000),
            makeCategory(id: 2, kind: "expense", planCents: 20_000),
        ]
        XCTAssertEqual(
            PlanEditorData.computeSurplus(incomeCents: 100_000, categories: cats),
            50_000
        )
    }

    func test_computeSurplus_excludesPausedAndIncome() {
        let cats = [
            makeCategory(id: 1, kind: "expense", planCents: 30_000, paused: false),
            makeCategory(id: 2, kind: "expense", planCents: 10_000, paused: true),
            makeCategory(id: 3, kind: "income", planCents: 200_000),
        ]
        XCTAssertEqual(
            PlanEditorData.computeSurplus(incomeCents: 100_000, categories: cats),
            70_000
        )
    }

    func test_computeSurplus_negativeWhenOver() {
        let cats = [makeCategory(id: 1, kind: "expense", planCents: 15_000)]
        XCTAssertEqual(
            PlanEditorData.computeSurplus(incomeCents: 10_000, categories: cats),
            -5_000
        )
    }

    // MARK: - sortCategoriesForDisplay

    func test_sortCategories_splitsByKind() {
        let cats = [
            makeCategory(id: 1, kind: "expense"),
            makeCategory(id: 2, kind: "income"),
            makeCategory(id: 3, kind: "expense"),
            makeCategory(id: 4, kind: "income"),
            makeCategory(id: 5, kind: "expense"),
        ]
        let r = PlanEditorData.sortCategoriesForDisplay(cats)
        XCTAssertEqual(r.expense.count, 3)
        XCTAssertEqual(r.income.count, 2)
    }

    func test_sortCategories_excludesArchived() {
        let cats = [
            makeCategory(id: 1, kind: "expense", isArchived: false),
            makeCategory(id: 2, kind: "expense", isArchived: true),
        ]
        let r = PlanEditorData.sortCategoriesForDisplay(cats)
        XCTAssertEqual(r.expense.count, 1)
        XCTAssertEqual(r.expense.first?.id, 1)
    }

    func test_sortCategories_sortsByOrd() {
        let cats = [
            makeCategory(id: 3, name: "C", kind: "expense", ord: "03"),
            makeCategory(id: 1, name: "A", kind: "expense", ord: "01"),
            makeCategory(id: 2, name: "B", kind: "expense", ord: "02"),
        ]
        let r = PlanEditorData.sortCategoriesForDisplay(cats)
        XCTAssertEqual(r.expense.map(\.id), [1, 2, 3])
    }

    func test_sortCategories_pausedToEnd() {
        let cats = [
            makeCategory(id: 1, kind: "expense", ord: "01", paused: true),
            makeCategory(id: 2, kind: "expense", ord: "02", paused: false),
        ]
        let r = PlanEditorData.sortCategoriesForDisplay(cats)
        // active (id=2) first; paused (id=1) at end.
        XCTAssertEqual(r.expense.map(\.id), [2, 1])
    }

    func test_sortCategories_tieBreakByName() {
        let cats = [
            makeCategory(id: 2, name: "B", kind: "expense", ord: "01"),
            makeCategory(id: 1, name: "A", kind: "expense", ord: "01"),
        ]
        let r = PlanEditorData.sortCategoriesForDisplay(cats)
        XCTAssertEqual(r.expense.map(\.name), ["A", "B"])
    }

    // MARK: - factCentsByCategory

    func test_factCents_sumsAbsAmounts() {
        let acts = [
            makeActual(id: 1, categoryId: 5, amountCents: 1_000),
            makeActual(id: 2, categoryId: 5, amountCents: 2_500),
        ]
        XCTAssertEqual(
            PlanEditorData.factCentsByCategory(acts, categoryId: 5),
            3_500
        )
    }

    func test_factCents_filtersByCategoryId() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: 1_000),
            makeActual(id: 2, categoryId: 2, amountCents: 2_000),
            makeActual(id: 3, categoryId: 3, amountCents: 3_000),
        ]
        XCTAssertEqual(
            PlanEditorData.factCentsByCategory(acts, categoryId: 2),
            2_000
        )
    }

    func test_factCents_includesAllKinds() {
        let acts = [
            makeActual(id: 1, categoryId: 5, amountCents: 1_000, kind: "income"),
            makeActual(id: 2, categoryId: 5, amountCents: 2_000, kind: "expense"),
        ]
        XCTAssertEqual(
            PlanEditorData.factCentsByCategory(acts, categoryId: 5),
            3_000
        )
    }

    // MARK: - computeRolloverAggregates

    func test_rolloverAggregates_partitions() {
        let cats = [
            makeCategory(id: 1, kind: "expense", planCents: 10_000, rollover: "misc"),
            makeCategory(id: 2, kind: "expense", planCents: 20_000, rollover: "savings"),
        ]
        let acts = [
            makeActual(id: 10, categoryId: 1, amountCents: 4_000),  // expense kind default
            makeActual(id: 20, categoryId: 2, amountCents: 7_000),
        ]
        let r = PlanEditorData.computeRolloverAggregates(categories: cats, actuals: acts)
        XCTAssertEqual(r.miscCents, 6_000)
        XCTAssertEqual(r.savingsCents, 13_000)
    }

    func test_rolloverAggregates_excludesPausedSavingsArchived() {
        let cats = [
            makeCategory(id: 1, kind: "expense", planCents: 10_000, rollover: "misc", paused: true),
            makeCategory(id: 2, kind: "expense", planCents: 5_000, rollover: "misc", code: "savings"),
            makeCategory(id: 3, kind: "expense", planCents: 7_000, rollover: "misc", isArchived: true),
            makeCategory(id: 4, kind: "expense", planCents: 8_000, rollover: "misc"),
        ]
        let r = PlanEditorData.computeRolloverAggregates(categories: cats, actuals: [])
        // только id=4 учитывается; fact=0 → remainder=8000
        XCTAssertEqual(r.miscCents, 8_000)
        XCTAssertEqual(r.savingsCents, 0)
    }

    func test_rolloverAggregates_overBudgetClampedZero() {
        let cats = [
            makeCategory(id: 1, kind: "expense", planCents: 10_000, rollover: "misc")
        ]
        let acts = [makeActual(id: 10, categoryId: 1, amountCents: 15_000)]
        let r = PlanEditorData.computeRolloverAggregates(categories: cats, actuals: acts)
        XCTAssertEqual(r.miscCents, 0)
    }

    // MARK: - applyOptimisticUpdate

    func test_applyOptimistic_replacesById() {
        let c1 = makeCategory(id: 1, planCents: 1_000)
        let c2 = makeCategory(id: 2, planCents: 2_000)
        let c3 = makeCategory(id: 3, planCents: 3_000)
        let updated = makeCategory(id: 2, planCents: 9_999)
        let r = PlanEditorData.applyOptimisticUpdate([c1, c2, c3], updated: updated)
        XCTAssertEqual(r.count, 3)
        XCTAssertEqual(r[1].planCents, 9_999)
        XCTAssertEqual(r[0].planCents, 1_000)
        XCTAssertEqual(r[2].planCents, 3_000)
    }

    func test_applyOptimistic_unknownIdNoChange() {
        let c1 = makeCategory(id: 1, planCents: 1_000)
        let updated = makeCategory(id: 99, planCents: 9_999)
        let r = PlanEditorData.applyOptimisticUpdate([c1], updated: updated)
        XCTAssertEqual(r.count, 1)
        XCTAssertEqual(r[0].planCents, 1_000)
    }

    func test_applyOptimistic_immutable() {
        let c1 = makeCategory(id: 1, planCents: 1_000)
        let updated = makeCategory(id: 1, planCents: 9_999)
        let input = [c1]
        _ = PlanEditorData.applyOptimisticUpdate(input, updated: updated)
        XCTAssertEqual(input[0].planCents, 1_000)
    }
}
