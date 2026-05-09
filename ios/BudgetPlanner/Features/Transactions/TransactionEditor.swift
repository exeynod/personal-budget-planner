import SwiftUI

enum TransactionEditorMode: Identifiable {
    case createActual
    case createPlanned(periodId: Int)
    case editActual(ActualDTO)
    case editPlanned(PlannedDTO)

    var id: String {
        switch self {
        case .createActual: return "createActual"
        case .createPlanned(let pid): return "createPlanned-\(pid)"
        case .editActual(let a): return "editActual-\(a.id)"
        case .editPlanned(let p): return "editPlanned-\(p.id)"
        }
    }

    var isPlanned: Bool {
        switch self {
        case .createPlanned, .editPlanned: return true
        default: return false
        }
    }

    var isActual: Bool { !isPlanned }

    var isEdit: Bool {
        switch self {
        case .editActual, .editPlanned: return true
        default: return false
        }
    }

    var title: String {
        switch self {
        case .createActual, .createPlanned: return "Новая транзакция"
        case .editActual, .editPlanned: return "Изменить транзакцию"
        }
    }
}

/// Native iOS 26 sheet: NavigationStack + Form + toolbar buttons.
/// Drag indicator + medium/large detents — native sheet conventions.
struct TransactionEditor: View {
    let mode: TransactionEditorMode
    let categories: [CategoryDTO]
    let onSaved: () async -> Void
    var onDelete: (() async -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var amountText: String = ""
    @State private var kind: CategoryKind = .expense
    @State private var categoryId: Int?
    @State private var date: Date = Date()
    @State private var description: String = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var showingDeleteConfirm = false

    private var amountCents: Int? { MoneyParser.parseToCents(amountText) }

    private var filteredCategories: [CategoryDTO] {
        categories.filter { !$0.isArchived && $0.kind == kind }
    }

    private var canSave: Bool {
        guard let cents = amountCents, cents > 0, categoryId != nil else { return false }
        return !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                if mode.isActual {
                    Section {
                        Picker("Тип", selection: $kind) {
                            Text("Расход").tag(CategoryKind.expense)
                            Text("Доход").tag(CategoryKind.income)
                        }
                        .pickerStyle(.segmented)
                    }
                }

                Section("Сумма") {
                    HStack {
                        TextField("0", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.body.monospacedDigit())
                        Text("₽")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Категория") {
                    if filteredCategories.isEmpty {
                        Text("Нет доступных категорий")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker(selection: $categoryId) {
                            Text("— выберите —").tag(Int?.none)
                            ForEach(filteredCategories) { cat in
                                Label {
                                    Text(cat.name)
                                } icon: {
                                    let v = Tokens.Categories.visual(for: cat.name)
                                    Image(systemName: v.icon).foregroundStyle(v.color)
                                }
                                .tag(cat.id as Int?)
                            }
                        } label: {
                            EmptyView()
                        }
                        .labelsHidden()
                    }
                }

                if mode.isActual {
                    Section("Дата") {
                        DatePicker("Дата", selection: $date, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "ru_RU"))
                    }
                }

                Section("Описание") {
                    TextField("Опционально", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                }

                if mode.isEdit, onDelete != nil {
                    Section {
                        Button("Удалить", role: .destructive) {
                            showingDeleteConfirm = true
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
            .navigationTitle(mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSubmitting)
            .onAppear { populate() }
            .confirmationDialog(
                "Удалить транзакцию?",
                isPresented: $showingDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Удалить", role: .destructive) {
                    Task { await performDelete() }
                }
            }
        }
        .presentationDragIndicator(.visible)
        .presentationDetents([.medium, .large])
    }

    private func populate() {
        switch mode {
        case .createActual:
            kind = .expense
            categoryId = filteredCategories.first?.id
        case .createPlanned:
            kind = .expense
            categoryId = filteredCategories.first?.id
        case .editActual(let a):
            kind = a.kind
            amountText = MoneyFormatter.format(cents: a.amountCents)
            categoryId = a.categoryId
            date = a.txDate
            description = a.description ?? ""
        case .editPlanned(let p):
            kind = p.kind
            amountText = MoneyFormatter.format(cents: p.amountCents)
            categoryId = p.categoryId
            description = p.description ?? ""
        }
    }

    private func performDelete() async {
        guard let onDelete else { return }
        isSubmitting = true
        await onDelete()
        isSubmitting = false
        dismiss()
    }

    private func save() async {
        guard let cents = amountCents, let catId = categoryId else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            switch mode {
            case .createActual:
                _ = try await ActualAPI.create(ActualCreateRequest(
                    kind: kind.rawValue,
                    amountCents: cents,
                    categoryId: catId,
                    txDate: DateFormatters.isoDate.string(from: date),
                    description: description.isEmpty ? nil : description
                ))
            case .createPlanned(let pid):
                _ = try await PlannedAPI.create(periodId: pid, PlannedCreateRequest(
                    kind: kind.rawValue,
                    amountCents: cents,
                    categoryId: catId,
                    plannedDate: nil,
                    description: description.isEmpty ? nil : description
                ))
            case .editActual(let a):
                _ = try await ActualAPI.update(id: a.id, ActualUpdateRequest(
                    amountCents: cents,
                    categoryId: catId,
                    txDate: DateFormatters.isoDate.string(from: date),
                    description: description.isEmpty ? nil : description
                ))
            case .editPlanned(let p):
                _ = try await PlannedAPI.update(id: p.id, PlannedUpdateRequest(
                    amountCents: cents,
                    categoryId: catId,
                    plannedDate: nil,
                    description: description.isEmpty ? nil : description
                ))
            }
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
