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

/// Bottom-sheet editor — pixel-perfect port web `frontend/src/components/TransactionEditor.tsx`.
///
/// Layout:
///   - sheet header (title + close button)
///   - kind toggle (Расход / Доход), glass pill segmented
///   - labeled fields: amount (numeric), description, category, date
///   - actions row (delete? cancel + save)
///
/// Использует те же стили input/button что и web (rgba(255,255,255,0.55) tile,
/// inset border 0.5px, accent gradient на save). Шрифты и spacing подобраны
/// под значения из `TransactionEditor.module.css`.
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
    @State private var confirmingDelete = false

    private var amountCents: Int? { MoneyParser.parseToCents(amountText) }

    private var filteredCategories: [CategoryDTO] {
        categories.filter { !$0.isArchived && $0.kind == kind }
    }

    private var canSave: Bool {
        guard let cents = amountCents, cents > 0, categoryId != nil else { return false }
        return !isSubmitting
    }

    var body: some View {
        ZStack {
            AdaptiveBackground()
            ScrollView {
                VStack(spacing: 14) {
                    sheetHeader
                    if mode.isActual {
                        kindToggle
                    }
                    labeledField("Сумма (₽)") { amountInput }
                    labeledField("Описание") { descriptionInput }
                    labeledField("Категория") { categoryInput }
                    if mode.isActual {
                        labeledField("Дата") { dateInput }
                    }
                    if let errorMessage {
                        errorBanner(errorMessage)
                    }
                    if confirmingDelete {
                        confirmDeleteRow
                    }
                    actionsRow
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { populate() }
    }

    // MARK: - Header

    private var sheetHeader: some View {
        HStack(alignment: .center) {
            Text(mode.title)
                .font(.system(size: 22, weight: .bold))
                .tracking(-0.4)
                .foregroundStyle(Tokens.Ink.primary)
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Tokens.Ink.secondary)
                    .frame(width: 30, height: 30)
                    .background(
                        Circle().fill(Color.white.opacity(0.55))
                    )
                    .overlay(
                        Circle().strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 2)
    }

    // MARK: - Kind toggle

    private var kindToggle: some View {
        HStack(spacing: 4) {
            kindButton("Расход", value: .expense)
            kindButton("Доход", value: .income)
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.45))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Color.white.opacity(0.7), lineWidth: 0.5)
        )
    }

    private func kindButton(_ title: String, value: CategoryKind) -> some View {
        let isActive = kind == value
        return Button {
            withAnimation(.easeInOut(duration: 0.15)) { kind = value }
        } label: {
            Text(title)
                .font(.system(size: 13, weight: isActive ? .bold : .semibold))
                .foregroundStyle(isActive ? Tokens.Accent.primary : Tokens.Ink.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                    Group {
                        if isActive {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            Tokens.Accent.primary.opacity(0.18),
                                            Tokens.Accent.primary.opacity(0.08),
                                        ],
                                        startPoint: .top, endPoint: .bottom
                                    )
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .strokeBorder(
                                            Tokens.Accent.primary.opacity(0.33),
                                            lineWidth: 0.5
                                        )
                                )
                        }
                    }
                )
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    // MARK: - Labeled field wrapper

    @ViewBuilder
    private func labeledField<Content: View>(
        _ label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.44)
                .foregroundStyle(Tokens.Ink.secondary)
            content()
        }
    }

    // MARK: - Inputs

    private var amountInput: some View {
        TextField("1500", text: $amountText)
            .keyboardType(.decimalPad)
            .font(.system(size: 15))
            .foregroundStyle(Tokens.Ink.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(inputBackground)
            .disabled(isSubmitting)
    }

    private var descriptionInput: some View {
        TextField("", text: $description, axis: .vertical)
            .font(.system(size: 15))
            .foregroundStyle(Tokens.Ink.primary)
            .lineLimit(2...4)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 56, alignment: .topLeading)
            .background(inputBackground)
            .disabled(isSubmitting)
    }

    private var categoryInput: some View {
        Menu {
            if filteredCategories.isEmpty {
                Button("Нет доступных категорий") {}.disabled(true)
            } else {
                ForEach(filteredCategories) { cat in
                    Button(cat.name) { categoryId = cat.id }
                }
            }
        } label: {
            HStack {
                Text(categoryLabel)
                    .font(.system(size: 15))
                    .foregroundStyle(
                        categoryId == nil ? Tokens.Ink.tertiary : Tokens.Ink.primary
                    )
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Tokens.Ink.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(inputBackground)
        }
        .disabled(isSubmitting)
    }

    private var categoryLabel: String {
        if let id = categoryId, let cat = categories.first(where: { $0.id == id }) {
            return cat.name
        }
        return "— выберите —"
    }

    private var dateInput: some View {
        HStack {
            DatePicker(
                "",
                selection: $date,
                displayedComponents: .date
            )
            .labelsHidden()
            .environment(\.locale, Locale(identifier: "ru_RU"))
            .datePickerStyle(.compact)
            .tint(Tokens.Accent.primary)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(inputBackground)
        .disabled(isSubmitting)
    }

    private var inputBackground: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.55))
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.black.opacity(0.08), lineWidth: 0.5)
        }
    }

    // MARK: - Errors / confirm

    private func errorBanner(_ message: String) -> some View {
        Text("Ошибка: \(message)")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Color.red)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.red.opacity(0.10))
            )
    }

    private var confirmDeleteRow: some View {
        HStack(spacing: 10) {
            Text("Удалить?")
                .font(.system(size: 13))
                .foregroundStyle(Tokens.Ink.primary)
            Spacer()
            Button("Да") {
                Task { await performDelete() }
            }
            .buttonStyle(DangerButtonStyle())
            Button("Нет") {
                confirmingDelete = false
            }
            .buttonStyle(NeutralButtonStyle())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.45))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
        )
    }

    // MARK: - Actions

    private var actionsRow: some View {
        HStack(spacing: 10) {
            if mode.isEdit && onDelete != nil && !confirmingDelete {
                Button("Удалить") {
                    confirmingDelete = true
                }
                .buttonStyle(DangerButtonStyle())
                .disabled(isSubmitting)
                Spacer()
            } else {
                Spacer().frame(maxWidth: .infinity)
            }

            Button("Отмена") { dismiss() }
                .buttonStyle(NeutralButtonStyle())
                .disabled(isSubmitting)

            Button(isSubmitting ? "Сохранение…" : "Сохранить") {
                Task { await save() }
            }
            .buttonStyle(PrimaryButtonStyle(enabled: canSave))
            .disabled(!canSave)
        }
        .padding(.top, 6)
    }

    // MARK: - Actions logic

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
        confirmingDelete = false
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

// MARK: - Button styles

private struct PrimaryButtonStyle: ButtonStyle {
    let enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(
                        LinearGradient(
                            colors: [
                                Tokens.Accent.primary,
                                Tokens.Accent.primary.opacity(0.8),
                            ],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(Color.white.opacity(0.4), lineWidth: 0.5)
                    .offset(y: 0.5)
                    .blendMode(.plusLighter)
            )
            .shadow(color: Tokens.Accent.primary.opacity(0.33), radius: 12, x: 0, y: 6)
            .opacity(enabled ? 1.0 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

private struct NeutralButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Tokens.Ink.primary)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.55))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

private struct DangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Color(red: 216/255, green: 64/255, blue: 75/255))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(red: 216/255, green: 64/255, blue: 75/255).opacity(0.10))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(
                        Color(red: 216/255, green: 64/255, blue: 75/255).opacity(0.32),
                        lineWidth: 0.5
                    )
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}
