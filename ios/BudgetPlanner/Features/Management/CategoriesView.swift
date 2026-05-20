import SwiftUI

@MainActor
@Observable
final class CategoriesViewModel {
    var categories: [CategoryDTO] = []
    var isLoading: Bool = false
    var errorMessage: String?
    var includeArchived: Bool = false

    var groups: [CategoryGroup] {
        let active = categories.filter { includeArchived || !$0.isArchived }
        let sortFn: (CategoryDTO, CategoryDTO) -> Bool = { lhs, rhs in
            if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
            return lhs.name.localizedCompare(rhs.name) == .orderedAscending
        }
        let expense = active.filter { $0.kind == .expense }.sorted(by: sortFn)
        let income = active.filter { $0.kind == .income }.sorted(by: sortFn)
        var result: [CategoryGroup] = []
        if !expense.isEmpty { result.append(.init(title: "Расходы", kind: .expense, rows: expense)) }
        if !income.isEmpty { result.append(.init(title: "Доходы", kind: .income, rows: income)) }
        return result
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            categories = try await CategoriesAPI.list()
        } catch {
            #if DEBUG
            print("CategoriesView.load error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func create(name: String, kind: CategoryKind) async {
        do {
            _ = try await CategoriesWriteAPI.create(CategoryCreateRequest(name: name, kind: kind.rawValue))
            await load()
        } catch {
            #if DEBUG
            print("CategoriesView.create error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func rename(id: Int, newName: String) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: id, CategoryUpdateRequest(name: newName, isArchived: nil))
            await load()
        } catch {
            #if DEBUG
            print("CategoriesView.rename error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func archive(id: Int) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: id, CategoryUpdateRequest(name: nil, isArchived: true))
            await load()
        } catch {
            #if DEBUG
            print("CategoriesView.archive error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func unarchive(id: Int) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: id, CategoryUpdateRequest(name: nil, isArchived: false))
            await load()
        } catch {
            #if DEBUG
            print("CategoriesView.unarchive error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }
}

struct CategoryGroup: Identifiable {
    let title: String
    let kind: CategoryKind
    let rows: [CategoryDTO]
    var id: CategoryKind { kind }
}

/// Categories — native iOS List(.insetGrouped) + swipeActions.
///   - Section per kind (Расходы / Доходы)
///   - Row tap → rename inline; swipeActions → archive/unarchive/delete
///   - Toolbar "+" → sheet с Form
///   - Toolbar Menu → "Показать архивные" toggle
struct CategoriesView: View {
    @State private var viewModel = CategoriesViewModel()
    @State private var showingNewSheet = false
    @State private var archiveCandidate: CategoryDTO?

    var body: some View {
        List {
            if viewModel.isLoading && viewModel.categories.isEmpty {
                Section { ProgressView() }
            }
            if let err = viewModel.errorMessage {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
            if !viewModel.isLoading, viewModel.errorMessage == nil, viewModel.groups.isEmpty {
                Section {
                    ContentUnavailableView(
                        "Нет категорий",
                        systemImage: "tag",
                        description: Text("Нажмите + чтобы создать первую.")
                    )
                    .listRowBackground(Color.clear)
                }
            }
            ForEach(viewModel.groups) { group in
                Section(group.title) {
                    ForEach(group.rows) { cat in
                        // Phase 65 (v06 Native Rebuild): tap → drill-down на
                        // CategoryDetailView с историей транзакций. Rename
                        // переехал в toolbar Detail-экрана.
                        NavigationLink {
                            CategoryDetailScreen(
                                category: cat,
                                parentViewModel: viewModel
                            )
                        } label: {
                            CategoryListRow(category: cat)
                        }
                        .swipeActions(edge: .trailing) {
                            if cat.isArchived {
                                Button {
                                    Task { await viewModel.unarchive(id: cat.id) }
                                } label: {
                                    Label("Восстановить", systemImage: "tray.and.arrow.up")
                                }
                                .tint(Tokens.Accent.primary)
                            } else {
                                Button(role: .destructive) {
                                    archiveCandidate = cat
                                } label: {
                                    Label("Архив", systemImage: "archivebox")
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Категории")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingNewSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Toggle("Показать архивные", isOn: $viewModel.includeArchived)
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                }
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showingNewSheet) {
            NewCategorySheet { name, kind in
                await viewModel.create(name: name, kind: kind)
            }
        }
        .confirmationDialog(
            archiveCandidate.map { "Архивировать «\($0.name)»?" } ?? "",
            isPresented: Binding(
                get: { archiveCandidate != nil },
                set: { if !$0 { archiveCandidate = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Архивировать", role: .destructive) {
                if let cat = archiveCandidate {
                    Task { await viewModel.archive(id: cat.id) }
                }
                archiveCandidate = nil
            }
            Button("Отмена", role: .cancel) { archiveCandidate = nil }
        } message: {
            Text("Категория будет скрыта. Транзакции сохранятся.")
        }
    }
}

private struct CategoryListRow: View {
    let category: CategoryDTO

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category.name)
    }

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(category.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .strikethrough(category.isArchived)
                if category.isArchived {
                    Text("В архиве")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } icon: {
            Image(systemName: visual.icon)
                .foregroundStyle(visual.color)
        }
        .opacity(category.isArchived ? 0.5 : 1.0)
    }
}

// MARK: - New / rename sheets

private struct NewCategorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let onCreate: (String, CategoryKind) async -> Void

    @State private var name: String = ""
    @State private var kind: CategoryKind = .expense
    @State private var isSubmitting = false

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Например, Спорт", text: $name)
                }
                Section("Тип") {
                    Picker("Тип", selection: $kind) {
                        Text("Расход").tag(CategoryKind.expense)
                        Text("Доход").tag(CategoryKind.income)
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Новая категория")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") {
                        Task {
                            isSubmitting = true
                            await onCreate(name.trimmingCharacters(in: .whitespaces), kind)
                            isSubmitting = false
                            dismiss()
                        }
                    }
                    .disabled(!canSubmit)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
