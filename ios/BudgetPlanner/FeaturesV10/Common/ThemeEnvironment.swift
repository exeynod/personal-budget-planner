// Phase 50-02 (THEME-04): SwiftUI Environment binding for the runtime theme.
//
// Hosts a `@Environment(\.appTheme) var theme: Theme` value so child views
// can branch on the active theme without prop-drilling through the entire
// V10 view tree. The root `BudgetPlannerApp` reads `@AppStorage("ui.theme")`
// — mirroring the web localStorage key — and injects the resolved `Theme`
// enum into the environment for every descendant.
//
// `Theme` itself is declared in `PosterTokens.swift` (codegen-output of
// Phase 50-01). This file only adds the EnvironmentKey + EnvironmentValues
// extension so PosterTokens.swift stays purely token-generated.

import SwiftUI

private struct AppThemeKey: EnvironmentKey {
    static let defaultValue: Theme = .maximalPoster
}

extension EnvironmentValues {
    var appTheme: Theme {
        get { self[AppThemeKey.self] }
        set { self[AppThemeKey.self] = newValue }
    }
}
