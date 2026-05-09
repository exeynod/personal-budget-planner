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
            errorMessage = error.localizedDescription
        }
    }

    func create(name: String, kind: CategoryKind) async {
        do {
            _ = try await CategoriesWriteAPI.create(CategoryCreateRequest(name: name, kind: kind.rawValue))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rename(id: Int, newName: String) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: id, CategoryUpdateRequest(name: newName, isArchived: nil))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func archive(id: Int) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: id, CategoryUpdateRequest(name: nil, isArchived: true))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func unarchive(id: Int) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: id, CategoryUpdateRequest(name: nil, isArchived: false))
            await load()
        } catch {
            errorMessage = error.localizedDescription
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
    @State private var renamingCategory: CategoryDTO?
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
                        CategoryListRow(category: cat)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                renamingCategory = cat
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
                Button { showingNewSheet = true } label: {
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
        .sheet(item: $renamingCategory) { cat in
            RenameCategorySheet(initialName: cat.name) { newName in
                await viewModel.rename(id: cat.id, newName: newName)
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

private struct RenameCategorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let initialName: String
    let onRename: (String) async -> Void

    @State private var name: String
    @State private var isSubmitting = false

    init(initialName: String, onRename: @escaping (String) async -> Void) {
        self.initialName = initialName
        self.onRename = onRename
        self._name = State(initialValue: initialName)
    }

    private var canSave: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && trimmed != initialName && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Название", text: $name)
                }
            }
            .navigationTitle("Переименовать")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        Task {
                            isSubmitting = true
                            await onRename(name.trimmingCharacters(in: .whitespaces))
                            isSubmitting = false
                            dismiss()
                        }
                    }
                    .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
