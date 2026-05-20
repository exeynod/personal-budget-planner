import SwiftUI

/// Phase 62 — native SavingsView (Копилка master list).
///
/// Stub (Plan 62-01) — placeholder body. Реальный List(.insetGrouped)
/// с Hero / Roundup / Goals sections / swipe-to-delete / Menu toolbar
/// landing в Plan 62-02. NavigationStack принадлежит родителю
/// (ManagementView) — здесь только .navigationTitle("Копилка") +
/// destination dispatch для SavingsRoute.
struct SavingsView: View {
    @State private var viewModel = SavingsViewModel()

    var body: some View {
        List {
            Section {
                ProgressView("Загрузка…")
                    .frame(maxWidth: .infinity)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Копилка")
        .task { await viewModel.load() }
    }
}
