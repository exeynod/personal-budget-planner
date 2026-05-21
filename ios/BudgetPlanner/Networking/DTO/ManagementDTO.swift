import Foundation

enum SubCycle: String, Codable, CaseIterable {
    case monthly
    case yearly
}

struct SubscriptionDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let amountCents: Int
    let cycle: SubCycle
    let nextChargeDate: BusinessDate
    let categoryId: Int
    let notifyDaysBefore: Int
    let isActive: Bool
    let category: CategoryDTO?
}

struct SubscriptionCreateRequest: Encodable {
    let name: String
    let amountCents: Int
    let cycle: String
    let nextChargeDate: String
    let categoryId: Int
    let notifyDaysBefore: Int
}

struct SubscriptionUpdateRequest: Encodable {
    let name: String?
    let amountCents: Int?
    let cycle: String?
    let nextChargeDate: String?
    let categoryId: Int?
    let notifyDaysBefore: Int?
    let isActive: Bool?
}

struct TemplateItemDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let amountCents: Int
    let kind: CategoryKind
    let categoryId: Int
    let sortOrder: Int
}

struct TemplateItemCreateRequest: Encodable {
    let name: String
    let amountCents: Int
    let kind: String
    let categoryId: Int
}

struct ApplyTemplateResponse: Decodable {
    let createdCount: Int
    let skippedCount: Int
}

// Phase 71: legacy v0.6 analytics DTOs realigned to the LIVE backend
// contract (`app/api/schemas/analytics.py`). The old shapes
// (`TopCategoriesResponse{categories,totalCents}` / a 4-field flat
// `ForecastResponse` / `TrendPoint{periodStart,…,actualExpenseCents}`)
// had drifted from the server and threw `keyNotFound("categories")`,
// breaking the v0.6 Управление → Аналитика screen on every range.
// All keys below match the real wire 1:1 via APIClient's global
// `convertFromSnakeCase` strategy.

/// One row of `GET /analytics/top-categories.items[]`.
/// Wire: `{category_id, name, actual_cents, planned_cents}`.
struct TopCategoryRow: Decodable, Identifiable {
    let categoryId: Int
    let name: String
    let actualCents: Int
    /// Optional so a future `null` (unplanned category) cannot throw.
    let plannedCents: Int?

    var id: Int { categoryId }

    /// Compat accessors for the v0.6 `AnalyticsView` (renders name + spend).
    var categoryName: String { name }
    var totalCents: Int { actualCents }
}

/// `GET /analytics/top-categories` → `{items: [...]}` (was `{categories}`).
struct TopCategoriesResponse: Decodable {
    let items: [TopCategoryRow]

    /// Compat accessor — v0.6 view iterates `.categories`.
    var categories: [TopCategoryRow] { items }
    /// Sum of all category actuals (derived; backend no longer sends it).
    var totalCents: Int { items.reduce(0) { $0 + $1.actualCents } }
}

/// `GET /analytics/forecast` — polymorphic card.
/// `mode` ∈ {forecast (1M), cashflow (3M+), empty}. All money fields are
/// optional because each mode populates a different subset.
struct ForecastResponse: Decodable {
    let mode: String

    // forecast (range=1M)
    let startingBalanceCents: Int?
    let plannedIncomeCents: Int?
    let plannedExpenseCents: Int?
    let projectedEndBalanceCents: Int?
    let periodEnd: String?

    // cashflow (range>=3M)
    let totalNetCents: Int?
    let monthlyAvgCents: Int?
    let periodsCount: Int?
    let requestedPeriods: Int?

    /// True when the backend has no data to compute a forecast.
    var isEmpty: Bool { mode == "empty" }
}

/// One point of `GET /analytics/trend.points[]`.
/// Wire: `{period_label, expense_cents, income_cents}`.
struct TrendPoint: Decodable, Identifiable {
    let periodLabel: String
    let expenseCents: Int
    let incomeCents: Int

    var id: String { periodLabel }
}

struct TrendResponse: Decodable {
    let points: [TrendPoint]
}
