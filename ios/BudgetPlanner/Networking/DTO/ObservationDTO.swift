// Phase 27-07 Task 1 (RED stub): AI Observation DTO. Real impl in GREEN.
import Foundation

struct ObservationDTO: Decodable, Equatable {
    let text: String
    let generatedAt: Date
}
