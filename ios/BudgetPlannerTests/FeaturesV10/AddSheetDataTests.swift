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

    // WR-25-08 (review fix): explicit cross-platform parity case.
    // Web: appendDigit("0", "0") == "0"; iOS must match.
    func test_appendDigit_zero_plus_zero_stays_zero() {
        XCTAssertEqual(AddSheetData.appendDigit("0", "0"), "0")
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

    // ─────────────── category fixture (Phase 71) ───────────────

    /// JSON-decode fixture, mirroring the production wire contract
    /// (`.convertFromSnakeCase`). Same pattern as PlanEditorDataTests.
    private func makeCategory(
        id: Int,
        name: String = "Test",
        kind: String = "expense",
        paused: Bool = false,
        code: String = "food"
    ) -> CategoryV10DTO {
        let fields: [String] = [
            "\"id\": \(id)",
            "\"name\": \"\(name)\"",
            "\"kind\": \"\(kind)\"",
            "\"is_archived\": false",
            "\"sort_order\": 0",
            "\"created_at\": \"2026-05-09\"",
            "\"plan_cents\": 0",
            "\"rollover\": \"misc\"",
            "\"paused\": \(paused ? "true" : "false")",
            "\"code\": \"\(code)\"",
            "\"ord\": \"01\"",
        ]
        let json = "{\(fields.joined(separator: ","))}".data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(CategoryV10DTO.self, from: json)
    }

    private var mixedCategories: [CategoryV10DTO] {
        [
            makeCategory(id: 1, name: "Продукты", kind: "expense", code: "food"),
            makeCategory(id: 2, name: "Кафе", kind: "expense", code: "cafe"),
            makeCategory(id: 3, name: "Зарплата", kind: "income", code: "salary"),
            makeCategory(id: 4, name: "Подработка", kind: "income", code: "side"),
            // System savings sink + a paused expense — both must be dropped.
            makeCategory(id: 5, name: "Накопления", kind: "expense", code: "savings"),
            makeCategory(id: 6, name: "Спорт", kind: "expense", paused: true, code: "sport"),
        ]
    }

    // ─────────────── AddSheetKind ───────────────

    func test_addSheetKind_wire_matches_rawvalue() {
        XCTAssertEqual(AddSheetKind.expense.wire, "expense")
        XCTAssertEqual(AddSheetKind.income.wire, "income")
    }

    func test_addSheetKind_categoryKind_maps() {
        XCTAssertEqual(AddSheetKind.expense.categoryKind, .expense)
        XCTAssertEqual(AddSheetKind.income.categoryKind, .income)
    }

    // ─────────────── visibleCategories(for:) (Phase 71) ───────────────

    func test_visibleCategories_expense_shows_only_expense_buckets() {
        let result = AddSheetData.visibleCategories(mixedCategories, for: .expense)
        // Drops savings (id 5) and paused (id 6); keeps expense food/cafe only.
        XCTAssertEqual(result.map { $0.id }, [1, 2])
    }

    func test_visibleCategories_income_shows_only_income_buckets() {
        let result = AddSheetData.visibleCategories(mixedCategories, for: .income)
        XCTAssertEqual(result.map { $0.id }, [3, 4])
    }

    func test_visibleCategories_drops_savings_and_paused_for_both_kinds() {
        let exp = AddSheetData.visibleCategories(mixedCategories, for: .expense)
        XCTAssertFalse(exp.contains { $0.code == "savings" })
        XCTAssertFalse(exp.contains { $0.paused })
    }

    // ─────────────── clearedCategoryIfInvalid (Phase 71) ───────────────

    func test_clearedCategory_keeps_valid_selection_for_kind() {
        // Expense category 1 stays valid when kind is expense.
        XCTAssertEqual(
            AddSheetData.clearedCategoryIfInvalid(1, in: mixedCategories, for: .expense),
            1
        )
    }

    func test_clearedCategory_clears_cross_kind_selection() {
        // Income category 3 is invalid once kind flips to expense → nil.
        XCTAssertNil(
            AddSheetData.clearedCategoryIfInvalid(3, in: mixedCategories, for: .expense)
        )
        // And the reverse: expense category 1 invalid under income → nil.
        XCTAssertNil(
            AddSheetData.clearedCategoryIfInvalid(1, in: mixedCategories, for: .income)
        )
    }

    func test_clearedCategory_clears_savings_and_paused_even_within_kind() {
        // Savings (5) and paused (6) are expense-kind but never visible → cleared.
        XCTAssertNil(
            AddSheetData.clearedCategoryIfInvalid(5, in: mixedCategories, for: .expense)
        )
        XCTAssertNil(
            AddSheetData.clearedCategoryIfInvalid(6, in: mixedCategories, for: .expense)
        )
    }

    func test_clearedCategory_nil_input_stays_nil() {
        XCTAssertNil(
            AddSheetData.clearedCategoryIfInvalid(nil, in: mixedCategories, for: .income)
        )
    }

    // ─────────────── buildPayload (Phase 71) ───────────────

    private func encodedKind(_ req: ActualCreateRequest) -> String? {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        guard
            let data = try? enc.encode(req),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return obj["kind"] as? String
    }

    func test_buildPayload_expense_uses_expense_kind() {
        let req = AddSheetData.buildPayload(
            kind: .expense, amountCents: 500, categoryId: 7,
            txDate: "2026-05-21", description: "кафе", accountId: 3
        )
        XCTAssertEqual(req.kind, "expense")
        XCTAssertEqual(encodedKind(req), "expense")
    }

    func test_buildPayload_income_uses_income_kind() {
        // The pre-fix bug: this would have been forced to "expense".
        let req = AddSheetData.buildPayload(
            kind: .income, amountCents: 5_000_00, categoryId: 3,
            txDate: "2026-05-21", description: "зарплата", accountId: 3
        )
        XCTAssertEqual(req.kind, "income")
        XCTAssertEqual(encodedKind(req), "income")
    }

    func test_buildPayload_carries_form_fields() {
        let req = AddSheetData.buildPayload(
            kind: .income, amountCents: 1234, categoryId: 9,
            txDate: "2026-05-20", description: "", accountId: nil
        )
        XCTAssertEqual(req.amountCents, 1234)
        XCTAssertEqual(req.categoryId, 9)
        XCTAssertEqual(req.txDate, "2026-05-20")
        XCTAssertNil(req.description)  // empty string → nil
        XCTAssertNil(req.accountId)
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
