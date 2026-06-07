// Phase 24-01: Default 8 categories for V10 onboarding step 03 (PLAN).
//
// Shares + ord match the web mirror at
// `frontend/src/screensV10/Onboarding/defaultCategories.ts` — keep them
// in lock-step. Sum of shares = 0.83; the remaining 0.17 is shown to the
// user as the savings/copilka counter at the bottom of Step 03.

import Foundation

struct DefaultCategory: Hashable, Sendable {
    let code: String
    /// UPPERCASE Russian name, exact strings shown on Step 03 cards.
    let name: String
    /// Display ord — 2-digit "01".."08".
    let ord: String
    /// Initial slider share. floor(income * share / 50_000) * 50_000 cents.
    let share: Double
}

enum DefaultCategories {
    /// Slider step in cents = 500₽ = 50_000 cents (DATA-MODEL §1.3).
    static let planStepCents: Int = 50_000

    static let all: [DefaultCategory] = [
        .init(code: "food", name: "ПРОДУКТЫ", ord: "01", share: 0.20),
        .init(code: "cafe", name: "КАФЕ", ord: "02", share: 0.10),
        .init(code: "home", name: "ДОМ", ord: "03", share: 0.30),
        .init(code: "transit", name: "ТРАНСПОРТ", ord: "04", share: 0.06),
        .init(code: "fun", name: "РАЗВЛЕЧ.", ord: "05", share: 0.05),
        .init(code: "gifts", name: "ПОДАРКИ", ord: "06", share: 0.04),
        .init(code: "health", name: "ЗДОРОВЬЕ", ord: "07", share: 0.05),
        .init(code: "subs", name: "ПОДПИСКИ", ord: "08", share: 0.03),
    ]

    /// O(1) whitelist for setPlan(code:cents:).
    static let codes: Set<String> = Set(all.map { $0.code })

    /// Compute initial plan allocation from income with floor-to-step
    /// rounding. Mirror of web `defaultPlanFromIncome`.
    static func defaultPlan(fromIncomeCents incomeCents: Int) -> [String: Int] {
        var out: [String: Int] = [:]
        let step = planStepCents
        for cat in all {
            let raw = Double(incomeCents) * cat.share
            // Match web semantics: floor(raw / step) * step.
            let ticks = Int((raw / Double(step)).rounded(.down))
            out[cat.code] = ticks * step
        }
        return out
    }
}
