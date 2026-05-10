// Phase 24-03: Step01IncomeView — onboarding step 1 «Какой доход в месяц?».
//
// Symmetric to web `<Step01Income>` (Plan 24-02). Three blocks:
//   1. Mass italic 36pt headline «Какой доход\nв месяц?»
//   2. Eyebrow «ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ»
//   3. TextField with digits-only keyboard + ₽ suffix, underline rule.
//   4. Preset chips 50/80/120/200K ₽ — tap fills the field.
//
// Validation:
//   - Digits-only filter on every change (T-24-03-01: guard against paste).
//   - Slice to 9 chars before parsing (T-24-03-02: max 999_999_999 ₽).
//   - flow.setIncome(_:) clamps negatives to 0 — handled by OnboardingFlow.
//
// Persistence is handled by OnboardingFlow.persist() inside setIncome —
// this view does not touch UserDefaults directly.

import SwiftUI

struct Step01IncomeView: View {
    @Bindable var flow: OnboardingFlow
    @State private var rawText: String = ""

    /// Preset rouble amounts (in whole rubles, multiplied by 100 → cents).
    private let presetsRub: [Int] = [50_000, 80_000, 120_000, 200_000]

    /// Maximum digits accepted in the field (corresponds to 999_999_999 ₽).
    private let maxDigits = 9

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Mass("Какой доход\nв месяц?", italic: true, size: 36)

            Eyebrow("ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ", opacity: 0.55)

            inputRow

            presetsRow
        }
        .onAppear {
            // Restore display from persisted draft.
            rawText = flow.incomeCents > 0
                ? RubleFormatter.format(cents: flow.incomeCents)
                : ""
        }
    }

    // MARK: - Input row (number + ₽ suffix + underline)

    private var inputRow: some View {
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            TextField("0", text: $rawText)
                .keyboardType(.numberPad)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 48))
                .foregroundColor(PosterTokens.Color.paper)
                .tint(PosterTokens.Color.paper)
                .onChange(of: rawText) { _, newValue in
                    apply(newValue)
                }

            Text("₽")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 32))
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
        .padding(.top, 6)
    }

    // MARK: - Presets row

    private var presetsRow: some View {
        HStack(spacing: 8) {
            ForEach(presetsRub, id: \.self) { preset in
                presetChip(preset)
            }
            Spacer(minLength: 0)
        }
    }

    private func presetChip(_ presetRub: Int) -> some View {
        let cents = presetRub * 100
        let active = flow.incomeCents == cents
        return Button(action: {
            flow.setIncome(cents)
            rawText = RubleFormatter.format(cents: cents)
        }) {
            Text(RubleFormatter.format(cents: cents))
                .font(.custom(PosterTokens.Font.jetBrainsMono, size: PosterTokens.FontSize.monoSm)
                    .weight(.semibold))
                .kerning(PosterTokens.FontSize.monoSm * 0.06)
                .foregroundColor(active ? PosterTokens.Color.coral : PosterTokens.Color.paper)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(active ? PosterTokens.Color.paper : Color.clear)
                .overlay(
                    Rectangle().stroke(PosterTokens.Color.paper.opacity(0.4), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Input pipeline (testable as pure function)

    /// Sanitise raw input → push to flow + reformat display.
    /// Made internal-`fileprivate(set)` API for unit tests via simulated calls.
    func apply(_ raw: String) {
        // T-24-03-01: filter to digits only (defends against paste of separators).
        var digits = raw.filter(\.isNumber)
        // T-24-03-02: cap length to maxDigits to keep value < Int.max on all targets.
        if digits.count > maxDigits {
            digits = String(digits.prefix(maxDigits))
        }
        let rubles = Int(digits) ?? 0
        let cents = rubles * 100
        flow.setIncome(cents)
        let formatted = digits.isEmpty ? "" : RubleFormatter.format(cents: cents)
        // Avoid recursive onChange when the formatted string already matches raw.
        if rawText != formatted {
            rawText = formatted
        }
    }
}

// MARK: - Preview

#Preview("Step01IncomeView") {
    let flow = OnboardingFlow()
    return OnboardingChrome(
        step: 1,
        label: "ШАГ 01 / 04 · ДОХОД",
        onBack: nil,
        onNext: { flow.next() },
        nextDisabled: flow.incomeCents <= 0,
        hint: "введи примерную сумму после налогов"
    ) {
        Step01IncomeView(flow: flow)
    }
}
