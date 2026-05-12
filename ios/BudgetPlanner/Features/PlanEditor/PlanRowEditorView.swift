import SwiftUI

/// Phase 61: PlanRowEditorView — detail editor для одной категории.
///
/// Detail в master-detail flow (CONTEXT D-3). Form с Stepper + TextField
/// (.decimalPad) + Picker (rollover) + Toggle (paused).
///
/// `onSaved` closure инжектируется родителем PlanEditorView и вызывается
/// PlanRowEditorViewModel после successful CategoriesV10API.update для
/// optimistic-refresh master list без full reload.
///
/// Scaffold (61-01): пустой Form body. Реализация — в 61-03 Task 2.
struct PlanRowEditorView: View {
    let categoryId: Int
    let onSaved: (CategoryV10DTO) -> Void

    @State private var viewModel: PlanRowEditorViewModel

    init(categoryId: Int, onSaved: @escaping (CategoryV10DTO) -> Void) {
        self.categoryId = categoryId
        self.onSaved = onSaved
        self._viewModel = State(
            wrappedValue: PlanRowEditorViewModel(categoryId: categoryId)
        )
    }

    var body: some View {
        // 61-03: Form реализация (Stepper + TextField + Picker + Toggle + banner)
        Text("PlanRowEditorView — body в 61-03")
            .navigationTitle("Категория")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                viewModel.onSaved = onSaved
            }
            .task { await viewModel.load() }
    }
}
