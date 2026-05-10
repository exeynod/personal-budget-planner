// Phase 26-07 Task 1 (GREEN): pure-compute helpers for the iOS Subscriptions
// screen (SUBS-V10-01..04). Symmetric to web Plan 26-06 data layer.
//
// All helpers are stateless static functions on `SubscriptionsData` —
// no SwiftUI imports — so they unit-test cheaply (SubscriptionsDataTests,
// 14 cases).
//
// Behaviours covered (per PLAN <behavior>):
//   - computeActiveCount             → counts isActive == true.
//   - computeMonthlyTotal            → Σ amountCents WHERE isActive AND cycle == .monthly.
//   - computeYearlyTotalAnnualized   → monthly*12 + Σ yearly active amountCents.
//   - formatCadenceRu                → human label for the row caption:
//       monthly + dayOfMonth → "каждое N число"
//       monthly + nil         → "ежемесячно"
//       yearly                → "{day} {month_genitive}" from nextChargeDate
//   - sortForDisplay                 → active first, then amount DESC, then name ASC.
//
// Threat-model notes:
//   - T-26-07-02 (day_of_month out of range) — UI Stepper(1...28) constrains;
//     formatCadenceRu does not validate (renders whatever value is in the DTO).
//   - Calendar parameter for formatCadenceRu defaults to `.current`; tests
//     inject Europe/Moscow for determinism.

import Foundation

enum SubscriptionsData {

    // MARK: - Aggregates

    /// Number of subscriptions with `isActive == true`.
    static func computeActiveCount(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy.filter { $0.isActive }.count
    }

    /// Σ amountCents for active monthly subscriptions only.
    static func computeMonthlyTotal(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy
            .filter { $0.isActive && $0.cycle == .monthly }
            .reduce(0) { $0 + $1.amountCents }
    }

    /// Annualised total = monthly_total * 12 + Σ yearly active amountCents.
    /// Used for the eyebrow «N АКТИВНЫХ · Y ₽ В ГОД».
    static func computeYearlyTotalAnnualized(_ subs: [SubscriptionV10DTO]) -> Int {
        let monthlyAnnual = computeMonthlyTotal(subs) * 12
        let yearlySum = subs.lazy
            .filter { $0.isActive && $0.cycle == .yearly }
            .reduce(0) { $0 + $1.amountCents }
        return monthlyAnnual + yearlySum
    }

    // MARK: - Cadence label

    /// Human-readable cadence label for the row caption.
    ///
    /// Cases:
    ///   - cycle == .monthly && dayOfMonth != nil → "каждое \(day) число"
    ///   - cycle == .monthly && dayOfMonth == nil → "ежемесячно"
    ///   - cycle == .yearly                       → "\(day) \(month_genitive)"
    ///
    /// `calendar` is injectable for test determinism (defaults to `.current`).
    static func formatCadenceRu(
        _ sub: SubscriptionV10DTO,
        calendar: Calendar = .current
    ) -> String {
        if sub.cycle == .monthly {
            if let day = sub.dayOfMonth {
                return "каждое \(day) число"
            }
            return "ежемесячно"
        }
        // .yearly
        let day = calendar.component(.day, from: sub.nextChargeDate)
        let monthIdx = calendar.component(.month, from: sub.nextChargeDate) - 1
        guard (0..<V10Formatters.monthsRuGenitive.count).contains(monthIdx) else {
            return "ежегодно"
        }
        return "\(day) \(V10Formatters.monthsRuGenitive[monthIdx])"
    }

    // MARK: - Sort

    /// Display order: active first, then amount DESC, then name ASC.
    /// Stable: ties broken by `localizedCompare` so cyrillic ordering is sane.
    static func sortForDisplay(_ subs: [SubscriptionV10DTO]) -> [SubscriptionV10DTO] {
        subs.sorted { lhs, rhs in
            if lhs.isActive != rhs.isActive { return lhs.isActive }
            if lhs.amountCents != rhs.amountCents { return lhs.amountCents > rhs.amountCents }
            return lhs.name.localizedCompare(rhs.name) == .orderedAscending
        }
    }
}
