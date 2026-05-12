import SwiftUI

/// Phase 60 (v06 Native Rebuild): native AccountsView со списком счетов.
///
/// Stub (Plan 60-01) — placeholder body. Реальная List + Hero + rows
/// landing в Plan 60-02. NewAccountSheet integration — 60-03. Push на
/// AccountDetailView — 60-04.
struct AccountsView: View {
    @State private var viewModel = AccountsViewModel()

    var body: some View {
        List {
            Section {
                ProgressView("Загрузка…")
                    .frame(maxWidth: .infinity)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Счета")
        .task { await viewModel.load() }
    }
}
