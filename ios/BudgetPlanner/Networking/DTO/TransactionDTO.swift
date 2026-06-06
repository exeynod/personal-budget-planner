import Foundation

enum ActualSource: String, Decodable {
    case miniApp = "mini_app"
    case bot
}

enum PlannedSource: String, Decodable {
    case template
    case manual
    case subscriptionAuto = "subscription_auto"
}

struct ActualDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let periodId: Int
    let kind: CategoryKind
    let amountCents: Int
    let description: String?
    let categoryId: Int
    let txDate: BusinessDate
    let source: ActualSource
    let createdAt: Date?
}

// MARK: - Phase 25-03 — v1.0 actual surface (parallel to legacy ActualDTO)

/// Phase 25-03 — wire-level kind enum for the v1.0 actual surface.
///
/// Mirrors `ActualKindStr` from `app/api/schemas/actual.py` (4-valued
/// after Phase 25-01 lands). Legacy v0.6 features keep using the
/// 2-valued `CategoryKind` via the original `ActualDTO`; v1.0 features
/// (Phase 25 Home / Transactions / AddSheet) decode through `ActualV10DTO`
/// so v0.6 screens stay untouched (no regression in legacy paths).
enum ActualKindV10: String, Decodable {
    case expense
    case income
    case roundup
    case deposit
}

/// Phase 25-03 — Decodable mirror of the v1.0 extended `ActualRead`
/// (Phase 25-01 schema extension: 4-valued kind + `account_id` +
/// `parent_txn_id`).
///
/// **Why a parallel struct (not extending `ActualDTO`)**: the legacy
/// `ActualDTO.kind: CategoryKind` is 2-valued; switching it to the
/// 4-valued `ActualKindV10` would silently break every v0.6 consumer
/// that grabs `dto.kind` (see audit:
/// `Features/Transactions/TransactionsView.swift`,
/// `Features/Transactions/TransactionEditor.swift`,
/// `Features/AI/AIChatView.swift`). The parallel-DTO approach
/// (recommended in the plan) keeps v0.6 untouched and lets v1.0 plans
/// opt into the wider surface explicitly.
struct ActualV10DTO: Decodable, Identifiable, Equatable {
    let id: Int
    let periodId: Int
    let kind: ActualKindV10
    let amountCents: Int
    let description: String?
    let categoryId: Int
    let txDate: BusinessDate
    let source: ActualSource
    /// `ActualRead.created_at` is required on the wire, but kept Optional
    /// here intentionally: every list/sort consumer falls back via
    /// `createdAt ?? txDate`, and legacy v0.x rows may lack it. The
    /// canonical wire shape is the generated `Gen.ActualRead` (createdAt
    /// non-optional); this consumer-facing mirror stays defensive.
    let createdAt: Date?
    /// Phase 25-01 — nullable for legacy v0.x rows.
    let accountId: Int?
    /// Phase 25-01 — non-null only on roundup children.
    let parentTxnId: Int?
    /// Transaction classification (Phase 36, optional on the wire). Reuses
    /// `CategoryTag` (personal|business|mixed) — same enum as `Gen.ActualRead.Tag`.
    let tag: CategoryTag?
}

struct PlannedDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let periodId: Int
    let kind: CategoryKind
    let amountCents: Int
    let description: String?
    let categoryId: Int
    let plannedDate: BusinessDate?
    let source: PlannedSource
    let subscriptionId: Int?
    /// v1.1 (AGREED §F): non-nil when this planned row has been posted into a
    /// real `actual_transaction` (the «Провести» bridge). nil = unposted. A
    /// synthesised `Decodable` uses `decodeIfPresent` for optionals, so legacy
    /// rows without the key decode to nil.
    let postedTxnId: Int?
}

/// Phase 25-03 — extended `POST /api/v1/actual` request body.
///
/// `accountId` is additive (Phase 25-01 wire contract): when provided,
/// the route delegates to `create_actual_v10` (delta-balance + roundup
/// hook); when nil, the legacy `create_actual` path runs. Existing v0.6
/// callers that don't pass `accountId` keep working — the explicit
/// `encode(to:)` below uses `encodeIfPresent` so legacy requests do NOT
/// emit `"account_id": null` on the wire (avoids any contract regression
/// for proxies / observability that filter on field presence).
struct ActualCreateRequest: Encodable {
    let kind: String
    let amountCents: Int
    let categoryId: Int
    let txDate: String
    let description: String?
    /// Phase 25-03 — optional. Triggers create_actual_v10 when present.
    var accountId: Int? = nil

    private enum CodingKeys: String, CodingKey {
        case kind
        case amountCents
        case categoryId
        case txDate
        case description
        case accountId
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(amountCents, forKey: .amountCents)
        try c.encode(categoryId, forKey: .categoryId)
        try c.encode(txDate, forKey: .txDate)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(accountId, forKey: .accountId)
    }
}

/// Phase 64-01 — `PATCH /api/v1/actual/{id}` request body.
///
/// `accountId` is additive (ADD-V10-04): mirrors the same field already on
/// `ActualCreateRequest`. All fields are optional and serialised through
/// `encodeIfPresent` so the wire payload only carries set fields — the
/// backend uses `exclude_unset` semantics, and a literal `"account_id":null`
/// would be a contract regression (would clear the column instead of leaving
/// it untouched). Existing callers that don't pass `accountId` keep working
/// because of the `= nil` default.
struct ActualUpdateRequest: Encodable {
    let amountCents: Int?
    let categoryId: Int?
    let txDate: String?
    let description: String?
    var accountId: Int? = nil

    private enum CodingKeys: String, CodingKey {
        case amountCents
        case categoryId
        case txDate
        case description
        case accountId
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(amountCents, forKey: .amountCents)
        try c.encodeIfPresent(categoryId, forKey: .categoryId)
        try c.encodeIfPresent(txDate, forKey: .txDate)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(accountId, forKey: .accountId)
    }
}

struct PlannedCreateRequest: Encodable {
    let kind: String
    let amountCents: Int
    let categoryId: Int
    let plannedDate: String?
    let description: String?
}

struct PlannedUpdateRequest: Encodable {
    let amountCents: Int?
    let categoryId: Int?
    let plannedDate: String?
    let description: String?
}

struct CategoryCreateRequest: Encodable {
    let name: String
    let kind: String
}

struct CategoryUpdateRequest: Encodable {
    let name: String?
    let isArchived: Bool?
}

struct SettingsDTO: Decodable, Equatable {
    let cycleStartDay: Int
    let notifyDaysBefore: Int
    let enableAiCategorization: Bool
    let isBotBound: Bool?
}

struct SettingsUpdateRequest: Encodable {
    let cycleStartDay: Int?
    let notifyDaysBefore: Int?
    let enableAiCategorization: Bool?
}
