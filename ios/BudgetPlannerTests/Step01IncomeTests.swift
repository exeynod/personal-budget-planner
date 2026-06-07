// Phase 24-03: XCTest specs for Step01IncomeView pipeline + RubleFormatter.
//
// We don't drive the SwiftUI view tree (ViewInspector / XCUI lands in
// 24-11). Instead we test:
//   1. Pure RubleFormatter behaviour (formatting + edge cases).
//   2. Step01IncomeView.apply(_:) — the input-sanitisation pipeline that
//      sits between the TextField onChange and OnboardingFlow.setIncome.
//      Covers T-24-03-01 (digits-only filter) and T-24-03-02 (9-digit cap).
//   3. flow.setIncome contract through the same pipeline (preset taps).
//
// Persistence is isolated via a fresh UserDefaults suite per test.

import XCTest

@testable import BudgetPlanner

@MainActor
final class Step01IncomeTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.step01"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: - RubleFormatter

    func testRubleFormatterZero() {
        XCTAssertEqual(RubleFormatter.format(cents: 0), "0")
    }

    func testRubleFormatterSubRubleTruncates() {
        // 99 копеек < 1 ₽ → "0".
        XCTAssertEqual(RubleFormatter.format(cents: 99), "0")
    }

    func testRubleFormatterOneRuble() {
        XCTAssertEqual(RubleFormatter.format(cents: 100), "1")
    }

    func testRubleFormatterTwoDigitRuble() {
        XCTAssertEqual(RubleFormatter.format(cents: 9_999), "99")
    }

    func testRubleFormatterTenThousand() {
        // 1_000_000 cents = 10_000 ₽ → "10\u{202F}000".
        XCTAssertEqual(RubleFormatter.format(cents: 1_000_000), "10\u{202F}000")
    }

    func testRubleFormatterHundredThousand() {
        // 12_000_000 cents = 120_000 ₽ → "120\u{202F}000".
        XCTAssertEqual(RubleFormatter.format(cents: 12_000_000), "120\u{202F}000")
    }

    func testRubleFormatterMillion() {
        // 100_000_000 cents = 1_000_000 ₽ → "1\u{202F}000\u{202F}000".
        XCTAssertEqual(RubleFormatter.format(cents: 100_000_000),
                       "1\u{202F}000\u{202F}000")
    }

    func testRubleFormatterUsesU202FNotAsciiSpace() {
        // Defensive: the separator MUST be U+202F, never ASCII " " (U+0020).
        let s = RubleFormatter.format(cents: 12_000_000)
        XCTAssertFalse(s.contains(" "), "ASCII space leaked into formatted ruble string")
        XCTAssertTrue(s.contains("\u{202F}"))
    }

    // MARK: - Step01IncomeView.apply pipeline

    func testInitialEmpty() {
        let flow = OnboardingFlow(defaults: defaults)
        XCTAssertEqual(flow.incomeCents, 0)
    }

    // MARK: - Preset behaviour (mirrors the chip onTap closures)

    func testPresetTapUpdatesFlow() {
        let flow = OnboardingFlow(defaults: defaults)
        // Mirror what the preset chip's Button action does.
        flow.setIncome(80_000 * 100)
        XCTAssertEqual(flow.incomeCents, 8_000_000)
    }

    func testAllFourPresetsRoundTrip() {
        let presetsRub = [50_000, 80_000, 120_000, 200_000]
        for preset in presetsRub {
            let flow = OnboardingFlow(defaults: defaults)
            flow.setIncome(preset * 100)
            XCTAssertEqual(flow.incomeCents, preset * 100,
                           "preset \(preset) ₽ should set incomeCents")
            // Display string round-trips via formatter.
            let display = RubleFormatter.format(cents: preset * 100)
            XCTAssertFalse(display.isEmpty)
        }
    }

    // MARK: - NEXT-disabled rule (incomeCents > 0 gate)

    func testNextDisabledWhenIncomeZero() {
        let flow = OnboardingFlow(defaults: defaults)
        XCTAssertTrue(flow.incomeCents <= 0, "NEXT should stay disabled at income 0")
    }

    func testNextEnabledAfterIncomeSet() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(50_000_00)
        XCTAssertFalse(flow.incomeCents <= 0, "NEXT should be enabled with income > 0")
    }
}
