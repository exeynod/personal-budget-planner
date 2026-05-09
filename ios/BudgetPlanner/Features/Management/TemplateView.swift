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

    var activeKind: CategoryKind = .expense

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
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
    }

    func delete(id: Int) async {
        do {
            try await TemplateAPI.delete(id: id)
            items.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func entries(for kind: CategoryKind) -> [(category: CategoryDTO, items: [TemplateItemDTO])] {
        let cats = categories
            .filter { $0.kind == kind }
            .sorted { lhs, rhs in
                if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
                return lhs.name.localizedCompare(rhs.name) == .orderedAscending
            }
        return cats.map { cat in
            let catItems = items
                .filter { $0.categoryId == cat.id }
                .sorted { ($0.sortOrder, $0.id) < ($1.sortOrder, $1.id) }
            return (cat, catItems)
        }
    }
}

/// Plan template — native iOS List(.insetGrouped) layout.
///   - Section per category (header = uppercase category name)
///   - Расходы / Доходы — Picker(.segmented) в верхней Section
///   - "+" в toolbar для новой строки
struct TemplateView: View {
    @State private var viewModel = TemplateViewModel()
    @State private var showingEditor = false
    @State private var presetCategoryId: Int?

    var body: some View {
        List {
            Section {
                Picker("Тип", selection: $viewModel.activeKind) {
                    Text("Расходы").tag(CategoryKind.expense)
                    Text("Доходы").tag(CategoryKind.income)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
            }

            if viewModel.isLoading && viewModel.items.isEmpty {
                Section { ProgressView() }
            }

            let entries = viewModel.entries(for: viewModel.activeKind)
            if entries.isEmpty && !viewModel.isLoading {
                Section {
                    ContentUnavailableView(
                        "Пусто",
                        systemImage: "list.bullet.rectangle",
                        description: Text("Создайте категорию и добавьте строки.")
                    )
                    .listRowBackground(Color.clear)
                }
            }

            ForEach(entries, id: \.category.id) { entry in
                Section(entry.category.name) {
                    if entry.items.isEmpty {
                        Text("Нет строк")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(entry.items) { item in
                            TemplateRow(item: item)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        Task { await viewModel.delete(id: item.id) }
                                    } label: {
                                        Label("Удалить", systemImage: "trash")
                                    }
                                }
                        }
                    }
                    Button {
                        presetCategoryId = entry.category.id
                        showingEditor = true
                    } label: {
                        Label("Добавить строку", systemImage: "plus.circle")
                            .foregroundStyle(Tokens.Accent.primary)
                    }
                }
            }

            if let err = viewModel.errorMessage {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Шаблон плана")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    presetCategoryId = nil
                    showingEditor = true
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(viewModel.categories.isEmpty)
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showingEditor) {
            TransactionEditor(
                mode: .createPlanned(periodId: viewModel.period?.id ?? 0),
                categories: viewModel.categories.filter { $0.kind == viewModel.activeKind },
                onSaved: {
                    presetCategoryId = nil
                    await viewModel.load()
                }
            )
        }
    }
}

private struct TemplateRow: View {
    let item: TemplateItemDTO

    var body: some View {
        HStack {
            Text(item.name.isEmpty ? "Без описания" : item.name)
                .font(.body)
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer()
            Text(MoneyFormatter.formatWithSymbol(cents: item.amountCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
        }
    }
}
