// Phase 25-09 Task 1 (GREEN): pure-compute helpers for the iOS Transactions
// registry view (TXN-V10-01..05).
//
// Symmetric to web Plan 25-08 transactions data layer. All helpers are
// stateless static functions on `TransactionsData` — no SwiftUI imports —
// so they unit-test cheaply (TransactionsDataTests).
//
// Threat-model mitigations enforced here (per PLAN <threat_model>):
//   - T-25-09-01 (Tampering: filter chip showing wrong code): hardcoded
//     enum-to-code mapping in `applyFilterChip`. Tests assert each chip
//     yields the expected dataset.
//
// Design notes:
//   - `formatTxAmount` uses U+2212 (MINUS SIGN) — NOT ASCII '-' (U+002D).
//     The minus sign matches typographic conventions for money display
//     and prevents collisions with hyphens in nearby labels.
//   - `groupByDay` sorts groups by max txDate DESC (newest day first) and
//     rows within a group by `createdAt ?? txDate` DESC so most-recent
//     entries surface to the top of the registry.
//   - `tagFor` returns `nil` for kind .expense / .income (no spec-tag
//     visible) and the dedicated TxTag for .roundup / .deposit.

import Foundation

// MARK: - Filter chip enum (TXN-V10-02)

/// Single-select filter chip for the registry. `rawValue` is a stable id
/// useful for tests and equality (the human-readable Russian label is
/// returned by the `label` computed property).
enum TransactionFilterChip: String, CaseIterable, Equatable {
    case all
    case cafe
    case food
    case transit
    case subs
    case savings

    /// Human-readable Russian label rendered in the chip-bar.
    var label: String {
        switch self {
        case .all: return "Все"
        case .cafe: return "Кафе"
        case .food: return "Продукты"
        case .transit: return "Транспорт"
        case .subs: return "Подписки"
        case .savings: return "Копилка"
        }
    }
}

// MARK: - Spec-tag enum (TXN-V10-04)

/// Inline spec-tag plate displayed next to the row name.
///   - `.roundup` → yellow plate «↻ ОКРУГЛ.»
///   - `.deposit` → paper plate «→ КОПИЛКА»
enum TxTag: Equatable {
    case roundup
    case deposit
}

// MARK: - Day group struct (TXN-V10-03)

/// One day-bucket in the grouped registry list.
///   - `id` / `dateKey`: stable yyyy-MM-dd component used as ForEach id.
///   - `dateLabel`: «Сегодня» / «Вчера» / «N мая» from V10Formatters.formatDay.
///   - `rows`: ActualV10DTOs that fall in this calendar day, sorted DESC
///     by createdAt (txDate fallback) — newest first.
///   - `sumCents`: Σ |amountCents| across the rows in the bucket.
struct TxDayGroup: Identifiable, Equatable {
    let id: String
    let dateLabel: String
    let dateKey: String
    let rows: [ActualV10DTO]
    let sumCents: Int
}

// MARK: - Pure helpers

enum TransactionsData {

    // MARK: applyFilterChip (T-25-09-01 mitigation)

    /// Filter `actuals` according to the selected `chip`.
    ///
    /// Mapping (mirrors web Plan 25-08):
    ///   - .all      → no filter (full list)
    ///   - .cafe     → categories.first(where: id == a.categoryId)?.code == "cafe"
    ///   - .food     → ... == "food"
    ///   - .transit  → ... == "transit"
    ///   - .subs     → ... == "subs"
    ///   - .savings  → kind in [.roundup, .deposit] (kind-based, not code-based)
    static func applyFilterChip(
        _ actuals: [ActualV10DTO],
        categories: [CategoryV10DTO],
        chip: TransactionFilterChip
    ) -> [ActualV10DTO] {
        switch chip {
        case .all:
            return actuals
        case .savings:
            return actuals.filter { $0.kind == .roundup || $0.kind == .deposit }
        case .cafe, .food, .transit, .subs:
            let target: String
            switch chip {
            case .cafe: target = "cafe"
            case .food: target = "food"
            case .transit: target = "transit"
            case .subs: target = "subs"
            default: target = ""
            }
            // Pre-bucket category id → code for O(N+M) lookup.
            var codeById: [Int: String?] = [:]
            for c in categories { codeById[c.id] = c.code }
            return actuals.filter { codeById[$0.categoryId, default: nil] == target }
        }
    }

    // MARK: groupByDay

    /// Group `actuals` by calendar day and produce a sorted [TxDayGroup].
    ///
    /// Sort: groups by max txDate DESC; rows within a group by
    /// `createdAt ?? txDate` DESC.
    /// Sum: Σ |amountCents| (absolute value) across rows in the bucket.
    static func groupByDay(
        _ actuals: [ActualV10DTO],
        today: Date,
        calendar: Calendar = .current
    ) -> [TxDayGroup] {
        guard !actuals.isEmpty else { return [] }

        // Bucket rows by day (yyyy-MM-dd in the supplied calendar's TZ).
        let keyFormatter = DateFormatter()
        keyFormatter.calendar = calendar
        keyFormatter.timeZone = calendar.timeZone
        keyFormatter.dateFormat = "yyyy-MM-dd"

        var buckets: [String: [ActualV10DTO]] = [:]
        var anyDateForKey: [String: Date] = [:]
        for a in actuals {
            // E2/R7: txDate is BusinessDate; bridge to its MSK-midnight `.date`
            // for the day-key formatter and the per-day representative-date
            // tracking (anyDateForKey holds audit-style Date). Behavior is
            // unchanged — the bridged instant is the same MSK midnight the
            // decoder produced.
            let txDate = a.txDate.date
            let key = keyFormatter.string(from: txDate)
            buckets[key, default: []].append(a)
            // Track newest txDate per day for inter-group sort.
            if let existing = anyDateForKey[key] {
                if txDate > existing { anyDateForKey[key] = txDate }
            } else {
                anyDateForKey[key] = txDate
            }
        }

        // Build groups in DESC order of representative date.
        let orderedKeys = buckets.keys.sorted { lhs, rhs in
            (anyDateForKey[lhs] ?? .distantPast) > (anyDateForKey[rhs] ?? .distantPast)
        }

        return orderedKeys.map { key in
            let rows = buckets[key] ?? []
            let sortedRows = rows.sorted { lhs, rhs in
                let l = lhs.createdAt ?? lhs.txDate.date
                let r = rhs.createdAt ?? rhs.txDate.date
                return l > r
            }
            let sum = sortedRows.reduce(0) { $0 + Swift.abs($1.amountCents) }
            // Use any row's txDate (the representative) for label formatting.
            let repDate = anyDateForKey[key] ?? sortedRows.first?.txDate.date ?? today
            let label = V10Formatters.formatDay(repDate, today: today, calendar: calendar)
            return TxDayGroup(id: key, dateLabel: label, dateKey: key, rows: sortedRows, sumCents: sum)
        }
    }

    // MARK: computeHeaderSummary

    /// Header summary line: «{count} ЗАПИСЕЙ · {sumCents formatted} ₽».
    /// `sumCents` is Σ |amountCents| across all rows.
    static func computeHeaderSummary(_ actuals: [ActualV10DTO]) -> (count: Int, sumCents: Int) {
        let sum = actuals.reduce(0) { $0 + Swift.abs($1.amountCents) }
        return (count: actuals.count, sumCents: sum)
    }

    // MARK: formatTxAmount

    /// Format a signed `amountCents` for display in a transaction row.
    ///
    ///   - Negative: `"\u{2212}{abs}\u{00A0}₽"` — U+2212 MINUS SIGN.
    ///   - Positive: `"+{abs}\u{00A0}₽"`.
    ///   - Zero: `"0 ₽"`.
    ///
    /// `RubleFormatter.format(cents:)` handles the U+202F NNBSP grouping.
    static func formatTxAmount(_ amountCents: Int) -> String {
        if amountCents == 0 { return "0 ₽" }
        let formatted = RubleFormatter.format(cents: amountCents)
        if amountCents < 0 {
            // U+2212 = MINUS SIGN (the proper typographic sign, not ASCII '-').
            return "\u{2212}\(formatted) ₽"
        }
        return "+\(formatted) ₽"
    }

    /// Format a transaction's amount with the **sign driven by `kind`**, not by
    /// the numeric sign of the stored value.
    ///
    /// The API returns `amountCents` as a positive magnitude for every kind
    /// (expenses are NOT stored negative), so the value-sign overload above
    /// renders expenses with a misleading "+". The registry / detail rows must
    /// instead derive direction from `kind` — matching the v0.6 reference
    /// (`Features/Transactions/TransactionsView.swift` `amountText`):
    ///
    ///   - `.income`                      → `"+{abs}\u{00A0}₽"`
    ///   - `.expense` / `.roundup` / `.deposit` → `"\u{2212}{abs}\u{00A0}₽"`
    ///
    /// Zero magnitude always renders `"0 ₽"` regardless of kind.
    ///
    /// This is display-only — stored values are never mutated.
    static func formatTxAmount(_ amountCents: Int, kind: ActualKindV10) -> String {
        let magnitude = Swift.abs(amountCents)
        if magnitude == 0 { return "0 ₽" }
        let formatted = RubleFormatter.format(cents: magnitude)
        switch kind {
        case .income:
            return "+\(formatted) ₽"
        case .expense, .roundup, .deposit:
            // U+2212 = MINUS SIGN (the proper typographic sign, not ASCII '-').
            return "\u{2212}\(formatted) ₽"
        }
    }

    // MARK: tagFor

    /// Spec-tag for the row, if any:
    ///   - .roundup → `.roundup` plate
    ///   - .deposit → `.deposit` plate
    ///   - else (.expense / .income) → nil (no plate)
    static func tagFor(_ tx: ActualV10DTO) -> TxTag? {
        switch tx.kind {
        case .roundup: return .roundup
        case .deposit: return .deposit
        case .expense, .income: return nil
        }
    }
}
