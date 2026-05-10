import XCTest
@testable import BudgetPlanner

final class MoneyParserTests: XCTestCase {
    func testInteger() {
        XCTAssertEqual(MoneyParser.parseToCents("100"), 10000)
    }

    func testWithSpaceGroupingAndComma() {
        XCTAssertEqual(MoneyParser.parseToCents("1 500,50"), 150050)
    }

    func testWithDotThousands() {
        XCTAssertEqual(MoneyParser.parseToCents("1.500,50"), 150050)
    }

    func testWithDotDecimal() {
        XCTAssertEqual(MoneyParser.parseToCents("100.50"), 10050)
    }

    func testZero() {
        XCTAssertEqual(MoneyParser.parseToCents("0"), 0)
    }

    func testNegative() {
        XCTAssertEqual(MoneyParser.parseToCents("-500"), -50000)
    }

    func testInvalidLetters() {
        XCTAssertNil(MoneyParser.parseToCents("abc"))
    }

    func testEmptyKopecks() {
        XCTAssertEqual(MoneyParser.parseToCents("100,"), 10000)
    }

    func testSingleKopeckDigit() {
        XCTAssertEqual(MoneyParser.parseToCents("100,5"), 10050)
    }
}

final class MoneyFormatterTests: XCTestCase {
    func testZero() {
        XCTAssertEqual(MoneyFormatter.format(cents: 0), "0")
    }

    func testRoundRubles() {
        // 10000 cents = 100 rubles → "100". For "10 000" (10k rubles) input must be 1_000_000 cents.
        // REG-04 (Phase 31-03): fixed input/expected mismatch — was expecting "10 000" from 10000 cents.
        XCTAssertEqual(MoneyFormatter.format(cents: 1_000_000), "10 000")
    }

    func testWithKopecks() {
        XCTAssertEqual(MoneyFormatter.format(cents: 150050), "1 500,50")
    }

    func testNegative() {
        XCTAssertEqual(MoneyFormatter.format(cents: -50000), "−500")
    }

    func testWithSymbol() {
        XCTAssertEqual(MoneyFormatter.formatWithSymbol(cents: 150050), "1 500,50 ₽")
    }
}
