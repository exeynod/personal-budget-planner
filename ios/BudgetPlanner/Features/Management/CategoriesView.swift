import SwiftUI

@MainActor
@Observable
final class CategoriesViewModel {
    var categories: [CategoryDTO] = []
    var isLoading: Bool = false
    var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let all = try await CategoriesAPI.list()
            categories = all.sorted { lhs, rhs in
                if lhs.isArchived != rhs.isArchived { return !lhs.isArchived }
                return lhs.sortOrder < rhs.sortOrder
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func create(name: String, kind: CategoryKind) async {
        do {
            _ = try await CategoriesWriteAPI.create(CategoryCreateRequest(
                name: name, kind: kind.rawValue
            ))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleArchive(_ cat: CategoryDTO) async {
        do {
            _ = try await CategoriesWriteAPI.update(id: cat.id, CategoryUpdateRequest(
                name: nil, isArchived: !cat.isArchived
            ))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ cat: CategoryDTO) async {
        do {
            try await CategoriesWriteAPI.delete(id: cat.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CategoriesView: View {
    @State private var viewModel = CategoriesViewModel()
    @State private var showingNewForm = false

    var body: some View {
        ZStack {
            AdaptiveBackground()

            ScrollView {
                LazyVStack(spacing: Tokens.Spacing.sm) {
                    ForEach(viewModel.categories) { cat in
                        CategoryRow(
                            category: cat,
                            onArchiveToggle: {
                                Task { await viewModel.toggleArchive(cat) }
                            },
                            onDelete: {
                                Task { await viewModel.delete(cat) }
                            }
                        )
                    }
                }
                .padding(.horizontal, Tokens.Spacing.xl)
                .padding(.top, Tokens.Spacing.lg)
                .padding(.bottom, 100)
            }
            .refreshable { await viewModel.load() }

            FAB { showingNewForm = true }
                .padding(.trailing, Tokens.Spacing.xl)
                .padding(.bottom, Tokens.Spacing.xl)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
        .navigationTitle("Категории")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .sheet(isPresented: $showingNewForm) {
            NewCategoryForm { name, kind in
                await viewModel.create(name: name, kind: kind)
            }
        }
    }
}

private struct CategoryRow: View {
    let category: CategoryDTO
    let onArchiveToggle: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: Tokens.Spacing.md) {
            Circle()
                .fill(Tokens.Categories.color(for: category.name))
                .frame(width: 12, height: 12)

            VStack(alignment: .leading, spacing: 2) {
                Text(category.name)
                    .font(.appBody)
                    .foregroundStyle(category.isArchived ? .secondary : .primary)
                    .strikethrough(category.isArchived)
                Text(category.kind == .expense ? "Расход" : "Доход")
                    .font(.appCaption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Menu {
                Button {
                    onArchiveToggle()
                } label: {
                    Label(category.isArchived ? "Восстановить" : "Архивировать",
                          systemImage: category.isArchived ? "tray.and.arrow.up" : "archivebox")
                }
                if category.isArchived {
                    Button(role: .destructive) {
                        onDelete()
                    } label: {
                        Label("Удалить", systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
            }
        }
        .padding(Tokens.Spacing.md)
        .glassCard(radius: Tokens.Radius.md)
    }
}

private struct NewCategoryForm: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var kind: CategoryKind = .expense
    @State private var isSubmitting = false
    let onCreate: (String, CategoryKind) async -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Название", text: $name)
                        .textInputAutocapitalization(.sentences)
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
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
