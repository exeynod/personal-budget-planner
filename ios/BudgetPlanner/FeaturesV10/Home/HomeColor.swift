// Phase 30-07 (DEBT-08): Home screen background color preference enum.
//
// Symmetric to web `frontend/src/screensV10/Home/useHomeColor.ts`:
//   - 4 values: coral (default) / cobalt / black / cream
//   - Persisted by HomeV10View + SettingsV10View via
//     `@AppStorage("ui.home-color")` (same storage key as web localStorage).
//   - Russian labels match web `homeColorLabel` (КОРАЛ / КОБАЛЬТ / ЧЁРНЫЙ / КРЕМ).
//
// User-request 2026-05-11.

import SwiftUI

enum HomeColor: String, CaseIterable, Identifiable {
    case coral
    case cobalt
    case black
    case cream

    var id: String { rawValue }

    /// Map to the corresponding PosterTokens color.
    var swiftColor: Color {
        switch self {
        case .coral:  return PosterTokens.Color.coral
        case .cobalt: return PosterTokens.Color.cobalt
        case .black:  return PosterTokens.Color.black
        case .cream:  return PosterTokens.Color.cream
        }
    }

    /// Russian label rendered in picker swatches + Settings row preview.
    var ruLabel: String {
        switch self {
        case .coral:  return "КОРАЛ"
        case .cobalt: return "КОБАЛЬТ"
        case .black:  return "ЧЁРНЫЙ"
        case .cream:  return "КРЕМ"
        }
    }

    /// Whitelist-resolve a raw `@AppStorage` string back into a value.
    /// Unknown / corrupted values fall back to `.coral` (matches web default).
    static func resolve(_ raw: String) -> HomeColor {
        HomeColor(rawValue: raw) ?? .coral
    }
}
