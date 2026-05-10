// Phase 26-03 Task 1 (GREEN): pure-compute helpers for the iOS Category Detail
// screen (CAT-V10-01..06). Symmetric to web Plan 26-02 `computeCategoryDetail.ts`.
//
// All helpers are stateless static functions on `CategoryDetailData` — no SwiftUI
// imports — so they unit-test cheaply (CategoryDetailDataTests, 13 cases).
//
// Helpers:
//   - computeOverPercent(fact, plan) → Int  (round((fact-plan)/plan*100), 0 when fact ≤ plan)
//   - computeUnderPercent(fact, plan) → Int (round(fact/plan*100), 0 when plan ≤ 0)
//   - computeBarSegments(fact, plan) → BarSegments
//       fillRatio: 0..1 (capped at 1)
//       tickAt: Optional 0..1 — nil when not over budget; for over-budget
//       returns plan/fact (visual break marker on the 6pt bar);
//       special case planCents=0 with fact>0 → fillRatio=1, tickAt=0.
//   - filterActualsForCategory(actuals, categoryId) → [ActualV10DTO]
//   - computeFactForCategory(actuals, categoryId) → Int  (Σ |amount| where kind==.expense)
//
// Threat-model:
//   - T-26-03-04 (DoS via concurrent toggle taps) — addressed at the ViewModel
//     layer via `inFlight` guard, not here. Pure helpers are O(N) and reentrant.

import Foundation

enum CategoryDetailData {

    // MARK: - Percent helpers

    /// Returns the rounded percent over plan when fact > plan, else 0.
    /// Returns 0 when planCents ≤ 0 (avoid divide-by-zero; over-budget signal
    /// for unbudgeted categories is handled by computeBarSegments / isOver flag
    /// in the View — this helper is for the «— превышено на N%» subtitle only).
    static func computeOverPercent(factCents: Int, planCents: Int) -> Int {
        guard planCents > 0 else { return 0 }
        guard factCents > planCents else { return 0 }
        let pct = Double(factCents - planCents) / Double(planCents) * 100.0
        return Int(pct.rounded())
    }

    /// Returns the rounded percent of plan used. Returns 0 when planCents ≤ 0.
    /// Caller should only invoke when fact ≤ plan (for the «— на N% плана»
    /// subtitle); for over-budget the View switches to computeOverPercent.
    static func computeUnderPercent(factCents: Int, planCents: Int) -> Int {
        guard planCents > 0 else { return 0 }
        let pct = Double(factCents) / Double(planCents) * 100.0
        return Int(pct.rounded())
    }

    // MARK: - Bar segments

    /// Visual segments for the 6pt progress bar at the top of CategoryDetail.
    ///   - `fillRatio`: 0..1 — width fraction of the filled portion.
    ///   - `tickAt`: 0..1 — where to draw the «break tick» (1pt vertical line)
    ///     for over-budget rows; nil when fact ≤ plan.
    struct BarSegments: Equatable {
        let fillRatio: Double
        let tickAt: Double?
    }

    /// Compute segments based on fact vs plan:
    ///   - fact ≤ 0 → empty bar (0 fill, no tick)
    ///   - plan ≤ 0 && fact > 0 → fully filled (anomaly), tick at 0 (left edge)
    ///   - fact ≤ plan → fillRatio = fact/plan, no tick
    ///   - fact > plan → fillRatio = 1.0, tick at plan/fact (visual break)
    static func computeBarSegments(factCents: Int, planCents: Int) -> BarSegments {
        if factCents <= 0 {
            return BarSegments(fillRatio: 0, tickAt: nil)
        }
        if planCents <= 0 {
            return BarSegments(fillRatio: 1, tickAt: 0)
        }
        if factCents <= planCents {
            return BarSegments(fillRatio: Double(factCents) / Double(planCents), tickAt: nil)
        }
        return BarSegments(fillRatio: 1, tickAt: Double(planCents) / Double(factCents))
    }

    // MARK: - Actuals helpers

    /// Filter actuals to the rows for a single category. O(N).
    static func filterActualsForCategory(
        _ actuals: [ActualV10DTO],
        categoryId: Int
    ) -> [ActualV10DTO] {
        actuals.filter { $0.categoryId == categoryId }
    }

    /// Sum |amount_cents| for `actuals` where category matches AND
    /// `kind == .expense`. Mirrors web `computeFactForCategory` and
    /// HomeData.computeCategoryAggregates (expense-only aggregation):
    /// roundup / deposit / income kinds DO NOT contribute to the
    /// CategoryDetail bar (those flow elsewhere — Subscriptions / Savings).
    static func computeFactForCategory(
        _ actuals: [ActualV10DTO],
        categoryId: Int
    ) -> Int {
        actuals
            .filter { $0.categoryId == categoryId && $0.kind == .expense }
            .reduce(0) { $0 + Swift.abs($1.amountCents) }
    }
}
