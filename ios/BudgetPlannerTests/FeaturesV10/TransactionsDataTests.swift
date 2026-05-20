// Phase 25-09 Task 1 (RED): unit specs for TransactionsData (pure compute helpers
// for the iOS Transactions registry view).
//
// Mirrors HomeDataTests fixture pattern (DTOs decoded via JSON to bypass
// synthesized inits) so DTO/wire schema drift is caught at the test boundary.
//
// Coverage matrix (per PLAN <behavior>):
//   - applyFilterChip: 6 chips × representative dataset
//   - groupByDay: empty, mixed-day grouping, sort-by-day-DESC,
//                 within-day sort by createdAt DESC, sumCents per group
//   - computeHeaderSummary: empty + non-empty (count + sumCents == Σ|amount|)
//   - formatTxAmount: negative (asserts U+2212), positive (+), zero, large 1M+
//   - tagFor: each kind value (.expense/.income → nil, .roundup → .roundup,
//                              .deposit → .deposit)

import XCTest

@testable import BudgetPlanner

final class TransactionsDataTests: XCTestCase {

    // MARK: - shared calendar / fixtures

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ mi: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: mi))!
    }

    /// Build a CategoryV10DTO via JSON decode (synthesized init unavailable).
    private func makeCategory(
        id: Int,
        name: String = "Кафе",
        kind: String = "expense",
        code: String = "food",
        planCents: Int = 0,
        paused: Bool = false
    ) -> CategoryV10DTO {
        // code/ord/created_at required on CategoryRead (Phase 69 B4).
        let fields: [String] = [
            "\"id\": \(id)",
            "\"name\": \"\(name)\"",
            "\"kind\": \"\(kind)\"",
            "\"is_archived\": false",
            "\"sort_order\": 0",
            "\"created_at\": \"2026-05-09\"",
            "\"ord\": \"01\"",
            "\"plan_cents\": \(planCents)",
            "\"paused\": \(paused)",
            "\"rollover\": \"misc\"",
            "\"code\": \"\(code)\"",
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

    /// Build an ActualV10DTO via JSON decode. txDate uses ISO-8601 with TZ to
    /// keep the TX-row sort tests deterministic across host timezones.
    private func makeActual(
        id: Int,
        categoryId: Int,
        amountCents: Int,
        kind: String = "expense",
        txDate: Date,
        createdAt: Date? = nil
    ) -> ActualV10DTO {
        let isoFmt = ISO8601DateFormatter()
        isoFmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let txStr = isoFmt.string(from: txDate)
        let createdStr: String
        if let createdAt { createdStr = "\"\(isoFmt.string(from: createdAt))\"" } else { createdStr = "null" }
        let json = """
            {
              "id": \(id),
              "period_id": 1,
              "kind": "\(kind)",
              "amount_cents": \(amountCents),
              "description": null,
              "category_id": \(categoryId),
              "tx_date": "\(txStr)",
              "source": "mini_app",
              "created_at": \(createdStr),
              "account_id": null,
              "parent_txn_id": null
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: str) { return d }
            // Fallback for plain yyyy-MM-dd
            let plain = DateFormatter()
            plain.dateFormat = "yyyy-MM-dd"
            plain.timeZone = TimeZone(identifier: "UTC")
            if let d = plain.date(from: str) { return d }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "bad date \(str)")
        }
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    // MARK: - TransactionFilterChip metadata

    func test_TransactionFilterChip_has_six_cases_in_canonical_order() {
        let cases = TransactionFilterChip.allCases
        XCTAssertEqual(cases.count, 6)
        XCTAssertEqual(cases.map(\.rawValue), ["all", "cafe", "food", "transit", "subs", "savings"])
    }

    func test_TransactionFilterChip_label_returns_russian_label() {
        XCTAssertEqual(TransactionFilterChip.all.label, "Все")
        XCTAssertEqual(TransactionFilterChip.cafe.label, "Кафе")
        XCTAssertEqual(TransactionFilterChip.food.label, "Продукты")
        XCTAssertEqual(TransactionFilterChip.transit.label, "Транспорт")
        XCTAssertEqual(TransactionFilterChip.subs.label, "Подписки")
        XCTAssertEqual(TransactionFilterChip.savings.label, "Копилка")
    }

    // MARK: - applyFilterChip — six cases

    private var sampleCats: [CategoryV10DTO] {
        [
            makeCategory(id: 1, name: "Кафе", code: "cafe"),
            makeCategory(id: 2, name: "Продукты", code: "food"),
            makeCategory(id: 3, name: "Транспорт", code: "transit"),
            makeCategory(id: 4, name: "Подписки", code: "subs"),
            makeCategory(id: 5, name: "Накопления", code: "savings"),
            makeCategory(id: 6, name: "Прочее", code: "misc"),
        ]
    }

    private var sampleActuals: [ActualV10DTO] {
        [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 2, amountCents: -120_000, txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 3, amountCents: -10_000, txDate: date(2026, 5, 9)),
            makeActual(id: 4, categoryId: 4, amountCents: -50_000, txDate: date(2026, 5, 9)),
            makeActual(id: 5, categoryId: 6, amountCents: -7_500, txDate: date(2026, 5, 9)),
            makeActual(id: 6, categoryId: 5, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9)),
            makeActual(id: 7, categoryId: 5, amountCents: -10_000, kind: "deposit", txDate: date(2026, 5, 9)),
        ]
    }

    func test_applyFilterChip_all_returns_full_list() {
        let out = TransactionsData.applyFilterChip(sampleActuals, categories: sampleCats, chip: .all)
        XCTAssertEqual(out.count, sampleActuals.count)
    }

    func test_applyFilterChip_cafe_filters_by_code_cafe() {
        let out = TransactionsData.applyFilterChip(sampleActuals, categories: sampleCats, chip: .cafe)
        XCTAssertEqual(out.map(\.id), [1])
    }

    func test_applyFilterChip_food_filters_by_code_food() {
        let out = TransactionsData.applyFilterChip(sampleActuals, categories: sampleCats, chip: .food)
        XCTAssertEqual(out.map(\.id), [2])
    }

    func test_applyFilterChip_transit_filters_by_code_transit() {
        let out = TransactionsData.applyFilterChip(sampleActuals, categories: sampleCats, chip: .transit)
        XCTAssertEqual(out.map(\.id), [3])
    }

    func test_applyFilterChip_subs_filters_by_code_subs() {
        let out = TransactionsData.applyFilterChip(sampleActuals, categories: sampleCats, chip: .subs)
        XCTAssertEqual(out.map(\.id), [4])
    }

    func test_applyFilterChip_savings_filters_by_kind_roundup_or_deposit() {
        let out = TransactionsData.applyFilterChip(sampleActuals, categories: sampleCats, chip: .savings)
        XCTAssertEqual(Set(out.map(\.id)), Set([6, 7]))
    }

    // MARK: - groupByDay

    func test_groupByDay_empty_returns_empty() {
        let out = TransactionsData.groupByDay([], today: date(2026, 5, 9), calendar: cal)
        XCTAssertTrue(out.isEmpty)
    }

    func test_groupByDay_mixed_day_buckets_by_dayLabel() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, txDate: date(2026, 5, 9, 10)),
            makeActual(id: 2, categoryId: 1, amountCents: -100_000, txDate: date(2026, 5, 9, 14)),
            makeActual(id: 3, categoryId: 2, amountCents: -50_000, txDate: date(2026, 5, 8, 12)),
            makeActual(id: 4, categoryId: 3, amountCents: -7_500, txDate: date(2026, 5, 7, 12)),
        ]
        let groups = TransactionsData.groupByDay(acts, today: date(2026, 5, 9), calendar: cal)
        XCTAssertEqual(groups.count, 3)
        XCTAssertEqual(groups[0].dateLabel, "Сегодня")
        XCTAssertEqual(groups[1].dateLabel, "Вчера")
        XCTAssertEqual(groups[2].dateLabel, "7 мая")
    }

    func test_groupByDay_sums_abs_amounts_per_group() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, txDate: date(2026, 5, 9, 10)),
            makeActual(id: 2, categoryId: 1, amountCents: -100_000, txDate: date(2026, 5, 9, 14)),
            makeActual(id: 3, categoryId: 2, amountCents: 50_000, kind: "income", txDate: date(2026, 5, 8, 12)),
        ]
        let groups = TransactionsData.groupByDay(acts, today: date(2026, 5, 9), calendar: cal)
        XCTAssertEqual(groups[0].sumCents, 125_000)
        XCTAssertEqual(groups[1].sumCents, 50_000)
    }

    func test_groupByDay_sorts_groups_by_max_txDate_desc() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -100, txDate: date(2026, 5, 7)),
            makeActual(id: 2, categoryId: 1, amountCents: -100, txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 1, amountCents: -100, txDate: date(2026, 5, 8)),
        ]
        let groups = TransactionsData.groupByDay(acts, today: date(2026, 5, 9), calendar: cal)
        XCTAssertEqual(groups.map(\.dateLabel), ["Сегодня", "Вчера", "7 мая"])
    }

    func test_groupByDay_within_group_sorts_rows_by_createdAt_desc() {
        let acts = [
            makeActual(
                id: 1, categoryId: 1, amountCents: -100,
                txDate: date(2026, 5, 9, 10), createdAt: date(2026, 5, 9, 10, 5)),
            makeActual(
                id: 2, categoryId: 1, amountCents: -200,
                txDate: date(2026, 5, 9, 11), createdAt: date(2026, 5, 9, 11, 30)),
            makeActual(
                id: 3, categoryId: 1, amountCents: -300,
                txDate: date(2026, 5, 9, 12), createdAt: date(2026, 5, 9, 12, 1)),
        ]
        let groups = TransactionsData.groupByDay(acts, today: date(2026, 5, 9), calendar: cal)
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].rows.map(\.id), [3, 2, 1])
    }

    func test_groupByDay_falls_back_to_txDate_when_createdAt_nil() {
        let acts = [
            makeActual(
                id: 1, categoryId: 1, amountCents: -100,
                txDate: date(2026, 5, 9, 8), createdAt: nil),
            makeActual(
                id: 2, categoryId: 1, amountCents: -200,
                txDate: date(2026, 5, 9, 18), createdAt: nil),
        ]
        let groups = TransactionsData.groupByDay(acts, today: date(2026, 5, 9), calendar: cal)
        XCTAssertEqual(groups[0].rows.map(\.id), [2, 1])
    }

    // MARK: - computeHeaderSummary

    func test_computeHeaderSummary_empty_yields_zero_count_and_zero_sum() {
        let summary = TransactionsData.computeHeaderSummary([])
        XCTAssertEqual(summary.count, 0)
        XCTAssertEqual(summary.sumCents, 0)
    }

    func test_computeHeaderSummary_sums_absolute_amounts_and_counts_rows() {
        let acts = [
            makeActual(id: 1, categoryId: 1, amountCents: -25_000, txDate: date(2026, 5, 9)),
            makeActual(id: 2, categoryId: 2, amountCents: 100_000, kind: "income", txDate: date(2026, 5, 9)),
            makeActual(id: 3, categoryId: 5, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9)),
        ]
        let summary = TransactionsData.computeHeaderSummary(acts)
        XCTAssertEqual(summary.count, 3)
        XCTAssertEqual(summary.sumCents, 25_000 + 100_000 + 50)
    }

    // MARK: - formatTxAmount

    func test_formatTxAmount_negative_uses_U2212_minus_sign() {
        let s = TransactionsData.formatTxAmount(-25_000)
        // U+2212 is the proper minus sign (not ASCII '-' = U+002D)
        XCTAssertTrue(
            s.contains("\u{2212}"),
            "expected U+2212 (MINUS SIGN) prefix, got \"\(s)\"")
        XCTAssertFalse(
            s.contains("-"),
            "must NOT contain ASCII hyphen-minus (U+002D), got \"\(s)\"")
        XCTAssertTrue(s.hasSuffix("₽"))
    }

    func test_formatTxAmount_positive_uses_plus() {
        let s = TransactionsData.formatTxAmount(50_000)
        XCTAssertTrue(s.hasPrefix("+"), "expected '+' prefix, got \"\(s)\"")
        XCTAssertTrue(s.hasSuffix("₽"))
    }

    func test_formatTxAmount_zero_returns_zero_with_ruble() {
        XCTAssertEqual(TransactionsData.formatTxAmount(0), "0 ₽")
    }

    func test_formatTxAmount_large_amount_groups_with_NNBSP() {
        // 1_000_000 cents = 10 000 ₽; RubleFormatter inserts U+202F
        let s = TransactionsData.formatTxAmount(-1_000_000)
        XCTAssertTrue(
            s.contains("10\u{202F}000"),
            "expected NNBSP-grouped 10 000, got \"\(s)\"")
    }

    // MARK: - tagFor

    func test_tagFor_returns_roundup_for_kind_roundup() {
        let tx = makeActual(id: 1, categoryId: 5, amountCents: -50, kind: "roundup", txDate: date(2026, 5, 9))
        XCTAssertEqual(TransactionsData.tagFor(tx), .roundup)
    }

    func test_tagFor_returns_deposit_for_kind_deposit() {
        let tx = makeActual(id: 1, categoryId: 5, amountCents: -10_000, kind: "deposit", txDate: date(2026, 5, 9))
        XCTAssertEqual(TransactionsData.tagFor(tx), .deposit)
    }

    func test_tagFor_returns_nil_for_kind_expense() {
        let tx = makeActual(id: 1, categoryId: 1, amountCents: -25_000, kind: "expense", txDate: date(2026, 5, 9))
        XCTAssertNil(TransactionsData.tagFor(tx))
    }

    func test_tagFor_returns_nil_for_kind_income() {
        let tx = makeActual(id: 1, categoryId: 1, amountCents: 100_000, kind: "income", txDate: date(2026, 5, 9))
        XCTAssertNil(TransactionsData.tagFor(tx))
    }
}
