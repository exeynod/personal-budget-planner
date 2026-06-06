// Phase 61: PlanEditorData — pure-compute helpers для PlanEditor master view.
//
// Symmetric to FeaturesV10/Plan/PlanData.swift, но adapted:
//   - не принимает explicit `plans:` parameter (читает planCents прямо из
//     CategoryV10DTO — single source of truth для master view; нет slider
//     preview state как в V10 Plan).
//   - excludes archived (V10 PlanData это не делал — там slider даже на
//     archived можно крутить через раздел КАТЕГОРИИ).
//
// Все helpers — stateless static functions на `enum PlanEditorData`. No SwiftUI
// imports, no state — unit-testable cheaply (PlanEditorDataTests).
//
// Реализация 61-02 Task 1.

import Foundation

enum PlanEditorData {

    // MARK: - Surplus

    /// Остаток к распределению: `incomeCents − Σ(planCents)` over non-archived
    /// **expense** categories. Income категории не вычитаются — они приносят
    /// дополнительный план-доход поверх monthly income (separate flow). Может
    /// быть отрицательной → over-budget signal на Hero plate.
    static func computeSurplus(
        incomeCents: Int,
        categories: [CategoryV10DTO]
    ) -> Int {
        let sumExpensePlan = categories
            .filter { !$0.isArchived && $0.kind == .expense }
            .reduce(0) { $0 + $1.planCents }
        return incomeCents - sumExpensePlan
    }

    // MARK: - Display sorting

    /// Отдаёт две сортированные группы для master view.
    ///
    /// Sort order (within kind):
    ///   1. `ord ?? "99"` ASC (lexicographic string compare — backend гарантирует
    ///      zero-padded CHAR(2) format, так что lexicographic == numeric).
    ///   2. tie-break by `name` ASC (lexicographic Russian-correct via Swift
    ///      default String Comparable).
    ///
    /// Archived (`isArchived == true`) excluded полностью.
    static func sortCategoriesForDisplay(
        _ categories: [CategoryV10DTO]
    ) -> (expense: [CategoryV10DTO], income: [CategoryV10DTO]) {
        let active = categories.filter { !$0.isArchived }
        let sorted = active.sorted { a, b in
            let oa = a.ord ?? "99"
            let ob = b.ord ?? "99"
            if oa != ob { return oa < ob }
            return a.name < b.name
        }
        let expense = sorted.filter { $0.kind == .expense }
        let income = sorted.filter { $0.kind == .income }
        return (expense: expense, income: income)
    }

    // MARK: - Fact lookup

    /// Σ `abs(amountCents)` по `actuals` где `actual.categoryId == categoryId`.
    /// Все kinds учитываются (.expense / .income / .roundup / .deposit) —
    /// row subtitle показывает общую активность на категории за период.
    static func factCentsByCategory(
        _ actuals: [ActualV10DTO],
        categoryId: Int
    ) -> Int {
        actuals
            .filter { $0.categoryId == categoryId }
            .reduce(0) { $0 + Swift.abs($1.amountCents) }
    }

    // MARK: - Optimistic update

    /// Заменяет `CategoryV10DTO` в списке по `id` (для post-save optimistic
    /// refresh из child editor PlanRowEditorView). Если `id` не найден —
    /// возвращает исходный массив без изменений (no append — это не upsert).
    ///
    /// Immutable: input array не мутируется (Swift value-type semantics +
    /// explicit copy).
    static func applyOptimisticUpdate(
        _ categories: [CategoryV10DTO],
        updated: CategoryV10DTO
    ) -> [CategoryV10DTO] {
        guard let idx = categories.firstIndex(where: { $0.id == updated.id }) else {
            return categories
        }
        var copy = categories
        copy[idx] = updated
        return copy
    }
}
