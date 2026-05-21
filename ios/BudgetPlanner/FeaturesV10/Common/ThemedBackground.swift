// ThemedBackground.swift — Phase 53 (LG-IOS-01..04), Phase 71 (theme cull).
//
// Theme-aware background wrapper. After Phase 71 the only V10 theme is
// Maximal Poster, so this simply paints the supplied solid `maximal` color.
// The wrapper is retained (rather than inlining `maximal`) so call sites stay
// stable and a future theme can reintroduce per-theme substitution here.
//
// Usage:
//   .background(ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea())
// or as a content child:
//   ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea()

import SwiftUI

/// Theme-aware background surface.
///
/// - `maximal`: the solid `PosterTokens.Color.*` painted under the
///              `.maximalPoster` theme — the only V10 theme post Phase 71.
struct ThemedBackground: View {
    let maximal: Color

    @Environment(\.appTheme) private var theme

    var body: some View {
        switch theme {
        case .maximalPoster:
            maximal
        }
    }
}

#if DEBUG
#Preview("ThemedBackground · maximal coral") {
    ThemedBackground(maximal: PosterTokens.Color.coral)
        .ignoresSafeArea()
        .environment(\.appTheme, .maximalPoster)
}
#endif
