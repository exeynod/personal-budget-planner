import XCTest

@testable import BudgetPlanner

/// Phase 71 (P0 fix) — regression test for the AI chat SSE URL construction.
///
/// The chat stream URL was previously built by string concatenation
/// (`baseURL.absoluteString + "api/v1/ai/chat"`). Because `APIClient.baseURL`
/// has NO trailing slash (default `http://localhost:8000`, env
/// `BACKEND_URL=http://host:8000`), the result was `http://host:8000api/v1/ai/chat`
/// — the `/` between the port and `api` was missing, so the request never
/// reached the backend and the chat surfaced a generic «⚠️ Ошибка».
///
/// `AIChatAPI.chatURL(base:)` now uses `appendingPathComponent`, mirroring how
/// `APIClient` builds REST URLs. These tests assert the URL is exactly
/// `http://<host>/api/v1/ai/chat` whether or not `base` carries a trailing
/// slash — and never the `:8000api` mashup.
@MainActor
final class SSEChatURLTests: XCTestCase {

    func test_chatURL_noTrailingSlash_buildsCorrectPath() {
        // The real production case: BACKEND_URL with no trailing slash.
        let base = URL(string: "http://192.168.31.117:8000")!
        let url = AIChatAPI.chatURL(base: base)
        XCTAssertEqual(url.absoluteString, "http://192.168.31.117:8000/api/v1/ai/chat")
    }

    func test_chatURL_withTrailingSlash_buildsCorrectPath() {
        let base = URL(string: "http://192.168.31.117:8000/")!
        let url = AIChatAPI.chatURL(base: base)
        XCTAssertEqual(url.absoluteString, "http://192.168.31.117:8000/api/v1/ai/chat")
    }

    func test_chatURL_localhostDefault_buildsCorrectPath() {
        let base = URL(string: "http://localhost:8000")!
        let url = AIChatAPI.chatURL(base: base)
        XCTAssertEqual(url.absoluteString, "http://localhost:8000/api/v1/ai/chat")
    }

    func test_chatURL_neverProducesPortMashup() {
        for raw in ["http://192.168.31.117:8000", "http://192.168.31.117:8000/", "http://localhost:8000"] {
            let url = AIChatAPI.chatURL(base: URL(string: raw)!)
            XCTAssertFalse(
                url.absoluteString.contains("8000api"),
                "URL must not mash the port into the path: \(url.absoluteString)"
            )
            XCTAssertEqual(url.path, "/api/v1/ai/chat")
        }
    }
}
