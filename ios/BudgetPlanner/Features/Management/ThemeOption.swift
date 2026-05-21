// Phase 66 Plan 01 (MGMT-V06-THEME): чистое тестируемое ядро theme picker для
// v06 SettingsView. Foundation-only (НЕ SwiftUI) — резолв/round-trip покрыты
// unit-тестами.
//
// Phase 71 (owner request): сведено к 2 опциям — единственный Theme-кейс
// maximal_poster (MAXIMAL POSTER) + sentinel `"v06"` (СТАРЫЙ IOS), который не
// входит в Theme.allCases, но управляет AppRouter (themeRaw == "v06" →
// нативный MainShell, иначе → V10MainShell / Maximal Poster).
//
// Зеркалит Theme.resolve: неизвестный raw (вкл. stale "liquid_glass"/
// "ios_default") → .maximalPoster.

import Foundation

enum ThemeOption: CaseIterable, Equatable {
    case maximalPoster
    case legacyV06

    /// Sentinel rawValue для нативного v06-шелла (вне Theme.allCases).
    static let legacyV06Raw = "v06"

    /// Порядок отображения в picker.
    static var allOptions: [ThemeOption] {
        [.maximalPoster, .legacyV06]
    }

    /// Резолвит сохранённый @AppStorage("ui.theme") raw в опцию.
    /// "v06" → .legacyV06; любой другой raw → .maximalPoster (mirror Theme.resolve).
    static func selected(forRaw raw: String) -> ThemeOption {
        if raw == legacyV06Raw { return .legacyV06 }
        switch Theme.resolve(raw) {
        case .maximalPoster: return .maximalPoster
        }
    }

    /// rawValue, который пишется в @AppStorage при выборе опции.
    static func rawValue(for option: ThemeOption) -> String {
        switch option {
        case .maximalPoster: return Theme.maximalPoster.rawValue
        case .legacyV06: return legacyV06Raw
        }
    }

    /// RU-лейбл ряда (паритет с Theme.ruLabel; legacyV06 — «СТАРЫЙ IOS»).
    var ruLabel: String {
        switch self {
        case .maximalPoster: return Theme.maximalPoster.ruLabel
        case .legacyV06: return "СТАРЫЙ IOS"
        }
    }
}
