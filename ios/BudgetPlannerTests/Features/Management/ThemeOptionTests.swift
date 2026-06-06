// Phase 66 Plan 01 (RED→GREEN), Phase 4 (Liquid Glass restore, 2026-06) — unit
// specs для ThemeOption pure helper (Foundation-only, no SwiftUI runtime).
//
// Phase 4: Liquid Glass restored. Two V10 themes (maximal_poster / liquid_glass)
// + v06 sentinel. Stale persisted "ios_default" raw безопасно резолвится в
// .maximalPoster; "liquid_glass" теперь снова резолвится в .liquidGlass.
//
// Liquid Glass v2 (2026-06-06): «Liquid Glass» = native MainShell. Picker = 2
// опции; sentinel "v06" мигрируется в .liquidGlass.
//
// Покрывает каждый <behavior> путь:
//   - selected(forRaw:) для maximal_poster / liquid_glass
//   - "v06" → .liquidGlass (миграция старого нативного шелла)
//   - stale ios_default/неизвестный/пустой raw → .maximalPoster
//   - liquid_glass round-trips to .liquidGlass
//   - rawValue(for:) для всех опций
//   - round-trip option ↔ rawValue по allOptions
//   - allOptions = [.maximalPoster, .liquidGlass]
//   - Theme.allCases == [.maximalPoster, .liquidGlass]
//   - ruLabel паритет с Theme.ruLabel

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

    func testSelectedMigratesLegacyV06ToLiquidGlass() {
        // Liquid Glass v2: "v06" — старый ключ нативного шелла, теперь это и есть
        // Liquid Glass (native MainShell), поэтому мигрируется в .liquidGlass.
        XCTAssertEqual(ThemeOption.selected(forRaw: "v06"), .liquidGlass)
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

    func testLegacyV06RawConstantPreserved() {
        // Sentinel-строка сохранена для миграции, но больше не пишется в storage.
        XCTAssertEqual(ThemeOption.legacyV06Raw, "v06")
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
            [.maximalPoster, .liquidGlass]
        )
    }

    // MARK: - ruLabel

    func testRuLabelMirrorsThemeForMaximalPoster() {
        XCTAssertEqual(ThemeOption.maximalPoster.ruLabel, Theme.maximalPoster.ruLabel)
    }

    func testRuLabelMirrorsThemeForLiquidGlass() {
        XCTAssertEqual(ThemeOption.liquidGlass.ruLabel, Theme.liquidGlass.ruLabel)
    }
}
