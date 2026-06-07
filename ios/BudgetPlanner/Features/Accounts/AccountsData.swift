// Phase 27-09 Task 1 (GREEN): pure compute helpers for the V10 Accounts
// screen — symmetric to web Plan 27-04 `computeAccounts.ts`.
//
// Helpers are side-effect free (no fetch, no @MainActor) so they unit-test
// in isolation. AccountsListV10ViewModel / AccountDetailV10ViewModel call
// these to derive display state from raw [AccountDTO] and [ActualV10DTO].
//
// Formula source-of-truth = web — keep ports byte-identical:
//   - sumBalances        Σ balance_cents
//   - count              [AccountDTO].count
//   - formatBankSubtitle 4 paths: card+mask / card / cash / savings
//   - filterByAccount    rows where account_id == id
//   - sumPeriodOps       inclusive [ps, pe] window — count + Σ |amount|
//   - isValidNewAccountDraft   bank trim + balance ≥ 0

import Foundation

enum AccountsData {

    /// Σ `balance_cents` across all accounts. Negative balances permitted
    /// (offline scenarios) and contribute as-is.
    static func sumBalances(_ list: [AccountDTO]) -> Int {
        list.reduce(0) { $0 + $1.balanceCents }
    }

    /// Convenience over `[AccountDTO].count` — readability at call sites.
    static func count(_ list: [AccountDTO]) -> Int { list.count }

    /// Compose the row subtitle for the Accounts list:
    ///   - `card` + mask → "карта ·· 1234"
    ///   - `card` w/o mask → "карта"
    ///   - `cash` → "наличные"
    ///   - `savings` → "накопит. счёт"
    static func formatBankSubtitle(_ a: AccountDTO) -> String {
        switch a.kind {
        case .cash:
            return "наличные"
        case .savings:
            return "накопит. счёт"
        case .card:
            if let mask = a.mask, !mask.isEmpty {
                return "карта ·· \(mask)"
            }
            return "карта"
        }
    }

    /// Subset of actuals that belong to the given account. Drops nulls
    /// (legacy v0.x rows where `account_id == nil`).
    static func filterByAccount(_ actuals: [ActualV10DTO], accountId: Int) -> [ActualV10DTO] {
        actuals.filter { $0.accountId == accountId }
    }

    /// Count + sum of |amount_cents| for tx in inclusive [periodStart, periodEnd].
    /// `abs` so signed deltas (refunds, corrections) still contribute positively
    /// to the «N ОПЕРАЦИЙ» KPI plate sum.
    static func sumPeriodOps(
        _ actuals: [ActualV10DTO],
        periodStart: BusinessDate,
        periodEnd: BusinessDate
    ) -> (count: Int, sumCents: Int) {
        // E2/R7: txDate, periodStart and periodEnd are all BusinessDate, so the
        // inclusive [periodStart, periodEnd] range is a direct BusinessDate
        // comparison (all anchored at MSK midnight) — the day-inclusive
        // boundary selects exactly the same transactions as before, with no
        // Date round-trip and no TZ ambiguity.
        let inRange = actuals.filter { $0.txDate >= periodStart && $0.txDate <= periodEnd }
        return (inRange.count, inRange.reduce(0) { $0 + abs($1.amountCents) })
    }

    /// UI gate for the «СОХРАНИТЬ» button on NewAccountSheet (T-27-09-01).
    /// Backend Pydantic enforces additional validation; this is the local
    /// fast-path that disables the button until the user fills required
    /// fields with sane values.
    static func isValidNewAccountDraft(bank: String, balanceCents: Int) -> Bool {
        let trimmed = bank.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && balanceCents >= 0
    }
}
