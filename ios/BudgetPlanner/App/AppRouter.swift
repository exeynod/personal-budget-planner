import SwiftUI

struct AppRouter: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        Group {
            switch authStore.state {
            case .bootstrapping:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(AdaptiveBackground())
            case .unauthenticated, .error:
                DevTokenSetupView()
            case .onboardingRequired(let user):
                OnboardingView(initialUser: user)
            case .authenticated:
                MainShell()
            }
        }
        .task {
            await authStore.bootstrap()
        }
    }
}
