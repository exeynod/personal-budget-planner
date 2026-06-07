// Phase 27-11 Task 1: MgmtHubViewModel — owner-gate state for the
// Management hub.
//
// Symmetric to web Plan 27-06 MgmtHubMount.tsx logic:
//   - default isOwner = false (fail-closed; T-27-11-01 mitigation —
//     defence-in-depth atop the backend require_owner FastAPI dep)
//   - load() fetches /me via MeV10API.shared and flips isOwner to true
//     ONLY when the call succeeds AND returns role == "owner"
//   - any error path leaves isOwner = false (silent — UI just hides
//     the «05 ДОСТУП» row)
//   - in-flight guard so two concurrent .task triggers coalesce
//
// Pure ViewModel — no SwiftUI. SwiftUI smoke tests are deferred to
// Phase 28 acceptance per project policy; logic is tested via
// MgmtHubTests.

import Foundation
import Observation

@MainActor
@Observable
final class MgmtHubViewModel {
    /// Whether the current user is the workspace owner. Drives the
    /// «05 ДОСТУП» row visibility in MgmtHubView. Defaults to false so
    /// the row is hidden until /me resolves with role == "owner".
    private(set) var isOwner: Bool = false

    /// Re-entrance guard. SwiftUI may invoke `.task` repeatedly when
    /// the view appears + state changes; we coalesce concurrent calls
    /// so the underlying /me hit fires at most once at a time.
    private var inFlight: Bool = false

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }
        do {
            let me = try await MeV10API.shared.fetchMeV10()
            isOwner = (me.role == "owner")
        } catch {
            // Fail-closed: keep isOwner = false so the «05 ДОСТУП» row
            // stays hidden. The backend admin/* routes already require
            // owner role, so the worst case (a member somehow reaches
            // AccessV10View) is a 403 banner — not data leakage.
            isOwner = false
        }
    }
}
