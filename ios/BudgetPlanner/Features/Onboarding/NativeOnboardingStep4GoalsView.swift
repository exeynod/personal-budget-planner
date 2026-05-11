import SwiftUI

/// Phase 57 (v06 Native Rebuild): Step 4 — optional goal + optional roundup
/// savings, plus the final submit button.
///
/// On goal toggle ON: calls `flow.setGoal(...)`; on toggle OFF: calls
/// `flow.skipGoal()`. On savings toggle ON: calls `flow.setSavingsConfig(...)`.
/// On submit: invokes the injected `onSubmit` async closure (wizard owns the
/// network call + state machine).
///
/// Submit error rendering: never echoes raw `error.localizedDescription`
/// (T-57-02 — uses the fixed Russian copy emitted by the wizard).
struct NativeOnboardingStep4GoalsView: View {
    @Bindable var flow: OnboardingFlow
    @Binding var submitState: NativeOnboardingWizardView.SubmitState
    let onSubmit: () async -> Void

    // Goal local state
    @State private var useGoal: Bool = false
    @State private var goalName: String = ""
    @State private var goalAmountText: String = ""
    @State private var useDue: Bool = false
    @State private var dueDate: Date = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)

    // Roundup savings local state
    @State private var roundupOn: Bool = false
    @State private var roundupBase: Int = 50

    private static let isoDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var minDueDate: Date {
        Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
    }

    private var isSubmitting: Bool {
        submitState == .submitting
    }

    private var submitLabel: String {
        isSubmitting ? "Сохранение…" : "Готово"
    }

    private var failureMessage: String? {
        if case .failed(let msg) = submitState { return msg }
        return nil
    }

    var body: some View {
        Form {
            // MARK: Goal
            Section {
                Toggle("Поставить цель", isOn: $useGoal)
                    .onChange(of: useGoal) { _, newOn in
                        if newOn {
                            applyGoal()
                        } else {
                            flow.skipGoal()
                        }
                    }

                if useGoal {
                    TextField("Например, отпуск", text: $goalName)
                        .autocorrectionDisabled()
                        .onChange(of: goalName) { _, _ in applyGoal() }

                    HStack {
                        Text("Сумма")
                        Spacer()
                        TextField("0", text: $goalAmountText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                            .frame(maxWidth: 140)
                            .onChange(of: goalAmountText) { _, _ in applyGoal() }
                        Text("₽").foregroundStyle(.secondary)
                    }

                    Toggle("Указать дату", isOn: $useDue)
                        .onChange(of: useDue) { _, _ in applyGoal() }

                    if useDue {
                        DatePicker(
                            "Дата",
                            selection: $dueDate,
                            in: minDueDate...,
                            displayedComponents: .date
                        )
                        .onChange(of: dueDate) { _, _ in applyGoal() }
                    }
                }
            } header: {
                Text("Цель")
            } footer: {
                Text("Необязательно. Можно добавить позже.")
            }

            // MARK: Savings (roundup)
            Section {
                Toggle("Включить копилку с округлением", isOn: $roundupOn)
                    .onChange(of: roundupOn) { _, _ in applySavings() }

                if roundupOn {
                    Picker("База округления", selection: $roundupBase) {
                        Text("10 ₽").tag(10)
                        Text("50 ₽").tag(50)
                        Text("100 ₽").tag(100)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: roundupBase) { _, _ in applySavings() }
                }
            } header: {
                Text("Копилка")
            } footer: {
                Text("Каждая трата будет округляться вверх; разница уйдёт в копилку.")
            }

            // MARK: Failure surface
            if let msg = failureMessage {
                Section {
                    Label(msg, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button(submitLabel) {
                Task { await onSubmit() }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isSubmitting)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .onAppear { hydrateFromFlow() }
    }

    // MARK: - Helpers

    private func hydrateFromFlow() {
        if let goal = flow.goal {
            useGoal = true
            goalName = goal.name
            goalAmountText = goal.targetCents > 0
                ? MoneyFormatter.format(cents: goal.targetCents)
                : ""
            if let dueStr = goal.due,
               let parsed = Self.isoDateFormatter.date(from: dueStr) {
                useDue = true
                dueDate = parsed
            }
        }
        if let savings = flow.savingsConfig {
            roundupOn = savings.roundupEnabled
            if [10, 50, 100].contains(savings.base) {
                roundupBase = savings.base
            }
        }
    }

    private func applyGoal() {
        guard useGoal else { return }
        let trimmedName = goalName.trimmingCharacters(in: .whitespaces)
        let cents = MoneyParser.parseToCents(goalAmountText) ?? 0
        let due: String? = useDue ? Self.isoDateFormatter.string(from: dueDate) : nil
        flow.setGoal(OnboardingGoal(name: trimmedName, targetCents: cents, due: due))
    }

    private func applySavings() {
        flow.setSavingsConfig(
            OnboardingSavingsConfig(roundupEnabled: roundupOn, base: roundupBase)
        )
    }
}
