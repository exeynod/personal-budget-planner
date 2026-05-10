// Phase 24-09: Step04GoalView — onboarding step 4 «Зачем копишь?» (optional).
//
// Symmetric to web `<Step04Goal>` (Plan 24-08,
// frontend/src/screensV10/Onboarding/Step04Goal.tsx). Three input blocks
// inside a Mass + Eyebrow header:
//   1. DM Serif italic 22pt name TextField (max 80 chars per server schema).
//   2. Archivo Black 36pt amount field with ₽ suffix (digits-only filter,
//      U+202F group separator on display).
//   3. Optional «Указать дату» Toggle → DatePicker bound to tomorrow…∞.
//
// Skip semantics live in OnboardingChrome (onSkip) / OnboardingV10View — the
// chrome's «ПРОПУСТИТЬ» dispatches `flow.skipGoal()` then `flow.next()`.
// This view itself only emits SET_GOAL via flow.setGoal(_:) on every
// keystroke, and clears via flow.skipGoal() when the user wipes both
// fields (so navigating back from Final and forward without entry doesn't
// smuggle a stale goal — T-24-09-04 logic-flaw mitigation).
//
// Validation here is advisory; OnboardingV10View case 4 owns the
// nextDisabled gate (name non-empty AND target_cents > 0). The server
// (extra="forbid", strict) is the authoritative validator.

import SwiftUI

// MARK: - Helpers

/// ISO yyyy-MM-dd formatter for goal.due. Locale en_US_POSIX +
/// Europe/Moscow timezone keeps the on-wire string aligned with the
/// server's strict-future check (CLAUDE.md: «расчёты Europe/Moscow»).
enum OnboardingDateFormatters {
    static let goalDue: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Tomorrow at 00:00 Moscow (local Date object) — used as the
    /// DatePicker lower bound. Server enforces `> today`; small TZ skew
    /// (Moscow vs device) is benign — server is authoritative.
    static func tomorrow(now: Date = Date()) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return cal.date(byAdding: .day, value: 1, to: now) ?? now.addingTimeInterval(86400)
    }
}

// MARK: - View

struct Step04GoalView: View {
    @Bindable var flow: OnboardingFlow

    @State private var name: String = ""
    @State private var amountText: String = ""
    @State private var dueDate: Date = OnboardingDateFormatters.tomorrow()
    @State private var useDue: Bool = false

    /// Server schema cap on goal name length.
    private let maxNameLength = 80

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Mass("Зачем\nкопишь?", italic: true, size: 32)

            Eyebrow("МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ", opacity: 0.55)

            nameInput
            amountInput
            dueRow
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear { hydrateFromFlow() }
    }

    // MARK: - Inputs

    private var nameInput: some View {
        TextField("", text: $name, prompt: namePlaceholder)
            .font(.custom(PosterTokens.Font.dmSerifItalic, size: 22))
            .foregroundColor(PosterTokens.Color.paper)
            .tint(PosterTokens.Color.paper)
            .submitLabel(.next)
            .autocorrectionDisabled(true)
            .textInputAutocapitalization(.sentences)
            .onChange(of: name) { _, newValue in
                // T-24-09-01: cap to 80 chars + trim trailing on dispatch.
                if newValue.count > maxNameLength {
                    name = String(newValue.prefix(maxNameLength))
                    return  // onChange will fire again with the clipped value
                }
                pushGoalToFlow()
            }
            .padding(.bottom, 6)
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.5)),
                alignment: .bottom
            )
    }

    private var namePlaceholder: Text {
        Text("Цель (Грузия, подушка, ноутбук…)")
            .font(.custom(PosterTokens.Font.dmSerifItalic, size: 22))
            .foregroundColor(PosterTokens.Color.paper.opacity(0.45))
    }

    private var amountInput: some View {
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            TextField("0", text: $amountText)
                .keyboardType(.numberPad)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 36))
                .foregroundColor(PosterTokens.Color.paper)
                .tint(PosterTokens.Color.paper)
                .onChange(of: amountText) { _, newValue in
                    applyAmount(newValue)
                }

            Text("₽")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 24))
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.85)
        }
        .padding(.bottom, 6)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(PosterTokens.Color.paper.opacity(0.5)),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private var dueRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: $useDue) {
                Text("УКАЗАТЬ ДАТУ")
                    .font(
                        .custom(PosterTokens.Font.jetBrainsMono, size: PosterTokens.FontSize.monoSm)
                            .weight(.semibold)
                    )
                    .kerning(PosterTokens.FontSize.monoSm * 0.14)
                    .foregroundColor(PosterTokens.Color.paper)
            }
            .toggleStyle(SwitchToggleStyle(tint: PosterTokens.Color.paper))
            .onChange(of: useDue) { _, _ in pushGoalToFlow() }

            if useDue {
                DatePicker(
                    "ДО КАКОЙ ДАТЫ",
                    selection: $dueDate,
                    in: OnboardingDateFormatters.tomorrow()...,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
                .labelsHidden()
                .tint(PosterTokens.Color.paper)
                .colorScheme(.dark)
                .onChange(of: dueDate) { _, _ in pushGoalToFlow() }
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Pipelines

    /// Restore inputs from flow.goal on first appear so back-navigation
    /// preserves user data.
    private func hydrateFromFlow() {
        guard let g = flow.goal else { return }
        name = g.name
        if g.targetCents > 0 {
            amountText = RubleFormatter.format(cents: g.targetCents)
        }
        if let dueIso = g.due,
           let parsed = OnboardingDateFormatters.goalDue.date(from: dueIso)
        {
            dueDate = parsed
            useDue = true
        }
    }

    /// Sanitise + reformat amount text → push to flow.
    private func applyAmount(_ raw: String) {
        let digits = raw.filter(\.isNumber)
        // Cap at 9 digits (= 999_999_999 ₽) — same ceiling as Step 01.
        let clipped = String(digits.prefix(9))
        let rubles = Int(clipped) ?? 0
        let formatted = clipped.isEmpty ? "" : RubleFormatter.format(cents: rubles * 100)
        if amountText != formatted {
            amountText = formatted
        }
        pushGoalToFlow()
    }

    /// Single dispatch surface — converts current local state into a
    /// flow mutation. Both fields empty → skipGoal() so we don't smuggle
    /// a stale OnboardingGoal forward through Final.
    private func pushGoalToFlow() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = amountText.filter(\.isNumber)
        let cents = (Int(digits) ?? 0) * 100

        if trimmedName.isEmpty && cents == 0 && !useDue {
            // Both name + amount empty AND user hasn't engaged the date toggle:
            // treat as «skip» so nextDisabled gating + Final summary stay
            // consistent with the cleared state.
            if flow.goal != nil {
                flow.skipGoal()
            }
            return
        }

        let dueIso: String? =
            useDue
            ? OnboardingDateFormatters.goalDue.string(from: dueDate)
            : nil
        flow.setGoal(
            OnboardingGoal(name: trimmedName, targetCents: cents, due: dueIso)
        )
    }
}

// MARK: - Preview

#Preview("Step04GoalView · empty") {
    let flow = OnboardingFlow()
    flow.setIncome(80_000_00)
    return OnboardingChrome(
        step: 4,
        label: "ШАГ 04 / 04 · ЦЕЛЬ",
        onBack: { flow.back() },
        onSkip: {
            flow.skipGoal()
            flow.next()
        },
        onNext: { flow.next() },
        nextLabel: "ГОТОВО →",
        nextDisabled: true
    ) {
        Step04GoalView(flow: flow)
    }
}

#Preview("Step04GoalView · prefilled") {
    let flow = OnboardingFlow()
    flow.setIncome(80_000_00)
    flow.setGoal(OnboardingGoal(name: "Подушка", targetCents: 200_000_00, due: nil))
    return OnboardingChrome(
        step: 4,
        label: "ШАГ 04 / 04 · ЦЕЛЬ",
        onBack: { flow.back() },
        onSkip: {
            flow.skipGoal()
            flow.next()
        },
        onNext: { flow.next() },
        nextLabel: "ГОТОВО →",
        nextDisabled: false
    ) {
        Step04GoalView(flow: flow)
    }
}
