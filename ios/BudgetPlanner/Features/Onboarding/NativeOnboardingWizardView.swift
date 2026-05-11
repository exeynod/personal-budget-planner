import SwiftUI

/// Phase 57 (v06 Native Rebuild): 4-step onboarding wizard for the v06 shell.
/// Replaces the legacy single-form `OnboardingView` while it stays in tree.
/// Reuses `OnboardingFlow` (FeaturesV10/Onboarding/OnboardingFlow.swift) as
/// the shared data model — no duplication.
///
/// Navigation: NavigationStack with NavigationPath driven push-based drill-down.
/// We DO NOT use OnboardingFlow.step/.next()/.back() for routing (that counter
/// is V10-internal); instead each step pushes the next via NavigationLink.
struct NativeOnboardingWizardView: View {
    @Environment(AuthStore.self) private var authStore
    let initialUser: UserDTO

    @State private var flow = OnboardingFlow()
    @State private var path = NavigationPath()
    @State private var submitState: SubmitState = .idle

    enum SubmitState: Equatable {
        case idle
        case submitting
        case failed(String)          // 422 / network — retryable
    }

    enum StepRoute: Hashable {
        case accounts                // Step 2
        case plan                    // Step 3
        case goals                   // Step 4
    }

    var body: some View {
        NavigationStack(path: $path) {
            NativeOnboardingStep1IncomeView(
                flow: flow,
                onContinue: { path.append(StepRoute.accounts) }
            )
            .navigationTitle("Шаг 1 из 4 · Доход")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: StepRoute.self) { route in
                switch route {
                case .accounts:
                    NativeOnboardingStep2AccountsView(
                        flow: flow,
                        onContinue: { path.append(StepRoute.plan) }
                    )
                    .navigationTitle("Шаг 2 из 4 · Счета")
                    .navigationBarTitleDisplayMode(.inline)
                case .plan:
                    NativeOnboardingStep3PlanView(
                        flow: flow,
                        onContinue: { path.append(StepRoute.goals) }
                    )
                    .navigationTitle("Шаг 3 из 4 · План")
                    .navigationBarTitleDisplayMode(.inline)
                case .goals:
                    NativeOnboardingStep4GoalsView(
                        flow: flow,
                        submitState: $submitState,
                        onSubmit: { await submit() }
                    )
                    .navigationTitle("Шаг 4 из 4 · Цель")
                    .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    @MainActor
    private func submit() async {
        guard submitState != .submitting else { return }
        submitState = .submitting
        do {
            _ = try await OnboardingV10API.postOnboardingComplete(body: flow.toAPIBody())
            flow.clearDraft()
            await authStore.refreshUser()
            // AppRouter will switch out of .onboardingRequired branch automatically.
        } catch APIError.conflict(_) {
            // Already onboarded server-side — wipe draft and re-fetch user.
            flow.clearDraft()
            await authStore.refreshUser()
        } catch APIError.unprocessable(_) {
            // Fixed Russian copy (T-57-02): never echo raw error string.
            submitState = .failed("Сервер отклонил данные. Проверьте поля и повторите.")
        } catch {
            submitState = .failed("Не удалось завершить настройку. Повторите.")
        }
    }
}
