import XCTest

@testable import BudgetPlanner

/// Phase 70 Plan 02 (E2 / R7) — `BusinessDate` is the wire `DATE` type carrying
/// MSK-midnight semantics as a property of the type (replacing the old
/// `APIClient` yyyy-MM-dd format heuristic). These lock the 5 behaviors the
/// retype relies on across both shells.
final class BusinessDateTests: XCTestCase {

    private func mskCal() throws -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Moscow"))
        return c
    }

    private func utcCal() throws -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = try XCTUnwrap(TimeZone(identifier: "UTC"))
        return c
    }

    private func decode(_ raw: String) throws -> BusinessDate {
        let json = Data("\"\(raw)\"".utf8)
        return try JSONDecoder().decode(BusinessDate.self, from: json)
    }

    // 1. Decoding "2027-01-01" yields MSK midnight (== 2026-12-31 21:00 UTC).
    func test_decode_yieldsMSKMidnight() throws {
        let bd = try decode("2027-01-01")

        let msk = try mskCal().dateComponents([.year, .month, .day, .hour, .minute], from: bd.date)
        XCTAssertEqual(msk.year, 2027)
        XCTAssertEqual(msk.month, 1)
        XCTAssertEqual(msk.day, 1)
        XCTAssertEqual(msk.hour, 0, "yyyy-MM-dd пиннится к MSK-полуночи (WR-05)")
        XCTAssertEqual(msk.minute, 0)

        let utc = try utcCal().dateComponents([.year, .month, .day, .hour], from: bd.date)
        XCTAssertEqual(utc.year, 2026)
        XCTAssertEqual(utc.month, 12)
        XCTAssertEqual(utc.day, 31)
        XCTAssertEqual(utc.hour, 21, "MSK-полночь == 21:00 UTC предыдущего дня")
    }

    // 2. Encoding emits the MSK "yyyy-MM-dd" string (round-trip symmetric).
    func test_encode_emitsMSKDateString() throws {
        let bd = try decode("2027-01-01")
        let data = try JSONEncoder().encode(bd)
        XCTAssertEqual(String(data: data, encoding: .utf8), "\"2027-01-01\"")
    }

    func test_roundTrip_isStable() throws {
        let original = try decode("2026-05-21")
        let data = try JSONEncoder().encode(original)
        let again = try JSONDecoder().decode(BusinessDate.self, from: data)
        XCTAssertEqual(original, again)
    }

    // 3. Comparable: sorts compile and order by calendar day.
    func test_comparable_ordersByDay() throws {
        let earlier = try decode("2026-05-20")
        let later = try decode("2026-05-21")
        XCTAssertLessThan(earlier, later)
        XCTAssertEqual([later, earlier].sorted(), [earlier, later])
    }

    // 4. Equatable + Hashable: same MSK calendar day equates + hashes equal
    //    (critical for Dictionary(grouping:by:) one-bucket-per-day — hotspot b).
    func test_hashable_sameMSKDayBucketsTogether() throws {
        // A `DatePicker`-style non-midnight Date on the same MSK day must
        // normalise to the same BusinessDate (so grouping does not fragment).
        let midnight = try decode("2026-05-21")
        let noonSameDay = BusinessDate(
            try mskCal().date(
                from: DateComponents(
                    year: 2026, month: 5, day: 21, hour: 13, minute: 37))!)

        XCTAssertEqual(midnight, noonSameDay)
        XCTAssertEqual(midnight.hashValue, noonSameDay.hashValue)

        let grouped = Dictionary(grouping: [midnight, noonSameDay], by: { $0 })
        XCTAssertEqual(grouped.count, 1, "same MSK day → one bucket, no fragmentation")
        XCTAssertEqual(grouped[midnight]?.count, 2)
    }

    // 5. `init(_ date:)` normalizes a picked Date to MSK midnight for encode.
    func test_initFromDate_normalizesToMSKMidnight() throws {
        let noon = try mskCal().date(
            from: DateComponents(
                year: 2026, month: 5, day: 21, hour: 13, minute: 37))!
        let bd = BusinessDate(noon)
        let data = try JSONEncoder().encode(bd)
        XCTAssertEqual(
            String(data: data, encoding: .utf8), "\"2026-05-21\"",
            "picked Date encodes to its MSK calendar day")
    }
}
