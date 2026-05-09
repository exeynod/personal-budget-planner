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

    var title: String {
        switch self {
        case .createActual: return "Новая трата"
        case .createPlanned: return "Новый план"
        case .editActual: return "Изменить трату"
        case .editPlanned: return "Изменить план"
        }
    }
}

struct TransactionEditor: View {
    let mode: TransactionEditorMode
    let categories: [CategoryDTO]
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var amountText: String = ""
    @State private var kind: CategoryKind = .expense
    @State private var categoryId: Int?
    @State private var date: Date = Date()
    @State private var description: String = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var amountCents: Int? { MoneyParser.parseToCents(amountText) }

    private var filteredCategories: [CategoryDTO] {
        categories.filter { !$0.isArchived && $0.kind == kind }
    }

    private var canSave: Bool {
        guard let cents = amountCents, cents > 0,
              categoryId != nil else { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Тип", selection: $kind) {
                        Text("Расход").tag(CategoryKind.expense)
                        Text("Доход").tag(CategoryKind.income)
                    }
                    .pickerStyle(.segmented)

                    HStack {
                        TextField("0", text: $amountText)
                            .keyboardType(.numbersAndPunctuation)
                            .font(.appHero)
                            .multilineTextAlignment(.trailing)
                        Text("₽").font(.appHero).foregroundStyle(.secondary)
                    }
                }

                Section("Категория") {
                    if filteredCategories.isEmpty {
                        Text("Нет категорий — создайте в Меню → Категории")
                            .font(.appCaption)
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Категория", selection: $categoryId) {
                            ForEach(filteredCategories) { cat in
                                Text(cat.name).tag(cat.id as Int?)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                if !mode.isPlanned {
                    Section("Дата") {
                        DatePicker("Дата", selection: $date, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "ru_RU"))
                    }
                }

                Section("Описание") {
                    TextField("Опционально", text: $description)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red).font(.appLabel)
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
                    .disabled(!canSave || isSubmitting)
                }
            }
            .onAppear { populate() }
        }
        .presentationDetents([.large])
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

    private func save() async {
        guard let cents = amountCents, let catId = categoryId else { return }
        isSubmitting = true
        errorMessage = nil
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
        isSubmitting = false
    }
}
