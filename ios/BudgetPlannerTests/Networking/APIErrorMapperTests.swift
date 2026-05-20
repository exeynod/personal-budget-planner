import XCTest

@testable import BudgetPlanner

/// Phase 67 Plan 05 (P1-3 / R1) — unit tests for the `APIError → fixed Russian
/// copy` mapper that replaces the `error.localizedDescription` UI-leak cluster.
///
/// The mapper MUST return fixed RU strings and MUST NOT surface server-supplied
/// detail text (the `.forbidden`/`.conflict`/`.unprocessable`/`.serverError`
/// embedded strings) into the user-facing copy — that is the information-leak
/// the cluster fix closes (T-67-05-01 / IN-01).
final class APIErrorMapperTests: XCTestCase {

    func test_unauthorized_mapsToSessionExpired() {
        XCTAssertEqual(APIError.unauthorized.userFacingRu, "Сессия истекла, войдите снова")
    }

    func test_network_mapsToNoConnection() {
        let err = APIError.network(URLError(.notConnectedToInternet))
        XCTAssertEqual(err.userFacingRu, "Нет связи с сервером")
    }

    func test_notFound_mapsToNotFound() {
        XCTAssertEqual(APIError.notFound.userFacingRu, "Не найдено")
    }

    func test_rateLimited_mapsToTooOften() {
        XCTAssertEqual(APIError.rateLimited(retryAfter: 30).userFacingRu, "Слишком часто, попробуйте позже")
    }

    func test_serverError_mapsToGeneric_andHidesDetail() {
        let err = APIError.serverError(500, "stacktrace: secret internal detail")
        XCTAssertEqual(err.userFacingRu, "Что-то пошло не так")
        XCTAssertFalse(err.userFacingRu.contains("secret"))
    }

    func test_decoding_mapsToGeneric() {
        let err = APIError.decoding(URLError(.cannotParseResponse))
        XCTAssertEqual(err.userFacingRu, "Что-то пошло не так")
    }

    func test_invalidURL_mapsToGeneric() {
        XCTAssertEqual(APIError.invalidURL.userFacingRu, "Что-то пошло не так")
    }

    func test_invalidResponse_mapsToGeneric() {
        XCTAssertEqual(APIError.invalidResponse.userFacingRu, "Что-то пошло не так")
    }

    func test_forbidden_doesNotSurfaceServerDetail() {
        let err = APIError.forbidden("internal owner-token rejected detail")
        XCTAssertFalse(err.userFacingRu.contains("internal"))
        XCTAssertFalse(err.userFacingRu.contains("owner-token"))
        XCTAssertFalse(err.userFacingRu.isEmpty)
    }

    func test_conflict_doesNotSurfaceServerDetail() {
        let err = APIError.conflict("duplicate row id=4827 internal")
        XCTAssertFalse(err.userFacingRu.contains("4827"))
        XCTAssertFalse(err.userFacingRu.contains("internal"))
        XCTAssertFalse(err.userFacingRu.isEmpty)
    }

    func test_unprocessable_doesNotSurfaceServerDetail() {
        let err = APIError.unprocessable("field amount_cents must be > 0 internal")
        XCTAssertFalse(err.userFacingRu.contains("amount_cents"))
        XCTAssertFalse(err.userFacingRu.contains("internal"))
        XCTAssertFalse(err.userFacingRu.isEmpty)
    }

    // MARK: - Error-extension helper (arbitrary Error → RU)

    func test_helper_apiError_routesThroughUserFacingRu() {
        let err: Error = APIError.notFound
        XCTAssertEqual(err.userFacingRu, "Не найдено")
    }

    func test_helper_nonAPIError_mapsToGeneric() {
        struct CustomError: Error { let secret = "should-never-surface" }
        let err: Error = CustomError()
        XCTAssertEqual(err.userFacingRu, "Что-то пошло не так")
        XCTAssertFalse(err.userFacingRu.contains("secret"))
    }
}
