import Foundation

enum Period {
    static var moscow: TimeZone { TimeZone(identifier: "Europe/Moscow") ?? .current }

    private static func calendar() -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = moscow
        return cal
    }

    private static func clampDay(year: Int, month: Int, day: Int) -> Int {
        var components = DateComponents(year: year, month: month, day: 1)
        let cal = calendar()
        guard let firstOfMonth = cal.date(from: components),
              let range = cal.range(of: .day, in: .month, for: firstOfMonth)
        else { return day }
        return min(day, range.count)
    }

    static func periodFor(date: Date, cycleStartDay: Int) -> (start: Date, end: Date) {
        precondition(cycleStartDay >= 1, "cycle_start_day must be >= 1")

        let cal = calendar()
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        guard let year = comps.year, let month = comps.month, let day = comps.day else {
            return (date, date)
        }

        let curClamped = clampDay(year: year, month: month, day: cycleStartDay)

        let psYear: Int
        let psMonth: Int
        if day >= curClamped {
            psYear = year
            psMonth = month
        } else {
            var prevComps = DateComponents()
            prevComps.year = year
            prevComps.month = month - 1
            prevComps.day = 1
            guard let prev = cal.date(from: prevComps) else { return (date, date) }
            let prevYM = cal.dateComponents([.year, .month], from: prev)
            psYear = prevYM.year ?? year
            psMonth = prevYM.month ?? month
        }

        let periodStartDay = clampDay(year: psYear, month: psMonth, day: cycleStartDay)
        let startComponents = DateComponents(
            timeZone: moscow,
            year: psYear, month: psMonth, day: periodStartDay
        )
        guard let periodStart = cal.date(from: startComponents) else { return (date, date) }

        let nextAnchor = cal.date(byAdding: .month, value: 1, to: periodStart) ?? periodStart
        let nextYM = cal.dateComponents([.year, .month], from: nextAnchor)
        let nextDay = clampDay(
            year: nextYM.year ?? psYear,
            month: nextYM.month ?? psMonth,
            day: cycleStartDay
        )
        let nextStartComponents = DateComponents(
            timeZone: moscow,
            year: nextYM.year, month: nextYM.month, day: nextDay
        )
        guard let nextStart = cal.date(from: nextStartComponents) else {
            return (periodStart, periodStart)
        }
        let periodEnd = cal.date(byAdding: .day, value: -1, to: nextStart) ?? periodStart
        return (periodStart, periodEnd)
    }

    static func dateOnly(_ date: Date) -> Date {
        let cal = calendar()
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        return cal.date(from: comps) ?? date
    }
}
