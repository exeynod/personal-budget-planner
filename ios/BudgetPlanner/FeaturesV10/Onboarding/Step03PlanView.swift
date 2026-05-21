// Phase 24-07: Step03PlanView — onboarding step 3 «Распредели X ₽».
//
// Symmetric to web `<Step03Plan>` (Plan 24-06,
// frontend/src/screensV10/Onboarding/Step03Plan.tsx). Three blocks +
// 8 slider rows:
//   1. Mass italic 32pt headline «Распредели\n{income} ₽»
//   2. Eyebrow «СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ»
//   3. ScrollView with 8 PosterSlider rows — one per DefaultCategories.all
//
// Each row renders:
//   - ord (JetBrains Mono 11pt, opacity 0.5)
//   - name UPPERCASE (Archivo Black 13pt, kerning 0.04em)
//   - current value «X ₽» right-aligned (JetBrains Mono 13pt)
//   - PosterSlider 0...sliderMax with step=50_000 cents (= 500 ₽)
//   - 1pt divider with paper @ 0.22 opacity
//
// Slider max = max(6_000_000, income * 0.6) — preserves headroom for
// users dragging a single category past their stated income.
//
// Hint + tone + nextDisabled live in OnboardingV10View (case 3) — this
// view is purely presentational and binds to flow.categoryPlans via
// closures.

import SwiftUI

struct Step03PlanView: View {
    @Bindable var flow: OnboardingFlow

    /// Σplan in cents — used by parent for hint/disabled gating.
    var sumPlan: Int { flow.categoryPlans.values.reduce(0, +) }

    /// Slider upper bound: never below 60_000 ₽ (=6_000_000 cents) so a
    /// low-income user can still overshoot a single category if they
    /// want to. Otherwise scales to 60% of income.
    var sliderMax: Int { max(6_000_000, Int(Double(flow.incomeCents) * 0.6)) }

    /// Defensive read: if categoryPlans was wiped by a back-edit on
    /// Step 01 (rare), fall back to the same floor formula the reducer
    /// applies on SET_INCOME so the slider doesn't snap to 0.
    func current(_ code: String) -> Int {
        flow.categoryPlans[code] ?? defaultFor(code)
    }

    /// Mirror of DefaultCategories.defaultPlan(fromIncomeCents:) for a
    /// single code — used only when categoryPlans[code] is nil.
    func defaultFor(_ code: String) -> Int {
        guard let cat = DefaultCategories.all.first(where: { $0.code == code }) else { return 0 }
        let raw = Double(flow.incomeCents) * cat.share
        let ticks = Int((raw / Double(DefaultCategories.planStepCents)).rounded(.down))
        return ticks * DefaultCategories.planStepCents
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Mass(
                    "Распредели\n\(RubleFormatter.format(cents: flow.incomeCents)) ₽",
                    italic: true,
                    size: 32
                )

                Eyebrow("СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ", opacity: 0.55)

                ForEach(DefaultCategories.all, id: \.code) { cat in
                    categoryRow(cat: cat)
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.22))
                        .frame(height: 1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Row

    private func categoryRow(cat: DefaultCategory) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(cat.ord)
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.5)
                Text(cat.name)
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.04)
                    .foregroundColor(PosterTokens.Color.paper)
                Spacer(minLength: 0)
            }

            // P3-B: render the value ONCE via the slider's own rubles+₽ readout
            // (valueIsCents: true) — matches the corrected PlanView editor. The
            // former external rubles label above was redundant and sat alongside
            // the slider's then-raw-kopeck readout (double display). Bound value
            // stays in cents, so saved plans are unchanged.
            PosterSlider(
                value: Binding(
                    get: { current(cat.code) },
                    set: { flow.setPlan(code: cat.code, cents: $0) }
                ),
                in: 0...sliderMax,
                step: DefaultCategories.planStepCents,
                label: nil,
                valueIsCents: true
            )
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Preview

#Preview("Step03PlanView · 80k ₽") {
    let flow = OnboardingFlow()
    flow.setIncome(80_000_00)  // seeds default allocation
    return OnboardingChrome(
        step: 3,
        label: "ШАГ 03 / 04 · ПЛАН",
        onBack: { flow.back() },
        onNext: { flow.next() },
        nextDisabled: false,
        hint: "остаётся 14\u{202F}000 ₽ → накопления",
        hintTone: .normal
    ) {
        Step03PlanView(flow: flow)
    }
}

#Preview("Step03PlanView · overflow") {
    let flow = OnboardingFlow()
    flow.setIncome(80_000_00)
    flow.setPlan(code: "food", cents: 100_000_00)  // single-category overflow
    return OnboardingChrome(
        step: 3,
        label: "ШАГ 03 / 04 · ПЛАН",
        onBack: { flow.back() },
        onNext: { flow.next() },
        nextDisabled: true,
        hint: "превышение 22\u{000A0}000 ₽",
        hintTone: .overflow
    ) {
        Step03PlanView(flow: flow)
    }
}
