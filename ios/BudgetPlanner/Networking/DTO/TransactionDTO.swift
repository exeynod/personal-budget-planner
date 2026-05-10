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
    let txDate: Date
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
    let txDate: Date
    let source: ActualSource
    let createdAt: Date?
    /// Phase 25-01 — nullable for legacy v0.x rows.
    let accountId: Int?
    /// Phase 25-01 — non-null only on roundup children.
    let parentTxnId: Int?
}

struct PlannedDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let periodId: Int
    let kind: CategoryKind
    let amountCents: Int
    let description: String?
    let categoryId: Int
    let plannedDate: Date?
    let source: PlannedSource
    let subscriptionId: Int?
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

struct ActualUpdateRequest: Encodable {
    let amountCents: Int?
    let categoryId: Int?
    let txDate: String?
    let description: String?
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
