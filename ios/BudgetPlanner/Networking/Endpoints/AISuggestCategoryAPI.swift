// Phase 64-02 (AI-V10-03) — typed wrapper for `GET /api/v1/ai/suggest-category?q=`.
//
// Backend: app/api/routes/ai_suggest.py — require_pro gated; returns
// { category_id: Int?, name: String?, confidence: Double }. The server already
// filters confidence < 0.5 → nulls category_id/name, so the editor shows a chip
// only when categoryId != nil.
//
// Silent contract: the suggest hint is auxiliary, not a critical path. Any
// failure (403 require_pro for a non-pro caller, 404 AI disabled, network,
// decoding) returns nil — no thrown error, no error banner.
//
// CRITICAL (T-64-02-02): the request passes `suppressForbiddenHandler: true` so
// a 403 from require_pro does NOT trigger APIClient.onUnauthenticated → global
// logout. Without this flag a non-pro 403 would log the owner out. WR-02: this
// suppression is 403-only; a genuine 401 expired-token here still logs out.

import Foundation

/// Response of `GET /api/v1/ai/suggest-category`.
/// `categoryId`/`name` are nil when the backend confidence is below its 0.5
/// threshold; the chip is only shown when `categoryId != nil`.
struct SuggestCategoryDTO: Decodable {
    let categoryId: Int?
    let name: String?
    let confidence: Double
}

@MainActor
enum AISuggestCategoryAPI {
    /// GET /api/v1/ai/suggest-category?q=<description>
    ///
    /// Non-throwing by design — the silent contract lives in the signature.
    /// Returns nil on ANY error (403/404/network/decoding). The caller
    /// guarantees `q.count >= 3` (backend min_length=3); the debounce helper
    /// never sends shorter queries.
    static func suggest(q: String) async -> SuggestCategoryDTO? {
        do {
            let dto: SuggestCategoryDTO = try await APIClient.shared.request(
                "GET", "/ai/suggest-category",
                query: ["q": q],
                suppressForbiddenHandler: true)
            return dto
        } catch {
            // Silent: 403 (non-pro) / 404 (AI off) / network / decoding → nil.
            // NOTE: suppressForbiddenHandler:true above means a 403 never reached
            // onUnauthenticated, so the owner is NOT logged out here. A real 401
            // is NOT suppressed and still triggers the global logout (WR-02).
            // IN-01: do NOT interpolate the raw error — a networking error can
            // embed the request URL with the `q=` description (PII). Log only a
            // static category in DEBUG; nothing in release.
            #if DEBUG
            print("AISuggest silent fail (\(type(of: error)))")
            #endif
            return nil
        }
    }
}
