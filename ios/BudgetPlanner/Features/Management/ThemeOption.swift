// Phase 66 Plan 01 (MGMT-V06-THEME): чистое тестируемое ядро theme picker для
// v06 SettingsView. Foundation-only (НЕ SwiftUI) — резолв/round-trip покрыты
// unit-тестами.
//
// Опции = 3 Theme-кейса (maximal_poster / liquid_glass / ios_default) + sentinel
// `"v06"` (СТАРЫЙ IOS), который не входит в Theme.allCases, но управляет
// AppRouter (themeRaw == "v06" → нативный MainShell, иначе → V10MainShell).
//
// Зеркалит Theme.resolve: неизвестный raw → .maximalPoster.

import Foundation

enum ThemeOption: CaseIterable, Equatable {
    case maximalPoster
    case liquidGlass
    case iosDefault
    case legacyV06

    /// Sentinel rawValue для нативного v06-шелла (вне Theme.allCases).
    static let legacyV06Raw = "v06"

    /// Порядок отображения в picker.
    static var allOptions: [ThemeOption] {
        [.maximalPoster, .liquidGlass, .iosDefault, .legacyV06]
    }

    /// Резолвит сохранённый @AppStorage("ui.theme") raw в опцию.
    /// "v06" → .legacyV06; неизвестный raw → .maximalPoster (mirror Theme.resolve).
    static func selected(forRaw raw: String) -> ThemeOption {
        if raw == legacyV06Raw { return .legacyV06 }
        switch Theme.resolve(raw) {
        case .maximalPoster: return .maximalPoster
        case .liquidGlass: return .liquidGlass
        case .iosDefault: return .iosDefault
        }
    }

    /// rawValue, который пишется в @AppStorage при выборе опции.
    static func rawValue(for option: ThemeOption) -> String {
        switch option {
        case .maximalPoster: return Theme.maximalPoster.rawValue
        case .liquidGlass: return Theme.liquidGlass.rawValue
        case .iosDefault: return Theme.iosDefault.rawValue
        case .legacyV06: return legacyV06Raw
        }
    }

    /// RU-лейбл ряда (паритет с Theme.ruLabel; legacyV06 — «СТАРЫЙ IOS»).
    var ruLabel: String {
        switch self {
        case .maximalPoster: return Theme.maximalPoster.ruLabel
        case .liquidGlass: return Theme.liquidGlass.ruLabel
        case .iosDefault: return Theme.iosDefault.ruLabel
        case .legacyV06: return "СТАРЫЙ IOS"
        }
    }
}
