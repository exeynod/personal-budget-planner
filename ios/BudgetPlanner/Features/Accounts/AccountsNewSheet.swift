import SwiftUI

/// Phase 60 (v06 Native Rebuild): native Form sheet для создания счёта.
///
/// **Symbol & filename collision avoidance**: FeaturesV10/Accounts/ уже
/// содержит файл с тем же простым именем и type с тем же простым именем в
/// том же модуле BudgetPlanner. Swift не разрешает два type с одинаковым
/// именем в одном модуле, а Xcode/Swift compiler ругается на дублирующиеся
/// filenames в одном target ("Filename used twice"). Поэтому v06 native
/// sheet называется `AccountsNewSheet` И живёт в файле
/// `AccountsNewSheet.swift` (filename и struct оба отличаются от V10).
/// Plan 60-03 заполняет полный Form body.
struct AccountsNewSheet: View {
    let submitting: Bool
    let onCreate: (_ bank: String, _ kind: AccountKind, _ mask: String?, _ balanceCents: Int, _ primary: Bool) async -> Bool
    let onCancel: () -> Void

    var body: some View {
        // Plan 60-03 fills this body with native Form.
        NavigationStack {
            Form {
                Section {
                    Text("Plan 60-03 заполнит этот sheet")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Новый счёт")
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
