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
        XCTAssertEqual(MoneyFormatter.format(cents: 10000), "10 000")
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
