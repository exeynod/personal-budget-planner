import XCTest

@testable import BudgetPlanner

/// Phase 64-02 (WR-03) — unit specs for `AISuggestApply.resolve`.
///
/// The editor's `applySuggestion` delegates the "is this suggestion safe to
/// apply?" decision here. A suggestion is applied ONLY when its `categoryId`
/// resolves to a currently-valid local category (present + non-archived).
/// Otherwise it must be ignored so the kind-filtered Picker never holds an
/// invisible/unverifiable selection while `canSave` is true.
final class AISuggestApplyTests: XCTestCase {

    // MARK: - Fixtures

    private func makeCategory(
        id: Int,
        name: String = "Кат",
        kind: CategoryKind = .expense,
        isArchived: Bool = false
    ) -> CategoryDTO {
        CategoryDTO(
            id: id, name: name, kind: kind, isArchived: isArchived,
            sortOrder: 0, createdAt: nil)
    }

    private func makeSuggestion(categoryId: Int?) -> SuggestCategoryDTO {
        var dict: [String: Any] = ["confidence": 0.9, "name": "X"]
        dict["category_id"] = categoryId ?? NSNull()
        let data = try! JSONSerialization.data(withJSONObject: dict)
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(SuggestCategoryDTO.self, from: data)
    }

    // MARK: - Applies a valid local category

    func test_resolve_validLocalCategory_appliesId_noKindChange() {
        let cats = [makeCategory(id: 7, kind: .expense)]
        let res = AISuggestApply.resolve(
            suggestion: makeSuggestion(categoryId: 7),
            categories: cats,
            currentKind: .expense,
            isActual: true)
        XCTAssertEqual(res.categoryId, 7)
        XCTAssertNil(res.alignKind)  // kind already matches
    }

    func test_resolve_actualMode_differentKind_alignsKind() {
        let cats = [makeCategory(id: 3, kind: .income)]
        let res = AISuggestApply.resolve(
            suggestion: makeSuggestion(categoryId: 3),
            categories: cats,
            currentKind: .expense,
            isActual: true)
        XCTAssertEqual(res.categoryId, 3)
        XCTAssertEqual(res.alignKind, .income)
    }

    func test_resolve_plannedMode_neverAlignsKind() {
        // Planned modes never flip kind even on a kind mismatch.
        let cats = [makeCategory(id: 4, kind: .income)]
        let res = AISuggestApply.resolve(
            suggestion: makeSuggestion(categoryId: 4),
            categories: cats,
            currentKind: .expense,
            isActual: false)
        XCTAssertEqual(res.categoryId, 4)
        XCTAssertNil(res.alignKind)
    }

    // MARK: - Ignores invalid suggestions (the WR-03 fix)

    func test_resolve_unknownId_ignored_noMutation() {
        // Foreign/stale id not in the local list → ignore (categoryId nil).
        let cats = [makeCategory(id: 1), makeCategory(id: 2)]
        let res = AISuggestApply.resolve(
            suggestion: makeSuggestion(categoryId: 999),
            categories: cats,
            currentKind: .expense,
            isActual: true)
        XCTAssertNil(res.categoryId)
        XCTAssertNil(res.alignKind)
    }

    func test_resolve_archivedCategory_ignored_noMutation() {
        // Archived category cannot render in the kind-filtered Picker → ignore.
        let cats = [makeCategory(id: 5, isArchived: true)]
        let res = AISuggestApply.resolve(
            suggestion: makeSuggestion(categoryId: 5),
            categories: cats,
            currentKind: .expense,
            isActual: true)
        XCTAssertNil(res.categoryId)
        XCTAssertNil(res.alignKind)
    }

    func test_resolve_nilSuggestionId_ignored() {
        let cats = [makeCategory(id: 1)]
        let res = AISuggestApply.resolve(
            suggestion: makeSuggestion(categoryId: nil),
            categories: cats,
            currentKind: .expense,
            isActual: true)
        XCTAssertNil(res.categoryId)
        XCTAssertNil(res.alignKind)
    }
}
