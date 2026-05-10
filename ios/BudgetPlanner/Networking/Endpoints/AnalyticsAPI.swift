// Phase 27-10 Task 1: AnalyticsV10API — typed wrapper for the v1.0
// Analytics endpoints. Parallel to the legacy `AnalyticsAPI` enum in
// `ManagementAPI.swift` (kept untouched so v0.6 `Features/Management/
// AnalyticsView.swift` does not regress).
//
// Backend wire-shape (verified in `app/api/routes/analytics.py` +
// `app/api/schemas/analytics.py`, Phase 8):
//
//   GET /api/v1/analytics/top-categories?range={1M|3M|6M|12M}
//     → TopCategoriesResponse{items: [TopCategoryItem]}
//
// **Plan vs reality (Rule 3 deviation, mirrors web Plan 27-05)**: the
// plan draft assumed the endpoint accepted `?period_start=...&
// period_end=...` query params. It does not — only `range`. We map the
// selected `MonthOption` to `range="1M"` (single most-recent period) and
// the per-period actuals/KPI delta is resolved client-side by joining
// `PeriodsAPI.list()` with the selected month — symmetric to web
// AnalyticsMount which uses `listPeriods()` + month-prefix match. The
// per-period top-categories query is a Phase 28 polish item.

import Foundation

@MainActor
enum AnalyticsV10API {
    /// `range` mirrors the backend Literal["1M","3M","6M","12M"].
    /// Default is `"1M"` (current month) since the iOS Analytics screen
    /// always renders one period at a time — the chip selection switches
    /// the per-period actuals/KPI fetch, but the top-categories endpoint
    /// only takes `range`.
    static func topCategories(range: String = "1M") async throws -> [TopCategoryItemDTO] {
        let response: TopCategoriesV10Response = try await APIClient.shared.request(
            "GET",
            "/analytics/top-categories",
            query: ["range": range]
        )
        return response.items
    }
}
