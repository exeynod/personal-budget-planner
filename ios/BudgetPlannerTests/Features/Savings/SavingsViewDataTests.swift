import XCTest

@testable import BudgetPlanner

/// Phase 62 Plan 02 — unit tests for `SavingsViewData` pure helpers.
///
/// Foundation-only, no SwiftUI runtime. Covers progressPercentage edge
/// cases, formatDue with an injected Europe/Moscow calendar,
/// sortGoalsForDisplay ordering, and the two validation gates.
final class SavingsViewDataTests: XCTestCase {

    // MARK: - progressPercentage

    func test_progressPercentage_zeroTarget_returnsZero() {
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 0, targetCents: 0), 0)
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 5000, targetCents: 0), 0)
    }

    func test_progressPercentage_negativeTarget_returnsZero() {
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 100, targetCents: -10), 0)
    }

    func test_progressPercentage_negativeCurrent_returnsZero() {
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: -100, targetCents: 100_000), 0)
    }

    func test_progressPercentage_halfTarget_returnsFifty() {
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 50_000, targetCents: 100_000), 50)
    }

    func test_progressPercentage_exceedsTarget_clamps100() {
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 200_000, targetCents: 100_000), 100)
    }

    func test_progressPercentage_rounding() {
        // 1/3 ≈ 33.333... → 33
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 33_333, targetCents: 100_000), 33)
        // 2/3 ≈ 66.666... → 67
        XCTAssertEqual(SavingsViewData.progressPercentage(currentCents: 66_666, targetCents: 100_000), 67)
    }

    // MARK: - formatDue

    func test_formatDue_nil_returnsNil() {
        XCTAssertNil(SavingsViewData.formatDue(nil, calendar: mskCalendar()))
    }

    func test_formatDue_validDate_returnsRussianGenitive() {
        // 12 сентября 2026 в Europe/Moscow
        var components = DateComponents()
        components.year = 2026
        components.month = 9
        components.day = 12
        let cal = mskCalendar()
        let date = cal.date(from: components)!
        XCTAssertEqual(SavingsViewData.formatDue(date, calendar: cal), "до 12 сентября 2026")
    }

    func test_formatDue_january_returnsJanuary() {
        var components = DateComponents()
        components.year = 2027
        components.month = 1
        components.day = 1
        let cal = mskCalendar()
        let date = cal.date(from: components)!
        XCTAssertEqual(SavingsViewData.formatDue(date, calendar: cal), "до 1 января 2027")
    }

    // MARK: - sortGoalsForDisplay

    func test_sortGoals_emptyReturnsEmpty() {
        XCTAssertEqual(SavingsViewData.sortGoalsForDisplay([]).count, 0)
    }

    func test_sortGoals_dueAscNilLast() {
        let cal = mskCalendar()
        let d1 = cal.date(from: DateComponents(year: 2026, month: 9, day: 12))!
        let d2 = cal.date(from: DateComponents(year: 2026, month: 7, day: 1))!
        let g1 = makeGoal(id: 1, due: d1, createdAt: Date(timeIntervalSince1970: 1000))
        let g2 = makeGoal(id: 2, due: d2, createdAt: Date(timeIntervalSince1970: 2000))
        let g3 = makeGoal(id: 3, due: nil, createdAt: Date(timeIntervalSince1970: 3000))
        let sorted = SavingsViewData.sortGoalsForDisplay([g1, g3, g2])
        XCTAssertEqual(sorted.map(\.id), [2, 1, 3])
    }

    func test_sortGoals_sameDue_tieBreakByCreatedDesc() {
        let cal = mskCalendar()
        let due = cal.date(from: DateComponents(year: 2026, month: 9, day: 12))!
        let g1 = makeGoal(id: 1, due: due, createdAt: Date(timeIntervalSince1970: 1000))
        let g2 = makeGoal(id: 2, due: due, createdAt: Date(timeIntervalSince1970: 2000))
        let sorted = SavingsViewData.sortGoalsForDisplay([g1, g2])
        XCTAssertEqual(sorted.map(\.id), [2, 1])
    }

    func test_sortGoals_bothNilDue_tieBreakByCreatedDesc() {
        let g1 = makeGoal(id: 1, due: nil, createdAt: Date(timeIntervalSince1970: 1000))
        let g2 = makeGoal(id: 2, due: nil, createdAt: Date(timeIntervalSince1970: 2000))
        let sorted = SavingsViewData.sortGoalsForDisplay([g1, g2])
        XCTAssertEqual(sorted.map(\.id), [2, 1])
    }

    // MARK: - isValidGoalDraft

    func test_isValidGoalDraft_emptyName_false() {
        XCTAssertFalse(SavingsViewData.isValidGoalDraft(name: "", targetCents: 100))
    }

    func test_isValidGoalDraft_whitespaceName_false() {
        XCTAssertFalse(SavingsViewData.isValidGoalDraft(name: "   ", targetCents: 100))
    }

    func test_isValidGoalDraft_zeroTarget_false() {
        XCTAssertFalse(SavingsViewData.isValidGoalDraft(name: "Test", targetCents: 0))
    }

    func test_isValidGoalDraft_negativeTarget_false() {
        XCTAssertFalse(SavingsViewData.isValidGoalDraft(name: "Test", targetCents: -100))
    }

    func test_isValidGoalDraft_validInputs_true() {
        XCTAssertTrue(SavingsViewData.isValidGoalDraft(name: "Test", targetCents: 100))
    }

    // MARK: - isValidDepositDraft

    func test_isValidDepositDraft_zeroAmount_false() {
        XCTAssertFalse(SavingsViewData.isValidDepositDraft(amountCents: 0, accountId: 1))
    }

    func test_isValidDepositDraft_nilAccount_false() {
        XCTAssertFalse(SavingsViewData.isValidDepositDraft(amountCents: 100, accountId: nil))
    }

    func test_isValidDepositDraft_validInputs_true() {
        XCTAssertTrue(SavingsViewData.isValidDepositDraft(amountCents: 100, accountId: 1))
    }

    // MARK: - Helpers

    private func mskCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        c.locale = Locale(identifier: "ru_RU")
        return c
    }

    private func makeGoal(id: Int, due: Date?, createdAt: Date) -> GoalDTO {
        GoalDTO(
            id: id,
            name: "Goal \(id)",
            targetCents: 100_000,
            currentCents: 0,
            due: due,
            createdAt: createdAt
        )
    }
}
