import SwiftUI

@MainActor
@Observable
final class SubscriptionsViewModel {
    var subscriptions: [SubscriptionDTO] = []
    var categories: [CategoryDTO] = []
    var isLoading: Bool = false
    var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let subs = SubscriptionsAPI.list()
            async let cats = CategoriesAPI.list()
            self.subscriptions = (try await subs).sorted { $0.nextChargeDate < $1.nextChargeDate }
            self.categories = (try await cats).filter { !$0.isArchived }
            await LocalNotifications.reschedule(subscriptions: self.subscriptions)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ sub: SubscriptionDTO) async {
        do {
            try await SubscriptionsAPI.delete(id: sub.id)
            subscriptions.removeAll { $0.id == sub.id }
            await LocalNotifications.reschedule(subscriptions: subscriptions)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var activeCount: Int {
        subscriptions.filter(\.isActive).count
    }

    var monthlyLoadCents: Int {
        subscriptions.filter(\.isActive).reduce(0) { acc, s in
            acc + (s.cycle == .monthly ? s.amountCents : s.amountCents / 12)
        }
    }
}

/// Subscriptions — native iOS List(.insetGrouped) layout.
///   - Section header — "Сводка" с monthlyLoad / N активных
///   - Section "Подписки" с rows
///   - swipeActions(.trailing) для удаления
///   - "+" → SubscriptionEditor sheet
struct SubscriptionsView: View {
    @State private var viewModel = SubscriptionsViewModel()
    @State private var editingSub: SubscriptionDTO?
    @State private var showingNew = false

    var body: some View {
        List {
            Section("Сводка") {
                LabeledContent("В месяц") {
                    Text(MoneyFormatter.formatWithSymbol(cents: viewModel.monthlyLoadCents))
                        .monospacedDigit()
                        .foregroundStyle(.primary)
                }
                LabeledContent("Активных") {
                    Text("\(viewModel.activeCount)")
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }

            Section("Подписки") {
                if viewModel.isLoading && viewModel.subscriptions.isEmpty {
                    ProgressView()
                } else if viewModel.subscriptions.isEmpty {
                    ContentUnavailableView(
                        "Подписок нет",
                        systemImage: "square.stack.3d.up.slash",
                        description: Text("Тапните + чтобы добавить.")
                    )
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(viewModel.subscriptions) { sub in
                        SubscriptionRow(sub: sub)
                            .contentShape(Rectangle())
                            .onTapGesture { editingSub = sub }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await viewModel.delete(sub) }
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                            }
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
        .navigationTitle("Подписки")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingNew = true } label: { Image(systemName: "plus") }
            }
        }
        .task {
            _ = await LocalNotifications.requestAuthorization()
            await viewModel.load()
            if UserDefaults.standard.bool(forKey: "DEV_OPEN_NEW_SUB_SHEET") {
                showingNew = true
            }
        }
        .sheet(isPresented: $showingNew) {
            SubscriptionEditor(
                mode: .create,
                categories: viewModel.categories,
                onSaved: { await viewModel.load() }
            )
        }
        .sheet(item: $editingSub) { sub in
            SubscriptionEditor(
                mode: .edit(sub),
                categories: viewModel.categories,
                onSaved: { await viewModel.load() }
            )
        }
    }
}

private struct SubscriptionRow: View {
    let sub: SubscriptionDTO

    private var daysUntil: Int {
        let today = Calendar.current.startOfDay(for: Date())
        let day = Calendar.current.startOfDay(for: sub.nextChargeDate)
        return Calendar.current.dateComponents([.day], from: today, to: day).day ?? 0
    }

    private var pillLabel: String {
        if daysUntil < 0 { return "просрочено" }
        if daysUntil == 0 { return "сегодня" }
        return "через \(daysUntil) дн."
    }

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: sub.category?.name ?? "")
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: visual.icon)
                .font(.body)
                .foregroundStyle(visual.color)
                .frame(width: 28, height: 28)
                .background(visual.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(sub.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(metaLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text(MoneyFormatter.formatWithSymbol(cents: sub.amountCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
        }
        .padding(.vertical, 2)
        .opacity(sub.isActive ? 1.0 : 0.55)
    }

    private var metaLine: String {
        let cycle = sub.cycle == .monthly ? "мес" : "год"
        let cat = sub.category?.name ?? ""
        return [cycle, cat, pillLabel].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

// MARK: - Editor

enum SubscriptionEditorMode: Identifiable {
    case create
    case edit(SubscriptionDTO)

    var id: String {
        switch self {
        case .create: return "create"
        case .edit(let s): return "edit-\(s.id)"
        }
    }

    var isEdit: Bool {
        if case .edit = self { return true }
        return false
    }

    var title: String {
        switch self {
        case .create: return "Новая подписка"
        case .edit: return "Подписка"
        }
    }
}

/// Native sheet — NavigationStack + Form. Все поля стандартные iOS.
struct SubscriptionEditor: View {
    let mode: SubscriptionEditorMode
    let categories: [CategoryDTO]
    let onSaved: () async -> Void
    var onDelete: (() async -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var amountText: String = ""
    @State private var cycle: SubCycle = .monthly
    @State private var nextChargeDate: Date = Date()
    @State private var categoryId: Int?
    @State private var notifyDaysBefore: Int = 2
    @State private var isActive: Bool = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var showingDeleteConfirm = false

    private var amountCents: Int? { MoneyParser.parseToCents(amountText) }

    private var expenseCategories: [CategoryDTO] {
        categories.filter { !$0.isArchived && $0.kind == .expense }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && (amountCents ?? 0) > 0
            && categoryId != nil
            && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Например, Netflix", text: $name)
                }
                Section("Сумма") {
                    HStack {
                        TextField("0", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.body.monospacedDigit())
                        Text("₽").foregroundStyle(.secondary)
                    }
                }
                Section("Цикл") {
                    Picker("Цикл", selection: $cycle) {
                        Text("Месяц").tag(SubCycle.monthly)
                        Text("Год").tag(SubCycle.yearly)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Следующее списание") {
                    DatePicker("Дата", selection: $nextChargeDate, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "ru_RU"))
                }
                Section("Категория") {
                    if expenseCategories.isEmpty {
                        Text("Нет категорий-расходов")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker(selection: $categoryId) {
                            Text("— выбрать —").tag(Int?.none)
                            ForEach(expenseCategories) { c in
                                Label {
                                    Text(c.name)
                                } icon: {
                                    let v = Tokens.Categories.visual(for: c.name)
                                    Image(systemName: v.icon).foregroundStyle(v.color)
                                }
                                .tag(c.id as Int?)
                            }
                        } label: {
                            EmptyView()
                        }
                        .labelsHidden()
                    }
                }
                Section("Уведомления") {
                    Stepper(value: $notifyDaysBefore, in: 0...30) {
                        LabeledContent("За дней до списания") {
                            Text("\(notifyDaysBefore)").monospacedDigit()
                        }
                    }
                }
                if mode.isEdit {
                    Section {
                        Toggle("Активна", isOn: $isActive)
                    }
                }
                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
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
                    Button(mode.isEdit ? "Сохранить" : "Создать") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSubmitting)
            .onAppear { populate() }
            .confirmationDialog(
                "Удалить подписку?",
                isPresented: $showingDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Удалить", role: .destructive) {
                    Task { await performDelete() }
                }
            }
        }
        .presentationDragIndicator(.visible)
        .presentationDetents([.large])
    }

    private func populate() {
        let expenses = categories.filter { $0.kind == .expense }
        switch mode {
        case .create:
            categoryId = expenses.first?.id
        case .edit(let s):
            name = s.name
            amountText = MoneyFormatter.format(cents: s.amountCents)
            cycle = s.cycle
            nextChargeDate = s.nextChargeDate
            categoryId = s.categoryId
            notifyDaysBefore = s.notifyDaysBefore
            isActive = s.isActive
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
            case .create:
                _ = try await SubscriptionsAPI.create(SubscriptionCreateRequest(
                    name: name.trimmingCharacters(in: .whitespaces),
                    amountCents: cents,
                    cycle: cycle.rawValue,
                    nextChargeDate: DateFormatters.isoDate.string(from: nextChargeDate),
                    categoryId: catId,
                    notifyDaysBefore: notifyDaysBefore
                ))
            case .edit(let s):
                _ = try await SubscriptionsAPI.update(id: s.id, SubscriptionUpdateRequest(
                    name: name,
                    amountCents: cents,
                    cycle: cycle.rawValue,
                    nextChargeDate: DateFormatters.isoDate.string(from: nextChargeDate),
                    categoryId: catId,
                    notifyDaysBefore: notifyDaysBefore,
                    isActive: isActive
                ))
            }
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
