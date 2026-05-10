// Phase 26-07 Task 1: V10 typed wrappers for the /api/v1/subscriptions surface.
//
// Symmetric to web `frontend/src/api/v10/subscriptions.ts` (Plan 26-05).
//
// The legacy `SubscriptionsAPI` (ManagementAPI.swift) backs v0.x screens and
// uses the legacy DTO shape. This v1.0 enum returns `SubscriptionV10DTO` which
// adds the day-of-month / account_id / posted_txn_id fields the v1.0 router
// merge (Plan 26-05) layers on top of the base `SubscriptionRead`.
//
// Routes wrapped:
//   GET    /api/v1/subscriptions              → [SubscriptionV10DTO]
//   POST   /api/v1/subscriptions/{id}/post    → SubscriptionPostResponseDTO
//   POST   /api/v1/subscriptions/{id}/unpost  → 200 (no body)
//   PATCH  /api/v1/subscriptions/{id}         → SubscriptionV10DTO
//   DELETE /api/v1/subscriptions/{id}         → 204
//
// Threat-model T-26-07-04 (Information Disclosure: cross-tenant sub):
// listSubscriptionsV10 is RLS-protected at the backend (router-level
// `Depends(get_current_user)` + tenant scope). 404 collapses to "not found"
// without distinguishing missing vs cross-tenant.

import Foundation

@MainActor
enum SubscriptionsV10API {
    static func list() async throws -> [SubscriptionV10DTO] {
        try await APIClient.shared.request("GET", "/subscriptions")
    }

    static func post(id: Int) async throws -> SubscriptionPostResponseDTO {
        try await APIClient.shared.request("POST", "/subscriptions/\(id)/post")
    }

    static func unpost(id: Int) async throws {
        try await APIClient.shared.requestVoid("POST", "/subscriptions/\(id)/unpost")
    }

    static func patch(id: Int, payload: SubscriptionV10UpdateRequest) async throws
    -> SubscriptionV10DTO {
        try await APIClient.shared.request("PATCH", "/subscriptions/\(id)", body: payload)
    }

    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/subscriptions/\(id)")
    }
}
