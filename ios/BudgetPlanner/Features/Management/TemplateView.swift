import SwiftUI

@MainActor
@Observable
final class TemplateViewModel {
    var items: [TemplateItemDTO] = []
    var categories: [CategoryDTO] = []
    var period: PeriodDTO?
    var isLoading: Bool = false
    var errorMessage: String?
    var applyResult: ApplyTemplateResponse?

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let itemsTask = TemplateAPI.list()
            async let categoriesTask = CategoriesAPI.list()
            async let periodTask = PeriodsAPI.current()
            self.items = try await itemsTask
            self.categories = (try await categoriesTask).filter { !$0.isArchived }
            self.period = try? await periodTask
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func apply() async {
        guard let p = period else { return }
        do {
            applyResult = try await TemplateAPI.apply(periodId: p.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(id: Int) async {
        do {
            try await TemplateAPI.delete(id: id)
            items.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct TemplateView: View {
    @State private var viewModel = TemplateViewModel()

    var body: some View {
        ZStack {
            AdaptiveBackground()

            ScrollView {
                LazyVStack(spacing: Tokens.Spacing.sm) {
                    if let result = viewModel.applyResult {
                        Text("Применено: создано \(result.createdCount), пропущено \(result.skippedCount)")
                            .font(.appLabel)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Tokens.Accent.soft, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
                    }

                    Button {
                        Task { await viewModel.apply() }
                    } label: {
                        Text("Применить к текущему периоду")
                            .font(.appLabel.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Tokens.Spacing.md)
                            .background(Tokens.Accent.primary,
                                      in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
                    }
                    .disabled(viewModel.period == nil)

                    ForEach(viewModel.items) { item in
                        TemplateRow(
                            item: item,
                            categoryName: viewModel.categories.first { $0.id == item.categoryId }?.name ?? "—"
                        )
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await viewModel.delete(id: item.id) }
                            } label: {
                                Label("Удалить", systemImage: "trash")
                            }
                        }
                    }

                    if viewModel.items.isEmpty && !viewModel.isLoading {
                        Text("Шаблон пуст. Snapshot from period в Phase 19+.")
                            .font(.appBody)
                            .foregroundStyle(.secondary)
                            .padding(.top, 60)
                    }
                }
                .padding(.horizontal, Tokens.Spacing.xl)
                .padding(.top, Tokens.Spacing.lg)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Шаблон плана")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }
}

private struct TemplateRow: View {
    let item: TemplateItemDTO
    let categoryName: String

    var body: some View {
        HStack {
            Circle()
                .fill(Tokens.Categories.color(for: categoryName))
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.appBody)
                Text(categoryName).font(.appCaption).foregroundStyle(.secondary)
            }

            Spacer()

            Text(MoneyFormatter.format(cents: item.amountCents))
                .font(.appNumber)
                .foregroundStyle(item.kind == .income ? .green : .primary)
        }
        .padding(Tokens.Spacing.md)
        .glassCard(radius: Tokens.Radius.md)
    }
}
