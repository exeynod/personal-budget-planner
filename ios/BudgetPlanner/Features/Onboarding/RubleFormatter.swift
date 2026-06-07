// Phase 24-03: RubleFormatter — single helper for displaying ruble amounts.
//
// Symmetric to web `formatRub(cents)` (frontend/src/screensV10/Onboarding/format.ts).
// Per DATA-MODEL §5.1 / D-11 the group separator is U+202F (NARROW NO-BREAK
// SPACE) — NOT a regular space — so the separator never collapses across
// line wraps and matches the prototype typography exactly.
//
// Implementation note: NumberFormatter's locale-driven grouping injects a
// regular ASCII space or NBSP depending on locale, which makes round-trips
// brittle. We perform manual digit-grouping instead: split rubles by
// thousands and join with U+202F. This is also faster than allocating an
// NSNumberFormatter on every keystroke.

import Foundation

enum RubleFormatter {
    /// Group separator: U+202F NARROW NO-BREAK SPACE (per DATA-MODEL §5.1).
    static let groupSeparator = "\u{202F}"

    /// Format ruble cents → display string.
    ///
    /// Examples (separator shown as `_` for clarity):
    ///   - `format(cents: 0)`          → `"0"`
    ///   - `format(cents: 99)`         → `"0"`        (truncated below 1₽)
    ///   - `format(cents: 100)`        → `"1"`
    ///   - `format(cents: 9_999)`      → `"99"`
    ///   - `format(cents: 1_000_000)`  → `"10_000"`
    ///   - `format(cents: 12_000_000)` → `"120_000"`
    static func format(cents: Int) -> String {
        // Negative values are not expected at the UI layer (incomeCents is
        // clamped to ≥0 by OnboardingFlow.setIncome) but `abs` keeps the
        // helper total in case a future caller passes signed deltas.
        let rubles = abs(cents) / 100
        let digits = String(rubles)

        // Insert U+202F every 3 digits from the right.
        var out = ""
        for (i, ch) in digits.reversed().enumerated() {
            if i > 0 && i % 3 == 0 {
                out.append(groupSeparator)
            }
            out.append(ch)
        }
        return String(out.reversed())
    }
}
