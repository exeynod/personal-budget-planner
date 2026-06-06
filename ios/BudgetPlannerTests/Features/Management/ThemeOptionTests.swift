// Phase 66 Plan 01 (RED→GREEN), Phase 4 (Liquid Glass restore, 2026-06) — unit
// specs для ThemeOption pure helper (Foundation-only, no SwiftUI runtime).
//
// Phase 4: Liquid Glass restored. Two V10 themes (maximal_poster / liquid_glass)
// + v06 sentinel. Stale persisted "ios_default" raw безопасно резолвится в
// .maximalPoster; "liquid_glass" теперь снова резолвится в .liquidGlass.
//
// Покрывает каждый <behavior> путь:
//   - selected(forRaw:) для maximal_poster / liquid_glass
//   - "v06" → .legacyV06
//   - stale ios_default/неизвестный/пустой raw → .maximalPoster
//   - liquid_glass round-trips to .liquidGlass
//   - rawValue(for:) для всех опций
//   - round-trip option ↔ rawValue по allOptions
//   - allOptions = [.maximalPoster, .liquidGlass, .legacyV06]
//   - Theme.allCases == [.maximalPoster, .liquidGlass]
//   - ruLabel (legacyV06 + паритет с Theme.ruLabel)

import XCTest

@testable import BudgetPlanner

final class ThemeOptionTests: XCTestCase {

    // MARK: - Theme enum (Phase 4 — Liquid Glass restored)

    func testThemeAllCasesAreMaximalPosterAndLiquidGlass() {
        XCTAssertEqual(Theme.allCases, [.maximalPoster, .liquidGlass])
    }

    func testThemeRawValueRoundTripForLiquidGlass() {
        XCTAssertEqual(Theme(rawValue: "liquid_glass"), .liquidGlass)
        XCTAssertEqual(Theme.liquidGlass.rawValue, "liquid_glass")
    }

    // MARK: - selected(forRaw:)

    func testSelectedResolvesMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "maximal_poster"), .maximalPoster)
    }

    func testSelectedResolvesLiquidGlass() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "liquid_glass"), .liquidGlass)
    }

    func testSelectedResolvesLegacyV06() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "v06"), .legacyV06)
    }

    func testSelectedStaleIosDefaultFallsBackToMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "ios_default"), .maximalPoster)
    }

    func testSelectedUnknownRawFallsBackToMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "garbage"), .maximalPoster)
    }

    func testSelectedEmptyRawFallsBackToMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: ""), .maximalPoster)
    }

    // MARK: - Theme.resolve raw safety (Phase 4)

    func testThemeResolveLiquidGlassRaw() {
        XCTAssertEqual(Theme.resolve("liquid_glass"), .liquidGlass)
    }

    func testThemeResolveStaleRawsMapToMaximalPoster() {
        XCTAssertEqual(Theme.resolve("ios_default"), .maximalPoster)
        XCTAssertEqual(Theme.resolve("anything"), .maximalPoster)
    }

    // MARK: - rawValue(for:)

    func testRawValueForMaximalPoster() {
        XCTAssertEqual(ThemeOption.rawValue(for: .maximalPoster), "maximal_poster")
    }

    func testRawValueForLiquidGlass() {
        XCTAssertEqual(ThemeOption.rawValue(for: .liquidGlass), "liquid_glass")
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
            [.maximalPoster, .liquidGlass, .legacyV06]
        )
    }

    // MARK: - ruLabel

    func testRuLabelLegacyV06() {
        XCTAssertEqual(ThemeOption.legacyV06.ruLabel, "СТАРЫЙ IOS")
    }

    func testRuLabelMirrorsThemeForMaximalPoster() {
        XCTAssertEqual(ThemeOption.maximalPoster.ruLabel, Theme.maximalPoster.ruLabel)
    }

    func testRuLabelMirrorsThemeForLiquidGlass() {
        XCTAssertEqual(ThemeOption.liquidGlass.ruLabel, Theme.liquidGlass.ruLabel)
    }
}
