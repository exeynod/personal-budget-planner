import SwiftUI

struct AppRouter: View {
    @Environment(AuthStore.self) private var authStore
    @AppStorage("ui.theme") private var themeRaw: String = "v10"

    // DS-08: validate value at access time — defends against UserDefaults tampering or
    // schema drift. Falls back to "v10" if anything other than v06 / v10 is stored.
    private var theme: String {
        (themeRaw == "v06" || themeRaw == "v10") ? themeRaw : "v10"
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
                OnboardingView(initialUser: user)
            case .authenticated:
                if theme == "v10" {
                    V10MainShell()
                } else {
                    MainShell()
                }
            }
        }
        .task {
            // Self-heal corrupt UserDefaults entries (overwrite once at launch)
            if themeRaw != "v06" && themeRaw != "v10" {
                themeRaw = "v10"
            }
            await authStore.bootstrap()
        }
    }
}
