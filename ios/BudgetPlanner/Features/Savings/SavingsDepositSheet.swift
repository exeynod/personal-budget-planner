import SwiftUI

/// Phase 62 — native Form sheet для пополнения копилки.
///
/// **Symbol-collision avoidance**: FeaturesV10/Savings/DepositSheet.swift
/// уже определяет `struct DepositSheet`. Поэтому v06 native sheet
/// называется `SavingsDepositSheet`.
///
/// **Composition (Plan 62-03)**:
///   - NavigationStack (self-contained sheet).
///   - Form: «Цель» Picker (Int? — «Общая копилка» nil-tag + goals),
///     pre-filled из `initialGoalId`; «Сумма» .decimalPad через
///     MoneyParser; «Счёт списания» Picker (required, default = primary
///     или первый account).
///   - Toolbar: «Отмена» (.cancellationAction) + «Пополнить»
///     (.confirmationAction, disabled до canDeposit; label «Пополнение…»).
///
/// **Threat-model**:
///   - T-62-01: canDeposit gate (amount>0 && accountId>0 после WR-05).
///   - T-62-04: submitting guard + .disabled + interactiveDismissDisabled.
struct SavingsDepositSheet: View {
    let submitting: Bool
    let goals: [GoalDTO]
    let accounts: [AccountDTO]
    let initialGoalId: Int?
    let onDeposit: (_ amountCents: Int, _ accountId: Int, _ goalId: Int?) async -> Bool
    let onCancel: () -> Void

    @State private var amountText: String = ""
    @State private var selectedGoalId: Int?
    @State private var selectedAccountId: Int?

    init(
        submitting: Bool,
        goals: [GoalDTO],
        accounts: [AccountDTO],
        initialGoalId: Int?,
        onDeposit: @escaping (_ amountCents: Int, _ accountId: Int, _ goalId: Int?) async -> Bool,
        onCancel: @escaping () -> Void
    ) {
        self.submitting = submitting
        self.goals = goals
        self.accounts = accounts
        self.initialGoalId = initialGoalId
        self.onDeposit = onDeposit
        self.onCancel = onCancel
        self._selectedGoalId = State(initialValue: initialGoalId)
        // Default account: primary first, иначе первый из списка.
        let defaultAccount = accounts.first(where: { $0.primary })?.id ?? accounts.first?.id
        self._selectedAccountId = State(initialValue: defaultAccount)
    }

    // MARK: - Derived

    private var amountCents: Int {
        MoneyParser.parseToCents(amountText) ?? 0
    }

    private var canDeposit: Bool {
        SavingsViewData.isValidDepositDraft(amountCents: amountCents, accountId: selectedAccountId)
            && !submitting
    }

    // R1 — single account-label source (AccountPickerLogic.label).
    private func accountLabel(_ a: AccountDTO) -> String {
        AccountPickerLogic.label(a)
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                Section("Цель") {
                    Picker("Цель", selection: $selectedGoalId) {
                        Text("Общая копилка").tag(Int?.none)
                        ForEach(goals) { g in
                            Text(g.name).tag(Int?.some(g.id))
                        }
                    }
                }

                Section("Сумма") {
                    HStack {
                        TextField("0", text: $amountText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                        Text("₽").foregroundStyle(.secondary)
                    }
                }

                Section {
                    Picker("Счёт", selection: $selectedAccountId) {
                        ForEach(accounts) { a in
                            Text(accountLabel(a)).tag(Int?.some(a.id))
                        }
                    }
                } header: {
                    Text("Счёт списания")
                } footer: {
                    Text("Списание со счёта; на счёт-копилку — будет приход.")
                }
            }
            .navigationTitle("Пополнение")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { onCancel() }
                        .disabled(submitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(submitting ? "Пополнение…" : "Пополнить") {
                        if let acc = selectedAccountId {
                            Task {
                                _ = await onDeposit(amountCents, acc, selectedGoalId)
                            }
                        }
                    }
                    .disabled(!canDeposit)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(submitting)
    }
}
