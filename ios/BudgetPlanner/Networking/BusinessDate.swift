import Foundation

/// A wire `DATE` (yyyy-MM-dd) **business date** — distinct from an audit-time
/// `Date` timestamp.
///
/// **Why a dedicated type (E2 / R7 / WR-05):** the backend serialises two kinds
/// of temporal value over the wire:
///   - audit-time instants (`created_at`, `closed_at`, …) as ISO-8601
///     timestamps, decoded as `Date` via the shared `APIClient` decoder; and
///   - *business dates* (`due`, `next_charge_date`, `tx_date`, `planned_date`,
///     `period_start/end`) as bare `yyyy-MM-dd` strings that denote a calendar
///     day in **Europe/Moscow** (the period/scheduler timezone — see
///     `period_for` and the worker jobs).
///
/// Previously the shared decoder *guessed* which kind a string was by its
/// format, pinning the bare-date branch to MSK midnight. That heuristic is now
/// gone: a business date carries its MSK-midnight semantics as a **property of
/// the type**. `BusinessDate` self-decodes from its own `singleValueContainer`
/// (a `String`), so it is unaffected by the decoder's `dateDecodingStrategy`,
/// and `encode(to:)` symmetrically emits the MSK-formatted `yyyy-MM-dd` string
/// (replacing the old `GoalCreateRequest` hand-roll).
///
/// **Representation:** the canonical stored instant (`date`) is the *MSK
/// midnight* of the represented calendar day (e.g. `2027-01-01` →
/// `2027-01-01 00:00 Europe/Moscow` == `2026-12-31 21:00 UTC`). `Comparable`,
/// `Equatable` and `Hashable` are all derived from that instant, so two
/// `BusinessDate`s for the same MSK calendar day are equal and hash equal —
/// which is what lets `BusinessDate` be a stable `Dictionary(grouping:by:)` key
/// for one-bucket-per-MSK-day analytics grouping.
struct BusinessDate: Codable, Equatable, Hashable, Comparable {

    /// The canonical instant: MSK (Europe/Moscow) midnight of the represented
    /// calendar day. Bridge for SwiftUI `DatePicker` / `Calendar` reads.
    let date: Date

    /// Europe/Moscow, en_US_POSIX, `yyyy-MM-dd` — the single source of truth for
    /// business-date wire formatting. Matches the old `APIClient` bare-date
    /// branch and the old `GoalCreateRequest` encode.
    private static let formatter: DateFormatter = {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "Europe/Moscow") ?? TimeZone(identifier: "UTC")!
        df.dateFormat = "yyyy-MM-dd"
        return df
    }()

    private static var mskCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Moscow") ?? TimeZone(identifier: "UTC")!
        return cal
    }

    /// Normalises an arbitrary `Date` (e.g. a `DatePicker` selection) to the MSK
    /// midnight of its MSK calendar day — so encode emits the day the user saw.
    init(_ date: Date) {
        self.date = Self.mskCalendar.startOfDay(for: date)
    }

    /// Internal: store an already-MSK-midnight instant verbatim.
    private init(mskMidnight date: Date) {
        self.date = date
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let str = try container.decode(String.self)
        guard let parsed = Self.formatter.date(from: str) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unrecognized business date (expected yyyy-MM-dd): \(str)")
        }
        // `formatter` parses to MSK midnight already; store verbatim.
        self.init(mskMidnight: parsed)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(Self.formatter.string(from: date))
    }

    static func < (lhs: BusinessDate, rhs: BusinessDate) -> Bool {
        lhs.date < rhs.date
    }
}
