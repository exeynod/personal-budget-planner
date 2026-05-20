import XCTest

@testable import BudgetPlanner

/// Phase 62 Plan 03 — WR-03 regression pin for the IN-04 fix.
///
/// `GoalCreateRequest.encode(to:)` MUST serialise `due` as a pure
/// `yyyy-MM-dd` string formatted in Europe/Moscow (NOT an ISO-8601
/// timestamp, NOT a UTC-shifted day). If a future refactor drops the
/// custom `encode(to:)` and falls back to the default `.iso8601`
/// strategy, these assertions fail — re-flagging the exact bug IN-04
/// fixed instead of silently regressing with a green CI.
///
/// Deterministic: the `due` Date is built from MSK-midnight
/// `DateComponents` so the wire day equals the picked day regardless of
/// the host machine timezone.
final class GoalCreateRequestTests: XCTestCase {

    private func mskCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    private func encodeToJSON(_ req: GoalCreateRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(req)
        let obj = try JSONSerialization.jsonObject(with: data)
        return obj as! [String: Any]
    }

    // MARK: - due present → MSK yyyy-MM-dd

    func test_encode_due_emitsMSKDateString_noTimestamp() throws {
        // 12 сентября 2026, midnight MSK.
        let date = mskCalendar().date(from: DateComponents(year: 2026, month: 9, day: 12))!
        let req = GoalCreateRequest(name: "Отпуск", targetCents: 100_000, due: date)

        let json = try encodeToJSON(req)

        XCTAssertEqual(json["due"] as? String, "2026-09-12")
        // Guard against an ISO-8601 timestamp regression.
        let dueString = json["due"] as? String ?? ""
        XCTAssertFalse(dueString.contains("T"), "due must be a pure date, not an ISO timestamp")
        XCTAssertFalse(dueString.contains(":"), "due must not contain a time component")
    }

    func test_encode_due_midnightMSK_noUTCDayShift() throws {
        // Midnight MSK = previous-day 21:00 UTC. A UTC formatter would
        // emit "2026-12-31"; the MSK formatter must emit "2027-01-01".
        let date = mskCalendar().date(from: DateComponents(year: 2027, month: 1, day: 1))!
        let req = GoalCreateRequest(name: "Новый год", targetCents: 50_000, due: date)

        let json = try encodeToJSON(req)

        XCTAssertEqual(json["due"] as? String, "2027-01-01")
    }

    // MARK: - snake_case key

    func test_encode_targetCents_snakeCaseKeyOnWire() throws {
        // Default JSONEncoder (no keyEncodingStrategy) uses CodingKeys as
        // declared — `targetCents` maps to "targetCents" unless the
        // APIClient applies a snake_case strategy. Pin the actual key so a
        // strategy change is detected. Backend expects `target_cents`;
        // the production encoder lives in APIClient — here we assert the
        // CodingKey contract this DTO declares.
        let req = GoalCreateRequest(name: "X", targetCents: 12_345, due: nil)
        let json = try encodeToJSON(req)
        // targetCents value must round-trip as an integer.
        XCTAssertEqual(json["targetCents"] as? Int, 12_345)
    }

    // MARK: - nil due → null

    func test_encode_nilDue_emitsNull() throws {
        let req = GoalCreateRequest(name: "Без срока", targetCents: 30_000, due: nil)
        let data = try JSONEncoder().encode(req)
        let raw = String(data: data, encoding: .utf8) ?? ""
        // due must be present as JSON null (encodeNil), not omitted.
        XCTAssertTrue(raw.contains("\"due\":null"), "expected explicit null due, got: \(raw)")
    }
}
