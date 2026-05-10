// Phase 24-05: AccountBalanceSheet — content view for the bottom-sheet
// invoked from Step02AccountsView when the user taps a chip
// (Т-Банк / Сбер / Наличные / + Добавить).
//
// Symmetric to web `<AccountBalanceForm>` from Plan 24-04
// (frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx). Wire payload
// is identical: `{ bank, kind, balance_cents }` (mask: nil for now —
// onboarding draft never asks for card mask digits).
//
// Hosted inside the existing `PosterSheet` modifier (Phase 23) so we get
// drag-to-close + backdrop tap-to-dismiss + paper bg + bottom anchor for
// free. This view only owns the form layout.
//
// Bank-name handling:
//   - When `editable` is true (the «+ Добавить» path), the bank field is
//     a TextField; bank name is trimmed + uppercased + sliced to 40 chars
//     before being persisted (T-24-05-01 free-text mitigation).
//   - When `editable` is false (predefined chip path), the bank label is
//     displayed read-only — user can't change Т-Банк / Сбер / Наличные.
//
// Balance-cents handling: digits-only filter on every change (mirrors
// Step01IncomeView.apply), 9-digit cap (≤ 999_999_999 ₽), formatted via
// RubleFormatter for consistent U+202F separators.

import SwiftUI

struct AccountBalanceSheet: View {
    // MARK: - Inputs

    let initialBank: String
    let initialKind: OnboardingAccountKind
    let editable: Bool
    let onSave: (OnboardingAccount) -> Void
    let onCancel: () -> Void

    // MARK: - Local state

    @State private var bank: String
    @State private var balance: String

    /// Server bank-name length cap (HLD §3.3 / OnboardingV10Body).
    private let maxBankChars = 40
    /// 999_999_999 ₽ — same cap as Step01IncomeView for input parity.
    private let maxDigits = 9

    init(
        initialBank: String,
        initialKind: OnboardingAccountKind,
        editable: Bool,
        onSave: @escaping (OnboardingAccount) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.initialBank = initialBank
        self.initialKind = initialKind
        self.editable = editable
        self.onSave = onSave
        self.onCancel = onCancel
        self._bank = State(initialValue: initialBank)
        self._balance = State(initialValue: "")
    }

    // MARK: - Derived

    private var trimmedBank: String {
        bank.trimmingCharacters(in: .whitespaces)
    }

    private var canSave: Bool {
        !trimmedBank.isEmpty
    }

    /// Parse the digits-only `balance` text → cents.
    private var balanceCents: Int {
        let digits = balance.filter(\.isNumber).prefix(maxDigits)
        let rubles = Int(String(digits)) ?? 0
        return rubles * 100
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Eyebrow("НОВЫЙ СЧЁТ", opacity: 0.6, color: PosterTokens.Color.ink)

            bankRow

            balanceRow

            buttonsRow
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PosterTokens.Color.paper)
    }

    // MARK: - Bank row (TextField OR static label)

    @ViewBuilder
    private var bankRow: some View {
        if editable {
            TextField("Название (Т-Банк, наличные…)", text: $bank)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled(true)
                .font(.custom(PosterTokens.Font.ptSerifItalic, size: 22))
                .foregroundColor(PosterTokens.Color.ink)
                .tint(PosterTokens.Color.coral)
                .padding(.bottom, 6)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.4)),
                    alignment: .bottom
                )
                .onChange(of: bank) { _, newValue in
                    // T-24-05-01: cap visual length so the field can't accept
                    // more than the server allows. Trimming + final slice
                    // happens at save time.
                    if newValue.count > maxBankChars {
                        bank = String(newValue.prefix(maxBankChars))
                    }
                }
        } else {
            Text(initialBank)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 18))
                .kerning(18 * 0.04)
                .foregroundColor(PosterTokens.Color.ink)
        }
    }

    // MARK: - Balance row (digits-only TextField + ₽ suffix)

    private var balanceRow: some View {
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            TextField("0", text: $balance)
                .keyboardType(.numberPad)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 36))
                .foregroundColor(PosterTokens.Color.ink)
                .tint(PosterTokens.Color.coral)
                .onChange(of: balance) { _, newValue in
                    apply(newValue)
                }

            Text("₽")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 18))
                .foregroundColor(PosterTokens.Color.ink)
                .opacity(0.85)
        }
        .padding(.bottom, 6)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(PosterTokens.Color.ink.opacity(0.4)),
            alignment: .bottom
        )
    }

    // MARK: - Buttons row (ОТМЕНА · ДОБАВИТЬ)

    private var buttonsRow: some View {
        HStack(spacing: 10) {
            cancelButton
            saveButton
        }
        .padding(.top, 6)
    }

    private var cancelButton: some View {
        Button(action: onCancel) {
            Text("ОТМЕНА")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                .kerning(11 * 0.16)
                .foregroundColor(PosterTokens.Color.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .overlay(
                    Rectangle()
                        .stroke(PosterTokens.Color.ink.opacity(0.45),
                                lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private var saveButton: some View {
        Button(action: handleSave) {
            Text("ДОБАВИТЬ")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                .kerning(11 * 0.16)
                .foregroundColor(PosterTokens.Color.paper)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(PosterTokens.Color.coral)
                .opacity(canSave ? 1.0 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!canSave)
    }

    // MARK: - Pipeline

    /// Sanitise raw balance input — digits-only filter + 9-digit cap +
    /// re-format display to use U+202F group separators.
    func apply(_ raw: String) {
        var digits = raw.filter(\.isNumber)
        if digits.count > maxDigits {
            digits = String(digits.prefix(maxDigits))
        }
        let rubles = Int(digits) ?? 0
        let cents = rubles * 100
        let formatted = digits.isEmpty ? "" : RubleFormatter.format(cents: cents)
        if balance != formatted {
            balance = formatted
        }
    }

    private func handleSave() {
        guard canSave else { return }
        // T-24-05-01: trim + uppercase + slice to 40 before persist.
        let normalised = String(trimmedBank.uppercased().prefix(maxBankChars))
        // OnboardingFlow.addAccount auto-promotes the first account to
        // primary — so the `primary: false` we attach here is overridden
        // when the parent flow appends. Caller decides via flow.addAccount.
        let acc = OnboardingAccount(
            bank: normalised,
            mask: nil,
            kind: initialKind,
            balanceCents: balanceCents,
            primary: false,
        )
        onSave(acc)
    }
}

// MARK: - Preview

#Preview("AccountBalanceSheet — predefined") {
    AccountBalanceSheet(
        initialBank: "Т-Банк",
        initialKind: .card,
        editable: false,
        onSave: { _ in },
        onCancel: { }
    )
    .background(PosterTokens.Color.paper)
}

#Preview("AccountBalanceSheet — free text") {
    AccountBalanceSheet(
        initialBank: "",
        initialKind: .card,
        editable: true,
        onSave: { _ in },
        onCancel: { }
    )
    .background(PosterTokens.Color.paper)
}
