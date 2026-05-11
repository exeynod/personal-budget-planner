import SwiftUI

@main
struct BudgetPlannerApp: App {
    @State private var authStore = AuthStore()

    // Phase 50-02 (THEME-04): runtime theme persisted via @AppStorage so the
    // value survives app relaunches. Key mirrors the web `localStorage` key
    // `ui.theme` (see `frontend/src/screensV10/common/useTheme.ts`) so a
    // shared backend setting could synchronise both platforms in the future.
    @AppStorage("ui.theme") private var themeRaw: String = Theme.maximalPoster.rawValue

    var body: some Scene {
        WindowGroup {
            AppRouter()
                .environment(authStore)
                .environment(\.appTheme, Theme.resolve(themeRaw))
                .tint(Tokens.Accent.primary)
        }
    }
}
