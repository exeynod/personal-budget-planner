// Phase 27-11 Task 2: AccessV10ViewModel — owns the parallel fetch of
// /admin/users + /admin/ai-usage for AccessV10View.
//
// Symmetric to web Plan 27-06 AccessMount.tsx. Catches 403 ApiError
// and surfaces the friendly «Только для владельца» banner instead of
// raw error text (T-27-11-01 / -04 — backend require_owner already
// gates the routes; we just render a nicer message).
//
// Tab state (.users / .aiUsage) is purely local to the VM; switching
// tabs does NOT re-fetch — both lists are loaded once on first appear.

import Foundation
import Observation

@MainActor
@Observable
final class AccessV10ViewModel {
    enum Tab: String, CaseIterable, Equatable {
        case users
        case aiUsage
    }

    enum LoadStatus: Equatable {
        case idle
        case loading
        case ready
        case forbidden  // 403 — non-owner reached the screen
        case error(String)
    }

    // MARK: - Public state

    private(set) var status: LoadStatus = .idle
    private(set) var users: [AdminUserDTO] = []
    private(set) var aiUsage: [AdminAiUsageRowDTO] = []
    var activeTab: Tab = .users

    // MARK: - Private

    private var inFlight: Bool = false

    // MARK: - Loading

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }
        status = .loading
        do {
            async let usersCall: [AdminUserDTO] = AdminAPI.users()
            async let usageCall: AdminAiUsageEnvelopeDTO = AdminAPI.aiUsage()
            let u = try await usersCall
            let usage = try await usageCall
            users = u
            aiUsage = usage.users
            status = .ready
        } catch let api as APIError {
            // Translate 401/403 → friendly «forbidden» state; other
            // errors → generic error string.
            switch api {
            case .forbidden, .unauthorized:
                status = .forbidden
            default:
                status = .error("Не удалось загрузить доступ")
            }
        } catch {
            status = .error("Не удалось загрузить доступ")
        }
    }
}
