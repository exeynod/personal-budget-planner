import SwiftUI

/// Phase 62 — native Form sheet для пополнения копилки.
///
/// **Symbol-collision avoidance**: FeaturesV10/Savings/DepositSheet.swift
/// уже определяет `struct DepositSheet`. Поэтому v06 native sheet
/// называется `SavingsDepositSheet`. Plan 62-03 заполняет полный Form
/// body (optional goal Picker pre-filled / MoneyParser amount /
/// account Picker required / live validation).
struct SavingsDepositSheet: View {
    let submitting: Bool
    let goals: [GoalDTO]
    let accounts: [AccountDTO]
    let initialGoalId: Int?
    let onDeposit: (_ amountCents: Int, _ accountId: Int, _ goalId: Int?) async -> Bool
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
            .navigationTitle("Пополнение")
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
