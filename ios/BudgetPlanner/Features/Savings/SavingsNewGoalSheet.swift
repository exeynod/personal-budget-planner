import SwiftUI

/// Phase 62 — native Form sheet для создания цели.
///
/// **Symbol-collision avoidance**: FeaturesV10/Savings/NewGoalSheet.swift
/// уже определяет `struct NewGoalSheet` в том же модуле BudgetPlanner.
/// Swift не разрешает два struct с одинаковым именем в одном модуле,
/// поэтому v06 native sheet называется `SavingsNewGoalSheet`. Plan 62-03
/// заполняет полный Form body (TextField name + MoneyParser target +
/// optional DatePicker due + live validation).
struct SavingsNewGoalSheet: View {
    let submitting: Bool
    let onCreate: (_ name: String, _ targetCents: Int, _ due: Date?) async -> Bool
    let onCancel: () -> Void

    var body: some View {
        // Plan 62-03 fills this body with native Form.
        NavigationStack {
            Form {
                Section {
                    Text("Plan 62-03 заполнит этот sheet")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Новая цель")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { onCancel() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
