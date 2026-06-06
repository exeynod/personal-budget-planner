import SwiftUI

struct AppRouter: View {
    @Environment(AuthStore.self) private var authStore
    @AppStorage("ui.theme") private var themeRaw: String = Theme.maximalPoster.rawValue

    // Liquid Glass v2 (2026-06-06): два первоклассных дизайна.
    //   - `liquid_glass` (Theme.liquidGlass) → native-iOS shell (MainShell). Это
    //     и есть «Liquid Glass» — настоящий нативный дизайн, не перекраска постера.
    //   - `maximal_poster` (+ stale "ios_default" и прочий неизвестный raw) →
    //     V10MainShell (постер). Тему резолвит `Theme.resolve(themeRaw)` через
    //     `\.appTheme` в `BudgetPlannerApp`.
    // Legacy `"v06"` (старый ключ нативного шелла) мигрируется в нативный шелл,
    // чтобы у уже-сохранённых пользователей native-дизайн не пропал.
    private var isNativeShell: Bool {
        themeRaw == Theme.liquidGlass.rawValue || themeRaw == ThemeOption.legacyV06Raw
    }

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
                if isNativeShell {
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
                if isNativeShell {
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
