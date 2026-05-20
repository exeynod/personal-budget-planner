import SwiftUI

/// Phase 62 — native GoalDetailView (Копилка goal detail).
///
/// List(.insetGrouped) с 4 рендер-состояниями (loading / error / fallback /
/// ready). В ready: optional mutation-error banner → Hero Section (name +
/// big ProgressView + cents/target + percentage + due + achievement seal) →
/// Action Section («Пополнить» CTA → pre-filled SavingsDepositSheet).
///
/// Toolbar trailing Menu `…` → «Удалить цель» destructive →
/// confirmationDialog (T-62-02) → GoalDetailViewModel.deleteGoal() →
/// dismiss on success.
///
/// «Пополнить» CTA открывает SavingsDepositSheet pre-filled этой целью;
/// success-path идёт через `GoalDetailViewModel.deposit` (submitting guard
/// против double-submit + reload hero/progress; GoalDetail self-contained —
/// SavingsViewModel не трогаем). T-62-05: reload после успешного депозита
/// освежает hero/progress. WR-01: failure → mutation-error banner.
struct GoalDetailView: View {
    let goalId: Int

    @State private var viewModel: GoalDetailViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var confirmDelete = false
    @State private var showDeposit = false

    init(goalId: Int) {
        self.goalId = goalId
        self._viewModel = State(wrappedValue: GoalDetailViewModel(goalId: goalId))
    }

    private static let mskCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        c.locale = Locale(identifier: "ru_RU")
        return c
    }()

    var body: some View {
        List {
            switch viewModel.status {
            case .idle, .loading:
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            case .error(let msg):
                Section {
                    Label(msg, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            case .ready:
                if let goal = viewModel.goal {
                    if let errMsg = viewModel.mutationError {
                        mutationErrorBanner(errMsg)
                    }
                    heroSection(goal)
                    actionSection
                } else {
                    // Defensive fallback (cross-tenant guard set .error и сюда
                    // не попадаем; single message без leak).
                    Section {
                        Label("Цель не найдена", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Цель")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .confirmationDialog(
            "Удалить цель?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Удалить", role: .destructive) {
                Task {
                    if await viewModel.deleteGoal() { dismiss() }
                }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Удаление цели нельзя отменить. Накопления останутся в общей копилке.")
        }
        .sheet(isPresented: $showDeposit) {
            SavingsDepositSheet(
                submitting: viewModel.submitting,
                goals: viewModel.goal.map { [$0] } ?? [],
                accounts: viewModel.accounts,
                initialGoalId: viewModel.goalId,
                onDeposit: { amount, accountId, goalId in
                    // CR-01: депозит идёт через VM behind submitting guard
                    // (no double-submit, sheet interactiveDismissDisabled).
                    // WR-01: failure ставит viewModel.mutationError в banner.
                    // T-62-05: VM.deposit делает reload hero/progress на success.
                    let ok = await viewModel.deposit(
                        amountCents: amount, accountId: accountId, goalId: goalId)
                    if ok { showDeposit = false }
                    return ok
                },
                onCancel: { showDeposit = false }
            )
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Mutation error banner (T-62-03)

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

    // MARK: - Hero

    @ViewBuilder
    private func heroSection(_ goal: GoalDTO) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(goal.name)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.primary)
                    Spacer()
                    if goal.currentCents >= goal.targetCents && goal.targetCents > 0 {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                            .accessibilityLabel("Цель достигнута")
                    }
                }
                ProgressView(value: Double(max(0, goal.currentCents)), total: Double(max(1, goal.targetCents)))
                    .tint(.green)
                Text(
                    "\(MoneyFormatter.format(cents: goal.currentCents)) ₽ из \(MoneyFormatter.format(cents: goal.targetCents)) ₽ · \(SavingsViewData.progressPercentage(currentCents: goal.currentCents, targetCents: goal.targetCents))%"
                )
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                if let due = SavingsViewData.formatDue(goal.due, calendar: GoalDetailView.mskCalendar) {
                    Text(due)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Action

    private var actionSection: some View {
        Section {
            Button {
                showDeposit = true
            } label: {
                Label("Пополнить", systemImage: "arrow.down.circle")
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Удалить цель", role: .destructive) {
                    confirmDelete = true
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .accessibilityLabel("Действия с целью")
            }
        }
    }
}
