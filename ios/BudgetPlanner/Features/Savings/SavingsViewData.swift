// Phase 62 — pure-compute helpers для v06 Savings (Копилка) screen.
//
// Stub (Plan 62-01). Полная реализация — Plan 62-02:
//   - progressPercentage(currentCents:targetCents:) -> Int (0..100)
//   - formatDue(_:calendar:) -> String? («до D <month_genitive> YYYY»)
//   - sortGoalsForDisplay(_:) -> [GoalDTO]
//   - isValidGoalDraft(name:targetCents:) -> Bool
//   - isValidDepositDraft(amountCents:accountId:) -> Bool
//
// **Naming**: enum `SavingsViewData` (не `SavingsData`) — избегаем Swift
// symbol collision с FeaturesV10/Savings/SavingsData.swift в том же
// таргете BudgetPlanner. Имя файла тоже `SavingsViewData.swift` (не
// `SavingsData.swift`): Xcode/Swift запрещает два файла с одинаковым
// basename в одном таргете ("Filename used twice"), поэтому файл
// переименован для уникальности basename (deviation Rule 3).
//
// Foundation only — no SwiftUI imports — unit-test cheaply.

import Foundation

enum SavingsViewData {
    // Plan 62-02 fills helpers.
}
