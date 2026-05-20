// Phase 60-04 Task 3: unit tests for AccountDetailViewModel state + derived
// properties.
//
// Scope:
//   - initial state (idle / account=nil / actuals=empty / categories=empty /
//     period=nil / accountId stored).
//   - categoryName(_:) lookup (hit / miss).
//   - dayGroups empty case (no actuals → no groups).
//   - dayGroups multi-day sort DESC (Europe/Moscow TZ — txDate ключи).
//   - dayGroups sum invariant (Σ |amount_cents|).
//   - hasActuals reflects count.
//   - calendar timezone identifier == "Europe/Moscow".
//
// Threat-model (T-60-03 Information Disclosure): tests НЕ exercise
// network failure path (APIClient mock отсутствует). Verification via
// grep gates (filtered Russian copy literal + 0 occurrences of raw error
// description). Smoke for actual .error state — manual через
// 60-VERIFICATION (auto-approved deferred per Plan 60-04 override).
//
// Fixture pattern: JSON-decode через `.convertFromSnakeCase` decoder —
// мирорит production wire contract (APIClient.shared.decoder).

import XCTest

@testable import BudgetPlanner

@MainActor
final class AccountDetailViewModelTests: XCTestCase {

    // MARK: - Calendar fixture

    private var moscow: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ mi: Int = 0) -> Date {
        moscow.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: mi))!
    }

    // MARK: - DTO factories

    private func makeAccount(
        id: Int,
        bank: String = "Т-Банк",
        kind: String = "card",
        mask: String? = "1234",
        balanceCents: Int = 100_000,
        primary: Bool = false
    ) -> AccountDTO {
        var fields: [String] = [
            "\"id\": \(id)",
            "\"bank\": \"\(bank)\"",
            "\"kind\": \"\(kind)\"",
            "\"balance_cents\": \(balanceCents)",
            "\"primary\": \(primary ? "true" : "false")",
        ]
        if let mask {
            fields.append("\"mask\": \"\(mask)\"")
        } else {
            fields.append("\"mask\": null")
        }
        // created_at required on AccountRead (Phase 69 B4).
        fields.append("\"created_at\": \"2026-05-09\"")
        let json = "{\(fields.joined(separator: ","))}".data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "UTC")
        dec.dateDecodingStrategy = .formatted(fmt)
        return try! dec.decode(AccountDTO.self, from: json)
    }

    private func makeCategory(id: Int, name: String, kind: String = "expense") -> CategoryV10DTO {
        // code/ord/created_at required on CategoryRead (Phase 69 B4).
        let json = """
            {
              "id": \(id),
              "name": "\(name)",
              "kind": "\(kind)",
              "is_archived": false,
              "sort_order": 0,
              "created_at": "2026-05-09",
              "code": "food",
              "ord": "01",
              "plan_cents": 0,
              "paused": false,
              "rollover": "misc"
            }
            """.data(using: .utf8)!
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
        accountId: Int? = 1,
        kind: String = "expense",
        txDate: Date,
        createdAt: Date? = nil
    ) -> ActualV10DTO {
        let isoFmt = ISO8601DateFormatter()
        isoFmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let txStr = isoFmt.string(from: txDate)
        let createdStr: String
        if let createdAt {
            createdStr = "\"\(isoFmt.string(from: createdAt))\""
        } else {
            createdStr = "null"
        }
        let accountStr = accountId.map { "\($0)" } ?? "null"
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
              "account_id": \(accountStr),
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
            let plain = DateFormatter()
            plain.dateFormat = "yyyy-MM-dd"
            plain.timeZone = TimeZone(identifier: "UTC")
            if let d = plain.date(from: str) { return d }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "bad date \(str)")
        }
        return try! dec.decode(ActualV10DTO.self, from: json)
    }

    // MARK: - Test 1: initial state

    func test_initialState_idleEmpty() {
        let vm = AccountDetailViewModel(accountId: 42)
        XCTAssertEqual(vm.status, .idle)
        XCTAssertNil(vm.account)
        XCTAssertTrue(vm.actuals.isEmpty)
        XCTAssertTrue(vm.categories.isEmpty)
        XCTAssertNil(vm.period)
        XCTAssertEqual(vm.accountId, 42)
        XCTAssertFalse(vm.hasActuals)
    }

    // MARK: - Test 2: categoryName lookup hit / miss

    func test_categoryName_returnsMatchingName() {
        let vm = AccountDetailViewModel(accountId: 1)
        vm._setStateForTesting(
            categories: [
                makeCategory(id: 1, name: "Food"),
                makeCategory(id: 2, name: "Зарплата", kind: "income"),
            ]
        )
        XCTAssertEqual(vm.categoryName(1), "Food")
        XCTAssertEqual(vm.categoryName(2), "Зарплата")
        XCTAssertNil(vm.categoryName(999))
    }

    // MARK: - Test 3: empty actuals → no groups

    func test_dayGroups_emptyActuals_returnsEmpty() {
        let vm = AccountDetailViewModel(accountId: 1)
        XCTAssertTrue(vm.dayGroups.isEmpty)
    }

    // MARK: - Test 4: three days → 3 groups sorted DESC (yyyy-MM-dd key DESC)

    func test_dayGroups_threeDaysInMoscowTZ_returnsSortedDesc() {
        let vm = AccountDetailViewModel(accountId: 1)
        vm._setStateForTesting(actuals: [
            makeActual(id: 1, categoryId: 1, amountCents: 1000, accountId: 1, txDate: date(2026, 5, 10)),
            makeActual(id: 2, categoryId: 1, amountCents: 2000, accountId: 1, txDate: date(2026, 5, 12)),
            makeActual(id: 3, categoryId: 1, amountCents: 3000, accountId: 1, txDate: date(2026, 5, 11)),
        ])
        let groups = vm.dayGroups
        XCTAssertEqual(groups.count, 3)
        // dateKey == "yyyy-MM-dd"; lexicographic == chronological для ISO-8601.
        XCTAssertEqual(groups[0].dateKey, "2026-05-12")
        XCTAssertEqual(groups[1].dateKey, "2026-05-11")
        XCTAssertEqual(groups[2].dateKey, "2026-05-10")
    }

    // MARK: - Test 5: single-day sum = Σ |amount|

    func test_dayGroups_sumsAbsoluteAmounts() {
        let vm = AccountDetailViewModel(accountId: 1)
        let day = date(2026, 5, 12)
        vm._setStateForTesting(actuals: [
            makeActual(id: 1, categoryId: 1, amountCents: 1000, accountId: 1, txDate: day),
            makeActual(
                id: 2, categoryId: 1, amountCents: 2500, accountId: 1, txDate: day, createdAt: date(2026, 5, 12, 10)),
            makeActual(
                id: 3, categoryId: 1, amountCents: 500, accountId: 1, txDate: day, createdAt: date(2026, 5, 12, 9)),
        ])
        let groups = vm.dayGroups
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].sumCents, 4000)
    }

    // MARK: - Test 6: hasActuals reflects state

    func test_hasActuals_reflectsCount() {
        let vm = AccountDetailViewModel(accountId: 1)
        XCTAssertFalse(vm.hasActuals)
        vm._setStateForTesting(actuals: [
            makeActual(id: 1, categoryId: 1, amountCents: 1000, accountId: 1, txDate: date(2026, 5, 12))
        ])
        XCTAssertTrue(vm.hasActuals)
    }

    // MARK: - Test 7: calendar TZ identifier

    func test_calendar_isEuropeMoscow() {
        let vm = AccountDetailViewModel(accountId: 1)
        XCTAssertEqual(vm.calendar.timeZone.identifier, "Europe/Moscow")
    }

    // MARK: - Test 8: account state writable through backdoor

    func test_setStateForTesting_assignsAccount() {
        let vm = AccountDetailViewModel(accountId: 5)
        let acc = makeAccount(id: 5, bank: "Tinkoff", kind: "card", mask: "0420", balanceCents: 200_000, primary: true)
        vm._setStateForTesting(account: acc)
        XCTAssertEqual(vm.account?.id, 5)
        XCTAssertEqual(vm.account?.bank, "Tinkoff")
        XCTAssertEqual(vm.account?.mask, "0420")
        XCTAssertTrue(vm.account?.primary ?? false)
    }

    // MARK: - Test 9: Status equatable distinguishes error messages

    func test_status_equatable_distinguishesErrorMessages() {
        XCTAssertNotEqual(
            AccountDetailViewModel.Status.error("Счёт не найден"),
            AccountDetailViewModel.Status.error("Не удалось загрузить счёт")
        )
        XCTAssertEqual(AccountDetailViewModel.Status.idle, .idle)
        XCTAssertEqual(AccountDetailViewModel.Status.loading, .loading)
        XCTAssertEqual(AccountDetailViewModel.Status.ready, .ready)
    }
}
