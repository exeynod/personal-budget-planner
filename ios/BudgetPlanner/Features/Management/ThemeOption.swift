// Phase 66 Plan 01 (MGMT-V06-THEME): чистое тестируемое ядро theme picker для
// v06 SettingsView. Foundation-only (НЕ SwiftUI) — резолв/round-trip покрыты
// unit-тестами.
//
// Phase 4 (UX refactor, 2026-06): Liquid Glass restored.
// Liquid Glass v2 (2026-06-06): «Liquid Glass» теперь = НАСТОЯЩИЙ native-iOS
// дизайн (MainShell), а не CSS-перекраска постера. Picker сведён к 2 опциям:
//   - .maximalPoster (maximal_poster) → V10MainShell (постер).
//   - .liquidGlass   (liquid_glass)   → native MainShell.
// Sentinel `"v06"` (старый ключ нативного шелла) мигрируется в .liquidGlass,
// чтобы у уже-сохранённых пользователей нативный шелл не пропал.
//
// Зеркалит Theme.resolve: неизвестный raw (вкл. stale "ios_default") →
// .maximalPoster.

import Foundation

enum ThemeOption: CaseIterable, Equatable {
    case maximalPoster
    case liquidGlass

    /// Legacy sentinel rawValue прежнего нативного шелла. Больше не пишется,
    /// но при чтении мигрируется в .liquidGlass (native MainShell).
    static let legacyV06Raw = "v06"

    /// Порядок отображения в picker.
    static var allOptions: [ThemeOption] {
        [.maximalPoster, .liquidGlass]
    }

    /// Резолвит сохранённый @AppStorage("ui.theme") raw в опцию.
    /// "v06" → .liquidGlass (миграция старого нативного шелла);
    /// неизвестный raw → .maximalPoster (mirror Theme.resolve).
    static func selected(forRaw raw: String) -> ThemeOption {
        if raw == legacyV06Raw { return .liquidGlass }
        switch Theme.resolve(raw) {
        case .maximalPoster: return .maximalPoster
        case .liquidGlass: return .liquidGlass
        }
    }

    /// rawValue, который пишется в @AppStorage при выборе опции.
    static func rawValue(for option: ThemeOption) -> String {
        switch option {
        case .maximalPoster: return Theme.maximalPoster.rawValue
        case .liquidGlass: return Theme.liquidGlass.rawValue
        }
    }

    /// RU-лейбл ряда (паритет с Theme.ruLabel).
    var ruLabel: String {
        switch self {
        case .maximalPoster: return Theme.maximalPoster.ruLabel
        case .liquidGlass: return Theme.liquidGlass.ruLabel
        }
    }
}
