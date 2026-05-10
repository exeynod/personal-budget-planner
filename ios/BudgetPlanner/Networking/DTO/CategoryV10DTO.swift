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

/// Phase 25-03 — Decodable mirror of the v1.0 `CategoryRead` surface.
///
/// **Schema gap (documented in 25-03 SUMMARY)**: as of Phase 22 the
/// backend Pydantic `CategoryRead` (`app/api/schemas/categories.py`)
/// still emits only the v0.x field set (id / name / kind / is_archived /
/// sort_order / created_at). The ORM `Category` model already has the
/// v1.0 columns (`code, plan_cents, ord, rollover, paused, parent_id`)
/// via Phase 22 alembic 0013 — but they are not yet on the wire.
///
/// This DTO declares the v1.0 fields as `Optional` so decoding stays
/// crash-clean both before and after the schema is widened. UI code
/// MUST defensively default (`planCents ?? 0`, `paused ?? false`,
/// `rollover ?? .misc`, `code ?? nil`) until the schema lands.
///
/// Reuses the existing `CategoryKind` enum from `CommonDTO.swift`
/// (2-valued — categories are always expense | income).
///
/// Decodable conformance is custom (not synthesized) so missing v1.0
/// keys don't trip `keyNotFound` errors — they fall back to nil/defaults.
struct CategoryV10DTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let kind: CategoryKind
    let isArchived: Bool
    let sortOrder: Int
    let createdAt: Date?

    // ---- Phase 22 BE-04 fields — pending CategoryRead schema update ----
    /// Slug for system categories ('food', 'cafe', 'savings', ...).
    /// Pending Phase 22 schema update — `nil` until backend exposes it.
    let code: String?
    /// Plan limit for the current period in copecks. Defaults to 0.
    let planCents: Int
    /// '01'..'99' display ordinal (CHAR(2) on DB). Defaults to nil.
    let ord: String?
    /// Where the leftover goes at period close. Defaults to `.misc`.
    let rollover: CategoryRollover
    /// True = excluded from current-period calculations. Defaults to false.
    let paused: Bool
    /// Composite self-FK on (parent_id, user_id). Defaults to nil.
    let parentId: Int?

    private enum CodingKeys: String, CodingKey {
        // Note: APIClient decoder uses .convertFromSnakeCase, so wire
        // keys like `is_archived` map to `isArchived` automatically —
        // BUT once we declare CodingKeys explicitly we must spell each
        // key in its camelCase form (the strategy still applies because
        // we're using rawValue identifiers that match the converted
        // names).
        case id, name, kind, isArchived, sortOrder, createdAt
        case code, planCents, ord, rollover, paused, parentId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(Int.self, forKey: .id)
        self.name = try c.decode(String.self, forKey: .name)
        self.kind = try c.decode(CategoryKind.self, forKey: .kind)
        self.isArchived = try c.decode(Bool.self, forKey: .isArchived)
        self.sortOrder = try c.decode(Int.self, forKey: .sortOrder)
        self.createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)

        // v1.0 fields — defensive defaults until CategoryRead is widened.
        self.code = try c.decodeIfPresent(String.self, forKey: .code)
        self.planCents = (try? c.decodeIfPresent(Int.self, forKey: .planCents)) ?? 0
        self.ord = try c.decodeIfPresent(String.self, forKey: .ord)
        self.rollover = (try? c.decodeIfPresent(CategoryRollover.self, forKey: .rollover)) ?? .misc
        self.paused = (try? c.decodeIfPresent(Bool.self, forKey: .paused)) ?? false
        self.parentId = try c.decodeIfPresent(Int.self, forKey: .parentId)
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
