import SwiftUI

/// Phase 57 (v06 Native Rebuild): Step 3 — plan allocation.
///
/// Iterates `DefaultCategories.all` (8 fixed categories) and renders a
/// row per category with `LabeledContent` + a `Stepper` in 500-ruble
/// steps (50_000 cents — `DefaultCategories.planStepCents`). On change
/// the row writes back via `flow.setPlan(code:cents:)`.
///
/// Pre-fill: `OnboardingFlow.setIncome` auto-populates `categoryPlans`
/// from `DefaultCategories.defaultPlan(fromIncomeCents:)` when empty —
/// so Step 3 opens with sensible defaults.
///
/// Σplan > income is allowed (server is authoritative; per CONTEXT the
/// v06 path stays permissive — no hard gate). The footer shows the live
/// distribution counter so the user can self-correct.
struct NativeOnboardingStep3PlanView: View {
    @Bindable var flow: OnboardingFlow
    let onContinue: () -> Void

    private var totalAllocatedCents: Int {
        flow.categoryPlans.values.reduce(0, +)
    }

    private var remainingCents: Int {
        flow.incomeCents - totalAllocatedCents
    }

    var body: some View {
        Form {
            Section {
                ForEach(DefaultCategories.all, id: \.code) { cat in
                    planRow(for: cat)
                }
            } footer: {
                planFooter
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button("Дальше") {
                onContinue()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    @ViewBuilder
    private func planRow(for cat: DefaultCategory) -> some View {
        // Rubles binding — derived from cents stored in flow. Step size = 500₽.
        let rubles = Binding<Int>(
            get: { (flow.categoryPlans[cat.code] ?? 0) / 100 },
            set: { newRub in
                flow.setPlan(code: cat.code, cents: max(0, newRub) * 100)
            }
        )
        let step = DefaultCategories.planStepCents / 100  // 500
        Stepper(value: rubles, in: 0...1_000_000, step: step) {
            LabeledContent(cat.name) {
                Text(MoneyFormatter.formatWithSymbol(cents: (flow.categoryPlans[cat.code] ?? 0)))
                    .monospacedDigit()
            }
        }
    }

    @ViewBuilder
    private var planFooter: some View {
        let income = flow.incomeCents
        let allocated = totalAllocatedCents
        let remaining = remainingCents
        VStack(alignment: .leading, spacing: 2) {
            Text("Распределено: \(MoneyFormatter.formatWithSymbol(cents: allocated)) из \(MoneyFormatter.formatWithSymbol(cents: income))")
            if remaining >= 0 {
                Text("Остаток: \(MoneyFormatter.formatWithSymbol(cents: remaining))")
                    .foregroundStyle(.secondary)
            } else {
                Text("Превышение: \(MoneyFormatter.formatWithSymbol(cents: -remaining))")
                    .foregroundStyle(.orange)
            }
        }
    }
}
