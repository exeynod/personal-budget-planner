// Phase 71 follow-up: AccessFormatting — pure, shell-agnostic derivation
// of the strings shown on the Access (admin) screen.
//
// Both shells consume the SAME `AccessV10ViewModel` (data/loading layer)
// AND the same formatting here, so the user list / AI-usage figures match
// EXACTLY between the maximal-poster `AccessV10View` and the native v06
// `AccessView`. This is the Phase 70 R6 «shared domain logic, per-shell
// Views» pattern: VM + derivations shared, presentation per shell.
//
// AI usage is USD — `cost_cents` / `spending_cap_cents` are US-cent
// integers, NOT ₽-копейки. We render them with a `$` prefix and never
// route through MoneyFormatter (which is ₽). Symmetric to the Настройки
// AI-limit row (`SettingsView.spendText`).

import Foundation

enum AccessFormatting {
    /// USD cents → "12.34" (two decimals, no symbol). Caller prepends `$`.
    static func usd(_ cents: Int) -> String {
        String(format: "%.2f", Double(cents) / 100.0)
    }

    /// USD cents → "$12.34".
    static func usdAmount(_ cents: Int) -> String {
        "$" + usd(cents)
    }

    /// AI-usage spend-vs-cap line, e.g. "$1.20 / $5.00".
    static func spendOverCap(spendCents: Int, capCents: Int) -> String {
        "\(usdAmount(spendCents)) / \(usdAmount(capCents))"
    }

    /// Percent-of-cap → whole-number percent, e.g. 0.42 → 42.
    static func pctInt(_ pct: Double) -> Int {
        Int(pct * 100)
    }

    /// AI-usage "% of cap" line, e.g. "42% / $5.00".
    static func pctOfCapLine(pct: Double, capCents: Int) -> String {
        "\(pctInt(pct))% / \(usdAmount(capCents))"
    }

    /// Role display label, uppercased (e.g. "owner" → "OWNER").
    static func roleLabel(_ role: String) -> String {
        role.uppercased()
    }
}
