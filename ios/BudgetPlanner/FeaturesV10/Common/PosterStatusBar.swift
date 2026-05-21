// PosterStatusBar.swift — Phase 71 P3-STATUSBAR.
//
// The V10 shell (`V10MainShell`) forces `.preferredColorScheme(.dark)` so the
// system status-bar time / icons render as LIGHT content — correct on the dark
// MP screens (Home, Копилка, Доступ, …). On the cream / light MP screens
// (Настройки, Аналитика, AI, Счета) that same light content sits on a light
// background and becomes barely legible.
//
// The V10 shell uses a custom `PosterRouter` (no `NavigationStack` / toolbar),
// so `.toolbarColorScheme(_:for: .statusBar)` is a no-op. The reliable lever is
// a screen-scoped `.preferredColorScheme(.light)`, which the SwiftUI runtime
// resolves to a DARK status-bar style. Because every MP screen paints with
// explicit `PosterTokens.Color.*` hex values (never semantic system colors),
// flipping the environment color scheme does not alter the screen's visuals —
// only the status-bar content contrast.
//
// Apply `.posterLightStatusBar()` on the root `ZStack` of each light/cream MP
// screen. Dark screens require no modifier (they inherit the shell's `.dark`).

import SwiftUI

extension View {
    /// Forces DARK status-bar content (legible on light / cream MP screens).
    ///
    /// Overrides the shell-level `.preferredColorScheme(.dark)` for this screen
    /// only. Use on cream / paper MP screens; omit on dark screens.
    func posterLightStatusBar() -> some View {
        preferredColorScheme(.light)
    }
}
