// Phase 27-07 Task 1 — Decodable mirror of `ObservationResponse`
// (`app/api/schemas/ai.py`, Phase 27-01).
//
// Round-trip JSON test in `BudgetPlannerTests/FeaturesV10/AiDataTests.swift`.
// Used by `AIObservationAPI.fetch()` (Phase 27-07).
//
// `APIClient.shared.decoder` uses `keyDecodingStrategy = .convertFromSnakeCase`
// so backend `generated_at` → Swift `generatedAt` automatically.

import Foundation

struct ObservationDTO: Decodable, Equatable {
    let text: String
    let generatedAt: Date
}
