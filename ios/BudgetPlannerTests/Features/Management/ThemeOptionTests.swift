// Phase 66 Plan 01 (RED→GREEN) — unit specs для ThemeOption pure helper
// (Foundation-only, no SwiftUI runtime).
//
// Покрывает каждый <behavior> путь:
//   - selected(forRaw:) для всех известных raw
//   - "v06" → .legacyV06
//   - неизвестный/пустой raw → .maximalPoster (mirror Theme.resolve)
//   - rawValue(for:) для всех опций
//   - round-trip option ↔ rawValue по allOptions
//   - allOptions порядок
//   - ruLabel (legacyV06 + паритет с Theme.ruLabel)

import XCTest

@testable import BudgetPlanner

final class ThemeOptionTests: XCTestCase {

    // MARK: - selected(forRaw:)

    func testSelectedResolvesMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "maximal_poster"), .maximalPoster)
    }

    func testSelectedResolvesLiquidGlass() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "liquid_glass"), .liquidGlass)
    }

    func testSelectedResolvesIosDefault() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "ios_default"), .iosDefault)
    }

    func testSelectedResolvesLegacyV06() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "v06"), .legacyV06)
    }

    func testSelectedUnknownRawFallsBackToMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "garbage"), .maximalPoster)
    }

    func testSelectedEmptyRawFallsBackToMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: ""), .maximalPoster)
    }

    // MARK: - rawValue(for:)

    func testRawValueForMaximalPoster() {
        XCTAssertEqual(ThemeOption.rawValue(for: .maximalPoster), "maximal_poster")
    }

    func testRawValueForLiquidGlass() {
        XCTAssertEqual(ThemeOption.rawValue(for: .liquidGlass), "liquid_glass")
    }

    func testRawValueForIosDefault() {
        XCTAssertEqual(ThemeOption.rawValue(for: .iosDefault), "ios_default")
    }

    func testRawValueForLegacyV06() {
        XCTAssertEqual(ThemeOption.rawValue(for: .legacyV06), "v06")
    }

    // MARK: - round-trip

    func testRoundTripForAllOptions() {
        for option in ThemeOption.allOptions {
            let raw = ThemeOption.rawValue(for: option)
            XCTAssertEqual(
                ThemeOption.selected(forRaw: raw),
                option,
                "round-trip failed for \(option) via raw '\(raw)'"
            )
        }
    }

    // MARK: - allOptions order

    func testAllOptionsOrder() {
        XCTAssertEqual(
            ThemeOption.allOptions,
            [.maximalPoster, .liquidGlass, .iosDefault, .legacyV06]
        )
    }

    // MARK: - ruLabel

    func testRuLabelLegacyV06() {
        XCTAssertEqual(ThemeOption.legacyV06.ruLabel, "СТАРЫЙ IOS")
    }

    func testRuLabelMirrorsThemeForV10Options() {
        XCTAssertEqual(ThemeOption.maximalPoster.ruLabel, Theme.maximalPoster.ruLabel)
        XCTAssertEqual(ThemeOption.liquidGlass.ruLabel, Theme.liquidGlass.ruLabel)
        XCTAssertEqual(ThemeOption.iosDefault.ruLabel, Theme.iosDefault.ruLabel)
    }
}
