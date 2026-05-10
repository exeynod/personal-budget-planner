// Phase 24-09: FinalView — onboarding step 5 «ВСЁ. деньги — под контролем.»
//
// Owns:
//   - Hero block: Eyebrow «VOL.04 · ГОТОВО», Mass «ВСЁ.» (Archivo Black 88pt),
//     Mass italic «деньги — под контролем.» (DM Serif italic 28pt routed
//     through `Mass(italic:)` per ADR-001).
//   - Summary plate: 4 rows separated by 1pt dividers — ДОХОД / СЧЕТА /
//     ПЛАН / ЦЕЛЬ.
//   - «НАЧАТЬ →» CTA → POST /api/v1/onboarding/complete via
//     OnboardingV10API.postOnboardingComplete.
//
// Status routing (mirror of web Final.tsx, plan 24-08):
//   - 200 → flow.clearDraft() then onComplete(response)
//   - 409 → flow.clearDraft() BEFORE delayed onComplete(nil)
//     (T-24-09-04: never observe stale draft mid-transition)
//   - 422 → errorMessage set; draft preserved; onComplete NOT called
//   - network/other → generic russian errorMessage
//
// Threat coverage:
//   - T-24-09-02 (replay): `submitting` flag + `Bool` guard inside
//     OnboardingSubmitter.start coalesce concurrent taps.
//   - T-24-09-03 (info disclosure): error copy is fixed russian, never
//     echoes APIError.errorDescription / err.localizedDescription.
//   - T-24-09-04 (logic flaw): 409 calls clearDraft() BEFORE onComplete.
//
// Submit logic is extracted into `OnboardingSubmitter` so tests can
// inject a fake `submit` closure (deterministic 200/409/422/network
// branches without URLSession). FinalView constructs the submitter with
// the live `OnboardingV10API.postOnboardingComplete` by default.

import Observation
import SwiftUI

// MARK: - Submitter (testable, injectable)

/// Owns the submit lifecycle: replay guard, error copy, draft clearing.
/// Pure logic — no SwiftUI dependencies.
@MainActor
@Observable
final class OnboardingSubmitter {
    let flow: OnboardingFlow
    let submit: (OnboardingAPIBody) async throws -> OnboardingAPIResponse
    /// Delay before onComplete(nil) on 409 path. Mirrors web 1500 ms toast
    /// dwell; tests pass 0 to skip the pause.
    let conflictDelay: UInt64

    private(set) var submitting: Bool = false
    var errorMessage: String? = nil

    init(
        flow: OnboardingFlow,
        submit: @escaping (OnboardingAPIBody) async throws -> OnboardingAPIResponse =
            OnboardingV10API.postOnboardingComplete(body:),
        conflictDelay: UInt64 = 1_500_000_000
    ) {
        self.flow = flow
        self.submit = submit
        self.conflictDelay = conflictDelay
    }

    /// Run a single submit pass. Replay guard: concurrent calls return
    /// immediately if a submission is already in flight (T-24-09-02).
    func start(onComplete: @escaping (OnboardingAPIResponse?) -> Void) async {
        if submitting { return }
        submitting = true
        errorMessage = nil
        defer { submitting = false }

        let body = flow.toAPIBody()
        do {
            let response = try await submit(body)
            flow.clearDraft()
            onComplete(response)
        } catch let error as APIError {
            switch error {
            case .conflict:
                // T-24-09-04: clear BEFORE onComplete so a re-render
                // between the two callbacks never observes a stale draft.
                flow.clearDraft()
                errorMessage = "вы уже завершили онбординг"
                if conflictDelay > 0 {
                    try? await Task.sleep(nanoseconds: conflictDelay)
                }
                onComplete(nil)
            case .unprocessable:
                // T-24-09-03: fixed copy, never echoes server detail string.
                errorMessage = "Проверьте план: сумма не может превышать доход"
            default:
                errorMessage = "Ошибка сети, попробуйте ещё раз"
            }
        } catch {
            errorMessage = "Ошибка сети, попробуйте ещё раз"
        }
    }
}

// MARK: - View

struct FinalView: View {
    @Bindable var flow: OnboardingFlow
    /// Called on 200 (with response) and 409 (with nil after toast dwell).
    /// 422 / network errors keep the user on Final; onComplete is NOT called.
    var onComplete: (OnboardingAPIResponse?) -> Void

    @State private var submitter: OnboardingSubmitter?
    @State private var toastVisible: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
                .padding(.top, PosterTokens.Space.s56)

            summaryPlate
                .padding(.top, PosterTokens.Space.s40)

            Spacer(minLength: PosterTokens.Space.s24)

            ctaButton
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.bottom, PosterTokens.Space.s28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(PosterTokens.Color.coral.ignoresSafeArea())
        .overlay(alignment: .top) {
            if let msg = submitter?.errorMessage, toastVisible {
                Toast(message: msg, visible: $toastVisible, duration: 4.0)
            }
        }
        .onAppear {
            if submitter == nil {
                submitter = OnboardingSubmitter(flow: flow)
            }
        }
        .onChange(of: submitter?.errorMessage) { _, new in
            // Show toast whenever errorMessage transitions to non-nil.
            if new != nil { toastVisible = true }
        }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow("VOL.04 · ГОТОВО", opacity: 0.65)
            Mass("ВСЁ.", italic: false, size: 88)
            // U+00A0 nbsp between «под» and «контролем» so the line
            // never breaks awkwardly mid-clause.
            Mass("деньги — под\u{00A0}контролем.", italic: true, size: 28)
        }
    }

    // MARK: - Summary plate

    private var summaryPlate: some View {
        VStack(alignment: .leading, spacing: 0) {
            summaryRow(
                label: "ДОХОД",
                value: "\(RubleFormatter.format(cents: flow.incomeCents)) ₽ / мес"
            )
            divider
            summaryRow(
                label: "СЧЕТА",
                value:
                    "\(flow.accounts.count) · \(RubleFormatter.format(cents: flow.accounts.reduce(0) { $0 + $1.balanceCents })) ₽"
            )
            divider
            summaryRow(
                label: "ПЛАН",
                value:
                    "\(RubleFormatter.format(cents: flow.categoryPlans.values.reduce(0, +))) ₽ распределено"
            )
            divider
            summaryRow(
                label: "ЦЕЛЬ",
                value: goalLabel
            )
        }
    }

    private var goalLabel: String {
        if let g = flow.goal, !g.name.isEmpty {
            return "\(g.name) · \(RubleFormatter.format(cents: g.targetCents)) ₽"
        }
        return "без цели"
    }

    private func summaryRow(label: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Eyebrow(label, opacity: 0.6)
                .frame(width: 64, alignment: .leading)
            Text(value)
                .font(.custom(PosterTokens.Font.jetBrainsMono, size: 13))
                .foregroundColor(PosterTokens.Color.paper)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Rectangle()
            .fill(PosterTokens.Color.paper.opacity(0.25))
            .frame(height: 1)
    }

    // MARK: - CTA

    private var ctaButton: some View {
        let busy = submitter?.submitting ?? false
        return Button(action: { onStartTap() }) {
            Text("НАЧАТЬ →")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                .kerning(13 * 0.18)
                .foregroundColor(PosterTokens.Color.coral)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(PosterTokens.Color.paper)
                .opacity(busy ? 0.55 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func onStartTap() {
        guard let submitter else { return }
        Task { await submitter.start(onComplete: onComplete) }
    }
}

// MARK: - Preview

#Preview("FinalView · with goal") {
    let flow = OnboardingFlow()
    flow.setIncome(80_000_00)
    flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
    flow.addAccount(bank: "СБЕР", kind: .card, balanceCents: 1_200_000)
    flow.setGoal(OnboardingGoal(name: "Грузия", targetCents: 500_000_00, due: nil))
    return FinalView(flow: flow, onComplete: { _ in })
}

#Preview("FinalView · skip goal") {
    let flow = OnboardingFlow()
    flow.setIncome(80_000_00)
    flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
    return FinalView(flow: flow, onComplete: { _ in })
}
