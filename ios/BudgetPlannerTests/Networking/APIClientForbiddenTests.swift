import XCTest

@testable import BudgetPlanner

/// Phase 67 Plan 07 (P1-7 / QA-F3) — regression lock for `APIClient` auth
/// semantics finalised in 67-03:
///   - 401 → `onUnauthenticated` fires + `.unauthorized` thrown (always logout).
///   - 403 with `!skipAuth` → `onUnauthenticated` fires + `.forbidden` thrown
///     (strict logout, post-67-03 — no per-call suppression).
///   - 403 with `skipAuth == true` → `onUnauthenticated` does NOT fire.
///
/// These pin app-wide auth behaviour so a silent regression in any screen
/// (e.g. re-introducing a suppress flag) is caught by CI. The stub injects via
/// `APIClient(baseURL:session:)` + a recording `onUnauthenticated` closure.
@MainActor
final class APIClientForbiddenTests: XCTestCase {

    override func setUp() {
        super.setUp()
        URLProtocolStub.reset()
    }

    override func tearDown() {
        URLProtocolStub.reset()
        super.tearDown()
    }

    private func makeClient() -> APIClient {
        APIClient(
            baseURL: URL(string: "http://stub.local")!,
            session: URLProtocolStub.makeSession())
    }

    func test_401_fires_onUnauthenticated_and_throws_unauthorized() async {
        URLProtocolStub.stub = .init(
            statusCode: 401,
            data: Data(#"{"detail":"Not authenticated"}"#.utf8),
            headers: ["Content-Type": "application/json"])

        let client = makeClient()
        var logoutCount = 0
        client.onUnauthenticated = { logoutCount += 1 }

        do {
            let _: GoalDTO = try await client.request("GET", "/goals/1")
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .unauthorized = error else {
                return XCTFail("expected .unauthorized, got \(error)")
            }
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertEqual(logoutCount, 1, "401 ВСЕГДА разлогинивает")
    }

    func test_403_notSkipAuth_fires_onUnauthenticated_and_throws_forbidden() async {
        URLProtocolStub.stub = .init(
            statusCode: 403,
            data: Data(#"{"detail":"Forbidden"}"#.utf8),
            headers: ["Content-Type": "application/json"])

        let client = makeClient()
        var logoutCount = 0
        client.onUnauthenticated = { logoutCount += 1 }

        do {
            let _: GoalDTO = try await client.request("GET", "/goals/1")
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .forbidden = error else {
                return XCTFail("expected .forbidden, got \(error)")
            }
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertEqual(logoutCount, 1, "403 (!skipAuth) строго разлогинивает (67-03)")
    }

    func test_403_skipAuth_does_not_fire_onUnauthenticated() async {
        URLProtocolStub.stub = .init(
            statusCode: 403,
            data: Data(#"{"detail":"Forbidden"}"#.utf8),
            headers: ["Content-Type": "application/json"])

        let client = makeClient()
        var logoutCount = 0
        client.onUnauthenticated = { logoutCount += 1 }

        do {
            let _: GoalDTO = try await client.request("GET", "/goals/1", skipAuth: true)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .forbidden = error else {
                return XCTFail("expected .forbidden, got \(error)")
            }
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
        XCTAssertEqual(logoutCount, 0, "skipAuth 403 НЕ разлогинивает (AI-path)")
    }

    func test_200_does_not_fire_onUnauthenticated() async {
        URLProtocolStub.stub = .init(
            statusCode: 200,
            data: Data(
                #"{"id":1,"name":"X","target_cents":100,"current_cents":0,"due":null,"created_at":"2026-01-01T00:00:00Z"}"#
                    .utf8),
            headers: ["Content-Type": "application/json"])

        let client = makeClient()
        var logoutCount = 0
        client.onUnauthenticated = { logoutCount += 1 }

        do {
            let goal: GoalDTO = try await client.request("GET", "/goals/1")
            XCTAssertEqual(goal.id, 1)
        } catch {
            XCTFail("unexpected error: \(error)")
        }
        XCTAssertEqual(logoutCount, 0, "успех не дёргает logout")
    }
}
