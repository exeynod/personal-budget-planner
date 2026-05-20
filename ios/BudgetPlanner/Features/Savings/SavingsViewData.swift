// Phase 62 — pure-compute helpers для v06 Savings (Копилка) screen.
//
// Symmetric to FeaturesV10/Savings/SavingsData.swift but adapted:
//   - renamed enum to SavingsViewData (избегаем Swift symbol collision
//     в том же таргете BudgetPlanner);
//   - file basename SavingsViewData.swift (не SavingsData.swift): Swift
//     запрещает два файла с одинаковым basename в одном таргете
//     ("Filename used twice") — deviation из Plan 62-01;
//   - sortGoalsForDisplay добавлен (V10 версия не имела — в V10 сортирует
//     SavingsV10View напрямую);
//   - formatDue имя без "Ru" suffix (наш v06 модуль не нуждается в
//     dual-locale flagging).
//
// Foundation only — no SwiftUI imports — unit-test cheaply.

import Foundation

enum SavingsViewData {

    /// Russian genitive month names — self-contained для tests.
    static let MONTHS_RU_GEN: [String] = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]

    /// Goal completion percentage as clamped integer in 0..100.
    ///
    /// Edge cases:
    ///   - `targetCents <= 0` → 0 (avoids divide-by-zero).
    ///   - `currentCents <= 0` → 0 (negative balance = no progress).
    ///   - Otherwise → round(current/target * 100), clamped to [0, 100].
    static func progressPercentage(currentCents: Int, targetCents: Int) -> Int {
        guard targetCents > 0 else { return 0 }
        guard currentCents > 0 else { return 0 }
        let ratio = Double(currentCents) / Double(targetCents) * 100.0
        let rounded = Int(ratio.rounded())
        return max(0, min(100, rounded))
    }

    /// Format a goal due-date as "до D <month_genitive> YYYY".
    ///
    /// Returns nil для nil input ИЛИ для invalid calendar extraction.
    /// `calendar` injectable для test determinism (production использует
    /// Europe/Moscow).
    static func formatDue(
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

    /// Sort goals для display в SavingsView.
    ///
    /// Order:
    ///   1. due ASC (с null-due в конце).
    ///   2. tie-break — createdAt DESC (newest first).
    ///
    /// Возвращает новый массив (input не мутируется).
    static func sortGoalsForDisplay(_ goals: [GoalDTO]) -> [GoalDTO] {
        goals.sorted { a, b in
            switch (a.due, b.due) {
            case (let lhs?, let rhs?):
                if lhs != rhs { return lhs < rhs }
                return a.createdAt > b.createdAt
            case (nil, _?):
                return false  // nil-due идёт в конец
            case (_?, nil):
                return true
            case (nil, nil):
                return a.createdAt > b.createdAt
            }
        }
    }

    /// Validation gate для SavingsNewGoalSheet «Создать» button.
    ///
    /// Mirrors V10 isValidGoalDraft — name non-empty after trim AND
    /// target_cents > 0. Backend enforces `name min_length=1, max=80`
    /// и `target_cents > 0` separately.
    static func isValidGoalDraft(name: String, targetCents: Int) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && targetCents > 0
    }

    /// Validation gate для SavingsDepositSheet «Пополнить» button.
    ///
    /// Mirrors V10 isValidDepositDraft — amount > 0 AND account selected.
    /// Backend's `DepositCreate.account_id = Field(gt=0)` REQUIRED.
    static func isValidDepositDraft(amountCents: Int, accountId: Int?) -> Bool {
        return amountCents > 0 && accountId != nil
    }
}
