// Phase 66 Plan 01 (RED→GREEN), Phase 71 (theme cull) — unit specs для
// ThemeOption pure helper (Foundation-only, no SwiftUI runtime).
//
// Phase 71: ровно 2 опции — maximal_poster + v06 sentinel. Stale persisted
// "liquid_glass"/"ios_default" raw'ы безопасно резолвятся в .maximalPoster.
//
// Покрывает каждый <behavior> путь:
//   - selected(forRaw:) для maximal_poster
//   - "v06" → .legacyV06
//   - stale liquid_glass/ios_default/неизвестный/пустой raw → .maximalPoster
//   - rawValue(for:) для обеих опций
//   - round-trip option ↔ rawValue по allOptions
//   - allOptions = [.maximalPoster, .legacyV06]
//   - Theme.allCases == [.maximalPoster]
//   - ruLabel (legacyV06 + паритет с Theme.ruLabel)

import XCTest

@testable import BudgetPlanner

final class ThemeOptionTests: XCTestCase {

    // MARK: - Theme enum (Phase 71)

    func testThemeAllCasesIsMaximalPosterOnly() {
        XCTAssertEqual(Theme.allCases, [.maximalPoster])
    }

    // MARK: - selected(forRaw:)

    func testSelectedResolvesMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "maximal_poster"), .maximalPoster)
    }

    func testSelectedResolvesLegacyV06() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "v06"), .legacyV06)
    }

    func testSelectedStaleLiquidGlassFallsBackToMaximalPoster() {
        XCTAssertEqual(ThemeOption.selected(forRaw: "liquid_glass"), .maximalPoster)
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

    // MARK: - Theme.resolve stale raw safety (Phase 71)

    func testThemeResolveStaleRawsMapToMaximalPoster() {
        XCTAssertEqual(Theme.resolve("liquid_glass"), .maximalPoster)
        XCTAssertEqual(Theme.resolve("ios_default"), .maximalPoster)
        XCTAssertEqual(Theme.resolve("anything"), .maximalPoster)
    }

    // MARK: - rawValue(for:)

    func testRawValueForMaximalPoster() {
        XCTAssertEqual(ThemeOption.rawValue(for: .maximalPoster), "maximal_poster")
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
            [.maximalPoster, .legacyV06]
        )
    }

    // MARK: - ruLabel

    func testRuLabelLegacyV06() {
        XCTAssertEqual(ThemeOption.legacyV06.ruLabel, "СТАРЫЙ IOS")
    }

    func testRuLabelMirrorsThemeForMaximalPoster() {
        XCTAssertEqual(ThemeOption.maximalPoster.ruLabel, Theme.maximalPoster.ruLabel)
    }
}
