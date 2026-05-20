import XCTest

@testable import BudgetPlanner

/// Phase 67 Plan 07 (P1-7 / QA-F4) — regression lock for the `APIClient`
/// production date decoder. The decoder is private, so we exercise it through a
/// real `request<T>` decode (URLProtocol stub returning JSON) — this pins the
/// EXACT decoder the app uses at every call-site, not a re-created copy.
///
/// What is locked:
///   - Bare `yyyy-MM-dd` (e.g. `due`) decodes to Europe/Moscow midnight (WR-05 /
///     IN-04): symmetric with `GoalCreateRequest.encode` which formats `due` in
///     MSK. A UTC drift here would shift fire-dates a day (T-67-07-03).
///   - ISO-8601 timestamps (`created_at`) — with and without fractional seconds
///     and with a `Z` zone — still parse (regression guard for other call-sites
///     that carry full timestamps).
@MainActor
final class APIClientDateDecodeTests: XCTestCase {

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

    private func decodeGoal(_ json: String) async throws -> GoalDTO {
        URLProtocolStub.stub = .init(
            statusCode: 200,
            data: Data(json.utf8),
            headers: ["Content-Type": "application/json"])
        return try await makeClient().request("GET", "/goals/1")
    }

    func test_bareDate_decodesAs_MSK_midnight() async throws {
        let json =
            #"{"id":1,"name":"X","target_cents":100,"current_cents":0,"due":"2027-01-01","created_at":"2026-01-01T00:00:00Z"}"#
        let goal = try await decodeGoal(json)

        // E2/R7: `due` is now a `BusinessDate`; bridge to its MSK-midnight
        // `.date` for the assertion. The MSK-midnight WR-05 contract is
        // UNCHANGED — BusinessDate self-decodes the bare yyyy-MM-dd to the
        // exact same instant the old decoder heuristic produced.
        let due = try XCTUnwrap(goal.due).date

        // 2027-01-01 00:00 MSK == 2026-12-31 21:00 UTC.
        var mskCal = Calendar(identifier: .gregorian)
        mskCal.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Moscow"))
        let comps = mskCal.dateComponents([.year, .month, .day, .hour, .minute], from: due)
        XCTAssertEqual(comps.year, 2027)
        XCTAssertEqual(comps.month, 1)
        XCTAssertEqual(comps.day, 1)
        XCTAssertEqual(comps.hour, 0, "yyyy-MM-dd пиннится к MSK-полуночи (WR-05)")
        XCTAssertEqual(comps.minute, 0)

        // Cross-check: same instant in UTC is the previous day at 21:00.
        var utcCal = Calendar(identifier: .gregorian)
        utcCal.timeZone = try XCTUnwrap(TimeZone(identifier: "UTC"))
        let utc = utcCal.dateComponents([.year, .month, .day, .hour], from: due)
        XCTAssertEqual(utc.year, 2026)
        XCTAssertEqual(utc.month, 12)
        XCTAssertEqual(utc.day, 31)
        XCTAssertEqual(utc.hour, 21, "MSK-полночь == 21:00 UTC предыдущего дня")
    }

    func test_timestamp_withZ_parses() async throws {
        let json =
            #"{"id":1,"name":"X","target_cents":100,"current_cents":0,"due":null,"created_at":"2026-05-20T12:30:00Z"}"#
        let goal = try await decodeGoal(json)
        XCTAssertEqual(goal.createdAt.timeIntervalSince1970, 1_779_280_200, accuracy: 1)
    }

    func test_timestamp_withFractionalSeconds_parses() async throws {
        let json =
            #"{"id":1,"name":"X","target_cents":100,"current_cents":0,"due":null,"created_at":"2026-05-20T12:30:00.123456Z"}"#
        let goal = try await decodeGoal(json)
        // Fractional-seconds variant must still parse (no throw); whole-second
        // anchor matches the non-fractional case.
        XCTAssertEqual(goal.createdAt.timeIntervalSince1970, 1_779_280_200, accuracy: 1)
    }

    func test_timestamp_withoutZone_parses() async throws {
        let json =
            #"{"id":1,"name":"X","target_cents":100,"current_cents":0,"due":null,"created_at":"2026-05-20T12:30:00"}"#
        let goal = try await decodeGoal(json)
        // No-zone fallback (DateFormatter без явной tz → device tz) must parse
        // without throwing — regression guard for legacy timestamp shapes.
        XCTAssertNotNil(goal.createdAt)
    }
}
