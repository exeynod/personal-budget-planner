import SwiftUI

struct AppRouter: View {
    @Environment(AuthStore.self) private var authStore

    // Single native design (Liquid Glass): the Maximal Poster / V10 shell was
    // removed, so the router always mounts the native `MainShell` and the
    // native 4-step onboarding wizard. No runtime theme switch remains.

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
                // Native 4-step wizard. Legacy OnboardingView
                // (`Features/Onboarding/OnboardingView.swift`) remains in tree but
                // is no longer reachable from this router.
                NativeOnboardingWizardView(initialUser: user)
            case .authenticated:
                MainShell()
            }
        }
        .task {
            await authStore.bootstrap()
        }
    }
}
