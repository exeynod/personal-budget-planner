import SwiftUI

/// Phase 57 (v06 Native Rebuild): Step 1 — monthly income input.
///
/// Native Form layout, single TextField with .decimalPad. Money entry is
/// parsed via `MoneyParser.parseToCents` (integer cents only — no float math).
/// Continue button is disabled until `flow.incomeCents > 0`. Bottom button
/// rendered via `.safeAreaInset(edge: .bottom)` so it floats above the
/// keyboard like the legacy OnboardingView.
struct NativeOnboardingStep1IncomeView: View {
    @Bindable var flow: OnboardingFlow
    let onContinue: () -> Void

    @State private var amountText: String = ""

    var body: some View {
        Form {
            Section {
                HStack {
                    Text("Доход за месяц")
                    Spacer()
                    TextField("0", text: $amountText)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .frame(maxWidth: 160)
                        .onChange(of: amountText) { _, newValue in
                            if let cents = MoneyParser.parseToCents(newValue) {
                                flow.setIncome(cents)
                            } else if newValue.trimmingCharacters(in: .whitespaces).isEmpty {
                                flow.setIncome(0)
                            }
                        }
                    Text("₽").foregroundStyle(.secondary)
                }
            } footer: {
                Text("Это поможет рассчитать ваш план — план по категориям заполнится автоматически на следующих шагах.")
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button("Дальше") {
                onContinue()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(flow.incomeCents <= 0)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .onAppear {
            // Restore from draft if user came back to this step or relaunched app.
            if amountText.isEmpty, flow.incomeCents > 0 {
                amountText = MoneyFormatter.format(cents: flow.incomeCents)
            }
        }
    }
}
