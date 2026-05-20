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
            // Phase 63-02 — восстановлен rescheduling нотификаций через
            // V10DTO-overload (63-01 known-gap закрыт).
            await LocalNotifications.reschedule(subscriptionsV10: self.subscriptions)
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
        await patchById(sub.id, payload: payload)
    }

    /// PATCH по id — used by editor follow-up (create-path: id известен только
    /// после legacy create; edit-path: id из DTO) для записи V10-extension
    /// полей `day_of_month`/`account_id` (Plan 63-02). Submitting guard + reload.
    @discardableResult
    func patchById(_ id: Int, payload: SubscriptionV10UpdateRequest) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await SubscriptionsV10API.patch(id: id, payload: payload)
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
    /// Pending post/unpost target — денежная мутация под confirmationDialog
    /// (T-63-01/05). nil → диалог скрыт.
    @State private var postSubject: SubscriptionV10DTO?
    @State private var postIsUnpost = false

    private func categoryName(_ id: Int) -> String {
        viewModel.categories.first { $0.id == id }?.name ?? ""
    }

    var body: some View {
        List {
            switch viewModel.status {
            case .idle, .loading:
                loadingSection
            case .error(let msg):
                errorSection(msg)
            case .ready:
                if let err = viewModel.mutationError {
                    mutationErrorBanner(err)
                }
                summarySection
                subscriptionsSection
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Подписки")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingNew = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable { await viewModel.load() }
        .confirmationDialog(
            postIsUnpost ? "Отменить проведение?" : "Провести подписку?",
            isPresented: postDialogBinding,
            titleVisibility: .visible
        ) {
            if let sub = postSubject {
                Button(postIsUnpost ? "Отменить проведение" : "Провести", role: postIsUnpost ? .destructive : nil) {
                    let target = sub
                    let isUnpost = postIsUnpost
                    Task {
                        if isUnpost {
                            _ = await viewModel.unpost(target)
                        } else {
                            _ = await viewModel.post(target)
                        }
                        postSubject = nil
                    }
                }
                Button("Отмена", role: .cancel) { postSubject = nil }
            }
        } message: {
            Text(
                postIsUnpost
                    ? "Связанная транзакция-списание будет удалена."
                    : "Будет создана транзакция-списание по подписке.")
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
                accounts: viewModel.accounts,
                onSaved: { await viewModel.load() },
                onPatchV10: { id, payload in
                    await viewModel.patchById(id, payload: payload)
                }
            )
        }
        .sheet(item: $editingSub) { sub in
            SubscriptionEditor(
                mode: .edit(sub),
                categories: viewModel.categories,
                accounts: viewModel.accounts,
                onSaved: { await viewModel.load() },
                onDelete: { await viewModel.delete(sub) },
                onPatchV10: { id, payload in
                    await viewModel.patchById(id, payload: payload)
                }
            )
        }
    }

    // MARK: - State sections

    private var loadingSection: some View {
        Section {
            ProgressView()
                .frame(maxWidth: .infinity)
        }
    }

    private func errorSection(_ msg: String) -> some View {
        Section {
            ContentUnavailableView(
                "Не удалось загрузить",
                systemImage: "exclamationmark.triangle",
                description: Text(msg)
            )
            .listRowBackground(Color.clear)
        }
    }

    // MARK: - Mutation error banner (T-63-02)

    private func mutationErrorBanner(_ msg: String) -> some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(msg)
                    .font(.callout)
                    .foregroundStyle(.primary)
                Spacer(minLength: 8)
                Button {
                    viewModel.clearMutationError()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Скрыть ошибку")
            }
        }
    }

    // MARK: - Summary

    private var summarySection: some View {
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
    }

    // MARK: - Subscriptions list

    @ViewBuilder
    private var subscriptionsSection: some View {
        Section("Подписки") {
            if viewModel.subscriptions.isEmpty {
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
                        .swipeActions(edge: .leading) {
                            if SubscriptionsViewData.isPosted(sub) {
                                Button {
                                    postIsUnpost = true
                                    postSubject = sub
                                } label: {
                                    Label("Отменить проведение", systemImage: "arrow.uturn.backward")
                                }
                                .tint(.orange)
                                .disabled(viewModel.submitting)
                            } else {
                                Button {
                                    postIsUnpost = false
                                    postSubject = sub
                                } label: {
                                    Label("Провести", systemImage: "checkmark.circle")
                                }
                                .tint(.green)
                                .disabled(viewModel.submitting)
                            }
                        }
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
    }

    // MARK: - Dialog binding

    private var postDialogBinding: Binding<Bool> {
        Binding(
            get: { postSubject != nil },
            set: { if !$0 { postSubject = nil } }
        )
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
                HStack(spacing: 6) {
                    Text(sub.name)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    if SubscriptionsViewData.isPosted(sub) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                            .accessibilityLabel("Проведено")
                    }
                }
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
///
/// Phase 63-02 — расширен секциями «Счёт списания» (Picker, источник
/// `accounts`, default = primary) и «День месяца» (Stepper 1...28, только
/// для `cycle == .monthly`). Save-path:
///   - `.create`: legacy `SubscriptionsAPI.create` (V10API не имеет create —
///     резолюция CONTEXT/63-01) → получить созданный id → follow-up
///     `viewModel.patch` для `day_of_month`/`account_id` (V10-extension поля).
///   - `.edit`: legacy `SubscriptionsAPI.update` для скаляров+даты
///     (String `yyyy-MM-dd` через DateFormatters.isoDate — без UTC day-shift,
///     т.к. APIClient encoder = `.iso8601` UTC и сместил бы DATE-поле) →
///     follow-up `viewModel.patch` для `day_of_month`/`account_id`.
struct SubscriptionEditor: View {
    let mode: SubscriptionEditorMode
    let categories: [CategoryDTO]
    let accounts: [AccountDTO]
    let onSaved: () async -> Void
    var onDelete: (() async -> Void)? = nil
    /// V10 PATCH seam для follow-up day_of_month/account_id (создание + правка).
    var onPatchV10: ((_ id: Int, _ payload: SubscriptionV10UpdateRequest) async -> Bool)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var amountText: String = ""
    @State private var cycle: SubCycle = .monthly
    @State private var nextChargeDate: Date = Date()
    @State private var categoryId: Int?
    @State private var notifyDaysBefore: Int = 2
    @State private var isActive: Bool = true
    @State private var dayOfMonth: Int = 1
    /// Исходное значение day_of_month из DTO (edit-path). nil → поле было
    /// не задано (legacy row). Используется чтобы НЕ писать day_of_month=1
    /// в follow-up PATCH, если пользователь не трогал Stepper (WR-03).
    @State private var originalDayOfMonth: Int?
    @State private var accountId: Int?
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var showingDeleteConfirm = false

    private var amountCents: Int? { MoneyParser.parseToCents(amountText) }

    private var expenseCategories: [CategoryDTO] {
        categories.filter { !$0.isArchived && $0.kind == .expense }
    }

    private func accountLabel(_ a: AccountDTO) -> String {
        a.bank + (a.mask.map { " · \($0)" } ?? "")
    }

    private var canSave: Bool {
        SubscriptionsViewData.isValidDraft(
            name: name,
            amountCents: amountCents ?? 0,
            categoryId: categoryId,
            submitting: isSubmitting
        )
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
                if cycle == .monthly {
                    Section {
                        Stepper(value: $dayOfMonth, in: 1...28) {
                            LabeledContent("Число списания") {
                                Text("\(dayOfMonth)").monospacedDigit()
                            }
                        }
                    } header: {
                        Text("День месяца")
                    } footer: {
                        Text("Порядковый день (1–28) для ежемесячного списания.")
                    }
                }
                Section("Следующее списание") {
                    DatePicker("Дата", selection: $nextChargeDate, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "ru_RU"))
                }
                Section {
                    Picker(selection: $accountId) {
                        Text("Не указан").tag(Int?.none)
                        ForEach(accounts) { a in
                            Text(accountLabel(a)).tag(Int?.some(a.id))
                        }
                    } label: {
                        Text("Счёт")
                    }
                } header: {
                    Text("Счёт списания")
                } footer: {
                    Text("Со счёта спишется сумма при проведении подписки.")
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
        // Default account = primary, иначе первый (как SavingsDepositSheet).
        let defaultAccount = accounts.first(where: { $0.primary })?.id ?? accounts.first?.id
        switch mode {
        case .create:
            categoryId = expenses.first?.id
            accountId = defaultAccount
            dayOfMonth = 1
            originalDayOfMonth = nil
        case .edit(let s):
            name = s.name
            amountText = MoneyFormatter.format(cents: s.amountCents)
            cycle = s.cycle
            nextChargeDate = s.nextChargeDate
            categoryId = s.categoryId
            notifyDaysBefore = s.notifyDaysBefore
            isActive = s.isActive
            dayOfMonth = s.dayOfMonth ?? 1
            originalDayOfMonth = s.dayOfMonth
            accountId = s.accountId
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

        // day_of_month — ordinal, только для monthly. account_id — optional.
        // WR-03: на edit-path пишем day_of_month ТОЛЬКО если пользователь
        // реально изменил значение (vs исходного DTO). На create-path —
        // если выбран monthly (пользователь всегда видит Stepper).
        let dayChanged: Bool
        switch mode {
        case .create:
            dayChanged = (cycle == .monthly)
        case .edit:
            dayChanged = (cycle == .monthly) && (dayOfMonth != originalDayOfMonth)
        }
        let dayPayload: Int? = dayChanged ? dayOfMonth : nil
        let v10Payload = SubscriptionV10UpdateRequest(dayOfMonth: dayPayload, accountId: accountId)
        // PATCH нужен только если есть что писать в V10-extension поля.
        let needsFollowUpPatch = dayPayload != nil || accountId != nil

        do {
            switch mode {
            case .create:
                // V10API не имеет create — legacy create задаёт скаляры+дату
                // (String yyyy-MM-dd, без UTC day-shift), затем follow-up V10
                // PATCH дописывает day_of_month/account_id (резолюция 63-01).
                let created = try await SubscriptionsAPI.create(
                    SubscriptionCreateRequest(
                        name: name.trimmingCharacters(in: .whitespaces),
                        amountCents: cents,
                        cycle: cycle.rawValue,
                        nextChargeDate: DateFormatters.isoDate.string(from: nextChargeDate),
                        categoryId: catId,
                        notifyDaysBefore: notifyDaysBefore
                    ))
                if needsFollowUpPatch, let onPatchV10 {
                    // WR-02: подписка создана, но follow-up PATCH (day/account)
                    // может упасть. Раньше результат игнорировался и sheet
                    // закрывался как полный успех. Теперь — проверяем результат:
                    // на сбое НЕ закрываем sheet, показываем partial-success
                    // ошибку и отражаем реальное состояние через onSaved().
                    let ok = await onPatchV10(created.id, v10Payload)
                    if !ok {
                        await onSaved()
                        errorMessage =
                            "Подписка создана, но счёт/день не сохранились. "
                            + "Откройте её и сохраните ещё раз."
                        return
                    }
                }
            case .edit(let s):
                // Скаляры+дата через legacy update (String date — без day-shift),
                // затем V10 PATCH для day_of_month/account_id.
                _ = try await SubscriptionsAPI.update(
                    id: s.id,
                    SubscriptionUpdateRequest(
                        name: name,
                        amountCents: cents,
                        cycle: cycle.rawValue,
                        nextChargeDate: DateFormatters.isoDate.string(from: nextChargeDate),
                        categoryId: catId,
                        notifyDaysBefore: notifyDaysBefore,
                        isActive: isActive
                    ))
                if needsFollowUpPatch, let onPatchV10 {
                    // WR-02 (симметрично create): на сбое follow-up PATCH не
                    // закрываем sheet, показываем ошибку и отражаем реальное
                    // состояние через onSaved().
                    let ok = await onPatchV10(s.id, v10Payload)
                    if !ok {
                        await onSaved()
                        errorMessage =
                            "Основные поля сохранены, но счёт/день не сохранились. "
                            + "Попробуйте сохранить ещё раз."
                        return
                    }
                }
            }
            await onSaved()
            dismiss()
        } catch {
            // T-63-02 — фиксированная RU-копия, без утечки raw error.
            print("[SubscriptionEditor] save failed: \(error)")
            errorMessage = "Не удалось сохранить подписку"
        }
    }
}
