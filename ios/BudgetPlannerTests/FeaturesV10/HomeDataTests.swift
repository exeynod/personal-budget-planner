// Phase 25-05 Task 1 (RED): unit specs for HomeData (pure compute helpers) and
// V10Formatters (eyebrow / day / time / pluralisation). Symmetric to web Plan
// 25-04 Task 1 coverage in `frontend/src/screensV10/common/__tests__/format.test.ts`
// (extended with HomeData equivalents the web plan will land in 25-04).
//
// All tests use a fixed `cal: Calendar` with `.gregorian` + `Europe/Moscow`
// time zone so date-component arithmetic stays deterministic regardless of
// the host machine. `Date(timeIntervalSince1970:)` is used rather than
// `DateComponents().date` to avoid TZ-dependent constructions creeping in.

import XCTest

@testable import BudgetPlanner

final class V10FormattersTests: XCTestCase {

    // ─────────────── Calendar helper (Moscow, gregorian) ───────────────
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ mi: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: mi))!
    }

    // ─────────────── constants ───────────────

    func test_monthsEn_has_twelve_uppercase_three_letter_abbreviations() {
        XCTAssertEqual(V10Formatters.monthsEn.count, 12)
        XCTAssertEqual(V10Formatters.monthsEn[0], "JAN")
        XCTAssertEqual(V10Formatters.monthsEn[4], "MAY")
        XCTAssertEqual(V10Formatters.monthsEn[11], "DEC")
        for m in V10Formatters.monthsEn {
            XCTAssertTrue(
                m.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil,
                "expected /^[A-Z]{3}$/, got \(m)")
        }
    }

    func test_monthsRuGenitive_has_twelve_lowercase_russian_genitive_names() {
        XCTAssertEqual(V10Formatters.monthsRuGenitive.count, 12)
        XCTAssertEqual(V10Formatters.monthsRuGenitive[0], "января")
        XCTAssertEqual(V10Formatters.monthsRuGenitive[4], "мая")
        XCTAssertEqual(V10Formatters.monthsRuGenitive[11], "декабря")
    }

    // ─────────────── pluralDays ───────────────

    func test_pluralDays_returns_DEN_for_modulo_one_excluding_eleven() {
        XCTAssertEqual(V10Formatters.pluralDays(1), "ДЕНЬ")
        XCTAssertEqual(V10Formatters.pluralDays(21), "ДЕНЬ")
        XCTAssertEqual(V10Formatters.pluralDays(101), "ДЕНЬ")
    }

    func test_pluralDays_returns_DNYA_for_modulo_two_three_four() {
        XCTAssertEqual(V10Formatters.pluralDays(2), "ДНЯ")
        XCTAssertEqual(V10Formatters.pluralDays(3), "ДНЯ")
        XCTAssertEqual(V10Formatters.pluralDays(4), "ДНЯ")
        XCTAssertEqual(V10Formatters.pluralDays(22), "ДНЯ")
        XCTAssertEqual(V10Formatters.pluralDays(23), "ДНЯ")
    }

    func test_pluralDays_returns_DNEY_for_zero_teens_and_five_plus() {
        XCTAssertEqual(V10Formatters.pluralDays(0), "ДНЕЙ")
        XCTAssertEqual(V10Formatters.pluralDays(5), "ДНЕЙ")
        XCTAssertEqual(V10Formatters.pluralDays(11), "ДНЕЙ")
        XCTAssertEqual(V10Formatters.pluralDays(12), "ДНЕЙ")
        XCTAssertEqual(V10Formatters.pluralDays(13), "ДНЕЙ")
        XCTAssertEqual(V10Formatters.pluralDays(14), "ДНЕЙ")
        XCTAssertEqual(V10Formatters.pluralDays(25), "ДНЕЙ")
    }

    // ─────────────── formatDay ───────────────

    func test_formatDay_returns_today_when_same_year_month_day() {
        let today = date(2026, 5, 9, 0, 0)
        let d = date(2026, 5, 9, 14, 30)
        XCTAssertEqual(V10Formatters.formatDay(d, today: today, calendar: cal), "Сегодня")
    }

    func test_formatDay_returns_yesterday_for_one_day_before() {
        let today = date(2026, 5, 9)
        let d = date(2026, 5, 8)
        XCTAssertEqual(V10Formatters.formatDay(d, today: today, calendar: cal), "Вчера")
    }

    func test_formatDay_returns_day_with_genitive_month_for_older_dates() {
        let today = date(2026, 5, 9)
        let d = date(2026, 5, 7)
        XCTAssertEqual(V10Formatters.formatDay(d, today: today, calendar: cal), "7 мая")
    }

    func test_formatDay_handles_year_boundary() {
        let today = date(2026, 5, 9)
        let d = date(2025, 12, 31)
        XCTAssertEqual(V10Formatters.formatDay(d, today: today, calendar: cal), "31 декабря")
    }

    func test_formatDay_handles_future_dates() {
        let today = date(2026, 5, 9)
        let d = date(2026, 6, 1)
        XCTAssertEqual(V10Formatters.formatDay(d, today: today, calendar: cal), "1 июня")
    }

    func test_formatDay_handles_yesterday_across_month_boundary() {
        let today = date(2026, 6, 1)
        let d = date(2026, 5, 31)
        XCTAssertEqual(V10Formatters.formatDay(d, today: today, calendar: cal), "Вчера")
    }

    // ─────────────── formatTimeHM ───────────────

    func test_formatTimeHM_returns_zero_padded_HHmm() {
        XCTAssertEqual(V10Formatters.formatTimeHM(date(2026, 5, 9, 14, 32), calendar: cal), "14:32")
    }

    func test_formatTimeHM_zero_pads_single_digit_hours() {
        XCTAssertEqual(V10Formatters.formatTimeHM(date(2026, 5, 9, 9, 5), calendar: cal), "09:05")
    }

    func test_formatTimeHM_handles_zero_zero() {
        XCTAssertEqual(V10Formatters.formatTimeHM(date(2026, 5, 9, 0, 0), calendar: cal), "00:00")
    }

    func test_formatTimeHM_handles_twentythree_fiftynine() {
        XCTAssertEqual(V10Formatters.formatTimeHM(date(2026, 5, 9, 23, 59), calendar: cal), "23:59")
    }

    // ─────────────── formatPeriodEyebrow ───────────────

    func test_formatPeriodEyebrow_may_9_2026_yields_VOL17_23_dnya() {
        let d = date(2026, 5, 9)
        // vol = (2026-2025)*12 + 5 = 17 ; lastDay May = 31 ; daysLeft = 31-9+1=23 → "ДНЯ"
        XCTAssertEqual(
            V10Formatters.formatPeriodEyebrow(d, calendar: cal),
            "VOL.17 / MAY 2026 · 23 ДНЯ"
        )
    }

    func test_formatPeriodEyebrow_jan_1_2025_yields_VOL01_31_DEN() {
        let d = date(2025, 1, 1)
        // vol = 1, lastDay = 31, daysLeft = 31-1+1 = 31 → mod10=1 mod100=31 → "ДЕНЬ"
        XCTAssertEqual(
            V10Formatters.formatPeriodEyebrow(d, calendar: cal),
            "VOL.01 / JAN 2025 · 31 ДЕНЬ"
        )
    }

    func test_formatPeriodEyebrow_dec_31_2026_yields_1_DEN() {
        let d = date(2026, 12, 31)
        XCTAssertEqual(
            V10Formatters.formatPeriodEyebrow(d, calendar: cal),
            "VOL.24 / DEC 2026 · 1 ДЕНЬ"
        )
    }

    func test_formatPeriodEyebrow_zero_pads_vol_for_single_digit() {
        let d = date(2025, 5, 1)
        let s = V10Formatters.formatPeriodEyebrow(d, calendar: cal)
        XCTAssertTrue(s.hasPrefix("VOL.05 /"), "expected VOL.05 prefix, got \(s)")
    }

    func test_formatPeriodEyebrow_handles_february_leap_year() {
        let d = date(2028, 2, 1)
        // vol = (2028-2025)*12 + 2 = 38 ; lastDay Feb 2028 = 29 ; daysLeft = 29 → "ДНЕЙ"
        XCTAssertEqual(
            V10Formatters.formatPeriodEyebrow(d, calendar: cal),
            "VOL.38 / FEB 2028 · 29 ДНЕЙ"
        )
    }

    func test_formatPeriodEyebrow_two_dnya_and_five_dney() {
        let d2 = date(2026, 5, 30)
        XCTAssertEqual(
            V10Formatters.formatPeriodEyebrow(d2, calendar: cal),
            "VOL.17 / MAY 2026 · 2 ДНЯ"
        )
        let d5 = date(2026, 5, 27)
        XCTAssertEqual(
            V10Formatters.formatPeriodEyebrow(d5, calendar: cal),
            "VOL.17 / MAY 2026 · 5 ДНЕЙ"
        )
    }
}

// ───────────────────────────────────────────────────────────────────────────────

final class HomeDataTests: XCTestCase {

    // ─────────────── shared fixtures ───────────────
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    private func makeAccount(id: Int, balance: Int, primary: Bool = false) -> AccountDTO {
        // Decode from JSON to bypass synthesized init (DTO fields are immutable
        // by design and have no public initializer).
        // created_at is required on AccountRead (Phase 69 B4) — supply a valid
        // value (+ date strategy) so the now-non-optional decode does not throw.
        let json = """
            {
              "id": \(id),
              "bank": "Bank",
              "mask": null,
              "kind": "card",
              "balance_cents": \(balance),
              "primary": \(primary),
              "created_at": "2026-05-09"
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(AccountDTO.self, from: json)
    }

    private func makeCategory(
        id: Int,
        name: String = "Кафе",
        kind: String = "expense",
        code: String = "food",
        planCents: Int = 0,
        ord: String = "01",
        paused: Bool = false
    ) -> CategoryV10DTO {
        // code/ord/created_at are required on CategoryRead (Phase 69 B4) — always
        // supply valid values so the now-non-optional decode does not throw.
        let fields: [String] = [
            "\"id\": \(id)",
            "\"name\": \"\(name)\"",
            "\"kind\": \"\(kind)\"",
            "\"is_archived\": false",
            "\"sort_order\": 0",
            "\"plan_cents\": \(planCents)",
            "\"paused\": \(paused)",
            "\"rollover\": \"misc\"",
            "\"created_at\": \"2026-05-09\"",
            "\"code\": \"\(code)\"",
            "\"ord\": \"\(ord)\"",
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

    private func makeActual(
        id: Int,
        categoryId: Int,
        amountCents: Int,
        kind: String = "expense"
    ) -> ActualV10DTO {
        let json = """
            {
              "id": \(id),
              "period_id": 1,
              "kind": "\(kind)",
              "amount_cents": \(amountCents),
              "description": null,
              "category_id": \(categoryId),
              "tx_date": "2026-05-09",
              "source": "mini_app",
              "created_at": null,
              "account_id": null,
              "parent_txn_id": null
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    // ─────────────── computeDailyPace ───────────────

    func test_computeDailyPace_basic_division() {
        // plan 30_000₽, fact 15_000₽, 10 days left → (30_000-15_000)/10 = 1_500
        XCTAssertEqual(
            HomeData.computeDailyPace(
                planTotalCents: 3_000_000,
                factTotalExpenseCents: 1_500_000,
                daysLeft: 10
            ),
            150_000
        )
    }

    func test_computeDailyPace_clamps_negative_to_zero_when_overspent() {
        XCTAssertEqual(
            HomeData.computeDailyPace(
                planTotalCents: 1_000_000,
                factTotalExpenseCents: 2_000_000,
                daysLeft: 5
            ),
            0
        )
    }

    func test_computeDailyPace_division_by_zero_clamps_to_one_day() {
        // daysLeft=0 → use max(1, daysLeft) = 1
        XCTAssertEqual(
            HomeData.computeDailyPace(
                planTotalCents: 1_000_000,
                factTotalExpenseCents: 200_000,
                daysLeft: 0
            ),
            800_000
        )
    }

    func test_computeDailyPace_zero_plan_zero_fact_yields_zero() {
        XCTAssertEqual(
            HomeData.computeDailyPace(
                planTotalCents: 0,
                factTotalExpenseCents: 0,
                daysLeft: 30
            ),
            0
        )
    }

    // ─────────────── computeSurplus ───────────────

    func test_computeSurplus_positive_when_plan_above_fact() {
        XCTAssertEqual(
            HomeData.computeSurplus(planTotalCents: 5_000_000, factTotalExpenseCents: 3_000_000),
            2_000_000
        )
    }

    func test_computeSurplus_negative_when_overspent() {
        XCTAssertEqual(
            HomeData.computeSurplus(planTotalCents: 3_000_000, factTotalExpenseCents: 5_000_000),
            -2_000_000
        )
    }

    func test_computeSurplus_zero_when_equal() {
        XCTAssertEqual(
            HomeData.computeSurplus(planTotalCents: 1_000_000, factTotalExpenseCents: 1_000_000),
            0
        )
    }

    // ─────────────── computeWalletTotal ───────────────

    func test_computeWalletTotal_sums_all_account_balances() {
        let accs = [
            makeAccount(id: 1, balance: 5_000_000, primary: true),
            makeAccount(id: 2, balance: 1_500_000),
            makeAccount(id: 3, balance: 250_000),
        ]
        XCTAssertEqual(HomeData.computeWalletTotal(accs), 6_750_000)
    }

    func test_computeWalletTotal_empty_returns_zero() {
        XCTAssertEqual(HomeData.computeWalletTotal([]), 0)
    }

    // ─────────────── computeCategoryAggregates — filtering ───────────────

    func test_computeCategoryAggregates_filters_savings_code() {
        let cats = [
            makeCategory(id: 1, name: "Кафе", code: "cafe", planCents: 1_000_000),
            makeCategory(id: 2, name: "Накопления", code: "savings", planCents: 5_000_000),
        ]
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: 200_000),
            makeActual(id: 2, categoryId: 2, amountCents: 1_000_000),
        ]
        let rows = HomeData.computeCategoryAggregates(categories: cats, actuals: acts)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.id, 1)
    }

    func test_computeCategoryAggregates_aggregates_only_expense_kind() {
        let cats = [makeCategory(id: 1, name: "Кафе", planCents: 1_000_000)]
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: 200_000, kind: "expense"),
            makeActual(id: 2, categoryId: 1, amountCents: 100_000, kind: "income"),
            makeActual(id: 3, categoryId: 1, amountCents: 50_000, kind: "roundup"),
        ]
        let rows = HomeData.computeCategoryAggregates(categories: cats, actuals: acts)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(
            rows.first?.factCents, 200_000,
            "only kind=expense actuals should aggregate into factCents")
    }

    func test_computeCategoryAggregates_isOver_when_fact_exceeds_plan() {
        let cats = [makeCategory(id: 1, name: "Кафе", planCents: 1_000_000)]
        let acts = [makeActual(id: 1, categoryId: 1, amountCents: 1_500_000)]
        let rows = HomeData.computeCategoryAggregates(categories: cats, actuals: acts)
        XCTAssertEqual(rows.first?.isOver, true)
        XCTAssertEqual(rows.first?.factCents, 1_500_000)
    }

    func test_computeCategoryAggregates_ratio_zero_plan_with_fact_yields_infinity() {
        let cats = [makeCategory(id: 1, name: "Без плана", planCents: 0)]
        let acts = [makeActual(id: 1, categoryId: 1, amountCents: 50_000)]
        let rows = HomeData.computeCategoryAggregates(categories: cats, actuals: acts)
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(
            rows[0].ratio.isInfinite,
            "ratio = fact / plan with plan=0 must be +Infinity")
        XCTAssertTrue(rows[0].isOver, "fact > 0 with plan = 0 → over")
    }

    func test_computeCategoryAggregates_ratio_zero_plan_zero_fact_yields_zero() {
        let cats = [makeCategory(id: 1, name: "Пустая", planCents: 0)]
        let rows = HomeData.computeCategoryAggregates(categories: cats, actuals: [])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].ratio, 0, "ratio = 0/0 should be defined as 0 (not NaN)")
        XCTAssertEqual(rows[0].isOver, false)
    }

    // ─────────────── sortForHome ───────────────

    func test_sortForHome_primary_by_ratio_descending() {
        let rows = [
            CategoryAggregateRow(
                id: 1, name: "A", code: nil, ord: nil,
                planCents: 1_000_000, factCents: 200_000,
                ratio: 0.2, isOver: false),
            CategoryAggregateRow(
                id: 2, name: "B", code: nil, ord: nil,
                planCents: 1_000_000, factCents: 1_500_000,
                ratio: 1.5, isOver: true),
            CategoryAggregateRow(
                id: 3, name: "C", code: nil, ord: nil,
                planCents: 1_000_000, factCents: 600_000,
                ratio: 0.6, isOver: false),
        ]
        let sorted = HomeData.sortForHome(rows)
        XCTAssertEqual(sorted.map(\.id), [2, 3, 1])
    }

    func test_sortForHome_tie_break_by_planCents_descending() {
        let rows = [
            CategoryAggregateRow(
                id: 1, name: "A", code: nil, ord: nil,
                planCents: 500_000, factCents: 250_000,
                ratio: 0.5, isOver: false),
            CategoryAggregateRow(
                id: 2, name: "B", code: nil, ord: nil,
                planCents: 1_000_000, factCents: 500_000,
                ratio: 0.5, isOver: false),
            CategoryAggregateRow(
                id: 3, name: "C", code: nil, ord: nil,
                planCents: 200_000, factCents: 100_000,
                ratio: 0.5, isOver: false),
        ]
        let sorted = HomeData.sortForHome(rows)
        XCTAssertEqual(
            sorted.map(\.id), [2, 1, 3],
            "rows with equal ratio should sort by planCents DESC")
    }

    func test_sortForHome_infinite_ratio_first() {
        let rows = [
            CategoryAggregateRow(
                id: 1, name: "Normal", code: nil, ord: nil,
                planCents: 1_000_000, factCents: 500_000,
                ratio: 0.5, isOver: false),
            CategoryAggregateRow(
                id: 2, name: "Unbudgeted", code: nil, ord: nil,
                planCents: 0, factCents: 100_000,
                ratio: .infinity, isOver: true),
        ]
        let sorted = HomeData.sortForHome(rows)
        XCTAssertEqual(sorted.map(\.id), [2, 1])
    }

    // ─────────────── planTotal ───────────────

    func test_planTotal_sums_filtered_categories_planCents() {
        let cats = [
            makeCategory(id: 1, name: "A", planCents: 1_000_000),
            makeCategory(id: 2, name: "B", planCents: 2_500_000),
            makeCategory(id: 3, name: "C", planCents: 500_000),
        ]
        XCTAssertEqual(HomeData.planTotal(cats), 4_000_000)
    }

    func test_planTotal_empty_array_yields_zero() {
        XCTAssertEqual(HomeData.planTotal([]), 0)
    }
}
