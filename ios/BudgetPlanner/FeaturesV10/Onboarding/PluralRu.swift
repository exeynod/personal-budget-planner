// Phase 24-05: Russian pluralisation helper for the onboarding flow.
//
// Symmetric to web `pluralAccounts(_)` from Plan 24-04 (frontend
// src/screensV10/Onboarding/format.ts). Same rule, same outputs:
//
//   - one  (n%10 == 1 && n%100 != 11)              → "счёт"
//   - few  (n%10 ∈ 2..4  && n%100 ∉ 12..14)         → "счёта"
//   - many (everything else, incl. 0 and the teens) → "счётов"
//
// Pure logic, no SwiftUI imports — covered by unit tests in
// `BudgetPlannerTests/Step02AccountsTests.swift`. Kept as a separate
// type so other onboarding screens (categories / goals) can reuse the
// same helper for their own nouns later.

import Foundation

enum PluralRu {
    /// Pluralised form of «счёт» for `n` accounts.
    ///
    /// Examples: 0→"счётов", 1→"счёт", 2→"счёта", 5→"счётов",
    /// 11→"счётов", 21→"счёт", 22→"счёта", 25→"счётов".
    static func accounts(_ n: Int) -> String {
        let abs = Swift.abs(n)
        let mod10 = abs % 10
        let mod100 = abs % 100

        // Teen exception (11..14) trumps the mod10 rule.
        if (11...14).contains(mod100) {
            return "счётов"
        }
        if mod10 == 1 {
            return "счёт"
        }
        if (2...4).contains(mod10) {
            return "счёта"
        }
        return "счётов"
    }
}
