// Phase 64-02 (AI-V10-03) — typed wrapper for `GET /api/v1/ai/suggest-category?q=`.
//
// Backend: app/api/routes/ai_suggest.py — require_pro gated; returns
// { category_id: Int?, name: String?, confidence: Double }. The server already
// filters confidence < 0.35 → nulls category_id/name, so the editor shows a chip
// only when categoryId != nil.
//
// Silent contract: the suggest hint is auxiliary, not a critical path. Any
// thrown failure returns nil — no error, no banner. require_pro returns 402
// (PRO_TIER_REQUIRED), which APIClient maps to serverError → caught here → nil
// (hint silently hidden for a non-pro caller). 404 (AI disabled) / network /
// decoding errors are likewise swallowed to nil.
//
// P0-3 (T-67-03-01): there is NO 403 suppression here anymore. The old
// per-call 403-suppress flag was removed app-wide — it guarded a 403 that
// require_pro never returns (it returns 402) while masking real 403s. A genuine
// 401/403 auth failure on this endpoint now logs the owner out globally via
// APIClient.onUnauthenticated — correct, because the owner token is broken.

import Foundation

/// Response of `GET /api/v1/ai/suggest-category`.
/// `categoryId`/`name` are nil when the backend confidence is below its 0.35
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
    /// Returns nil on ANY error (402 require_pro / 404 / network / decoding).
    /// The caller guarantees `q.count >= 3` (backend min_length=3); the debounce
    /// helper never sends shorter queries.
    static func suggest(q: String) async -> SuggestCategoryDTO? {
        do {
            let dto: SuggestCategoryDTO = try await APIClient.shared.request(
                "GET", "/ai/suggest-category",
                query: ["q": q])
            return dto
        } catch {
            // Silent: 402 (non-pro require_pro → serverError) / 404 (AI off) /
            // network / decoding → nil. P0-3: there is no 403 suppression here;
            // a genuine 401/403 auth failure is intentionally NOT caught for
            // logout purposes — APIClient.onUnauthenticated already fired before
            // the throw, so a broken owner token correctly logs out globally.
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
