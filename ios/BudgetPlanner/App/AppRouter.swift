import SwiftUI

struct AppRouter: View {
    @Environment(AuthStore.self) private var authStore
    @AppStorage("ui.theme") private var themeRaw: String = Theme.maximalPoster.rawValue

    // Phase 56 (v06 Native Rebuild — Foundation): один-единственный special-case.
    // `"v06"` → native-iOS shell (MainShell). Любое другое значение (включая
    // три V10 темы: maximal_poster / liquid_glass / ios_default) → V10MainShell;
    // конкретную V10-тему дальше резолвит `Theme.resolve(themeRaw)` через
    // `\.appTheme` environment в `BudgetPlannerApp`.
    private var isLegacyV06Shell: Bool { themeRaw == "v06" }

    var body: some View {
        Group {
            switch authStore.state {
            case .bootstrapping:
                ZStack {
                    Color(.systemGroupedBackground).ignoresSafeArea()
                    ProgressView().controlSize(.large)
                }
            case .unauthenticated, .error:
                DevTokenSetupView()
            case .onboardingRequired(let user):
                if isLegacyV06Shell {
                    // Phase 57 (v06 Native Rebuild): native 4-step wizard for the
                    // v06 shell. Legacy OnboardingView (`Features/Onboarding/OnboardingView.swift`)
                    // remains in tree but is no longer reachable from this router.
                    NativeOnboardingWizardView(initialUser: user)
                } else {
                    // V10 path: existing onboarding mount (legacy view here while
                    // V10MainShell owns its own routing). Untouched in Phase 57.
                    OnboardingView(initialUser: user)
                }
            case .authenticated:
                if isLegacyV06Shell {
                    MainShell()
                } else {
                    V10MainShell()
                }
            }
        }
        .task {
            await authStore.bootstrap()
        }
    }
}
