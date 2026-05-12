import SwiftUI

/// Phase 61: PlanEditorView — master list editor месячного плана.
///
/// Master в master-detail flow (CONTEXT D-2). NavigationStack принадлежит
/// родителю ManagementView — здесь только `.navigationTitle("План месяца")`
/// + `.navigationDestination(for: PlanEditorRoute.self)` (61-02 wiring).
///
/// Scaffold (61-01): пустой body. Реализация body — в 61-02 Task 2 (Hero +
/// Aggregates + Expense Section + Income Section + tap-to-detail).
struct PlanEditorView: View {
    @State private var viewModel = PlanEditorViewModel()

    var body: some View {
        // 61-02: реализация (List + switch на status + Hero + Aggregates + Categories)
        Text("PlanEditorView — body в 61-02")
            .navigationTitle("План месяца")
            .task { await viewModel.load() }
    }
}
