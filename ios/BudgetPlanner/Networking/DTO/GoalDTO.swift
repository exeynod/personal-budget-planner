// Phase 27-08 Task 1 (GREEN): V10 wire DTOs for /api/v1/goals surface.
//
// Symmetric to web Plan 27-03 frontend/src/api/types.ts (GoalRead /
// GoalCreatePayload) and to backend app/api/schemas/goals.py
// (GoalRead / GoalCreate).
//
// Backend invariants:
//   - `due` is YYYY-MM-DD or null on the wire (Pydantic `date`
//     serializer). Backend strict validators enforce due > today (MSK)
//     on POST/PATCH (T-22-12-07 mitigation) — UI shows a DatePicker
//     with `in: Date()...` so the user can't pick a past date.
//   - `name` 1..80, `target_cents` (0, 100M ₽].
//
// `created_at` is a full ISO timestamp (Pydantic datetime). The
// APIClient's custom date decoder handles both date-only and
// timestamp formats so a single JSONDecoder fits both fields.

import Foundation

struct GoalDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let targetCents: Int
    let currentCents: Int
    let due: Date?  // YYYY-MM-DD on the wire; nil = no deadline.
    let createdAt: Date
}

/// POST /api/v1/goals — request body.
///
/// `due` optional (nil = no deadline). When set, MUST be strictly in
/// the future per backend Europe/Moscow `today` validator (UI
/// enforces via DatePicker `in: Date()...`).
///
/// Custom Encodable so we can serialise `due` as `YYYY-MM-DD` (rather
/// than ISO-8601 timestamp from the default `JSONEncoder` strategy)
/// to match Pydantic's `date` parser. Mirrors web Plan 27-03's
/// `GoalCreatePayload` with the same wire shape.
struct GoalCreateRequest: Encodable {
    let name: String
    let targetCents: Int
    let due: Date?

    enum CodingKeys: String, CodingKey {
        case name
        case targetCents
        case due
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(targetCents, forKey: .targetCents)
        if let due {
            // Pydantic GoalCreate.due expects YYYY-MM-DD; default
            // JSONEncoder.dateEncodingStrategy = .iso8601 would emit a
            // full ISO timestamp which `_coerce_iso_date` does NOT
            // accept (it only parses pure date strings). Encode the
            // wire-required shape explicitly.
            //
            // IN-04: timeZone MUST be Europe/Moscow, NOT UTC. A SwiftUI
            // DatePicker in MSK produces midnight-MSK (= previous-day
            // 21:00 UTC), so a UTC formatter would render the wire
            // `yyyy-MM-dd` one calendar day EARLIER than the user picked.
            // Formatting in MSK keeps the wire day == the picked day.
            let fmt = DateFormatter()
            fmt.locale = Locale(identifier: "en_US_POSIX")
            fmt.timeZone = TimeZone(identifier: "Europe/Moscow") ?? TimeZone(identifier: "UTC")!
            fmt.dateFormat = "yyyy-MM-dd"
            try c.encode(fmt.string(from: due), forKey: .due)
        } else {
            try c.encodeNil(forKey: .due)
        }
    }
}
