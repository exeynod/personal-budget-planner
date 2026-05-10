// Phase 24-03 / 24-05 / 24-07 / 24-09: OnboardingV10View — root SwiftUI
// view that switches on `flow.step` and renders the correct step body
// inside OnboardingChrome (or, for step 5, the FinalView which owns its
// own scaffold).
//
// Symmetric to web `<OnboardingFlow>` root (Plan 24-02). Steps wired:
//   - Step 01 (Income, Plan 24-03)
//   - Step 02 (Accounts, Plan 24-05)
//   - Step 03 (Plan,    Plan 24-07)
//   - Step 04 (Goal,    Plan 24-09)
//   - Step 05 (Final,   Plan 24-09)
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
    /// Called by FinalView on 200 (response) or 409 (nil after toast). 422
    /// / network errors keep the user on Final; onComplete is NOT called.
    var onComplete: (OnboardingAPIResponse?) -> Void

    var body: some View {
        Group {
            switch flow.step {
            case 1:
                step01
            case 2:
                step02
            case 3:
                step03
            case 4:
                step04
            case 5:
                FinalView(flow: flow, onComplete: onComplete)
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

    // MARK: - Step 02 (Accounts)

    private var step02: some View {
        OnboardingChrome(
            step: 2,
            label: "ШАГ 02 / 04 · СЧЕТА",
            onBack: { flow.back() },
            onSkip: nil,
            onNext: { flow.next() },
            nextDisabled: flow.accounts.isEmpty,
            hint: step02Hint
        ) {
            Step02AccountsView(flow: flow)
        }
    }

    /// Hint string for step 02 — pluralised count + total balance, or
    /// the empty-state nudge.
    private var step02Hint: String {
        if flow.accounts.isEmpty {
            return "нужен минимум один счёт"
        }
        let total = flow.accounts.reduce(0) { $0 + $1.balanceCents }
        return "\(flow.accounts.count) \(PluralRu.accounts(flow.accounts.count)) · \(RubleFormatter.format(cents: total)) ₽"
    }

    // MARK: - Step 03 (Plan)

    private var step03: some View {
        let total = flow.categoryPlans.values.reduce(0, +)
        let left = flow.incomeCents - total
        let hint: String
        if left == 0 {
            hint = "всё распределено"
        } else if left > 0 {
            hint = "остаётся \(RubleFormatter.format(cents: left)) ₽ → накопления"
        } else {
            hint = "превышение \(RubleFormatter.format(cents: -left)) ₽"
        }
        let tone: HintTone = left < 0 ? .overflow : .normal

        return OnboardingChrome(
            step: 3,
            label: "ШАГ 03 / 04 · ПЛАН",
            onBack: { flow.back() },
            onSkip: nil,
            onNext: { flow.next() },
            nextDisabled: left < 0,
            hint: hint,
            hintTone: tone
        ) {
            Step03PlanView(flow: flow)
        }
    }

    // MARK: - Step 04 (Goal, optional + skip)

    private var step04: some View {
        // nextDisabled mirror of Step04GoalTests `isValid` predicate:
        // name non-empty (post-trim) AND target_cents > 0.
        let trimmed =
            flow.goal?.name.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        let cents = flow.goal?.targetCents ?? 0
        let isValid = !trimmed.isEmpty && cents > 0

        return OnboardingChrome(
            step: 4,
            label: "ШАГ 04 / 04 · ЦЕЛЬ",
            onBack: { flow.back() },
            onSkip: {
                // T-24-09-04: clear before next() so Final never sees a
                // half-typed goal after the user opted out.
                flow.skipGoal()
                flow.next()
            },
            onNext: { flow.next() },
            nextLabel: "ГОТОВО →",
            nextDisabled: !isValid
        ) {
            Step04GoalView(flow: flow)
        }
    }
}

// MARK: - Preview

#Preview("OnboardingV10View step 1") {
    let flow = OnboardingFlow()
    return OnboardingV10View(flow: flow, onComplete: { _ in })
}
