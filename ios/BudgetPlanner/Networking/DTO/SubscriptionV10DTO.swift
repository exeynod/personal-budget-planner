// Phase 26-07 Task 1: V10 wire DTOs for /api/v1/subscriptions surface.
//
// Symmetric to web `frontend/src/api/v10/subscriptions.ts` (Plan 26-05).
//
// The legacy `SubscriptionDTO` (ManagementDTO.swift) backs the v0.x screens.
// This v1.0 DTO adds three optional fields the backend exposes via the
// SubscriptionV10Extension mixin (Phase 22 BE-12): `dayOfMonth`, `accountId`,
// `postedTxnId`. The base SubscriptionRead → SubscriptionV10Extension merge is
// applied router-side in Plan 26-05; if/when the backend hasn't yet shipped
// the extension on a given route, these fields decode as nil and the UI
// degrades gracefully (formatCadenceRu falls back to «ежемесячно»).
//
// Encoded PATCH body uses `SubscriptionV10UpdateRequest` (custom Encodable
// with encodeIfPresent for every field — pairs with backend's
// `model_dump(exclude_unset=True)` so per-field PATCH only mutates what was
// sent). Extension fields (`dayOfMonth`, `accountId`) require the v1.0 router
// merge (Phase 26-05); legacy `SubscriptionUpdate` rejects them with 422.

import Foundation

struct SubscriptionV10DTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let amountCents: Int
    let cycle: SubCycle
    let nextChargeDate: Date
    let categoryId: Int
    let notifyDaysBefore: Int
    let isActive: Bool
    let dayOfMonth: Int?
    let accountId: Int?
    let postedTxnId: Int?

    /// Custom decoder so the three v1.0-extension fields decode as nil when
    /// the backend hasn't merged the SubscriptionV10Extension shape onto a
    /// given route yet. Required because synthesised Decodable would error
    /// on missing keys (vs. nil-valued keys).
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case amountCents
        case cycle
        case nextChargeDate
        case categoryId
        case notifyDaysBefore
        case isActive
        case dayOfMonth
        case accountId
        case postedTxnId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(Int.self, forKey: .id)
        self.name = try c.decode(String.self, forKey: .name)
        self.amountCents = try c.decode(Int.self, forKey: .amountCents)
        self.cycle = try c.decode(SubCycle.self, forKey: .cycle)
        self.nextChargeDate = try c.decode(Date.self, forKey: .nextChargeDate)
        self.categoryId = try c.decode(Int.self, forKey: .categoryId)
        self.notifyDaysBefore = try c.decode(Int.self, forKey: .notifyDaysBefore)
        self.isActive = try c.decode(Bool.self, forKey: .isActive)
        self.dayOfMonth = try c.decodeIfPresent(Int.self, forKey: .dayOfMonth)
        self.accountId = try c.decodeIfPresent(Int.self, forKey: .accountId)
        self.postedTxnId = try c.decodeIfPresent(Int.self, forKey: .postedTxnId)
    }
}

/// PATCH /api/v1/subscriptions/{id} request body.
///
/// Per-field optional encoding — `encodeIfPresent` skips nil keys on the
/// wire so the backend's `model_dump(exclude_unset=True)` only mutates
/// fields the UI explicitly set.
///
/// `dayOfMonth` / `accountId` require the v1.0 router merge (Phase 26-05).
struct SubscriptionV10UpdateRequest: Encodable {
    var name: String? = nil
    var amountCents: Int? = nil
    var cycle: SubCycle? = nil
    var nextChargeDate: Date? = nil
    var categoryId: Int? = nil
    var notifyDaysBefore: Int? = nil
    var isActive: Bool? = nil
    var dayOfMonth: Int? = nil
    var accountId: Int? = nil

    enum CodingKeys: String, CodingKey {
        case name
        case amountCents
        case cycle
        case nextChargeDate
        case categoryId
        case notifyDaysBefore
        case isActive
        case dayOfMonth
        case accountId
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(amountCents, forKey: .amountCents)
        try c.encodeIfPresent(cycle, forKey: .cycle)
        try c.encodeIfPresent(nextChargeDate, forKey: .nextChargeDate)
        try c.encodeIfPresent(categoryId, forKey: .categoryId)
        try c.encodeIfPresent(notifyDaysBefore, forKey: .notifyDaysBefore)
        try c.encodeIfPresent(isActive, forKey: .isActive)
        try c.encodeIfPresent(dayOfMonth, forKey: .dayOfMonth)
        try c.encodeIfPresent(accountId, forKey: .accountId)
    }
}

/// POST /api/v1/subscriptions/{id}/post response (BE-13).
struct SubscriptionPostResponseDTO: Decodable, Equatable {
    let txnId: Int
    let subscriptionId: Int
    let postedAt: String
}
