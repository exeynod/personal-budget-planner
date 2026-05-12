// Phase 61: PlanEditorData — pure-compute helpers для PlanEditor master view.
//
// Symmetric to FeaturesV10/Plan/PlanData.swift (reusable где collision-free).
// Все helpers — stateless static functions на `enum PlanEditorData`. No SwiftUI
// imports, no state — unit-testable cheaply (PlanEditorDataTests в 61-04).
//
// Bodies заполняются в 61-02 (Task 1 — extend signatures with implementations
// before PlanEditorView body construction). Scaffold gives 61-02 / 61-03 stable
// contracts to import.

import Foundation

enum PlanEditorData {
    // MARK: - Surplus

    /// Остаток к распределению: incomeCents − Σ(planCents) over non-paused
    /// expense categories (income категории не вычитаются — они приносят
    /// дополнительный план-доход к месячному total).
    /// Body заполняется в 61-02.
    static func computeSurplus(
        incomeCents: Int,
        categories: [CategoryV10DTO]
    ) -> Int {
        // 61-02: реализация
        return 0
    }

    // MARK: - Display sorting

    /// Отдаёт две сортированные группы для master view:
    /// - expense categories (kind == .expense), sorted by `ord ?? "99"` ASC
    ///   с tie-break по name; paused-категории идут в конец каждой группы.
    /// - income categories (kind == .income), sorted same.
    /// Excludes archived categories (isArchived == true).
    /// Body заполняется в 61-02.
    static func sortCategoriesForDisplay(
        _ categories: [CategoryV10DTO]
    ) -> (expense: [CategoryV10DTO], income: [CategoryV10DTO]) {
        // 61-02: реализация
        return (expense: [], income: [])
    }

    // MARK: - Fact lookup

    /// Сумма фактических трат на категорию в текущем периоде
    /// (`actuals` filtered by kind == .expense ИЛИ .income в зависимости
    /// от категории; используется `abs(amountCents)`).
    /// Body заполняется в 61-02.
    static func factCentsByCategory(
        _ actuals: [ActualV10DTO],
        categoryId: Int
    ) -> Int {
        // 61-02: реализация
        return 0
    }

    // MARK: - Rollover aggregates

    /// Aggregated leftover by rollover destination (`.misc` / `.savings`)
    /// для master Aggregates section. Excludes paused / archived / savings-code.
    /// Body заполняется в 61-02 (можно reuse FeaturesV10/Plan/PlanData
    /// если no name-collision — иначе reimplement здесь).
    struct RolloverAggregates: Equatable {
        let miscCents: Int
        let savingsCents: Int
    }

    static func computeRolloverAggregates(
        categories: [CategoryV10DTO],
        actuals: [ActualV10DTO]
    ) -> RolloverAggregates {
        // 61-02: реализация
        return RolloverAggregates(miscCents: 0, savingsCents: 0)
    }

    // MARK: - Optimistic update

    /// Заменяет CategoryV10DTO в списке по id (для post-save optimistic
    /// refresh из child editor). Returns new array (immutable mutation).
    /// Body заполняется в 61-02.
    static func applyOptimisticUpdate(
        _ categories: [CategoryV10DTO],
        updated: CategoryV10DTO
    ) -> [CategoryV10DTO] {
        // 61-02: реализация
        return categories
    }
}
