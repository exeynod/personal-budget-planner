// Phase 27-09 Task 1 (RED): unit specs for AccountsData (pure compute helpers)
// and AccountCreateRequest encoding. Symmetric to web Plan 27-04
// (frontend/src/screensV10/Accounts/__tests__/computeAccounts.test.ts).
//
// All ActualV10DTO fixtures decode through JSONDecoder (same convention as
// HomeDataTests / CategoryDetailDataTests) so DTO immutability is preserved.
//
// Tests cover:
//   - sumBalances / count
//   - formatBankSubtitle (3 kind variants × ±mask)
//   - filterByAccount
//   - sumPeriodOps (range filter + sum + count)
//   - isValidNewAccountDraft (empty/valid)
//   - AccountCreateRequest encode round-trip (primary nil omitted)

import XCTest

@testable import BudgetPlanner

final class AccountsDataTests: XCTestCase {

    // ─────────────── Calendar ───────────────
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }

    // ─────────────── DTO factories ───────────────

    private func makeAccount(
        id: Int,
        bank: String = "Тинькофф",
        kind: String = "card",
        mask: String? = nil,
        balance: Int = 0,
        primary: Bool = false
    ) -> AccountDTO {
        let maskJson = mask.map { "\"\($0)\"" } ?? "null"
        // created_at is required on AccountRead (Phase 69 B4) — supply a valid
        // value (+ date strategy) so the now-non-optional decode does not throw.
        let json = """
            {
              "id": \(id),
              "bank": "\(bank)",
              "mask": \(maskJson),
              "kind": "\(kind)",
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

    private func makeActual(
        id: Int,
        accountId: Int?,
        amountCents: Int,
        txDate: Date
    ) -> ActualV10DTO {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        let aidJson = accountId.map { "\($0)" } ?? "null"
        let json = """
            {
              "id": \(id),
              "period_id": 1,
              "kind": "expense",
              "amount_cents": \(amountCents),
              "description": null,
              "category_id": 1,
              "tx_date": "\(fmt.string(from: txDate))",
              "source": "mini_app",
              "created_at": null,
              "account_id": \(aidJson),
              "parent_txn_id": null
            }
            """.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    // ─────────────── sumBalances ───────────────

    func test_sumBalances_returns_total_for_multiple_accounts() {
        let accs = [
            makeAccount(id: 1, balance: 5_000_000, primary: true),
            makeAccount(id: 2, balance: 1_500_000),
            makeAccount(id: 3, balance: 250_000),
        ]
        XCTAssertEqual(AccountsData.sumBalances(accs), 6_750_000)
    }

    func test_sumBalances_empty_returns_zero() {
        XCTAssertEqual(AccountsData.sumBalances([]), 0)
    }

    // ─────────────── count ───────────────

    func test_count_returns_array_length() {
        let accs = [
            makeAccount(id: 1),
            makeAccount(id: 2),
        ]
        XCTAssertEqual(AccountsData.count(accs), 2)
        XCTAssertEqual(AccountsData.count([]), 0)
    }

    // ─────────────── formatBankSubtitle ───────────────

    func test_formatBankSubtitle_card_with_mask() {
        let a = makeAccount(id: 1, kind: "card", mask: "1234")
        XCTAssertEqual(AccountsData.formatBankSubtitle(a), "карта ·· 1234")
    }

    func test_formatBankSubtitle_card_without_mask() {
        let a = makeAccount(id: 1, kind: "card", mask: nil)
        XCTAssertEqual(AccountsData.formatBankSubtitle(a), "карта")
    }

    func test_formatBankSubtitle_cash() {
        let a = makeAccount(id: 1, kind: "cash")
        XCTAssertEqual(AccountsData.formatBankSubtitle(a), "наличные")
    }

    func test_formatBankSubtitle_savings() {
        let a = makeAccount(id: 1, kind: "savings")
        XCTAssertEqual(AccountsData.formatBankSubtitle(a), "накопит. счёт")
    }

    // ─────────────── filterByAccount ───────────────

    func test_filterByAccount_returns_only_matching_account_id() {
        let txs = [
            makeActual(id: 1, accountId: 5, amountCents: 100, txDate: date(2026, 5, 1)),
            makeActual(id: 2, accountId: 7, amountCents: 200, txDate: date(2026, 5, 2)),
            makeActual(id: 3, accountId: 5, amountCents: 300, txDate: date(2026, 5, 3)),
            makeActual(id: 4, accountId: nil, amountCents: 400, txDate: date(2026, 5, 4)),
        ]
        let filtered = AccountsData.filterByAccount(txs, accountId: 5)
        XCTAssertEqual(filtered.map(\.id), [1, 3])
    }

    func test_filterByAccount_empty_input_returns_empty() {
        XCTAssertEqual(AccountsData.filterByAccount([], accountId: 1).count, 0)
    }

    // ─────────────── sumPeriodOps ───────────────

    func test_sumPeriodOps_inclusive_range_count_and_sum() {
        let ps = date(2026, 5, 1)
        let pe = date(2026, 5, 31)
        let txs = [
            makeActual(id: 1, accountId: 1, amountCents: 1_000, txDate: date(2026, 5, 5)),
            makeActual(id: 2, accountId: 1, amountCents: 2_000, txDate: date(2026, 5, 31)),
            makeActual(id: 3, accountId: 1, amountCents: 3_000, txDate: date(2026, 4, 30)),
            makeActual(id: 4, accountId: 1, amountCents: 4_000, txDate: date(2026, 6, 1)),
        ]
        let result = AccountsData.sumPeriodOps(
            txs, periodStart: BusinessDate(ps), periodEnd: BusinessDate(pe))
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result.sumCents, 3_000)
    }

    func test_sumPeriodOps_uses_absolute_amount() {
        let ps = date(2026, 5, 1)
        let pe = date(2026, 5, 31)
        let txs = [
            makeActual(id: 1, accountId: 1, amountCents: -500, txDate: date(2026, 5, 10)),
            makeActual(id: 2, accountId: 1, amountCents: 700, txDate: date(2026, 5, 11)),
        ]
        let result = AccountsData.sumPeriodOps(
            txs, periodStart: BusinessDate(ps), periodEnd: BusinessDate(pe))
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result.sumCents, 1_200)
    }

    func test_sumPeriodOps_empty_returns_zero_zero() {
        let result = AccountsData.sumPeriodOps(
            [], periodStart: BusinessDate(date(2026, 5, 1)),
            periodEnd: BusinessDate(date(2026, 5, 31)))
        XCTAssertEqual(result.count, 0)
        XCTAssertEqual(result.sumCents, 0)
    }

    // ─────────────── isValidNewAccountDraft ───────────────

    func test_isValidNewAccountDraft_empty_bank_is_invalid() {
        XCTAssertFalse(AccountsData.isValidNewAccountDraft(bank: "", balanceCents: 0))
        XCTAssertFalse(AccountsData.isValidNewAccountDraft(bank: "   ", balanceCents: 100))
    }

    func test_isValidNewAccountDraft_valid_returns_true() {
        XCTAssertTrue(AccountsData.isValidNewAccountDraft(bank: "Тинькофф", balanceCents: 0))
        XCTAssertTrue(AccountsData.isValidNewAccountDraft(bank: "Сбер", balanceCents: 1_000_000))
    }

    func test_isValidNewAccountDraft_negative_balance_is_invalid() {
        XCTAssertFalse(AccountsData.isValidNewAccountDraft(bank: "Тинькофф", balanceCents: -100))
    }

    // ─────────────── AccountCreateRequest encoding ───────────────

    func test_AccountCreateRequest_encode_omits_nil_primary_and_mask() throws {
        let req = AccountCreateRequest(
            bank: "Тинькофф",
            kind: .card,
            mask: nil,
            balanceCents: 100_000,
            primary: nil
        )
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let data = try enc.encode(req)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(json["bank"] as? String, "Тинькофф")
        XCTAssertEqual(json["kind"] as? String, "card")
        XCTAssertEqual(json["balance_cents"] as? Int, 100_000)
        XCTAssertNil(json["primary"], "primary nil should be omitted")
        XCTAssertNil(json["mask"], "mask nil should be omitted")
    }

    func test_AccountCreateRequest_encode_includes_primary_when_set() throws {
        let req = AccountCreateRequest(
            bank: "Сбер",
            kind: .card,
            mask: "1234",
            balanceCents: 50_000,
            primary: true
        )
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let data = try enc.encode(req)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(json["primary"] as? Bool, true)
        XCTAssertEqual(json["mask"] as? String, "1234")
    }
}
