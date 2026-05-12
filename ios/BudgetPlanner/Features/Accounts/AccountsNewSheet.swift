import SwiftUI

/// Phase 60 (v06 Native Rebuild): native Form sheet для создания счёта.
///
/// **Symbol & filename collision avoidance**: FeaturesV10/Accounts/ уже
/// содержит файл с тем же простым именем и type с тем же простым именем в
/// том же модуле BudgetPlanner. Swift не разрешает два type с одинаковым
/// именем в одном модуле, а Xcode/Swift compiler ругается на дублирующиеся
/// filenames в одном target ("Filename used twice"). Поэтому v06 native
/// sheet называется `AccountsNewSheet` И живёт в файле
/// `AccountsNewSheet.swift` (filename и struct оба отличаются от V10).
///
/// **Composition (Plan 60-03)**:
///   - NavigationStack (self-contained — sheet рендерится отдельно от
///     родительского NavigationStack ManagementView).
///   - Form с 5 секциями:
///     - «Банк» → TextField, .words capitalization, autocorrectionDisabled.
///     - «Тип» → Picker(.segmented) с 3 опциями (Карта / Наличные / Сбережения).
///     - «Последние 4 цифры» (conditional, kind == .card) → TextField,
///       .numberPad, keystroke filter digits-only + prefix(4) (T-60-02).
///     - «Текущий баланс» → TextField .decimalPad с MoneyParser.parseToCents
///       (локаль ru_RU, поддержка запятой и пробела).
///     - «Основной счёт» → Toggle с conditional footer text.
///   - Toolbar: «Отмена» (.cancellationAction) + «Создать» (.confirmationAction,
///     disabled до `AccountsNewSheetValidation.canCreate`; во время submitting
///     label «Создание…»).
///   - sheet detents: medium + large.
///   - interactiveDismissDisabled(submitting) — нельзя swipe-down во время submit.
///
/// **Validation** вынесена в pure helper `AccountsNewSheetValidation` ниже —
/// тестируется отдельно через `@testable import` без SwiftUI runtime.
///
/// **Error handling**: на failure createAccount возвращает false; sheet
/// dismisses (управляется AccountsViewModel.createAccount). Inline banner
/// шоуится в AccountsView outside sheet — НЕ внутри sheet (CONTEXT D-4
/// «failure: inline banner» интерпретируется как «в context list, не alert»).
struct AccountsNewSheet: View {
    let submitting: Bool
    let onCreate: (_ bank: String, _ kind: AccountKind, _ mask: String?, _ balanceCents: Int, _ primary: Bool) async -> Bool
    let onCancel: () -> Void

    @State private var bank: String = ""
    @State private var kind: AccountKind = .card
    @State private var mask: String = ""
    @State private var balanceText: String = ""
    @State private var primary: Bool = false

    // MARK: - Derived

    /// Empty balance → 0 (валидно: «нулевой баланс — открыл счёт, уточню
    /// позже»). Не-числовой ввод → 0 fallback (MoneyParser возвращает nil).
    private var balanceCents: Int {
        guard !balanceText.trimmingCharacters(in: .whitespaces).isEmpty else { return 0 }
        return MoneyParser.parseToCents(balanceText) ?? 0
    }

    private var trimmedBank: String {
        bank.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canCreate: Bool {
        AccountsNewSheetValidation.canCreate(
            bank: bank,
            kind: kind,
            mask: mask,
            balanceCents: balanceCents,
            submitting: submitting
        )
    }

    private var normalisedMask: String? {
        AccountsNewSheetValidation.normaliseMask(mask, kind: kind)
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                Section("Банк") {
                    TextField("Например, Т-Банк", text: $bank)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.words)
                }

                Section("Тип") {
                    Picker("Тип", selection: $kind) {
                        Text("Карта").tag(AccountKind.card)
                        Text("Наличные").tag(AccountKind.cash)
                        Text("Сбережения").tag(AccountKind.savings)
                    }
                    .pickerStyle(.segmented)
                }

                if kind == .card {
                    Section("Последние 4 цифры") {
                        TextField("0000", text: Binding(
                            get: { mask },
                            set: { newVal in
                                // T-60-02: digits-only + truncate prefix(4).
                                let digits = newVal.filter(\.isNumber)
                                mask = String(digits.prefix(4))
                            }
                        ))
                        .keyboardType(.numberPad)
                        .monospacedDigit()
                    }
                }

                Section("Текущий баланс") {
                    HStack {
                        TextField("0", text: $balanceText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                        Text("₽").foregroundStyle(.secondary)
                    }
                }

                Section {
                    Toggle(isOn: $primary) {
                        Text("Основной счёт")
                    }
                } footer: {
                    if primary {
                        Text("Снимет статус «основной» с другого счёта.")
                    }
                }
            }
            .navigationTitle("Новый счёт")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { onCancel() }
                        .disabled(submitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(submitting ? "Создание…" : "Создать") {
                        Task {
                            _ = await onCreate(
                                trimmedBank,
                                kind,
                                normalisedMask,
                                balanceCents,
                                primary
                            )
                            // Sheet dismissal управляется AccountsViewModel
                            // .createAccount (sheet = .none on success AND
                            // failure). Banner на failure живёт в AccountsView.
                        }
                    }
                    .disabled(!canCreate)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(submitting)
    }
}

// MARK: - Validation (pure helper — testable без SwiftUI runtime)

/// Pure validation logic для AccountsNewSheet — extracted чтобы unit tests
/// могли проверять matrix (empty bank / card mask / ignore mask /
/// negative balance / submitting) без живого SwiftUI view.
///
/// Threat-model:
///   - T-60-02: `canCreate` ENFORCES `mask.count == 4 && mask.allSatisfy(\.isNumber)`
///     при kind == .card. UI layer дополнительно truncate'ит keystroke до 4
///     цифр (defence-in-depth).
enum AccountsNewSheetValidation {
    /// Returns true если форма валидна и можно submit.
    /// - `bank.trimmed.count >= 1`
    /// - if `kind == .card`: `mask` matches `^\d{4}$`
    /// - `balanceCents >= 0`
    /// - `!submitting`
    static func canCreate(
        bank: String,
        kind: AccountKind,
        mask: String,
        balanceCents: Int,
        submitting: Bool
    ) -> Bool {
        guard !submitting else { return false }
        let trimmed = bank.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        if kind == .card {
            guard mask.count == 4, mask.allSatisfy(\.isNumber) else { return false }
        }
        guard balanceCents >= 0 else { return false }
        return true
    }

    /// Normalises mask для wire-payload: возвращает значение только для
    /// `.card` kind с непустым raw. Для `.cash` / `.savings` всегда `nil`
    /// (даже если raw непустой — UI hides mask field, но защита на helper-
    /// уровне обязательна для consistency).
    static func normaliseMask(_ raw: String, kind: AccountKind) -> String? {
        (kind == .card && !raw.isEmpty) ? raw : nil
    }
}
