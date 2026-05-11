import SwiftUI

/// Phase 57 (v06 Native Rebuild): Step 2 — accounts editor.
///
/// Lists existing accounts (with primary chip + setPrimary star + trash
/// button). Quick presets (Т-Банк / Сбер / Наличные) add an account with
/// `balanceCents: 0` immediately; "Свой банк" opens a sheet with full
/// bank-name / kind / balance fields. Continue disabled until at least
/// one account exists.
struct NativeOnboardingStep2AccountsView: View {
    @Bindable var flow: OnboardingFlow
    let onContinue: () -> Void

    @State private var showingAddSheet = false

    private struct Preset {
        let bank: String
        let kind: OnboardingAccountKind
    }

    private let presets: [Preset] = [
        Preset(bank: "Т-Банк", kind: .card),
        Preset(bank: "Сбер", kind: .card),
        Preset(bank: "Наличные", kind: .cash),
    ]

    var body: some View {
        Form {
            if !flow.accounts.isEmpty {
                Section("Ваши счета") {
                    ForEach(Array(flow.accounts.enumerated()), id: \.offset) { idx, acct in
                        accountRow(index: idx, account: acct)
                    }
                }
            }

            Section("Добавить счёт") {
                ForEach(presets, id: \.bank) { preset in
                    Button {
                        flow.addAccount(
                            bank: preset.bank,
                            kind: preset.kind,
                            balanceCents: 0
                        )
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: iconName(for: preset.kind))
                                .foregroundStyle(.secondary)
                                .frame(width: 28)
                            Text(preset.bank)
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "plus.circle")
                                .foregroundStyle(.tint)
                        }
                    }
                }

                Button {
                    showingAddSheet = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "plus.app")
                            .foregroundStyle(.secondary)
                            .frame(width: 28)
                        Text("Свой банк")
                            .foregroundStyle(.primary)
                        Spacer()
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button("Дальше") {
                onContinue()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(flow.accounts.isEmpty)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .sheet(isPresented: $showingAddSheet) {
            AddAccountSheet { bank, kind, cents in
                flow.addAccount(bank: bank, kind: kind, balanceCents: cents)
                showingAddSheet = false
            } onCancel: {
                showingAddSheet = false
            }
        }
    }

    @ViewBuilder
    private func accountRow(index: Int, account: OnboardingAccount) -> some View {
        HStack(spacing: 12) {
            Image(systemName: iconName(for: account.kind))
                .foregroundStyle(.secondary)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(account.bank)
                        .font(.body)
                    if account.primary {
                        Text("· основной")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(MoneyFormatter.formatWithSymbol(cents: account.balanceCents))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                flow.setPrimary(at: index)
            } label: {
                Image(systemName: account.primary ? "star.fill" : "star")
                    .foregroundStyle(account.primary ? .yellow : .secondary)
            }
            .buttonStyle(.borderless)
            .disabled(account.primary)

            Button(role: .destructive) {
                flow.removeAccount(at: index)
            } label: {
                Image(systemName: "trash")
                    .foregroundStyle(.red)
            }
            .buttonStyle(.borderless)
        }
    }

    private func iconName(for kind: OnboardingAccountKind) -> String {
        switch kind {
        case .card: return "creditcard"
        case .cash: return "banknote"
        case .savings: return "lock.shield"
        }
    }
}

// MARK: - Add account sheet (private)

private struct AddAccountSheet: View {
    let onConfirm: (String, OnboardingAccountKind, Int) -> Void
    let onCancel: () -> Void

    @State private var bank: String = ""
    @State private var kind: OnboardingAccountKind = .card
    @State private var balanceText: String = ""

    private var canConfirm: Bool {
        !bank.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Банк") {
                    TextField("Название банка", text: $bank)
                        .autocorrectionDisabled()
                }
                Section("Тип") {
                    Picker("Тип", selection: $kind) {
                        Text("Карта").tag(OnboardingAccountKind.card)
                        Text("Нал.").tag(OnboardingAccountKind.cash)
                        Text("Накоп.").tag(OnboardingAccountKind.savings)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Баланс") {
                    HStack {
                        TextField("0", text: $balanceText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                        Text("₽").foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Свой банк")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { onCancel() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Добавить") {
                        let cents = MoneyParser.parseToCents(balanceText) ?? 0
                        onConfirm(bank.trimmingCharacters(in: .whitespaces), kind, cents)
                    }
                    .disabled(!canConfirm)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
