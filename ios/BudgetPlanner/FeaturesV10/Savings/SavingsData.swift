// Phase 27-08 Task 1 (GREEN): pure-compute helpers for the iOS Savings
// (Копилка) screen (SAV-V10-01..04).
//
// Symmetric to web Plan 27-03 `frontend/src/screensV10/Savings/computeSavings.ts`
// (computeProgressPct / formatDueRu / isValidGoalDraft / isValidDepositDraft).
//
// All helpers stateless on `enum SavingsData` — no SwiftUI imports —
// so they unit-test cheaply (SavingsDataTests, 12+ cases).
//
// Behaviours covered (per PLAN <behavior>):
//   - computeProgressPct       → currentCents / targetCents → 0..100,
//                                clamped on the rails (target<=0 → 0;
//                                negative current → 0).
//   - formatDueRu              → Date? → "до D <month_genitive> YYYY"
//                                or nil for nil/invalid input.
//   - isValidGoalDraft         → name.trim().nonEmpty AND target > 0.
//   - isValidDepositDraft      → amount > 0 AND account_id != nil.
//
// Calendar parameter on `formatDueRu` defaults to `.current` (production)
// but tests inject Europe/Moscow for determinism (mirrors
// `SubscriptionsDomain.cadenceRuV10` — consolidated in Plan 70-04).
//
// MONTHS_RU_GEN reuses the same genitive list as V10Formatters but
// kept here as a private constant to avoid coupling the Savings
// helpers to the formatter module (lets the helpers compile + test
// independently of the V10 chrome).

import Foundation

enum SavingsData {

    /// Russian genitive month names — same list as V10Formatters but
    /// duplicated here so this module stays self-contained for tests.
    /// One-time `static let` cost is negligible.
    static let MONTHS_RU_GEN: [String] = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]

    /// Goal completion percentage as a clamped integer in 0..100.
    ///
    /// Edge cases:
    ///   - `targetCents <= 0` → 0 (avoids divide-by-zero; treats
    ///     "no target" as no progress).
    ///   - `currentCents <= 0` → 0 (negative balance = no progress).
    ///   - Otherwise → round(current/target * 100), clamped to [0, 100].
    static func computeProgressPct(currentCents: Int, targetCents: Int) -> Int {
        guard targetCents > 0 else { return 0 }
        guard currentCents > 0 else { return 0 }
        let ratio = Double(currentCents) / Double(targetCents) * 100.0
        let rounded = Int(ratio.rounded())
        return max(0, min(100, rounded))
    }

    /// Format a goal due-date as Russian "до D <month_genitive> YYYY".
    ///
    /// Returns nil for nil input OR for inputs whose calendar
    /// component extraction fails (defensive — should never happen
    /// for any Date the backend sends, but keeps the helper total).
    ///
    /// `calendar` injectable for test determinism (defaults to `.current`).
    static func formatDueRu(
        _ date: Date?,
        calendar: Calendar = .current
    ) -> String? {
        guard let date = date else { return nil }
        let comps = calendar.dateComponents([.day, .month, .year], from: date)
        guard
            let day = comps.day,
            let month = comps.month,
            let year = comps.year,
            (1...12).contains(month)
        else { return nil }
        return "до \(day) \(MONTHS_RU_GEN[month - 1]) \(year)"
    }

    /// Validation gate for the NewGoalSheet СОХРАНИТЬ button.
    /// Mirror of web `isValidGoalDraft` — name non-empty after trim AND
    /// target_cents > 0. Backend enforces `name min_length=1, max=80`
    /// and `target_cents > 0` separately; UI only needs to gate the
    /// happy path.
    static func isValidGoalDraft(name: String, targetCents: Int) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && targetCents > 0
    }

    /// Validation gate for the DepositSheet СОХРАНИТЬ button.
    /// Mirror of web `isValidDepositDraft` — amount > 0 AND an account
    /// is selected. Backend's `DepositCreate.account_id = Field(gt=0)`
    /// is REQUIRED — UI must never POST a missing account_id.
    static func isValidDepositDraft(amountCents: Int, accountId: Int?) -> Bool {
        return amountCents > 0 && accountId != nil
    }
}
