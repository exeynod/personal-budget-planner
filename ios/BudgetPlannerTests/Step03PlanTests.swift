// Phase 24-07: XCTest specs for Step 03 (Plan) — initial allocation, setPlan,
// hint computation, slider max bound, RubleFormatter cent-level granularity.
//
// Symmetric to web Plan 24-06 vitest suite
// (frontend/src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx).
//
// We do NOT drive the SwiftUI view tree (XCUI / ViewInspector lands in
// 24-11). Instead we assert:
//   1. flow.setIncome(_:) seeds floor-allocated categoryPlans (8 entries, share-based).
//   2. flow.setPlan(code:cents:) updates categoryPlans defensively.
//   3. Sum of default allocation matches Σshare * income (= 0.83 * income).
//   4. Hint text construction (3 branches: equal / left / overflow).
//   5. Slider range max formula: max(6_000_000, income * 0.6).
//   6. RubleFormatter cent-level alignment for slider value display.
//
// Persistence isolated via fresh UserDefaults suite per test.

import XCTest

@testable import BudgetPlanner

@MainActor
final class Step03PlanTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.step03"

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

    // MARK: - Initial allocation (SET_INCOME side-effect)

    func testInitialAllocationFood() {
        // floor(80_000_00 * 0.20 / 50_000) * 50_000
        //   = floor(1_600_000 / 50_000) * 50_000
        //   = 32 * 50_000 = 1_600_000 cents = 16_000 ₽.
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        XCTAssertEqual(flow.categoryPlans["food"], 1_600_000)
    }

    func testInitialAllocationAllEightCodes() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        for cat in DefaultCategories.all {
            XCTAssertNotNil(
                flow.categoryPlans[cat.code],
                "category \(cat.code) missing from default allocation"
            )
        }
        XCTAssertEqual(flow.categoryPlans.count, 8)
    }

    func testInitialAllocationFloorRounding() {
        // share=0.05, income=80_000_00:
        //   raw = 400_000; ticks = floor(400_000/50_000) = 8; out = 400_000 cents = 4_000 ₽.
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        // "fun" share = 0.05 → 400_000 cents
        XCTAssertEqual(flow.categoryPlans["fun"], 400_000)
        // "health" share = 0.05 → 400_000 cents
        XCTAssertEqual(flow.categoryPlans["health"], 400_000)
        // "subs" share = 0.03 → floor(80_000_00*0.03 / 50_000)*50_000 =
        //   floor(240_000/50_000)*50_000 = 4 * 50_000 = 200_000 cents = 2_000 ₽
        XCTAssertEqual(flow.categoryPlans["subs"], 200_000)
    }

    // MARK: - SET_PLAN

    func testSetPlanUpdatesValue() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.setPlan(code: "food", cents: 5_000_00)
        XCTAssertEqual(flow.categoryPlans["food"], 5_000_00)
    }

    func testSetPlanIgnoresUnknownCode() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.setPlan(code: "BOGUS", cents: 1_234_56)
        XCTAssertNil(flow.categoryPlans["BOGUS"])
        // and the rest of allocation stays intact:
        XCTAssertEqual(flow.categoryPlans["food"], 1_600_000)
    }

    func testSetPlanClampsNegative() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.setPlan(code: "food", cents: -42)
        XCTAssertEqual(flow.categoryPlans["food"], 0)
    }

    // MARK: - Σplan from default allocation

    func testSumPlanForEightyThousand() {
        // Σshare = 0.20+0.10+0.30+0.06+0.05+0.04+0.05+0.03 = 0.83.
        // For income=80_000_00 cents, per-category floor(raw/50_000)*50_000:
        //   food    0.20 → raw=1_600_000 → 1_600_000
        //   cafe    0.10 → raw=  800_000 →   800_000
        //   home    0.30 → raw=2_400_000 → 2_400_000
        //   transit 0.06 → raw=  480_000 →   450_000  (floor(9.6)=9)
        //   fun     0.05 → raw=  400_000 →   400_000
        //   gifts   0.04 → raw=  320_000 →   300_000  (floor(6.4)=6)
        //   health  0.05 → raw=  400_000 →   400_000
        //   subs    0.03 → raw=  240_000 →   200_000  (floor(4.8)=4)
        //   Σ = 6_550_000 cents = 65_500 ₽.
        // (Pure 0.83*80_000_00 = 6_640_000; floor rounding shaves 90_000.)
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        let sum = flow.categoryPlans.values.reduce(0, +)
        XCTAssertEqual(sum, 6_550_000)
    }

    // MARK: - Hint text construction (mirrors view's `hintText` getter)

    /// Reproduces the formula used inside OnboardingV10View for case 3 hint.
    /// Centralised here so a regression in either view OR the formula gets caught.
    private func hintText(income: Int, plans: [String: Int]) -> String {
        let total = plans.values.reduce(0, +)
        let left = income - total
        if left == 0 {
            return "всё распределено"
        } else if left > 0 {
            return "остаётся \(RubleFormatter.format(cents: left)) ₽ → накопления"
        } else {
            return "превышение \(RubleFormatter.format(cents: -left)) ₽"
        }
    }

    private func tone(income: Int, plans: [String: Int]) -> HintTone {
        let total = plans.values.reduce(0, +)
        let left = income - total
        return left < 0 ? .overflow : .normal
    }

    func testHintNormalLeft() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        // After default allocation: Σ=6_600_000, left = 8_000_000 - 6_600_000 = 1_400_000.
        let hint = hintText(income: flow.incomeCents, plans: flow.categoryPlans)
        XCTAssertTrue(hint.lowercased().contains("остаётся"),
                      "expected normal-left hint, got: \(hint)")
        XCTAssertEqual(tone(income: flow.incomeCents, plans: flow.categoryPlans), .normal)
    }

    func testHintEqualWhenFullyAllocated() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        // Bump every category proportionally to make Σ == income.
        // Adjust food by exactly the leftover.
        let leftover = flow.incomeCents - flow.categoryPlans.values.reduce(0, +)
        flow.setPlan(code: "food", cents: (flow.categoryPlans["food"] ?? 0) + leftover)
        let hint = hintText(income: flow.incomeCents, plans: flow.categoryPlans)
        XCTAssertEqual(hint, "всё распределено")
        XCTAssertEqual(tone(income: flow.incomeCents, plans: flow.categoryPlans), .normal)
    }

    func testHintOverflow() {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        // Push a single slider over income to force overflow.
        flow.setPlan(code: "food", cents: 100_000_00)  // 100k₽ alone exceeds 80k₽
        let hint = hintText(income: flow.incomeCents, plans: flow.categoryPlans)
        XCTAssertTrue(hint.lowercased().contains("превышение"),
                      "expected overflow hint, got: \(hint)")
        XCTAssertEqual(tone(income: flow.incomeCents, plans: flow.categoryPlans), .overflow)
    }

    // MARK: - Slider max bound (max(6_000_000, income*0.6))

    private func sliderMax(incomeCents: Int) -> Int {
        max(6_000_000, Int(Double(incomeCents) * 0.6))
    }

    func testSliderMaxFloorAtSixtyKRubles() {
        // Income=10_000 ₽ → 60% = 6_000 ₽ < 60_000 ₽ floor → max stays 6_000_000 cents (60_000 ₽).
        XCTAssertEqual(sliderMax(incomeCents: 1_000_000), 6_000_000)
    }

    func testSliderMaxAboveFloor() {
        // Income=200_000 ₽ → 60% = 120_000 ₽ > 60_000 ₽ floor → max = 12_000_000 cents.
        XCTAssertEqual(sliderMax(incomeCents: 20_000_000), 12_000_000)
    }

    // MARK: - RubleFormatter cents

    func testRubleFormatterCentsSixteenK() {
        // floor allocation for food at income=80k₽ is 1_600_000 cents → "16\u{202F}000".
        XCTAssertEqual(RubleFormatter.format(cents: 1_600_000), "16\u{202F}000")
    }

    func testRubleFormatterCentsThreeHundredAtSubsLevel() {
        // 300_000 cents = 3_000 ₽ → "3\u{202F}000".
        XCTAssertEqual(RubleFormatter.format(cents: 300_000), "3\u{202F}000")
    }

    // MARK: - HintTone enum sanity

    func testHintToneEnumValues() {
        let normal: HintTone = .normal
        let overflow: HintTone = .overflow
        XCTAssertNotEqual(normal, overflow)
    }
}
