// Phase 27-07 Task 1 — typed wrapper for `GET /api/v1/ai/observation`.
//
// Backend: Phase 27-01 added a separate `observation_router` (no LLM USD-cap
// gate) — pure-Python rule-engine returning one short Russian sentence
// describing the user's current financial state. Server caches 1h per user.
//
// Used by AiV10ViewModel.loadObservation() to populate the V10 AI screen
// initial-state observation block.

import Foundation

@MainActor
enum AIObservationAPI {
    /// GET /api/v1/ai/observation
    static func fetch() async throws -> ObservationDTO {
        try await APIClient.shared.request("GET", "/ai/observation")
    }
}
