// Phase 27-07 Task 1 (RED): unit specs for AiData pure compute helpers
// + ObservationDTO JSON-decode round-trip.
//
// Symmetric to web Plan 27-02 `__tests__/computeAi.test.ts` (8 cases).
// Helpers stateless on `enum AiData`.
//
// 8 cases:
//   - todayRu (4 — Jan / May / Dec / leap-Feb29)
//   - DEFAULT_SUGGESTION_CHIPS shape (count==4 + non-empty)
//   - MONTHS_RU_GEN shape (count==12)
//   - ObservationDTO round-trip decode (snake_case → camelCase + ISO date)
//   - ObservationDTO decode without text → throws

import XCTest
@testable import BudgetPlanner

final class AiDataTests: XCTestCase {

    // MARK: - todayRu

    private func makeDate(year: Int, month: Int, day: Int) -> Date {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        var comps = DateComponents()
        comps.year = year; comps.month = month; comps.day = day
        return c.date(from: comps)!
    }

    private var moscowCalendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    func test_todayRu_january_first() {
        let d = makeDate(year: 2026, month: 1, day: 1)
        XCTAssertEqual(AiData.todayRu(d, calendar: moscowCalendar), "1 января")
    }

    func test_todayRu_may_ninth() {
        let d = makeDate(year: 2026, month: 5, day: 9)
        XCTAssertEqual(AiData.todayRu(d, calendar: moscowCalendar), "9 мая")
    }

    func test_todayRu_december_thirty_first() {
        let d = makeDate(year: 2026, month: 12, day: 31)
        XCTAssertEqual(AiData.todayRu(d, calendar: moscowCalendar), "31 декабря")
    }

    func test_todayRu_leap_feb29() {
        let d = makeDate(year: 2024, month: 2, day: 29)
        XCTAssertEqual(AiData.todayRu(d, calendar: moscowCalendar), "29 февраля")
    }

    // MARK: - DEFAULT_SUGGESTION_CHIPS

    func test_default_suggestion_chips_count_is_4() {
        XCTAssertEqual(AiData.DEFAULT_SUGGESTION_CHIPS.count, 4)
    }

    func test_default_suggestion_chips_all_nonempty() {
        for chip in AiData.DEFAULT_SUGGESTION_CHIPS {
            XCTAssertFalse(chip.isEmpty)
        }
    }

    // MARK: - MONTHS_RU_GEN

    func test_months_ru_gen_has_12_entries() {
        XCTAssertEqual(AiData.MONTHS_RU_GEN.count, 12)
        XCTAssertEqual(AiData.MONTHS_RU_GEN[0], "января")
        XCTAssertEqual(AiData.MONTHS_RU_GEN[4], "мая")
        XCTAssertEqual(AiData.MONTHS_RU_GEN[11], "декабря")
    }

    // MARK: - ObservationDTO round-trip

    func test_observation_dto_decodes_snake_case_and_iso_date() throws {
        let json = """
        {
          "text": "Кафе уже +12% к лимиту",
          "generated_at": "2026-05-09T10:30:00Z"
        }
        """.data(using: .utf8)!

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        dec.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let d = f.date(from: s) { return d }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "bad date \(s)")
        }

        let dto = try dec.decode(ObservationDTO.self, from: json)
        XCTAssertEqual(dto.text, "Кафе уже +12% к лимиту")
        // Sanity: generatedAt is parsed (don't assert exact instant — we just
        // care that the field decodes via snake-case → camelCase mapping).
        XCTAssertGreaterThan(dto.generatedAt.timeIntervalSince1970, 0)
    }

    func test_observation_dto_decode_missing_text_throws() {
        let json = """
        {
          "generated_at": "2026-05-09T10:30:00Z"
        }
        """.data(using: .utf8)!

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .iso8601

        XCTAssertThrowsError(try dec.decode(ObservationDTO.self, from: json))
    }
}
