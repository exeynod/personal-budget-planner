// Phase 27-10 Task 1: AnalyticsDTO — v1.0 wire-shape mirror of
// `app/api/schemas/analytics.py::TopCategoryItem`.
//
// Backend `/api/v1/analytics/top-categories` returns:
//   `{"items": [{"category_id": Int, "name": String,
//                "actual_cents": Int, "planned_cents": Int}]}`
//
// The legacy v0.6 wrapper (`Networking/Endpoints/ManagementAPI.swift`
// `enum AnalyticsAPI`) decodes into `TopCategoriesResponse{categories,
// totalCents}` whose item shape (`TopCategoryRow{categoryId,
// categoryName, totalCents, percentage}`) does NOT match the actual wire
// (drift from a long-removed schema variant). v0.6 is still consumed by
// `Features/Management/AnalyticsView.swift` so we deliberately leave it
// untouched — Phase 27 v1.0 features call the parallel `AnalyticsV10API`
// (this plan) which decodes into `TopCategoryItemDTO` with the correct
// snake_case → camelCase mapping (driven by the global decoder strategy
// `convertFromSnakeCase` in APIClient.shared).
//
// `pctOfPlan` is computed client-side (clamped 0..100) so the iOS Top-5
// list mirrors the web `fetchTopCategories` normalised shape (Plan 27-05,
// frontend/src/api/v10/analytics.ts) — symmetry decision documented there
// and in this plan's SUMMARY.

import Foundation

/// One row of `/analytics/top-categories.items[]` (Phase 27-10).
///
/// Decoded via APIClient's global `convertFromSnakeCase` strategy — wire
/// keys `category_id` / `actual_cents` / `planned_cents` map automatically
/// to `categoryId` / `sumCents` / `planCents` after we declare the
/// camelCase identifier on the wire field that has a different SEMANTIC
/// name (`actual_cents` → `sumCents`, `planned_cents` → `planCents`).
///
/// We use a custom CodingKeys enum so the SEMANTIC rename
/// (`actualCents` → `sumCents`) survives — the convertFromSnakeCase only
/// maps casing, not semantic aliases.
struct TopCategoryItemDTO: Decodable, Equatable, Identifiable {
    /// Backend `category_id`.
    let categoryId: Int
    /// Backend `name` — UI shows uppercase.
    let categoryName: String
    /// Backend `actual_cents` (sum spent in the period for this category).
    let sumCents: Int
    /// Backend `planned_cents` — nullable on the iOS side because the
    /// backend currently always emits an Int; we keep the optional so a
    /// future widening (e.g. `null` for unplanned categories) does not
    /// break decoding.
    let planCents: Int?
    /// Computed at decode time: `min(100, max(0, sum / plan * 100))`,
    /// or `nil` when plan ≤ 0 (T-27-10-03 guard).
    let pctOfPlan: Double?

    var id: Int { categoryId }

    private enum CodingKeys: String, CodingKey {
        // After convertFromSnakeCase: category_id → categoryId, name → name,
        // actual_cents → actualCents, planned_cents → plannedCents.
        case categoryId
        case name
        case actualCents
        case plannedCents
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let cid = try c.decode(Int.self, forKey: .categoryId)
        let name = try c.decode(String.self, forKey: .name)
        let actual = try c.decode(Int.self, forKey: .actualCents)
        let planned = try c.decodeIfPresent(Int.self, forKey: .plannedCents)

        self.categoryId = cid
        self.categoryName = name
        self.sumCents = actual
        self.planCents = planned

        // T-27-10-03: divide-by-zero / negative-plan guard.
        if let p = planned, p > 0 {
            let raw = Double(actual) / Double(p) * 100.0
            self.pctOfPlan = max(0.0, min(100.0, raw))
        } else {
            self.pctOfPlan = nil
        }
    }

    /// Memberwise initialiser used by tests / synthetic fixtures.
    init(
        categoryId: Int,
        categoryName: String,
        sumCents: Int,
        planCents: Int?,
        pctOfPlan: Double?
    ) {
        self.categoryId = categoryId
        self.categoryName = categoryName
        self.sumCents = sumCents
        self.planCents = planCents
        self.pctOfPlan = pctOfPlan
    }
}

/// Wrapper for `GET /analytics/top-categories` body — `{items: [...]}`.
struct TopCategoriesV10Response: Decodable, Equatable {
    let items: [TopCategoryItemDTO]
}
