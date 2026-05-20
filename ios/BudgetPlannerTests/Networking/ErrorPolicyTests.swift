import XCTest

@testable import BudgetPlanner

/// Phase 70 Plan 03 (E1 / R7) — pins the DEFAULT `ErrorHandling` policy's
/// status → (domain error, logout) matrix. This is the unit-level half of the
/// regression gate; the live-client half lives in `APIClientForbiddenTests`
/// (unmodified) + the 402-no-logout case below.
///
/// 429 is intentionally ABSENT: it is owned by `APIClient` upstream (it needs
/// the `Retry-After` header off the `HTTPURLResponse` the policy never sees).
/// Asserting 429 here would be testing a path the policy does not handle.
final class ErrorPolicyTests: XCTestCase {

    private let detailData = Data(#"{"detail":"boom"}"#.utf8)
    private let emptyData = Data()

    /// Mirror of `APIClient.decodeErrorDetail` for the policy under test.
    private func decodeDetail(_ data: Data) -> String? {
        guard let body = try? JSONDecoder().decode(APIErrorBody.self, from: data) else {
            return String(data: data, encoding: .utf8)
        }
        return body.detail.stringValue
    }

    private func map(_ status: Int, _ data: Data, skipAuth: Bool) -> ErrorDecision {
        ErrorHandling.default.map(status, data, skipAuth, decodeDetail)
    }

    // MARK: 2xx

    func test_2xx_isSuccess() {
        XCTAssertEqual(map(200, emptyData, skipAuth: false), .success)
        XCTAssertEqual(map(204, emptyData, skipAuth: false), .success)
        XCTAssertEqual(map(299, emptyData, skipAuth: true), .success)
    }

    // MARK: 401 — ALWAYS logout (WR-02)

    func test_401_alwaysLogout_regardlessOfSkipAuth() {
        XCTAssertEqual(map(401, emptyData, skipAuth: false), .fail(.unauthorized, logout: true))
        XCTAssertEqual(map(401, emptyData, skipAuth: true), .fail(.unauthorized, logout: true))
    }

    // MARK: 403 — logout iff !skipAuth (67-03)

    func test_403_notSkipAuth_logsOut() {
        XCTAssertEqual(
            map(403, detailData, skipAuth: false),
            .fail(.forbidden("boom"), logout: true))
    }

    func test_403_skipAuth_doesNotLogOut() {
        XCTAssertEqual(
            map(403, detailData, skipAuth: true),
            .fail(.forbidden("boom"), logout: false))
    }

    // MARK: 402 require_pro — NO logout (67-05)

    func test_402_requirePro_serverError_noLogout() {
        // 402 falls into `default` → serverError(402), NO logout regardless of
        // skipAuth. This is the silent-nil contract AISuggest depends on.
        XCTAssertEqual(
            map(402, detailData, skipAuth: false),
            .fail(.serverError(402, "boom"), logout: false))
        XCTAssertEqual(
            map(402, detailData, skipAuth: true),
            .fail(.serverError(402, "boom"), logout: false))
    }

    // MARK: 404 / 409 / 422 — no logout

    func test_404_notFound_noLogout() {
        XCTAssertEqual(map(404, emptyData, skipAuth: false), .fail(.notFound, logout: false))
    }

    func test_409_conflict_noLogout() {
        XCTAssertEqual(
            map(409, detailData, skipAuth: false),
            .fail(.conflict("boom"), logout: false))
    }

    func test_422_unprocessable_noLogout() {
        XCTAssertEqual(
            map(422, detailData, skipAuth: false),
            .fail(.unprocessable("boom"), logout: false))
    }

    // MARK: default branch — serverError, no logout

    func test_500_serverError_noLogout() {
        XCTAssertEqual(
            map(500, detailData, skipAuth: false),
            .fail(.serverError(500, "boom"), logout: false))
    }

    // MARK: composable tolerating(_:) — illustrative, non-logout empty signal

    func test_tolerating_treatsListedStatusAsNonLogout() {
        let policy = ErrorHandling.tolerating([404])
        XCTAssertEqual(
            policy.map(404, emptyData, false, decodeDetail),
            .fail(.notFound, logout: false))
        // Non-tolerated status still defers to the default matrix (401 logout).
        XCTAssertEqual(
            policy.map(401, emptyData, false, decodeDetail),
            .fail(.unauthorized, logout: true))
    }
}
