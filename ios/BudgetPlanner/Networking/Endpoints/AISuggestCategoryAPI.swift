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
// CRITICAL (T-64-02-02): the request passes `suppressUnauthHandler: true` so a
// 403 from require_pro does NOT trigger APIClient.onUnauthenticated → global
// logout. Without this flag a non-pro 403 would log the owner out.

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
                suppressUnauthHandler: true)
            return dto
        } catch {
            // Silent: 403 (non-pro) / 404 (AI off) / network / decoding → nil.
            // NOTE: suppressUnauthHandler:true above means a 403 never reached
            // onUnauthenticated, so the owner is NOT logged out here.
            print("AISuggest silent fail: \(error)")
            return nil
        }
    }
}
