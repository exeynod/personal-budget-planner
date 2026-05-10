// Phase 27-07 Task 1 (RED stub): AI observation endpoint wrapper. Real impl in GREEN.
import Foundation

@MainActor
enum AIObservationAPI {
    static func fetch() async throws -> ObservationDTO {
        // Stub — will throw via APIClient in GREEN; for RED tests do not call this.
        throw APIError.invalidURL
    }
}
