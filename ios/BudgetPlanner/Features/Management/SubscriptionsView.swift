import SwiftUI

/// Phase 63 Plan 01 — SubscriptionsViewModel мигрирован на SubscriptionsV10API.
///
/// list / patch / post / unpost / delete — всё на v1.0-контракте
/// (`SubscriptionV10DTO`). create-путь остаётся на legacy `SubscriptionsAPI`
/// (V10API не имеет create-эндпоинта — резолюция CONTEXT open-вопроса) и живёт
/// во View-editor (Plan 63-02). post/unpost — денежные мутации (создают /
/// отменяют транзакцию).
///
/// Эталон поведения — SavingsViewModel (Phase 62):
///   - Status state-machine {idle, loading, ready, error};
///   - inFlight guard в load();
///   - submitting guard + defer на post/unpost/patch/delete (T-63-01);
///   - raw error → ТОЛЬКО print(); UI читает фиксированную RU-копию (T-63-02);
///   - full reload после успешной мутации (T-63-04).
@MainActor
@Observable
final class SubscriptionsViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    private(set) var subscriptions: [SubscriptionV10DTO] = []
    private(set) var categories: [CategoryDTO] = []
    private(set) var accounts: [AccountDTO] = []
    private(set) var status: Status = .idle
    private(set) var submitting: Bool = false

    /// Фиксированная RU-копия на mutation failure (T-63-02). UI читает в banner.
    var mutationError: String? = nil

    @ObservationIgnored
    private var inFlight: Bool = false

    // MARK: - Load

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        do {
            async let subsTask = SubscriptionsV10API.list()
            async let catsTask = CategoriesAPI.list()
            async let accsTask = AccountsAPI.list()
            let (subs, cats, accs) = try await (subsTask, catsTask, accsTask)
            self.subscriptions = SubscriptionsViewData.sortForDisplay(subs)
            self.categories = cats.filter { !$0.isArchived }
            self.accounts = accs
            // NOTE (Phase 63-01 known-gap): LocalNotifications.reschedule принимает
            // legacy [SubscriptionDTO] (Decodable-only, нет memberwise init), поэтому
            // V10DTO нельзя смэппить без модификации LocalNotifications/SubscriptionDTO
            // (вне scope этого плана). Rescheduling нотификаций подписок — follow-up;
            // CRUD-функционал подписок не регрессирует. TODO(63-02+): overload под V10DTO.
            status = .ready
        } catch {
            print("[SubscriptionsViewModel] load failed: \(error)")
            status = .error("Не удалось загрузить подписки")
        }
    }

    // MARK: - Mutations

    /// Провести списание подписки (создаёт транзакцию). Submitting guard
    /// (T-63-01) + reload (T-63-04) на успехе.
    @discardableResult
    func post(_ sub: SubscriptionV10DTO) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await SubscriptionsV10API.post(id: sub.id)
            mutationError = nil
            await load()
            return true
        } catch {
            print("[SubscriptionsViewModel] post failed: \(error)")
            mutationError = "Не удалось провести подписку"
            return false
        }
    }

    /// Отменить проведение подписки. Submitting guard + reload.
    @discardableResult
    func unpost(_ sub: SubscriptionV10DTO) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await SubscriptionsV10API.unpost(id: sub.id)
            mutationError = nil
            await load()
            return true
        } catch {
            print("[SubscriptionsViewModel] unpost failed: \(error)")
            mutationError = "Не удалось отменить проведение"
            return false
        }
    }

    /// Удалить подписку (hard delete). Submitting guard + reload.
    func delete(_ sub: SubscriptionV10DTO) async {
        guard !submitting else { return }
        submitting = true
        defer { submitting = false }
        do {
            try await SubscriptionsV10API.delete(id: sub.id)
            mutationError = nil
            await load()
        } catch {
            print("[SubscriptionsViewModel] delete failed: \(error)")
            mutationError = "Не удалось удалить подписку"
        }
    }

    /// PATCH подписки (используется editor edit-path в Plan 63-02).
    /// Submitting guard + reload.
    @discardableResult
    func patch(_ sub: SubscriptionV10DTO, payload: SubscriptionV10UpdateRequest) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await SubscriptionsV10API.patch(id: sub.id, payload: payload)
            mutationError = nil
            await load()
            return true
        } catch {
            print("[SubscriptionsViewModel] patch failed: \(error)")
            mutationError = "Не удалось сохранить подписку"
            return false
        }
    }

    // MARK: - Helpers

    func clearMutationError() { self.mutationError = nil }

    // MARK: - Derived

    var activeCount: Int { SubscriptionsViewData.computeActiveCount(subscriptions) }
    var monthlyLoadCents: Int { SubscriptionsViewData.computeMonthlyLoadCents(subscriptions) }

    // MARK: - DEBUG backdoor

    #if DEBUG
    func _setStateForTesting(
        subscriptions: [SubscriptionV10DTO] = [],
        categories: [CategoryDTO] = [],
        accounts: [AccountDTO] = [],
        status: Status = .ready
    ) {
        self.subscriptions = subscriptions
        self.categories = categories
        self.accounts = accounts
        self.status = status
    }
    #endif
}

/// Subscriptions — native iOS List(.insetGrouped) layout.
///   - Section header — "Сводка" с monthlyLoad / N активных
///   - Section "Подписки" с rows
///   - swipeActions(.trailing) для удаления
///   - "+" → SubscriptionEditor sheet
struct SubscriptionsView: View {
    @State private var viewModel = SubscriptionsViewModel()
    @State private var editingSub: SubscriptionV10DTO?
    @State private var showingNew = false

    private var isLoading: Bool {
        if case .loading = viewModel.status { return true }
        return false
    }

    private func categoryName(_ id: Int) -> String {
        viewModel.categories.first { $0.id == id }?.name ?? ""
    }

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
                if isLoading && viewModel.subscriptions.isEmpty {
                    ProgressView()
                } else if case .error(let msg) = viewModel.status, viewModel.subscriptions.isEmpty {
                    ContentUnavailableView(
                        "Не удалось загрузить",
                        systemImage: "exclamationmark.triangle",
                        description: Text(msg)
                    )
                    .listRowBackground(Color.clear)
                } else if viewModel.subscriptions.isEmpty {
                    ContentUnavailableView(
                        "Подписок нет",
                        systemImage: "square.stack.3d.up.slash",
                        description: Text("Тапните + чтобы добавить.")
                    )
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(viewModel.subscriptions) { sub in
                        SubscriptionRow(sub: sub, categoryName: categoryName(sub.categoryId))
                            .contentShape(Rectangle())
                            .onTapGesture { editingSub = sub }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await viewModel.delete(sub) }
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                                .disabled(viewModel.submitting)
                            }
                    }
                }
            }

            if let err = viewModel.mutationError {
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
        .refreshable { await viewModel.load() }
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
    let sub: SubscriptionV10DTO
    let categoryName: String

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
        Tokens.Categories.visual(for: categoryName)
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
        let cadence = SubscriptionsViewData.formatCadenceRu(cycle: sub.cycle, dayOfMonth: sub.dayOfMonth)
        return [cadence, categoryName, pillLabel].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

// MARK: - Editor

enum SubscriptionEditorMode: Identifiable {
    case create
    case edit(SubscriptionV10DTO)

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
