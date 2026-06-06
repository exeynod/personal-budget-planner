// Phase 26-05 Task 1: PlanData — pure-compute helpers for PLAN мая screen.
//
// Symmetric to web Plan 26-04 `frontend/src/screensV10/Plan/computePlan.ts`.
// All helpers are stateless static functions on `enum PlanData` — no SwiftUI
// imports — so they can be unit-tested cheaply (PlanDataTests).
//
// Six helpers cover the must-haves T-P-02 .. T-P-06:
//   - computeSurplus / computeIsOverflow   (T-P-02 «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» plate)
//   - computeRolloverAggregates            (T-P-03 «→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ»)
//   - computeRegularsList                  (T-P-04 «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ»)
//   - applyPlanEdit / plansFromCategories  (T-P-05 / T-P-06 — slider state)

import Foundation

enum PlanData {
    // MARK: - T-P-02: surplus + overflow

    /// Signed surplus (positive = under budget, negative = over).
    /// Formula: `income − Σ(plan)` over the entire plan list.
    static func computeSurplus(incomeCents: Int, plans: [PlanMonthItem]) -> Int {
        incomeCents - plans.reduce(0) { $0 + $1.planCents }
    }

    /// Convenience predicate: surplus < 0 → user has overspent the plan.
    /// Drives the OK/OVER colour swap on the surplus plate AND blocks the
    /// «СОХРАНИТЬ» CTA (must-have T-P-06).
    static func computeIsOverflow(_ surplus: Int) -> Bool { surplus < 0 }

    // MARK: - T-P-04: regulars list

    /// One row in the «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» list.
    struct RegularRow: Identifiable, Equatable {
        let id: Int
        let name: String
        let dayOfMonth: Int
        let categoryName: String
        let amountCents: Int
        /// nil = unposted (show «ПРОВЕСТИ →»); non-nil = posted (show «ОТМЕНА»).
        let postedTxnId: Int?
    }

    /// Filter subscriptions to monthly regulars with a non-nil `dayOfMonth`,
    /// joined to category name (lookup is O(1) via dictionary), sorted by
    /// `dayOfMonth` ascending. Yearly cycles are excluded — they belong on
    /// the future Phase 27 calendar surface, not the monthly Plan screen.
    static func computeRegularsList(
        subs: [SubscriptionV10DTO],
        categories: [CategoryV10DTO]
    ) -> [RegularRow] {
        let nameById: [Int: String] = Dictionary(
            uniqueKeysWithValues: categories.map { ($0.id, $0.name) }
        )
        return subs
            .filter { $0.cycle == .monthly && $0.dayOfMonth != nil }
            .map { sub in
                RegularRow(
                    id: sub.id,
                    name: sub.name,
                    dayOfMonth: sub.dayOfMonth!,
                    categoryName: nameById[sub.categoryId] ?? "—",
                    amountCents: sub.amountCents,
                    postedTxnId: sub.postedTxnId
                )
            }
            .sorted { $0.dayOfMonth < $1.dayOfMonth }
    }

    // MARK: - T-P-05 / T-P-06: plan edit state

    /// Pure replace-or-append on the plan list. Immutable — returns a new
    /// array, leaves the input untouched (asserted by test fixture).
    static func applyPlanEdit(
        _ plans: [PlanMonthItem],
        categoryId: Int,
        newCents: Int
    ) -> [PlanMonthItem] {
        if let idx = plans.firstIndex(where: { $0.categoryId == categoryId }) {
            var copy = plans
            copy[idx] = PlanMonthItem(categoryId: categoryId, planCents: newCents)
            return copy
        }
        return plans + [PlanMonthItem(categoryId: categoryId, planCents: newCents)]
    }

    /// Seed the plan list from the loaded categories (drop the system savings
    /// sink). Used on initial load so the slider positions match the saved
    /// state from the server.
    static func plansFromCategories(_ cats: [CategoryV10DTO]) -> [PlanMonthItem] {
        cats
            .filter { $0.code != "savings" }
            .map { PlanMonthItem(categoryId: $0.id, planCents: $0.planCents) }
    }
}
