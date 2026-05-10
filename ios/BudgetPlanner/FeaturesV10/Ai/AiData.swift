// Phase 27-07 Task 1 — pure compute helpers for the V10 AI screen.
//
// Symmetric to web Plan 27-02 `screensV10/Ai/computeAi.ts`.
// Stateless helpers on `enum AiData` — fully testable via XCTest.
//
// Surface:
//   - MONTHS_RU_GEN          — 12 RU genitive month names («января» … «декабря»)
//   - todayRu(_:calendar:)   — formats day + month genitive («9 мая»)
//   - DEFAULT_SUGGESTION_CHIPS — 4 fixed prompt suggestions for initial state.
//
// Note: a sister `MONTHS_RU_GENITIVE` exists in `V10Formatters.swift` for
// period-eyebrow formatting; we keep an Ai-local copy to keep this feature's
// unit-test surface self-contained (Wave-3 disjoint-files convention).

import Foundation

enum AiData {
    static let MONTHS_RU_GEN: [String] = [
        "января", "февраля", "марта",  "апреля",
        "мая",    "июня",    "июля",   "августа",
        "сентября","октября", "ноября", "декабря",
    ]

    /// Formats a calendar date as `«{day} {month-genitive}»` — e.g. `9 мая`.
    /// Defaults to `Calendar.current` so callers can override with the
    /// shell's MSK-locked calendar (V10 convention).
    static func todayRu(_ d: Date, calendar: Calendar = .current) -> String {
        let comps = calendar.dateComponents([.day, .month], from: d)
        let day = comps.day ?? 1
        let monthIdx = max(1, min(12, comps.month ?? 1)) - 1
        return "\(day) \(MONTHS_RU_GEN[monthIdx])"
    }

    /// Fixed list of 4 initial-state prompt suggestions. Symmetric to web
    /// `DEFAULT_SUGGESTION_CHIPS` so iOS/web AI screens advertise the same
    /// quick-actions to the user.
    static let DEFAULT_SUGGESTION_CHIPS: [String] = [
        "Сколько я потратил на кафе в мае?",
        "Покажи топ-3 категории за неделю",
        "Создай регулярный платёж 1490 ₽ Wildberries 5 числа",
        "Куда уходят деньги в этом месяце?",
    ]
}
