// Phase 71 (PLAN-1): XCTest specs for PosterSlider.readout — the money readout
// label on the PLAN МЕСЯЦА category-limit sliders.
//
// Regression guard for PLAN-1: the slider used to print the raw BIGINT-cents
// integer (e.g. "3 000 000") instead of converting cents→rubles and appending
// «₽». With `isCents: true` it must render rubles via RubleFormatter
// (cents→rubles, U+202F NARROW NO-BREAK SPACE grouping) + " ₽".
//
// Non-money sliders (`isCents: false`, e.g. onboarding cycle-day) must keep the
// plain grouped integer with NO ₽ sign.

import XCTest

@testable import BudgetPlanner

final class PosterSliderReadoutTests: XCTestCase {
    /// U+202F NARROW NO-BREAK SPACE — the grouping separator RubleFormatter uses.
    private let nbsp = "\u{202F}"

    // MARK: - Money mode (isCents: true) — PLAN-1 core fix

    func test_centsReadout_convertsToRublesAndAppendsRubleSign() {
        // ПРОДУКТЫ: 3_000_000 cents = 30 000 ₽ (was rendered "3 000 000").
        XCTAssertEqual(PosterSlider.readout(3_000_000, isCents: true), "30\(nbsp)000 ₽")
    }

    func test_centsReadout_kafe() {
        // КАФЕ: 1_200_000 cents = 12 000 ₽.
        XCTAssertEqual(PosterSlider.readout(1_200_000, isCents: true), "12\(nbsp)000 ₽")
    }

    func test_centsReadout_dom() {
        // ДОМ: 1_500_000 cents = 15 000 ₽.
        XCTAssertEqual(PosterSlider.readout(1_500_000, isCents: true), "15\(nbsp)000 ₽")
    }

    func test_centsReadout_zero() {
        XCTAssertEqual(PosterSlider.readout(0, isCents: true), "0 ₽")
    }

    func test_centsReadout_subRuble_truncatesToZero() {
        // Below 1₽ truncates to 0 (matches RubleFormatter).
        XCTAssertEqual(PosterSlider.readout(99, isCents: true), "0 ₽")
    }

    func test_centsReadout_hasNoRawKopeckString() {
        // The defining symptom of PLAN-1: raw kopecks must NOT appear.
        let out = PosterSlider.readout(3_000_000, isCents: true)
        XCTAssertFalse(out.contains("3\(nbsp)000\(nbsp)000"))
        XCTAssertFalse(out.contains("3000000"))
        XCTAssertTrue(out.contains("₽"))
    }

    // MARK: - Plain mode (isCents: false) — must stay unchanged / no ₽

    func test_plainReadout_keepsIntegerNoRubleSign() {
        XCTAssertFalse(PosterSlider.readout(15, isCents: false).contains("₽"))
        XCTAssertTrue(PosterSlider.readout(15, isCents: false).contains("15"))
    }
}
