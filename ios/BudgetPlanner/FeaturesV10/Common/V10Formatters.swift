// Phase 25-05 Task 1: Day / time / period eyebrow formatters used by HomeView,
// TransactionsView, AddSheet (T-H-02, T-T-04, T-A-02 from must-haves).
// Symmetric to web `frontend/src/screensV10/common/format.ts` (Plan 25-04).
//
// Conventions (per CONTEXT 25-CONTEXT.md §decisions, prototype/poster-screens.jsx):
//  - eyebrow uses ENGLISH 3-letter MONTH (matches prototype line 215 «MAY 2026»)
//  - day grouping uses RUSSIAN GENITIVE month names («7 мая», «31 декабря»)
//  - period_number = (year - 2025) * 12 + month, zero-padded to 2 digits → VOL.NN
//  - daysLeft = lastDayOfMonth - currentDayOfMonth + 1 (today counts as remaining)
//  - pluralDays follows Slavic one/few/many rules (mirror of PluralRu.accounts
//    in FeaturesV10/Onboarding/PluralRu.swift, just for the «день» noun)
//
// All public funcs accept an explicit `Calendar` so tests stay deterministic
// regardless of the host machine's TZ. Default value `Calendar.current` keeps
// callers ergonomic at production sites.

import Foundation

enum V10Formatters {
    /// ENGLISH 3-letter month abbreviations for eyebrow («MAY 2026»).
    static let monthsEn: [String] = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
        "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ]

    /// Russian genitive month names for day-grouping headers («7 мая»).
    static let monthsRuGenitive: [String] = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]

    // MARK: - pluralisation

    /// Russian plural form for «день» (day) given an integer count.
    /// Returned UPPERCASE for use inside the eyebrow ribbon.
    ///
    /// Rules (Slavic one / few / many):
    ///   - one  (n%10 == 1 && n%100 != 11)             → "ДЕНЬ"
    ///   - few  (n%10 ∈ 2..4 && n%100 ∉ 12..14)        → "ДНЯ"
    ///   - many (everything else, incl. 0/5+/11..14)   → "ДНЕЙ"
    static func pluralDays(_ n: Int) -> String {
        let abs = Swift.abs(n)
        let mod10 = abs % 10
        let mod100 = abs % 100
        if (11...14).contains(mod100) { return "ДНЕЙ" }
        if mod10 == 1 { return "ДЕНЬ" }
        if (2...4).contains(mod10) { return "ДНЯ" }
        return "ДНЕЙ"
    }

    // MARK: - formatDay

    /// Format a date for day-grouping headers (TransactionsView, HomeView).
    ///
    ///  - Same calendar day as `today` → "Сегодня"
    ///  - One calendar day before `today` → "Вчера"
    ///  - Otherwise → "{day} {month_genitive}" (e.g. "7 мая", "31 декабря")
    ///
    /// Year is omitted by design (registry rarely shows cross-year ranges in MVP).
    static func formatDay(_ date: Date, today: Date, calendar: Calendar = .current) -> String {
        if calendar.isDate(date, inSameDayAs: today) { return "Сегодня" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: today),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "Вчера"
        }
        let day = calendar.component(.day, from: date)
        let monthIdx = calendar.component(.month, from: date) - 1
        return "\(day) \(monthsRuGenitive[monthIdx])"
    }

    // MARK: - formatTimeHM

    /// Format the time component of a Date as zero-padded `HH:mm` (24h).
    static func formatTimeHM(_ date: Date, calendar: Calendar = .current) -> String {
        let h = calendar.component(.hour, from: date)
        let m = calendar.component(.minute, from: date)
        return String(format: "%02d:%02d", h, m)
    }

    // MARK: - formatPeriodEyebrow

    /// Build the Home / Transactions period eyebrow string:
    ///
    ///   `VOL.{NN} / {MONTH} {YYYY} · {N} {ДЕНЬ|ДНЯ|ДНЕЙ}`
    ///
    /// Examples:
    ///  - May 9 2026 → "VOL.17 / MAY 2026 · 23 ДНЯ"
    ///  - Jan 1 2025 → "VOL.01 / JAN 2025 · 31 ДЕНЬ"
    ///  - Feb 1 2028 → "VOL.38 / FEB 2028 · 29 ДНЕЙ" (leap-year aware)
    static func formatPeriodEyebrow(_ date: Date, calendar: Calendar = .current) -> String {
        let comps = calendar.dateComponents([.year, .month, .day], from: date)
        let year = comps.year ?? 0
        let month = comps.month ?? 1
        let day = comps.day ?? 1
        let vol = (year - 2025) * 12 + month
        let volStr = String(format: "%02d", vol)
        let monthEn = monthsEn[month - 1]
        let lastDay: Int = {
            let range = calendar.range(of: .day, in: .month, for: date)
            return range?.upperBound != nil ? (range!.upperBound - 1) : 30
        }()
        let daysLeft = lastDay - day + 1
        return "VOL.\(volStr) / \(monthEn) \(year) · \(daysLeft) \(pluralDays(daysLeft))"
    }
}
