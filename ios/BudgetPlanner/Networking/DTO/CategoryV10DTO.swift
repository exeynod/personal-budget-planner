import Foundation

/// Wire-level enum for `category.rollover` (Phase 22 BE-04).
/// VARCHAR(8) on DB with CHECK constraint (alembic 0013).
///
/// Phase 26-03: widened to `Codable` so `CategoryV10UpdateRequest` can serialise
/// the rollover toggle in PATCH bodies (was Decodable-only before — only the
/// list path needed to read it). No behaviour change for existing callers.
enum CategoryRollover: String, Codable {
    case misc
    case savings
}

/// Wire-level enum for `category.tag` (Phase 36). VARCHAR with a CHECK
/// constraint on DB; the server defaults it to `personal`.
enum CategoryTag: String, Codable {
    case personal
    case business
    case mixed
}

/// Decodable read shape for the v1.0 `CategoryRead` surface
/// (`app/api/schemas/categories.py`). The canonical wire contract is the
/// generated `Gen.CategoryRead` (Networking/Generated/GeneratedDTO.swift,
/// Phase 69 B1/B3); this consumer-facing type mirrors it field-for-field
/// and decodes through the same `APIClient` `JSONDecoder`
/// (`.convertFromSnakeCase` + MSK date strategy).
///
/// **Required vs optional follows the OpenAPI `required` set** (Phase 69 B4):
/// - `code` / `ord` / `createdAt` are required on the wire (no server
///   default) → **non-optional**, plain `decode`.
/// - `planCents` (=0) / `rollover` (=misc) / `paused` (=false) carry server
///   defaults → kept as non-optional consumer-facing values with a decode
///   fallback (the wire always carries them; the fallback only guards
///   fixtures that omit a defaulted field — drift-report §"required vs
///   optional"). `parentId` / `tag` are genuinely optional.
///
/// Reuses the existing `CategoryKind` enum from `CommonDTO.swift`
/// (2-valued — categories are always expense | income).
struct CategoryV10DTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let kind: CategoryKind
    let isArchived: Bool
    let sortOrder: Int
    let createdAt: Date
    /// Slug for system categories ('food', 'cafe', 'savings', ...).
    let code: String
    /// '01'..'99' display ordinal (CHAR(2) on DB).
    let ord: String
    /// Plan limit for the current period in copecks (server default 0).
    let planCents: Int
    /// Where the leftover goes at period close (server default `.misc`).
    let rollover: CategoryRollover
    /// True = excluded from current-period calculations (server default false).
    let paused: Bool
    /// Composite self-FK on (parent_id, user_id). Genuinely optional.
    let parentId: Int?
    /// Category classification (Phase 36, server default `personal`).
    let tag: CategoryTag?

    private enum CodingKeys: String, CodingKey {
        case id, name, kind, isArchived, sortOrder, createdAt
        case code, planCents, ord, rollover, paused, parentId, tag
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(Int.self, forKey: .id)
        self.name = try c.decode(String.self, forKey: .name)
        self.kind = try c.decode(CategoryKind.self, forKey: .kind)
        self.isArchived = try c.decode(Bool.self, forKey: .isArchived)
        self.sortOrder = try c.decode(Int.self, forKey: .sortOrder)
        // Required on the wire (no server default).
        self.createdAt = try c.decode(Date.self, forKey: .createdAt)
        self.code = try c.decode(String.self, forKey: .code)
        self.ord = try c.decode(String.self, forKey: .ord)
        // Server-defaulted: fallback only guards a fixture that omits them.
        self.planCents = (try? c.decodeIfPresent(Int.self, forKey: .planCents)) ?? 0
        self.rollover = (try? c.decodeIfPresent(CategoryRollover.self, forKey: .rollover)) ?? .misc
        self.paused = (try? c.decodeIfPresent(Bool.self, forKey: .paused)) ?? false
        // Genuinely optional.
        self.parentId = try c.decodeIfPresent(Int.self, forKey: .parentId)
        self.tag = try c.decodeIfPresent(CategoryTag.self, forKey: .tag)
    }
}

// MARK: - Phase 26-03: PATCH /categories/{id} request body

/// Phase 26 — payload for `PATCH /api/v1/categories/{id}` (CAT-V10-04 + Phase 26-01
/// backend extension). All fields optional; the custom `encode(to:)` skips nil
/// keys via `encodeIfPresent` so the backend (`CategoryUpdate` Pydantic schema with
/// `model_dump(exclude_unset=True)`) only mutates fields explicitly set by the
/// caller. This matches the per-task toggle pattern (rollover-only or paused-only
/// PATCH from CategoryDetailViewModel) and prevents accidental overwrite of
/// unrelated fields if the local model becomes stale.
///
/// Threat-model T-26-03-01: type-safe Encodable struct + nil-aware encoder gives
/// us a tight wire-contract — backend Pydantic validation is the second line.
struct CategoryV10UpdateRequest: Encodable {
    let name: String?
    let sortOrder: Int?
    let isArchived: Bool?
    let planCents: Int?
    let rollover: CategoryRollover?
    let paused: Bool?
    let parentId: Int?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(sortOrder, forKey: .sortOrder)
        try c.encodeIfPresent(isArchived, forKey: .isArchived)
        try c.encodeIfPresent(planCents, forKey: .planCents)
        try c.encodeIfPresent(rollover, forKey: .rollover)
        try c.encodeIfPresent(paused, forKey: .paused)
        try c.encodeIfPresent(parentId, forKey: .parentId)
    }

    private enum CodingKeys: String, CodingKey {
        case name, sortOrder, isArchived, planCents, rollover, paused, parentId
    }

    init(
        name: String? = nil,
        sortOrder: Int? = nil,
        isArchived: Bool? = nil,
        planCents: Int? = nil,
        rollover: CategoryRollover? = nil,
        paused: Bool? = nil,
        parentId: Int? = nil
    ) {
        self.name = name
        self.sortOrder = sortOrder
        self.isArchived = isArchived
        self.planCents = planCents
        self.rollover = rollover
        self.paused = paused
        self.parentId = parentId
    }
}
