import Foundation

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
/// - `planCents` (=0) carries a server default → non-optional with a decode
///   fallback. `parentId` / `tag` are genuinely optional.
///
/// v1.1 (AGREED §G3/§G4): `rollover` / `paused` fields removed from the
/// backend `CategoryRead` — dropped here to stay in sync with `Gen.CategoryRead`.
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
    /// Slug for system categories ('food', 'cafe', 'adjustment', ...).
    let code: String
    /// '01'..'99' display ordinal (CHAR(2) on DB).
    let ord: String
    /// Plan limit for the current period in copecks (server default 0).
    let planCents: Int
    /// Composite self-FK on (parent_id, user_id). Genuinely optional.
    let parentId: Int?
    /// Category classification (Phase 36, server default `personal`).
    let tag: CategoryTag?

    private enum CodingKeys: String, CodingKey {
        case id, name, kind, isArchived, sortOrder, createdAt
        case code, planCents, ord, parentId, tag
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
        // Server-defaulted: fallback only guards a fixture that omits it.
        self.planCents = (try? c.decodeIfPresent(Int.self, forKey: .planCents)) ?? 0
        // Genuinely optional.
        self.parentId = try c.decodeIfPresent(Int.self, forKey: .parentId)
        self.tag = try c.decodeIfPresent(CategoryTag.self, forKey: .tag)
    }
}

// MARK: - Phase 26-03: PATCH /categories/{id} request body

/// Payload for `PATCH /api/v1/categories/{id}` (CAT-V10-04). All fields
/// optional; the custom `encode(to:)` skips nil keys via `encodeIfPresent` so
/// the backend (`CategoryUpdate` Pydantic schema with
/// `model_dump(exclude_unset=True)`) only mutates fields explicitly set by the
/// caller.
///
/// v1.1 (AGREED §G3/§G4): `rollover` / `paused` removed.
struct CategoryV10UpdateRequest: Encodable {
    let name: String?
    let sortOrder: Int?
    let isArchived: Bool?
    let planCents: Int?
    let parentId: Int?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(sortOrder, forKey: .sortOrder)
        try c.encodeIfPresent(isArchived, forKey: .isArchived)
        try c.encodeIfPresent(planCents, forKey: .planCents)
        try c.encodeIfPresent(parentId, forKey: .parentId)
    }

    private enum CodingKeys: String, CodingKey {
        case name, sortOrder, isArchived, planCents, parentId
    }

    init(
        name: String? = nil,
        sortOrder: Int? = nil,
        isArchived: Bool? = nil,
        planCents: Int? = nil,
        parentId: Int? = nil
    ) {
        self.name = name
        self.sortOrder = sortOrder
        self.isArchived = isArchived
        self.planCents = planCents
        self.parentId = parentId
    }
}
