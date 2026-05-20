// Phase 70-04 (Workstream D / R6) — the SINGLE shared compute home for the
// Subscriptions domain, consumed by BOTH iOS shells:
//   - V10 poster shell  (FeaturesV10/Subscriptions/*)
//   - v06 native shell   (Features/Management/SubscriptionsView.swift)
//
// Why this file exists
// --------------------
// Two duplicate pure-compute enums used to live side-by-side:
//   - `SubscriptionsData`      (V10, Phase 26-07)
//   - `SubscriptionsViewData`  (v06, Phase 63-01)
// They drifted on purpose — different monthly-total formula, different sort
// order, different cadence copy — but the divergence was ACCIDENTAL-looking
// (two files, two enums) and would silently drift further. Owner decision R6
// keeps BOTH shells forever; the only way they don't drift is one shared
// compute layer where every divergence is INTENTIONAL and explicitly NAMED.
//
// Contract
// --------
// - Helpers shared by both shells have a plain name (`activeCount`, `isPosted`,
//   `isValidDraft`).
// - Helpers that intentionally differ per shell carry a `*V10` / `*V06` suffix
//   and a doc-comment stating which shell owns it and WHY it differs, so a
//   future reader knows the divergence is a product choice, not a bug.
// - Foundation-only (no SwiftUI). Деньги — Int cents, без float.
//
// PRESERVED per-shell differences (do NOT collapse — would change UI):
//   monthly total : V10 = Σ active monthly only  · V06 = Σ active (monthly full + yearly/12)
//   sort order    : V10 = active-first/amount-DESC/name-ASC · V06 = nextChargeDate ASC
//   cadence copy   : V10 = "каждое N число" / "{day} {month_genitive}"
//                   · V06 = "ежемесячно, N числа" / "ежегодно" (no genitive)

import Foundation

enum SubscriptionsDomain {

    // MARK: - Shared (identical on both shells)

    /// Number of subscriptions with `isActive == true`.
    /// Identical on both shells (was `computeActiveCount` in both old enums).
    static func activeCount(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy.filter { $0.isActive }.count
    }

    /// `postedTxnId != nil` — подписка проведена (создана транзакция).
    /// Shared — only v06 currently calls it (V10 has no post/unpost UI), but
    /// the predicate is shell-agnostic so it lives in the shared section.
    static func isPosted(_ sub: SubscriptionV10DTO) -> Bool {
        sub.postedTxnId != nil
    }

    /// Validation gate for the editor «Создать»/«Сохранить» button.
    ///
    /// name non-empty после trim AND amountCents > 0 AND categoryId != nil
    /// AND !submitting (double-submit guard zeroes button). Shared — only the
    /// v06 editor calls it today (V10 has no create path), kept shell-agnostic.
    static func isValidDraft(
        name: String,
        amountCents: Int,
        categoryId: Int?,
        submitting: Bool
    ) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && amountCents > 0 && categoryId != nil && !submitting
    }

    // MARK: - V10 variants (poster shell)

    /// V10 monthly total = Σ amountCents for active MONTHLY subscriptions only.
    /// Owner: V10 poster shell. WHY it differs from v06: the V10 eyebrow shows
    /// monthly-recurring spend only; yearly subs are surfaced via the annualised
    /// «в год» figure (`yearlyTotalAnnualizedV10`), NOT folded into the monthly
    /// number. (Was `SubscriptionsData.computeMonthlyTotal`.)
    static func monthlyTotalV10(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy
            .filter { $0.isActive && $0.cycle == .monthly }
            .reduce(0) { $0 + $1.amountCents }
    }

    /// V10 annualised total = monthly_total * 12 + Σ active yearly amountCents.
    /// Owner: V10 poster shell — eyebrow «N АКТИВНЫХ · Y ₽ В ГОД».
    /// (Was `SubscriptionsData.computeYearlyTotalAnnualized`.)
    static func yearlyTotalAnnualizedV10(_ subs: [SubscriptionV10DTO]) -> Int {
        let monthlyAnnual = monthlyTotalV10(subs) * 12
        let yearlySum = subs.lazy
            .filter { $0.isActive && $0.cycle == .yearly }
            .reduce(0) { $0 + $1.amountCents }
        return monthlyAnnual + yearlySum
    }

    /// V10 cadence label for the row caption.
    /// Owner: V10 poster shell. WHY it differs from v06: V10 spells out the
    /// concrete day ("каждое N число") and renders yearly cadence as
    /// "{day} {month_genitive}" via Europe/Moscow calendar — the poster shell
    /// favours specific, typographic copy. (Was `SubscriptionsData.formatCadenceRu`.)
    ///
    /// Cases:
    ///   - cycle == .monthly && dayOfMonth != nil → "каждое N число"
    ///   - cycle == .monthly && dayOfMonth == nil → "ежемесячно"
    ///   - cycle == .yearly                        → "{day} {month_genitive}"
    ///
    /// `calendar` is injectable for test determinism (defaults to `.current`).
    static func cadenceRuV10(
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
        let day = calendar.component(.day, from: sub.nextChargeDate.date)
        let monthIdx = calendar.component(.month, from: sub.nextChargeDate.date) - 1
        guard (0..<V10Formatters.monthsRuGenitive.count).contains(monthIdx) else {
            return "ежегодно"
        }
        return "\(day) \(V10Formatters.monthsRuGenitive[monthIdx])"
    }

    /// V10 display order: active first, then amount DESC, then name ASC.
    /// Owner: V10 poster shell. Stable: ties broken by `localizedCompare` so
    /// cyrillic ordering is sane. WHY it differs from v06: the poster grid leads
    /// with active + most-expensive subs. (Was `SubscriptionsData.sortForDisplay`.)
    static func sortV10(_ subs: [SubscriptionV10DTO]) -> [SubscriptionV10DTO] {
        subs.sorted { lhs, rhs in
            if lhs.isActive != rhs.isActive { return lhs.isActive }
            if lhs.amountCents != rhs.amountCents { return lhs.amountCents > rhs.amountCents }
            return lhs.name.localizedCompare(rhs.name) == .orderedAscending
        }
    }

    // MARK: - v06 variants (native legacy shell)

    /// v06 monthly load = Σ active (monthly: full amount; yearly: amount / 12).
    /// Owner: v06 native shell — «В месяц» card shows the total monthly burden
    /// of ALL active subs, annualising yearly via INTEGER /12 (no float, mirrors
    /// the legacy VM). WHY it differs from V10: v06 wants one combined monthly
    /// burden figure, V10 keeps monthly and yearly separate.
    /// (Was `SubscriptionsViewData.computeMonthlyLoadCents`.)
    static func monthlyLoadCentsV06(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy
            .filter { $0.isActive }
            .reduce(0) { acc, s in
                acc + (s.cycle == .monthly ? s.amountCents : s.amountCents / 12)
            }
    }

    /// v06 cadence copy for the row caption.
    /// Owner: v06 native shell. WHY it differs from V10: simpler RU copy without
    /// the day/month-genitive computation — "ежемесячно, N числа" / "ежегодно".
    /// (Was `SubscriptionsViewData.formatCadenceRu`.)
    ///
    /// Cases:
    ///   - cycle == .monthly && dayOfMonth != nil → "ежемесячно, N числа"
    ///   - cycle == .monthly && dayOfMonth == nil → "ежемесячно"
    ///   - cycle == .yearly                        → "ежегодно"
    static func cadenceRuV06(cycle: SubCycle, dayOfMonth: Int?) -> String {
        switch cycle {
        case .monthly:
            if let day = dayOfMonth {
                return "ежемесячно, \(day) числа"
            }
            return "ежемесячно"
        case .yearly:
            return "ежегодно"
        }
    }

    /// v06 master-list sort — nextChargeDate ASC (nearest charge first).
    /// Owner: v06 native shell. WHY it differs from V10: the native list is
    /// timeline-ordered (soonest charge on top), not amount-ranked. Returns a
    /// new array. (Was `SubscriptionsViewData.sortForDisplay`.)
    static func sortV06(_ subs: [SubscriptionV10DTO]) -> [SubscriptionV10DTO] {
        subs.sorted { $0.nextChargeDate < $1.nextChargeDate }
    }
}
