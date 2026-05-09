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

/// Categories CRUD — pixel-perfect port web `frontend/src/screens/CategoriesScreen.tsx`.
///
/// Layout:
///   - SectionHeader (back chevron + "Категории" + accent "+ Новая" button)
///   - Optional inline NewCategoryForm (glass card, sheet emulation)
///   - Grouped sections "Расходы" / "Доходы" с CategoryRow (glass tile +
///     pencil/archive icon-кнопки)
///   - "Показать архивные" toggle внизу
struct CategoriesView: View {
    @State private var viewModel = CategoriesViewModel()
    @State private var showingNewForm = false
    @State private var archiveCandidate: CategoryDTO?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AdaptiveBackground()

            ScrollView {
                VStack(spacing: 14) {
                    headerRow

                    if showingNewForm {
                        NewCategoryInline { name, kind in
                            await viewModel.create(name: name, kind: kind)
                            showingNewForm = false
                        } onCancel: {
                            showingNewForm = false
                        }
                    }

                    if viewModel.isLoading {
                        Text("Загрузка…")
                            .font(.system(size: 13))
                            .foregroundStyle(Tokens.Ink.secondary)
                            .padding(.top, 24)
                    }
                    if let err = viewModel.errorMessage {
                        Text("Ошибка: \(err)")
                            .font(.system(size: 13))
                            .foregroundStyle(.red)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color.red.opacity(0.10)))
                    }
                    if !viewModel.isLoading,
                       viewModel.errorMessage == nil,
                       viewModel.groups.isEmpty {
                        Text("Нет категорий. Нажмите «+ Новая», чтобы создать первую.")
                            .font(.system(size: 13))
                            .foregroundStyle(Tokens.Ink.secondary)
                            .multilineTextAlignment(.center)
                            .padding(24)
                    }

                    ForEach(viewModel.groups) { group in
                        groupSection(group)
                    }

                    archivedToggle
                        .padding(.top, 8)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 130)
            }
            .scrollIndicators(.hidden)
        }
        .navigationBarHidden(true)
        .task { await viewModel.load() }
        .alert("Архивировать?", isPresented: Binding(
            get: { archiveCandidate != nil },
            set: { if !$0 { archiveCandidate = nil } }
        )) {
            Button("Архивировать", role: .destructive) {
                if let cat = archiveCandidate {
                    Task { await viewModel.archive(id: cat.id) }
                }
                archiveCandidate = nil
            }
            Button("Отмена", role: .cancel) { archiveCandidate = nil }
        } message: {
            if let cat = archiveCandidate {
                Text("Категория «\(cat.name)» будет скрыта. Транзакции сохранятся.")
            }
        }
    }

    // MARK: - Header

    private var headerRow: some View {
        HStack(spacing: 12) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Tokens.Ink.primary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Color.white.opacity(0.55)))
                    .overlay(Circle().strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5))
            }
            .buttonStyle(.plain)
            Text("Категории")
                .font(.system(size: 24, weight: .bold))
                .tracking(-0.48)
                .foregroundStyle(Tokens.Ink.primary)
            Spacer()
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showingNewForm.toggle() }
            } label: {
                Text(showingNewForm ? "×" : "+ Новая")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(
                                LinearGradient(
                                    colors: [Tokens.Accent.primary, Tokens.Accent.primary.opacity(0.8)],
                                    startPoint: .top, endPoint: .bottom
                                )
                            )
                    )
                    .shadow(color: Tokens.Accent.primary.opacity(0.33), radius: 6, x: 0, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 4)
    }

    // MARK: - Group section

    private func groupSection(_ group: CategoryGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(group.title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.66)
                .foregroundStyle(Tokens.Ink.secondary)
                .padding(.horizontal, 4)
                .padding(.bottom, 2)

            VStack(spacing: 6) {
                ForEach(group.rows) { cat in
                    CategoryRow(
                        category: cat,
                        onRename: { newName in
                            await viewModel.rename(id: cat.id, newName: newName)
                        },
                        onArchive: {
                            archiveCandidate = cat
                        },
                        onUnarchive: {
                            await viewModel.unarchive(id: cat.id)
                        }
                    )
                }
            }
        }
    }

    // MARK: - Toggle archived

    private var archivedToggle: some View {
        Button {
            viewModel.includeArchived.toggle()
            Task { await viewModel.load() }
        } label: {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 5)
                        .strokeBorder(Tokens.Ink.tertiary, lineWidth: 1)
                        .frame(width: 18, height: 18)
                    if viewModel.includeArchived {
                        RoundedRectangle(cornerRadius: 5)
                            .fill(Tokens.Accent.primary)
                            .frame(width: 18, height: 18)
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                Text("Показать архивные")
                    .font(.system(size: 13))
                    .foregroundStyle(Tokens.Ink.secondary)
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
    }
}

// MARK: - Category row

private struct CategoryRow: View {
    let category: CategoryDTO
    let onRename: (String) async -> Void
    let onArchive: () -> Void
    let onUnarchive: () async -> Void

    @State private var editing = false
    @State private var draft: String = ""
    @State private var saving = false

    var body: some View {
        HStack(spacing: 8) {
            visualIcon

            if editing {
                TextField("Название", text: $draft)
                    .font(.system(size: 14))
                    .foregroundStyle(Tokens.Ink.primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.white.opacity(0.7))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(Tokens.Accent.primary.opacity(0.5), lineWidth: 0.5)
                    )
                    .submitLabel(.done)
                    .onSubmit { commit() }
                    .disabled(saving)

                Button {
                    cancel()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Tokens.Ink.secondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .disabled(saving)

                Button {
                    commit()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Tokens.Accent.primary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .disabled(saving)
            } else {
                Text(category.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Tokens.Ink.primary)
                    .lineLimit(1)
                    .strikethrough(category.isArchived)

                Spacer()

                if category.isArchived {
                    Button {
                        Task { await onUnarchive() }
                    } label: {
                        Text("Восстановить")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Tokens.Accent.primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.white.opacity(0.6))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .strokeBorder(Tokens.Accent.primary.opacity(0.30), lineWidth: 0.5)
                            )
                    }
                    .buttonStyle(.plain)
                } else {
                    iconButton(systemName: "pencil") {
                        draft = category.name
                        editing = true
                    }
                    iconButton(systemName: "archivebox") {
                        onArchive()
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            ZStack {
                LiquidGlass(style: .systemUltraThinMaterial)
                Color.white.opacity(0.55)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Color.white.opacity(0.6), lineWidth: 0.5)
        )
        .opacity(category.isArchived ? 0.5 : 1.0)
    }

    private var visualIcon: some View {
        let visual = Tokens.Categories.visual(for: category.name)
        return ZStack {
            Circle().fill(visual.color.opacity(0.18))
            Image(systemName: visual.icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(visual.color)
        }
        .frame(width: 28, height: 28)
    }

    private func iconButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Tokens.Ink.secondary)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.clear))
        }
        .buttonStyle(.plain)
    }

    private func commit() {
        let trimmed = draft.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed != category.name else {
            cancel()
            return
        }
        saving = true
        Task {
            await onRename(trimmed)
            saving = false
            editing = false
        }
    }

    private func cancel() {
        editing = false
        draft = category.name
    }
}

// MARK: - Inline new category form

private struct NewCategoryInline: View {
    let onCreate: (String, CategoryKind) async -> Void
    let onCancel: () -> Void

    @State private var name: String = ""
    @State private var kind: CategoryKind = .expense
    @State private var isSubmitting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Новая категория".uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.44)
                .foregroundStyle(Tokens.Ink.secondary)

            TextField("Название", text: $name)
                .font(.system(size: 15))
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.55))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.black.opacity(0.08), lineWidth: 0.5)
                )

            HStack(spacing: 4) {
                kindButton("Расход", value: .expense)
                kindButton("Доход", value: .income)
            }
            .padding(4)
            .background(
                RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.45))
            )

            HStack(spacing: 10) {
                Spacer()
                Button("Отмена") { onCancel() }
                    .buttonStyle(NeutralInlineButtonStyle())
                Button(isSubmitting ? "Сохранение…" : "Создать") {
                    submit()
                }
                .buttonStyle(AccentInlineButtonStyle(enabled: canSubmit))
                .disabled(!canSubmit)
            }
            .padding(.top, 4)
        }
        .padding(16)
        .liquidGlass(radius: 18)
    }

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !isSubmitting
    }

    private func kindButton(_ title: String, value: CategoryKind) -> some View {
        let isActive = kind == value
        return Button {
            kind = value
        } label: {
            Text(title)
                .font(.system(size: 13, weight: isActive ? .bold : .semibold))
                .foregroundStyle(isActive ? Tokens.Accent.primary : Tokens.Ink.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                    isActive
                    ? AnyView(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Tokens.Accent.primary.opacity(0.16))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .strokeBorder(Tokens.Accent.primary.opacity(0.3), lineWidth: 0.5)
                            )
                    )
                    : AnyView(Color.clear)
                )
        }
        .buttonStyle(.plain)
    }

    private func submit() {
        guard canSubmit else { return }
        isSubmitting = true
        Task {
            await onCreate(name.trimmingCharacters(in: .whitespaces), kind)
            isSubmitting = false
            name = ""
        }
    }
}

private struct AccentInlineButtonStyle: ButtonStyle {
    let enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: [Tokens.Accent.primary, Tokens.Accent.primary.opacity(0.8)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
            )
            .opacity(enabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

private struct NeutralInlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Tokens.Ink.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white.opacity(0.55))
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}
