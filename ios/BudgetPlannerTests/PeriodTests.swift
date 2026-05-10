import XCTest
@testable import BudgetPlanner

final class PeriodTests: XCTestCase {
    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        var components = DateComponents(timeZone: Period.moscow, year: y, month: m, day: d)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = Period.moscow
        return cal.date(from: components)!
    }

    private func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = Period.moscow
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    func testMidPeriodFebruary() {
        let (start, end) = Period.periodFor(date: date(2026, 2, 15), cycleStartDay: 5)
        XCTAssertEqual(ymd(start), "2026-02-05")
        XCTAssertEqual(ymd(end), "2026-03-04")
    }

    func testBeforeCycleStartGoesToPreviousMonth() {
        let (start, end) = Period.periodFor(date: date(2026, 2, 3), cycleStartDay: 5)
        XCTAssertEqual(ymd(start), "2026-01-05")
        XCTAssertEqual(ymd(end), "2026-02-04")
    }

    func testExactCycleStartDay() {
        let (start, end) = Period.periodFor(date: date(2026, 2, 5), cycleStartDay: 5)
        XCTAssertEqual(ymd(start), "2026-02-05")
        XCTAssertEqual(ymd(end), "2026-03-04")
    }

    func testCycleDayClampedInFebruary() {
        // REG-04 (Phase 31-03): fixed expected values to match actual clamp semantics.
        // For 2026-02-15 with cycleStartDay=31, Feb 2026 has 28 days (non-leap):
        //   curClamped Feb = 28; day=15 < 28 → roll back to previous month
        //   Jan: clamp 31 → 31 (Jan has 31 days) → periodStart = 2026-01-31
        //   nextAnchor = +1 month = Feb 2026 → clamp 31 → 28 → nextStart = 2026-02-28
        //   periodEnd = nextStart − 1 day = 2026-02-27
        let (start, end) = Period.periodFor(date: date(2026, 2, 15), cycleStartDay: 31)
        XCTAssertEqual(ymd(start), "2026-01-31")
        XCTAssertEqual(ymd(end), "2026-02-27")
    }

    func testCycleDay31InJanuary() {
        // 2026-01-31 with cycle=31 — exactly cycle start
        let (start, end) = Period.periodFor(date: date(2026, 1, 31), cycleStartDay: 31)
        XCTAssertEqual(ymd(start), "2026-01-31")
        // next anchor Feb 31 → clamped to Feb 28 → end = 2026-02-27
        XCTAssertEqual(ymd(end), "2026-02-27")
    }

    func testYearBoundary() {
        // Date in Jan, before Jan cycle start → period rolls back to Dec
        let (start, end) = Period.periodFor(date: date(2026, 1, 3), cycleStartDay: 5)
        XCTAssertEqual(ymd(start), "2025-12-05")
        XCTAssertEqual(ymd(end), "2026-01-04")
    }
}
