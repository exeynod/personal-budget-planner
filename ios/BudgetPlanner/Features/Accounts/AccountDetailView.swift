import SwiftUI

/// Phase 60 (v06 Native Rebuild): native AccountDetailView.
///
/// Stub (Plan 60-01). Hero (bank/kind/mask/balance) + history section —
/// Plan 60-04.
struct AccountDetailView: View {
    let accountId: Int

    @State private var viewModel: AccountDetailViewModel

    init(accountId: Int) {
        self.accountId = accountId
        self._viewModel = State(wrappedValue: AccountDetailViewModel(accountId: accountId))
    }

    var body: some View {
        List {
            Section {
                ProgressView("Загрузка…")
                    .frame(maxWidth: .infinity)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Счёт")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }
}
