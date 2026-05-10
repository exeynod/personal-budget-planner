// Phase 27-08 Task 1 (GREEN): typed wrappers for /api/v1/goals (BE-11).
//
// Symmetric to web Plan 27-03 `frontend/src/api/v10/goals.ts`.
//
// Endpoints:
//   - GET    /api/v1/goals       → [GoalDTO]
//   - POST   /api/v1/goals       → GoalDTO
//   - DELETE /api/v1/goals/{id}  → 204 (No Content)
//
// `delete` uses `requestVoid` to avoid trying to decode a 204 body.

import Foundation

@MainActor
enum GoalsAPI {

    /// GET /api/v1/goals — list user's goals.
    static func list() async throws -> [GoalDTO] {
        try await APIClient.shared.request("GET", "/goals")
    }

    /// POST /api/v1/goals — create a new goal. Returns the persisted row.
    /// Backend rejects past `due` dates (T-22-12-07) with 422.
    static func create(_ req: GoalCreateRequest) async throws -> GoalDTO {
        try await APIClient.shared.request("POST", "/goals", body: req)
    }

    /// DELETE /api/v1/goals/{id} — 204 on success, 404 if missing.
    /// Wired into the API for completeness; UI delete affordance lands
    /// in Phase 28 polish (per web Plan 27-03 «Known Stubs»).
    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/goals/\(id)")
    }
}
