// Phase 27-08 Task 1 (RED → GREEN): unit specs for SavingsData pure
// compute helpers + SavingsSummaryDTO / GoalDTO JSON-decode round-trip.
//
// Symmetric to web Plan 27-03 Task 1 coverage
// (`computeSavings.test.ts` — 20 cases). Mirrors the iOS XCTest layout
// of Plan 26-07 SubscriptionsDataTests / Plan 26-05 PlanDataTests.
//
// 12+ cases cover every code path described in the plan's <behavior>:
//   - computeProgressPct                  (5 cases — happy + clamps)
//   - formatDueRu                         (4 cases — nil / valid /
//                                          december / nil-input)
//   - isValidGoalDraft                    (3 cases — empty / whitespace /
//                                          zero target / valid)
//   - isValidDepositDraft                 (3 cases — zero amount /
//                                          nil account / valid)
//   - savings_summary_dto_decode_round_trip
//   - goal_dto_decode_round_trip
//
// JSON-fixture pattern (rather than test-only init) mirrors the
// HomeDataTests / PlanDataTests / SubscriptionsDataTests files —
// catches DTO drift here too.

import XCTest

@testable import BudgetPlanner

final class SavingsDataTests: XCTestCase {

    // MARK: - Fixtures

    /// Decoder mirroring APIClient.shared.decoder (snake_case + custom
    /// date strategy that accepts both YYYY-MM-DD and ISO timestamps).
    private let dec: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: str) { return d }
            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: str) { return d }
            let formats = [
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd",
            ]
            for fmt in formats {
                let df = DateFormatter()
                df.locale = Locale(identifier: "en_US_POSIX")
                df.timeZone = TimeZone(identifier: "UTC")
                df.dateFormat = fmt
                if let d = df.date(from: str) { return d }
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unrecognized date: \(str)"
            )
        }
        return d
    }()

    private func mskCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    private func makeDate(_ iso: String) -> Date {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso)!
    }

    // MARK: - computeProgressPct

    func test_computeProgressPct_happy_50pct() {
        XCTAssertEqual(
            SavingsData.computeProgressPct(currentCents: 5_000, targetCents: 10_000),
            50
        )
    }

    func test_computeProgressPct_clamps_at_100_when_over_target() {
        XCTAssertEqual(
            SavingsData.computeProgressPct(currentCents: 30_000, targetCents: 10_000),
            100
        )
    }

    func test_computeProgressPct_returns_zero_when_target_is_zero() {
        XCTAssertEqual(
            SavingsData.computeProgressPct(currentCents: 5_000, targetCents: 0),
            0
        )
    }

    func test_computeProgressPct_returns_zero_when_target_is_negative() {
        XCTAssertEqual(
            SavingsData.computeProgressPct(currentCents: 5_000, targetCents: -1),
            0
        )
    }

    func test_computeProgressPct_returns_zero_when_current_is_negative() {
        XCTAssertEqual(
            SavingsData.computeProgressPct(currentCents: -100, targetCents: 10_000),
            0
        )
    }

    // MARK: - formatDueRu

    func test_formatDueRu_returns_nil_for_nil_input() {
        XCTAssertNil(SavingsData.formatDueRu(nil, calendar: mskCalendar()))
    }

    func test_formatDueRu_formats_valid_date_with_genitive_month() {
        let date = makeDate("2026-12-31")
        XCTAssertEqual(
            SavingsData.formatDueRu(date, calendar: mskCalendar()),
            "до 31 декабря 2026"
        )
    }

    func test_formatDueRu_formats_may_correctly() {
        let date = makeDate("2026-05-09")
        XCTAssertEqual(
            SavingsData.formatDueRu(date, calendar: mskCalendar()),
            "до 9 мая 2026"
        )
    }

    func test_formatDueRu_formats_january() {
        let date = makeDate("2027-01-01")
        XCTAssertEqual(
            SavingsData.formatDueRu(date, calendar: mskCalendar()),
            "до 1 января 2027"
        )
    }

    // MARK: - isValidGoalDraft

    func test_isValidGoalDraft_returns_false_for_empty_name() {
        XCTAssertFalse(SavingsData.isValidGoalDraft(name: "", targetCents: 10_000))
    }

    func test_isValidGoalDraft_returns_false_for_whitespace_only_name() {
        XCTAssertFalse(SavingsData.isValidGoalDraft(name: "   ", targetCents: 10_000))
    }

    func test_isValidGoalDraft_returns_false_for_zero_or_negative_target() {
        XCTAssertFalse(SavingsData.isValidGoalDraft(name: "Машина", targetCents: 0))
        XCTAssertFalse(SavingsData.isValidGoalDraft(name: "Машина", targetCents: -1))
    }

    func test_isValidGoalDraft_returns_true_for_valid_draft() {
        XCTAssertTrue(SavingsData.isValidGoalDraft(name: "Отпуск", targetCents: 50_000))
    }

    // MARK: - isValidDepositDraft

    func test_isValidDepositDraft_returns_false_for_zero_amount() {
        XCTAssertFalse(SavingsData.isValidDepositDraft(amountCents: 0, accountId: 1))
    }

    func test_isValidDepositDraft_returns_false_for_negative_amount() {
        XCTAssertFalse(SavingsData.isValidDepositDraft(amountCents: -100, accountId: 1))
    }

    func test_isValidDepositDraft_returns_false_for_nil_account_id() {
        XCTAssertFalse(SavingsData.isValidDepositDraft(amountCents: 5_000, accountId: nil))
    }

    func test_isValidDepositDraft_returns_true_for_valid_draft() {
        XCTAssertTrue(SavingsData.isValidDepositDraft(amountCents: 5_000, accountId: 42))
    }

    // MARK: - DTO round-trip (regression guards)

    func test_savings_summary_dto_decode_round_trip() {
        let json = """
            {
              "total_cents": 1234500,
              "month_in_cents": 50000,
              "config": {
                "roundup_enabled": true,
                "roundup_base": 50
              },
              "goals": [
                {
                  "id": 1,
                  "name": "Отпуск",
                  "target_cents": 100000,
                  "current_cents": 25000,
                  "due": "2026-12-31",
                  "created_at": "2026-05-01T10:00:00"
                }
              ]
            }
            """.data(using: .utf8)!
        let snap = try! dec.decode(SavingsSummaryDTO.self, from: json)
        XCTAssertEqual(snap.totalCents, 1_234_500)
        XCTAssertEqual(snap.monthInCents, 50_000)
        XCTAssertEqual(snap.config.roundupEnabled, true)
        XCTAssertEqual(snap.config.roundupBase, 50)
        XCTAssertEqual(snap.goals.count, 1)
        XCTAssertEqual(snap.goals[0].name, "Отпуск")
        XCTAssertEqual(snap.goals[0].targetCents, 100_000)
        XCTAssertEqual(snap.goals[0].currentCents, 25_000)
        XCTAssertNotNil(snap.goals[0].due)
    }

    func test_goal_dto_decode_round_trip_with_nil_due() {
        let json = """
            {
              "id": 5,
              "name": "Машина",
              "target_cents": 5000000,
              "current_cents": 0,
              "due": null,
              "created_at": "2026-05-01T10:00:00"
            }
            """.data(using: .utf8)!
        let goal = try! dec.decode(GoalDTO.self, from: json)
        XCTAssertEqual(goal.id, 5)
        XCTAssertEqual(goal.name, "Машина")
        XCTAssertEqual(goal.targetCents, 5_000_000)
        XCTAssertEqual(goal.currentCents, 0)
        XCTAssertNil(goal.due)
    }

    func test_savings_config_dto_round_trip() {
        let json = """
            {
              "roundup_enabled": false,
              "roundup_base": 10
            }
            """.data(using: .utf8)!
        let cfg = try! dec.decode(SavingsConfigDTO.self, from: json)
        XCTAssertEqual(cfg.roundupEnabled, false)
        XCTAssertEqual(cfg.roundupBase, 10)
    }
}
