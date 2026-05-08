import Foundation

enum MoneyFormatter {
    /// "1 500,50" из 150050 cents (без суффикса валюты).
    static func format(cents: Int) -> String {
        let isNegative = cents < 0
        let abs = Swift.abs(cents)
        let rubles = abs / 100
        let kopecks = abs % 100

        let f = NumberFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.numberStyle = .decimal
        f.groupingSeparator = " "
        let rublesStr = f.string(from: NSNumber(value: rubles)) ?? "\(rubles)"

        let result: String
        if kopecks == 0 {
            result = rublesStr
        } else {
            result = String(format: "%@,%02d", rublesStr, kopecks)
        }

        return isNegative ? "−\(result)" : result
    }

    /// "1 500,50 ₽"
    static func formatWithSymbol(cents: Int) -> String {
        "\(format(cents: cents)) ₽"
    }
}

enum MoneyParser {
    /// digit-walk без Float — точный порт parseRublesToKopecks из format.ts.
    /// "100" → 10000; "1 500,50" → 150050; "1.500,50" → 150050; "abc" → nil.
    static func parseToCents(_ raw: String) -> Int? {
        let cleaned = raw
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\u{00A0}", with: "")

        var rubles: String = ""
        var kopecks: String = ""
        var seenDecimal = false

        let candidate: String
        if let lastComma = cleaned.lastIndex(of: ",") {
            let before = cleaned[..<lastComma].replacingOccurrences(of: ".", with: "")
            let after = cleaned[cleaned.index(after: lastComma)...]
            candidate = before + "." + after
        } else if let lastDot = cleaned.lastIndex(of: ".") {
            let before = cleaned[..<lastDot]
            let after = cleaned[cleaned.index(after: lastDot)...]
            if after.count == 3 && before.allSatisfy({ $0.isNumber || $0 == "." || $0 == "-" }) {
                candidate = (before + after).replacingOccurrences(of: ".", with: "")
            } else {
                candidate = String(cleaned)
            }
        } else {
            candidate = cleaned
        }

        for ch in candidate {
            if ch == "-" && rubles.isEmpty && !seenDecimal { rubles.append(ch); continue }
            if ch.isNumber {
                if seenDecimal {
                    if kopecks.count < 2 { kopecks.append(ch) }
                } else {
                    rubles.append(ch)
                }
            } else if ch == "." {
                if seenDecimal { return nil }
                seenDecimal = true
            } else {
                return nil
            }
        }

        guard !rubles.isEmpty, rubles != "-",
              let rubInt = Int(rubles) else { return nil }

        var kopInt = 0
        if !kopecks.isEmpty {
            let padded = kopecks.padding(toLength: 2, withPad: "0", startingAt: 0)
            guard let k = Int(padded) else { return nil }
            kopInt = k
        }

        let sign = rubInt < 0 ? -1 : 1
        let absResult = Swift.abs(rubInt) * 100 + kopInt
        return sign * absResult
    }
}
