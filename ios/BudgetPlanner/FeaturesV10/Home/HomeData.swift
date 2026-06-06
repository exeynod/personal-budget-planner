// Phase 25-05 Task 1: pure-compute helpers for HomeView (HOME-V10-01..06).
//
// Symmetric to web Plan 25-04 HomeData (`frontend/src/screensV10/Home/data.ts`,
// landing in same wave). All helpers are stateless static functions on `HomeData`
// — no SwiftUI imports — so they can be unit-tested cheaply (HomeDataTests).
//
// Threat-model mitigations enforced here (per PLAN <threat_model>):
//   - T-25-05-01 (Information Disclosure: showing system 'savings' in user list):
//     `computeCategoryAggregates` filters `code != "savings" && !paused`. Asserted
//     in HomeDataTests.test_computeCategoryAggregates_filters_savings_code +
//     test_computeCategoryAggregates_filters_paused_categories.
//   - T-25-05-02 (Tampering: negative dailyPace from future tx_date):
//     `computeDailyPace` clamps to `max(0, ...)`. Asserted in
//     HomeDataTests.test_computeDailyPace_clamps_negative_to_zero_when_overspent.
//
// **Decimal semantics**: ratios are computed in Double for sort-key purposes
// only — money totals stay in Int (cents). The `.infinity` sentinel for
// «unbudgeted but spent» (planCents=0 && factCents>0) sorts naturally to the
// top of the Home list (which is the desired behaviour: surface anomalies).

import Foundation

/// One row in the Home category list (sorted, filtered, with derived totals).
struct CategoryAggregateRow: Identifiable, Equatable {
    let id: Int
    let name: String
    let code: String?
    let ord: String?
    let planCents: Int
    let factCents: Int
    /// `factCents / planCents` as Double. `.infinity` when planCents=0 && factCents>0.
    /// `0` when planCents=0 && factCents=0 (definedly, not NaN).
    let ratio: Double
    let isOver: Bool
}

enum HomeData {
    // MARK: - Daily pace

    /// Daily spending budget for the rest of the period.
    ///
    /// Formula: `max(0, (plan - fact) / max(1, daysLeft))`.
    ///   - `max(0, ...)` clamps to zero when overspent (T-25-05-02 mitigation).
    ///   - `max(1, daysLeft)` avoids division-by-zero on the last day of the period.
    static func computeDailyPace(
        planTotalCents: Int,
        factTotalExpenseCents: Int,
        daysLeft: Int
    ) -> Int {
        let surplus = planTotalCents - factTotalExpenseCents
        let denom = Swift.max(1, daysLeft)
        let raw = surplus / denom
        return Swift.max(0, raw)
    }

    // MARK: - Surplus

    /// Signed surplus (positive = under budget, negative = over).
    static func computeSurplus(
        planTotalCents: Int,
        factTotalExpenseCents: Int
    ) -> Int {
        planTotalCents - factTotalExpenseCents
    }

    // MARK: - Wallet total

    /// Sum of `balance_cents` across all accounts (T-H-04 wallet link).
    static func computeWalletTotal(_ accounts: [AccountDTO]) -> Int {
        accounts.reduce(0) { $0 + $1.balanceCents }
    }

    // MARK: - Category aggregates

    /// Per-category fact aggregation + filter + ratio computation.
    ///
    /// Filter: drop categories where `code == "savings"` OR `paused == true`
    /// (T-25-05-01). System 'savings' is a sink for roundup/deposit kinds and
    /// never belongs in the user-facing expense list.
    ///
    /// Per-cat fact = sum of `actuals` where `categoryId == cat.id` AND
    /// `kind == .expense`. Roundup / deposit / income kinds DO NOT contribute
    /// to the Home category bar (those flow to savings progress on the future
    /// SavingsView, Phase 27).
    static func computeCategoryAggregates(
        categories: [CategoryV10DTO],
        actuals: [ActualV10DTO]
    ) -> [CategoryAggregateRow] {
        let filtered = categories.filter { $0.code != "savings" }

        // Pre-bucket actuals by categoryId for O(N+M) instead of O(N*M).
        var factByCat: [Int: Int] = [:]
        for a in actuals where a.kind == .expense {
            factByCat[a.categoryId, default: 0] += a.amountCents
        }

        return filtered.map { cat in
            let fact = factByCat[cat.id] ?? 0
            let ratio: Double
            if cat.planCents > 0 {
                ratio = Double(fact) / Double(cat.planCents)
            } else if fact > 0 {
                ratio = .infinity
            } else {
                ratio = 0
            }
            let isOver = fact > cat.planCents
            return CategoryAggregateRow(
                id: cat.id,
                name: cat.name,
                code: cat.code,
                ord: cat.ord,
                planCents: cat.planCents,
                factCents: fact,
                ratio: ratio,
                isOver: isOver
            )
        }
    }

    // MARK: - Sort

    /// Sort rows for Home list display (T-H-06):
    ///   1. ratio DESC (over-budget rows surface first; +inf rows above all)
    ///   2. planCents DESC (tie-breaker — bigger budgets first within same ratio)
    static func sortForHome(_ rows: [CategoryAggregateRow]) -> [CategoryAggregateRow] {
        rows.sorted { a, b in
            if a.ratio != b.ratio { return a.ratio > b.ratio }
            return a.planCents > b.planCents
        }
    }

    // MARK: - Plan total

    /// Sum of `planCents` for already-filtered category list (caller filters via
    /// `computeCategoryAggregates`'s same predicate to keep totals consistent
    /// with row visibility). Pass the RAW filtered DTO list, not the
    /// CategoryAggregateRow array.
    static func planTotal(_ filtered: [CategoryV10DTO]) -> Int {
        filtered.reduce(0) { $0 + $1.planCents }
    }

    // MARK: - v1.1 plan↔fact ladder («Расписано»)

    /// Σ of UNPOSTED planned-row amounts — the «Расписано» ladder level.
    ///
    /// A row counts when BOTH hold:
    ///   - `postedTxnId == nil` (not yet realised into a fact), AND
    ///   - `source != .subscriptionAuto` (anti-double-count — subscription
    ///     charges are projected separately).
    /// Pass `kind` to keep the sum in lock-step with an expense-scoped ladder.
    /// Mirrors web `plannedUnpostedTotal` (computeHomeData.ts).
    static func plannedUnpostedTotal(
        _ planned: [PlannedDTO],
        kind: CategoryKind? = nil
    ) -> Int {
        var sum = 0
        for p in planned {
            if p.postedTxnId != nil { continue }
            if p.source == .subscriptionAuto { continue }
            if let kind, p.kind != kind { continue }
            sum += Swift.abs(p.amountCents)
        }
        return sum
    }
}
