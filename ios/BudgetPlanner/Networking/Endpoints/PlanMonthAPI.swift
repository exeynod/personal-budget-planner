// Phase 26-05 Task 1: PlanMonthAPI — typed wrapper for `PATCH /api/v1/plan-month`
// (Phase 26-01 backend, BE-08 atomic batch endpoint). Single endpoint applies
// every category's `plan_cents` in one DB transaction with server-side Σplan ≤
// User.income_cents validation (when income is configured).
//
// Why single PATCH (not per-category): the must-have T-P-06 demands an atomic
// "СОХРАНИТЬ" save — if user moves 3 sliders and presses Save, all 3 land or
// none. The server's `update_plan_month_atomic` (Phase 26-01) rejects the
// entire batch on first overflow / missing-id error.
//
// Error contract (Phase 26-01 SUMMARY):
//   - 400 plan_overflow: detail = `{error, income_cents, sum_plan_cents}` →
//     VM shows inline «Σplan превышает доход — уменьшите лимиты».
//   - 404 missing/cross-tenant category: shouldn't happen if VM seeds plans
//     from `CategoriesV10API.list()` response; surfaced as generic save error.
//   - 422 negative cents / empty list / duplicate id: client-side guards
//     should prevent these; server-side fail-closed.

import Foundation

/// One item in the atomic plan-month batch.
struct PlanMonthItem: Encodable, Equatable {
    let categoryId: Int
    let planCents: Int
}

/// Response shape — full updated category list (caller can replace local copy).
struct PlanMonthResponseDTO: Decodable {
    let categories: [CategoryV10DTO]
}

/// Request body wrapper.
struct PlanMonthPatchBody: Encodable {
    let plans: [PlanMonthItem]
}

@MainActor
enum PlanMonthAPI {
    /// PATCH /api/v1/plan-month — atomic batch plan-cents update.
    ///
    /// Returns the full refreshed category list (Phase 26-01 service
    /// `update_plan_month_atomic` returns the mutated rows with all
    /// fields, not just `plan_cents`). Throws `APIError.serverError(400, ...)`
    /// on plan_overflow — VM should catch and surface inline error.
    static func patch(plans: [PlanMonthItem]) async throws -> [CategoryV10DTO] {
        let body = PlanMonthPatchBody(plans: plans)
        let response: PlanMonthResponseDTO = try await APIClient.shared.request(
            "PATCH", "/plan-month", body: body
        )
        return response.categories
    }
}
