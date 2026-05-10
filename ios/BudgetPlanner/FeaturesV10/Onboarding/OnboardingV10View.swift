// Phase 24-03: OnboardingV10View — root SwiftUI view that switches on
// `flow.step` and renders the correct step body inside OnboardingChrome.
//
// Symmetric to web `<OnboardingFlow>` root (Plan 24-02). For Phase 24-03
// only Step 01 (Income) is wired in. Steps 02..05 render placeholder
// chrome that subsequent plans (24-05/07/09/10) replace with real bodies.
//
// NOTE on naming: the plan frontmatter listed file `OnboardingView.swift`
// + type `OnboardingView`, but the v0.5 legacy onboarding ships the same
// filename + type at `Features/Onboarding/OnboardingView.swift` in the
// same target — Swift errors out with "filename used twice". Both file
// and type renamed to `OnboardingV10View` to coexist; the legacy v0.5
// type stays untouched until Phase 24-11 wires the new flow into
// AppRouter. (Deviation: Rule 3 blocking issue auto-fixed.)
//
// Wiring into V10MainShell (auto-mount when GET /me returns income_cents
// null + accounts empty) lands in plan 24-11.

import SwiftUI

struct OnboardingV10View: View {
    @Bindable var flow: OnboardingFlow
    var onComplete: (OnboardingAPIResponse) -> Void

    var body: some View {
        Group {
            switch flow.step {
            case 1:
                step01
            case 2:
                placeholder(
                    step: 2,
                    label: "ШАГ 02 / 04 · СЧЕТА",
                    body: "Step 02 — coming next plan"
                )
            case 3:
                placeholder(
                    step: 3,
                    label: "ШАГ 03 / 04 · ПЛАН",
                    body: "Step 03 — coming next plan"
                )
            case 4:
                placeholder(
                    step: 4,
                    label: "ШАГ 04 / 04 · ЦЕЛЬ",
                    body: "Step 04 — coming next plan"
                )
            case 5:
                placeholder(
                    step: 5,
                    label: "VOL.04 · ГОТОВО",
                    body: "Final — coming next plan",
                    onNext: nil  // Final hides chrome CTA; own «НАЧАТЬ →» lands in 24-09.
                )
            default:
                EmptyView()
            }
        }
    }

    // MARK: - Step 01 (Income)

    private var step01: some View {
        OnboardingChrome(
            step: 1,
            label: "ШАГ 01 / 04 · ДОХОД",
            onBack: nil,                                    // back disabled on first step
            onSkip: nil,
            onNext: { flow.next() },
            nextDisabled: flow.incomeCents <= 0
        ) {
            Step01IncomeView(flow: flow)
        }
    }

    // MARK: - Placeholders for steps 02..05

    @ViewBuilder
    private func placeholder(
        step: Int,
        label: String,
        body: String,
        onNext: (() -> Void)? = nil
    ) -> some View {
        let backHandler: (() -> Void)? = step > 1 ? { flow.back() } : nil
        let nextHandler: (() -> Void)? = onNext ?? (step < OnboardingFlow.maxStep ? { flow.next() } : nil)

        OnboardingChrome(
            step: step,
            label: label,
            onBack: backHandler,
            onNext: nextHandler
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Mass(body, italic: true, size: 28)
                Eyebrow("ЗАГЛУШКА — РЕАЛИЗАЦИЯ В СЛЕДУЮЩЕМ ПЛАНЕ", opacity: 0.55)
            }
        }
    }
}

// MARK: - Preview

#Preview("OnboardingV10View step 1") {
    let flow = OnboardingFlow()
    return OnboardingV10View(flow: flow, onComplete: { _ in })
}
