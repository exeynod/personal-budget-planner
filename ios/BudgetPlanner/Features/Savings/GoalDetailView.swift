import SwiftUI

/// Phase 62 — native GoalDetailView (Копилка goal detail).
///
/// Stub (Plan 62-01) — placeholder body. Реальный Hero (name +
/// progress + cents/target + due) + Deposit CTA + delete Menu
/// landing в Plan 62-03.
struct GoalDetailView: View {
    let goalId: Int

    @State private var viewModel: GoalDetailViewModel

    init(goalId: Int) {
        self.goalId = goalId
        self._viewModel = State(wrappedValue: GoalDetailViewModel(goalId: goalId))
    }

    var body: some View {
        List {
            Section {
                ProgressView("Загрузка…")
                    .frame(maxWidth: .infinity)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Цель")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }
}
