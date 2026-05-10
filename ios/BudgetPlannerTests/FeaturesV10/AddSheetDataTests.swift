// Phase 25-11 Task 1 (RED → GREEN): unit specs for AddSheetData (pure compute
// helpers for the iOS AddSheet form state machine — amount string mutation,
// CTA state, default date for chips). Symmetric to web Plan 25-10 Task 1.
//
// All helpers are stateless; tests don't need DI. Mirrors the test pattern
// established in HomeDataTests (XCTest, no @MainActor since pure funcs).

import XCTest
@testable import BudgetPlanner

final class AddSheetDataTests: XCTestCase {

    // ─────────────── shared calendar (Moscow, gregorian) ───────────────

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    // ─────────────── appendDigit ───────────────

    func test_appendDigit_to_empty_returns_digit() {
        XCTAssertEqual(AddSheetData.appendDigit("", "5"), "5")
    }

    func test_appendDigit_replaces_lone_zero() {
        XCTAssertEqual(AddSheetData.appendDigit("0", "5"), "5")
    }

    func test_appendDigit_appends_to_nonzero() {
        XCTAssertEqual(AddSheetData.appendDigit("12", "3"), "123")
    }

    func test_appendDigit_zero_after_nonzero_appends() {
        XCTAssertEqual(AddSheetData.appendDigit("1", "0"), "10")
    }

    func test_appendDigit_preserves_dot() {
        XCTAssertEqual(AddSheetData.appendDigit("12.", "5"), "12.5")
    }

    func test_appendDigit_one_decimal_appends() {
        XCTAssertEqual(AddSheetData.appendDigit("12.5", "0"), "12.50")
    }

    func test_appendDigit_caps_decimal_part_at_two_chars() {
        // "12.50" → adding "9" should NOT extend to "12.509"
        XCTAssertEqual(AddSheetData.appendDigit("12.50", "9"), "12.50")
    }

    func test_appendDigit_caps_decimal_part_zero_one() {
        XCTAssertEqual(AddSheetData.appendDigit("0.05", "1"), "0.05")
    }

    // ─────────────── appendDot ───────────────

    func test_appendDot_to_empty_yields_zero_dot() {
        XCTAssertEqual(AddSheetData.appendDot(""), "0.")
    }

    func test_appendDot_after_digits_appends() {
        XCTAssertEqual(AddSheetData.appendDot("12"), "12.")
    }

    func test_appendDot_after_zero_appends() {
        XCTAssertEqual(AddSheetData.appendDot("0"), "0.")
    }

    func test_appendDot_when_dot_exists_is_noop() {
        XCTAssertEqual(AddSheetData.appendDot("12.5"), "12.5")
        XCTAssertEqual(AddSheetData.appendDot("0.05"), "0.05")
    }

    // ─────────────── backspace ───────────────

    func test_backspace_drops_last_char() {
        XCTAssertEqual(AddSheetData.backspace("123"), "12")
        XCTAssertEqual(AddSheetData.backspace("12.5"), "12.")
        XCTAssertEqual(AddSheetData.backspace("12."), "12")
    }

    func test_backspace_on_single_char_returns_empty() {
        XCTAssertEqual(AddSheetData.backspace("5"), "")
    }

    func test_backspace_on_empty_returns_empty() {
        XCTAssertEqual(AddSheetData.backspace(""), "")
    }

    // ─────────────── parseAmountToCents ───────────────

    func test_parseAmountToCents_empty_returns_zero() {
        XCTAssertEqual(AddSheetData.parseAmountToCents(""), 0)
    }

    func test_parseAmountToCents_zero_returns_zero() {
        XCTAssertEqual(AddSheetData.parseAmountToCents("0"), 0)
    }

    func test_parseAmountToCents_whole_rubles() {
        XCTAssertEqual(AddSheetData.parseAmountToCents("5"), 500)
        XCTAssertEqual(AddSheetData.parseAmountToCents("1234"), 123_400)
    }

    func test_parseAmountToCents_trailing_dot_treats_as_whole() {
        XCTAssertEqual(AddSheetData.parseAmountToCents("5."), 500)
    }

    func test_parseAmountToCents_one_decimal_yields_tenths() {
        // "5.5" → 5 ruble 50 kop = 550 cents
        XCTAssertEqual(AddSheetData.parseAmountToCents("5.5"), 550)
    }

    func test_parseAmountToCents_two_decimals_yields_exact() {
        XCTAssertEqual(AddSheetData.parseAmountToCents("5.50"), 550)
        XCTAssertEqual(AddSheetData.parseAmountToCents("0.05"), 5)
        XCTAssertEqual(AddSheetData.parseAmountToCents("12.34"), 1234)
    }

    func test_parseAmountToCents_invalid_returns_zero() {
        XCTAssertEqual(AddSheetData.parseAmountToCents("abc"), 0)
        XCTAssertEqual(AddSheetData.parseAmountToCents("."), 0)
        XCTAssertEqual(AddSheetData.parseAmountToCents("1.2.3"), 0)
    }

    func test_parseAmountToCents_large_number() {
        // 123_456 ₽ = 12_345_600 cents
        XCTAssertEqual(AddSheetData.parseAmountToCents("123456"), 12_345_600)
    }

    // ─────────────── ctaState ───────────────

    func test_ctaState_zero_amount_yields_empty() {
        XCTAssertEqual(AddSheetData.ctaState(amountCents: 0, categoryId: nil), .empty)
        XCTAssertEqual(AddSheetData.ctaState(amountCents: 0, categoryId: 5), .empty)
    }

    func test_ctaState_amount_no_cat_yields_noCat() {
        XCTAssertEqual(AddSheetData.ctaState(amountCents: 500, categoryId: nil), .noCat)
    }

    func test_ctaState_amount_and_cat_yields_ready() {
        XCTAssertEqual(AddSheetData.ctaState(amountCents: 500, categoryId: 7), .ready)
    }

    // WR-25-02 (review fix): account-gating overload.
    func test_ctaState_amount_cat_no_account_yields_noAccount() {
        XCTAssertEqual(
            AddSheetData.ctaState(amountCents: 500, categoryId: 7, accountId: nil),
            .noAccount
        )
    }

    func test_ctaState_amount_cat_account_yields_ready() {
        XCTAssertEqual(
            AddSheetData.ctaState(amountCents: 500, categoryId: 7, accountId: 3),
            .ready
        )
    }

    func test_ctaState_account_gate_after_cat_gate() {
        // No category trumps no account in the state machine.
        XCTAssertEqual(
            AddSheetData.ctaState(amountCents: 500, categoryId: nil, accountId: nil),
            .noCat
        )
    }

    // ─────────────── defaultDate ───────────────

    func test_defaultDate_today_returns_today() {
        let today = date(2026, 5, 9)
        let result = AddSheetData.defaultDate(for: .today, today: today, calendar: cal)
        XCTAssertNotNil(result)
        XCTAssertTrue(cal.isDate(result!, inSameDayAs: today))
    }

    func test_defaultDate_yesterday_returns_one_day_before() {
        let today = date(2026, 5, 9)
        let yesterday = date(2026, 5, 8)
        let result = AddSheetData.defaultDate(for: .yesterday, today: today, calendar: cal)
        XCTAssertNotNil(result)
        XCTAssertTrue(cal.isDate(result!, inSameDayAs: yesterday))
    }

    func test_defaultDate_yesterday_handles_month_boundary() {
        let today = date(2026, 6, 1)
        let yesterday = date(2026, 5, 31)
        let result = AddSheetData.defaultDate(for: .yesterday, today: today, calendar: cal)
        XCTAssertNotNil(result)
        XCTAssertTrue(cal.isDate(result!, inSameDayAs: yesterday))
    }

    func test_defaultDate_custom_returns_nil() {
        let today = date(2026, 5, 9)
        XCTAssertNil(AddSheetData.defaultDate(for: .custom, today: today, calendar: cal))
    }
}
