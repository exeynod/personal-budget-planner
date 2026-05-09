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
        do {
            async let subs = SubscriptionsAPI.list()
            async let cats = CategoriesAPI.list()
            self.subscriptions = (try await subs).sorted { $0.nextChargeDate < $1.nextChargeDate }
            self.categories = (try await cats).filter { !$0.isArchived }
            await LocalNotifications.reschedule(subscriptions: self.subscriptions)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
}

struct SubscriptionsView: View {
    @State private var viewModel = SubscriptionsViewModel()
    @State private var editingSub: SubscriptionDTO?
    @State private var showingNew = false

    var body: some View {
        ZStack {
            AdaptiveBackground()

            ScrollView {
                LazyVStack(spacing: Tokens.Spacing.md) {
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
                    if viewModel.subscriptions.isEmpty && !viewModel.isLoading {
                        Text("Нет подписок. Добавьте через +.")
                            .font(.appBody)
                            .foregroundStyle(.secondary)
                            .padding(.top, 80)
                    }
                }
                .padding(.horizontal, Tokens.Spacing.xl)
                .padding(.top, Tokens.Spacing.lg)
                .padding(.bottom, 100)
            }
            .refreshable { await viewModel.load() }

            FAB { showingNew = true }
                .padding(.trailing, Tokens.Spacing.xl)
                .padding(.bottom, Tokens.Spacing.xl)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
        .navigationTitle("Подписки")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            _ = await LocalNotifications.requestAuthorization()
            await viewModel.load()
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

    var body: some View {
        HStack(spacing: Tokens.Spacing.md) {
            Circle()
                .fill(Tokens.Categories.color(for: sub.category?.name ?? ""))
                .frame(width: 12, height: 12)

            VStack(alignment: .leading, spacing: 2) {
                Text(sub.name).font(.appBody)
                Text("\(sub.cycle == .monthly ? "Ежемес." : "Ежегод.") · \(DateFormatters.displayDayShort.string(from: sub.nextChargeDate))")
                    .font(.appCaption).foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(MoneyFormatter.formatWithSymbol(cents: sub.amountCents))
                    .font(.appNumber)
                if !sub.isActive {
                    Text("Пауза").font(.appCaption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(Tokens.Spacing.md)
        .glassCard(radius: Tokens.Radius.md)
    }
}

enum SubscriptionEditorMode: Identifiable {
    case create
    case edit(SubscriptionDTO)

    var id: String {
        switch self {
        case .create: return "create"
        case .edit(let s): return "edit-\(s.id)"
        }
    }
}

struct SubscriptionEditor: View {
    let mode: SubscriptionEditorMode
    let categories: [CategoryDTO]
    let onSaved: () async -> Void

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

    private var amountCents: Int? { MoneyParser.parseToCents(amountText) }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && (amountCents ?? 0) > 0
            && categoryId != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Название", text: $name)
                }
                Section("Сумма") {
                    HStack {
                        TextField("0", text: $amountText)
                            .keyboardType(.numbersAndPunctuation)
                        Text("₽").foregroundStyle(.secondary)
                    }
                }
                Section("Цикл") {
                    Picker("Цикл", selection: $cycle) {
                        Text("Ежемесячно").tag(SubCycle.monthly)
                        Text("Ежегодно").tag(SubCycle.yearly)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Следующее списание") {
                    DatePicker("Дата", selection: $nextChargeDate, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "ru_RU"))
                }
                Section("Категория") {
                    let expenses = categories.filter { $0.kind == .expense }
                    if expenses.isEmpty {
                        Text("Создайте категорию-расход в Меню → Категории").font(.appCaption)
                    } else {
                        Picker("Категория", selection: $categoryId) {
                            ForEach(expenses) { c in
                                Text(c.name).tag(c.id as Int?)
                            }
                        }
                    }
                }
                Section("Уведомления") {
                    Stepper("За \(notifyDaysBefore) дней", value: $notifyDaysBefore, in: 0...30)
                    Toggle("Активна", isOn: $isActive)
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle({
                if case .edit = mode { return "Изменить" } else { return "Новая подписка" }
            }())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { Task { await save() } }
                        .disabled(!canSave || isSubmitting)
                }
            }
            .onAppear { populate() }
        }
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

    private func save() async {
        guard let cents = amountCents, let catId = categoryId else { return }
        isSubmitting = true
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
        isSubmitting = false
    }
}
