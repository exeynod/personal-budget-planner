import SwiftUI

/// Phase 62 — native SavingsView (Копилка master list).
///
/// Native iOS-26 List(.insetGrouped) с 4 render-состояниями (loading /
/// error / ready+empty / ready+content).
///
/// Ready+content layout:
///   - Mutation-error banner Section (если mutationError != nil).
///   - Hero Section (без header): «Всего отложено» monospacedDigit +
///     sub «За месяц: +<monthIn> ₽».
///   - Roundup Section («Округление трат»): Toggle + conditional segmented
///     Picker (10/50/100 ₽) при enabled.
///   - Goals Section («Цели»): ForEach goals → NavigationLink(value:
///     SavingsRoute.goal(id:)) → SavingsGoalRow с progress bar +
///     sub + due. Swipe-to-delete → confirmationDialog.
///   - Empty goals: ContentUnavailableView «Нет целей».
///
/// Toolbar trailing: Menu с двумя пунктами («Новая цель» / «Пополнить»).
///
/// Sheets:
///   - SavingsNewGoalSheet (когда viewModel.sheet == .newGoal).
///   - SavingsDepositSheet (когда viewModel.sheet == .deposit(...)).
///
/// .navigationDestination(for: SavingsRoute.self) → push GoalDetailView.
///
/// Threat-model:
///   - T-62-02 (Repudiation — accidental delete): confirmationDialog
///     перед deleteGoal.
///   - T-62-03: mutationError banner reads filtered Russian copy
///     из VM; raw error не появляется.
struct SavingsView: View {
    @State private var viewModel = SavingsViewModel()
    @State private var goalToDelete: Int? = nil

    var body: some View {
        List {
            switch viewModel.status {
            case .idle, .loading:
                loadingSection
            case .error(let msg):
                errorSection(msg)
            case .ready:
                if let errMsg = viewModel.mutationError {
                    MutationErrorBanner(message: errMsg) { viewModel.clearMutationError() }
                }
                heroSection
                roundupSection
                goalsSection
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Копилка")
        .toolbar { toolbarContent }
        .navigationDestination(for: SavingsRoute.self) { route in
            switch route {
            case .goal(let id):
                GoalDetailView(goalId: id)
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(isPresented: newGoalSheetBinding) {
            SavingsNewGoalSheet(
                submitting: viewModel.submitting,
                onCreate: { name, targetCents, due in
                    await viewModel.createGoal(name: name, targetCents: targetCents, due: due)
                },
                onCancel: { viewModel.sheet = .none }
            )
        }
        .sheet(isPresented: depositSheetBinding) {
            SavingsDepositSheet(
                submitting: viewModel.submitting,
                goals: viewModel.goals,
                accounts: viewModel.accounts,
                initialGoalId: depositInitialGoalId,
                onDeposit: { amount, accountId, goalId in
                    await viewModel.deposit(amountCents: amount, accountId: accountId, goalId: goalId)
                },
                onCancel: { viewModel.sheet = .none }
            )
        }
        .confirmationDialog(
            "Удалить цель?",
            isPresented: deleteDialogBinding,
            titleVisibility: .visible
        ) {
            Button("Удалить", role: .destructive) {
                if let id = goalToDelete {
                    Task {
                        await viewModel.deleteGoal(id: id)
                        goalToDelete = nil
                    }
                }
            }
            Button("Отмена", role: .cancel) { goalToDelete = nil }
        } message: {
            Text("Удаление цели нельзя отменить. Накопления останутся в общей копилке.")
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
            Label(msg, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
        }
    }

    // MARK: - Hero

    private var heroSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("Всего отложено")
                    .font(.caption)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(MoneyFormatter.format(cents: viewModel.totalCents))
                        .font(.title.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("₽").foregroundStyle(.secondary)
                    Spacer()
                }
                Text("За месяц: +\(MoneyFormatter.format(cents: viewModel.monthInCents)) ₽")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Roundup

    private var roundupSection: some View {
        Section {
            Toggle(
                "Включить округление",
                isOn: Binding(
                    get: { viewModel.roundupEnabled },
                    set: { newValue in
                        Task { await viewModel.toggleRoundup(newValue) }
                    }
                ))
            if viewModel.roundupEnabled {
                Picker(
                    "База округления",
                    selection: Binding(
                        get: { viewModel.roundupBase },
                        set: { newValue in
                            Task { await viewModel.selectBase(newValue) }
                        }
                    )
                ) {
                    Text("10 ₽").tag(10)
                    Text("50 ₽").tag(50)
                    Text("100 ₽").tag(100)
                }
                .pickerStyle(.segmented)
            }
        } header: {
            Text("Округление трат")
        } footer: {
            if viewModel.roundupEnabled {
                Text("Каждая трата округлится вверх; разница уйдёт в копилку.")
            }
        }
    }

    // MARK: - Goals

    @ViewBuilder
    private var goalsSection: some View {
        let sorted = SavingsViewData.sortGoalsForDisplay(viewModel.goals)
        if sorted.isEmpty {
            Section {
                ContentUnavailableView(
                    "Нет целей",
                    systemImage: "target",
                    description: Text("Поставьте первую цель через «+»")
                )
                .listRowBackground(Color.clear)
            }
        } else {
            Section("Цели · \(sorted.count)") {
                ForEach(sorted) { goal in
                    NavigationLink(value: SavingsRoute.goal(id: goal.id)) {
                        SavingsGoalRow(goal: goal)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            goalToDelete = goal.id
                        } label: {
                            Label("Удалить", systemImage: "trash")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    viewModel.sheet = .newGoal
                } label: {
                    Label("Новая цель", systemImage: "target")
                }
                Button {
                    viewModel.sheet = .deposit(goalId: nil)
                } label: {
                    Label("Пополнить", systemImage: "arrow.down.circle")
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .accessibilityLabel("Действия с копилкой")
            }
        }
    }

    // MARK: - Sheet bindings

    private var newGoalSheetBinding: Binding<Bool> {
        Binding(
            get: { viewModel.sheet == .newGoal },
            set: { if !$0 { viewModel.sheet = .none } }
        )
    }

    private var depositSheetBinding: Binding<Bool> {
        Binding(
            get: {
                if case .deposit = viewModel.sheet { return true }
                return false
            },
            set: { if !$0 { viewModel.sheet = .none } }
        )
    }

    private var deleteDialogBinding: Binding<Bool> {
        Binding(
            get: { goalToDelete != nil },
            set: { if !$0 { goalToDelete = nil } }
        )
    }

    private var depositInitialGoalId: Int? {
        if case .deposit(let id) = viewModel.sheet { return id }
        return nil
    }
}

// MARK: - Row

private struct SavingsGoalRow: View {
    let goal: GoalDTO

    private var percentage: Int {
        SavingsViewData.progressPercentage(
            currentCents: goal.currentCents, targetCents: goal.targetCents)
    }

    private var dueText: String? {
        SavingsViewData.formatDue(goal.due?.date, calendar: SavingsGoalRow.mskCalendar)
    }

    private static let mskCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        c.locale = Locale(identifier: "ru_RU")
        return c
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(goal.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                Spacer()
                if goal.currentCents >= goal.targetCents && goal.targetCents > 0 {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                        .accessibilityLabel("Цель достигнута")
                }
            }
            ProgressView(
                value: Double(max(0, goal.currentCents)), total: Double(max(1, goal.targetCents))
            )
            .tint(.green)
            HStack(spacing: 4) {
                Text(
                    "\(MoneyFormatter.format(cents: goal.currentCents)) ₽ из \(MoneyFormatter.format(cents: goal.targetCents)) ₽"
                )
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                Text("·")
                    .foregroundStyle(.secondary)
                Text("\(percentage)%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if let due = dueText {
                Text(due)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
