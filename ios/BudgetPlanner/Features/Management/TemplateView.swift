import SwiftUI

@MainActor
@Observable
final class TemplateViewModel {
    /// Per-category limits keyed by category id.
    var items: [TemplateItemDTO] = []
    /// Recurring detail lines.
    var lines: [TemplateLineDTO] = []
    var categories: [CategoryDTO] = []
    var period: PeriodDTO?
    var isLoading: Bool = false
    var errorMessage: String?
    var applyResult: ApplyTemplateResponse?
    var isApplying: Bool = false

    var activeKind: CategoryKind = .expense

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let itemsTask = TemplateAPI.listItems()
            async let linesTask = TemplateAPI.listLines()
            async let categoriesTask = CategoriesAPI.list()
            async let periodTask = PeriodsAPI.current()
            self.items = try await itemsTask
            self.lines = try await linesTask
            self.categories = (try await categoriesTask).filter { !$0.isArchived }
            self.period = try? await periodTask
        } catch {
            #if DEBUG
            print("TemplateView.load error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    /// Limit (cents) for a category — 0 when no template item exists yet.
    func limit(for categoryId: Int) -> Int {
        items.first { $0.categoryId == categoryId }?.limitCents ?? 0
    }

    func saveLimit(categoryId: Int, cents: Int) async {
        do {
            let updated = try await TemplateAPI.upsertItem(
                categoryId: categoryId, limitCents: cents)
            if let idx = items.firstIndex(where: { $0.categoryId == categoryId }) {
                items[idx] = updated
            } else {
                items.append(updated)
            }
        } catch {
            #if DEBUG
            print("TemplateView.saveLimit error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func deleteLine(id: Int) async {
        do {
            try await TemplateAPI.deleteLine(id: id)
            lines.removeAll { $0.id == id }
        } catch {
            #if DEBUG
            print("TemplateView.deleteLine error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func apply() async {
        guard let pid = period?.id, !isApplying else { return }
        isApplying = true
        errorMessage = nil
        defer { isApplying = false }
        do {
            applyResult = try await TemplateAPI.apply(periodId: pid)
        } catch {
            #if DEBUG
            print("TemplateView.apply error: \(error)")
            #endif
            errorMessage = error.userFacingRu
        }
    }

    func entries(for kind: CategoryKind)
        -> [(category: CategoryDTO, lines: [TemplateLineDTO])]
    {
        let cats =
            categories
            .filter { $0.kind == kind }
            .sorted { lhs, rhs in
                if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
                return lhs.name.localizedCompare(rhs.name) == .orderedAscending
            }
        return cats.map { cat in
            let catLines =
                lines
                .filter { $0.categoryId == cat.id }
                .sorted { ($0.dayOfPeriod ?? 99, $0.id) < ($1.dayOfPeriod ?? 99, $1.id) }
            return (cat, catLines)
        }
    }
}

/// Plan template — native iOS List(.insetGrouped) layout (v1.1 model).
///   - Section per category: per-category limit (Stepper) + recurring lines.
///   - Расходы / Доходы — Picker(.segmented).
///   - «Применить к периоду» — POST /periods/{id}/apply-template.
struct TemplateView: View {
    @State private var viewModel = TemplateViewModel()
    @State private var editingLineCategory: CategoryDTO?

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

            if viewModel.isLoading && viewModel.categories.isEmpty {
                Section { ProgressView() }
            }

            let entries = viewModel.entries(for: viewModel.activeKind)
            if entries.isEmpty && !viewModel.isLoading {
                Section {
                    ContentUnavailableView(
                        "Пусто",
                        systemImage: "list.bullet.rectangle",
                        description: Text("Создайте категорию, затем задайте лимит и строки.")
                    )
                    .listRowBackground(Color.clear)
                }
            }

            ForEach(entries, id: \.category.id) { entry in
                categorySection(entry: entry)
            }

            if let err = viewModel.errorMessage {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Шаблон бюджета")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.apply() }
                } label: {
                    if viewModel.isApplying {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Применить")
                    }
                }
                .disabled(viewModel.period == nil || viewModel.isApplying)
            }
        }
        .task { await viewModel.load() }
        .sheet(item: $editingLineCategory) { cat in
            TemplateLineEditor(
                category: cat,
                onSaved: { await viewModel.load() }
            )
        }
        .alert(
            "Шаблон применён",
            isPresented: Binding(
                get: { viewModel.applyResult != nil },
                set: { if !$0 { viewModel.applyResult = nil } }
            )
        ) {
            Button("OK", role: .cancel) { viewModel.applyResult = nil }
        } message: {
            if let r = viewModel.applyResult {
                Text("Создано строк: \(r.created)")
            }
        }
    }

    @ViewBuilder
    private func categorySection(
        entry: (category: CategoryDTO, lines: [TemplateLineDTO])
    ) -> some View {
        Section(entry.category.name) {
            // Per-category limit.
            limitRow(categoryId: entry.category.id)

            // Recurring lines.
            if entry.lines.isEmpty {
                Text("Нет повторяющихся строк")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(entry.lines) { line in
                    TemplateLineRow(line: line)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await viewModel.deleteLine(id: line.id) }
                            } label: {
                                Label("Удалить", systemImage: "trash")
                            }
                        }
                }
            }

            Button {
                editingLineCategory = entry.category
            } label: {
                Label("Добавить строку", systemImage: "plus.circle")
                    .foregroundStyle(Tokens.Accent.primary)
            }
        }
    }

    private func limitRow(categoryId: Int) -> some View {
        let binding = Binding<Int>(
            get: { Swift.max(0, viewModel.limit(for: categoryId) / 100) },
            set: { newRub in
                Task { await viewModel.saveLimit(categoryId: categoryId, cents: newRub * 100) }
            }
        )
        return Stepper(value: binding, in: 0...100_000, step: 500) {
            LabeledContent("Лимит") {
                Text(MoneyFormatter.formatWithSymbol(cents: viewModel.limit(for: categoryId)))
                    .monospacedDigit()
            }
        }
    }
}

private struct TemplateLineRow: View {
    let line: TemplateLineDTO

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.title.isEmpty ? "Без описания" : line.title)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if let day = line.dayOfPeriod {
                    Text("день \(day)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(MoneyFormatter.formatWithSymbol(cents: line.amountCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
        }
    }
}

// MARK: - Add recurring line sheet

private struct TemplateLineEditor: View {
    let category: CategoryDTO
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String = ""
    @State private var rublesText: String = ""
    @State private var dayText: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var amountCents: Int { MoneyParser.parseToCents(rublesText) ?? 0 }
    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && amountCents > 0 && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Название", text: $title)
                    HStack {
                        TextField("Сумма (₽)", text: $rublesText)
                            .keyboardType(.decimalPad)
                        Text("₽").foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("День периода (необязательно)")
                        Spacer()
                        TextField("—", text: $dayText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 60)
                    }
                } header: {
                    Text(category.name)
                }
                if let err = errorMessage {
                    Section {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Новая строка")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { Task { await save() } }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func save() async {
        guard canSave else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let day = Int(dayText.trimmingCharacters(in: .whitespaces))
        do {
            _ = try await TemplateAPI.createLine(
                TemplateLineCreateRequest(
                    categoryId: category.id,
                    title: title.trimmingCharacters(in: .whitespaces),
                    amountCents: amountCents,
                    dayOfPeriod: (day.map { ($0 >= 1 && $0 <= 31) ? $0 : nil }) ?? nil,
                    kind: category.kind.rawValue
                ))
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.userFacingRu
        }
    }
}
