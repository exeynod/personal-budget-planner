import Foundation

struct UserDTO: Decodable, Identifiable, Equatable {
    let tgUserId: Int
    let tgChatId: Int?
    let cycleStartDay: Int
    let onboardedAt: Date?
    let chatIdKnown: Bool
    let role: String
    let aiSpendCents: Int
    let aiSpendingCapCents: Int
    /// BE-01 — monthly income in copecks; nil until onboarding completes
    /// (genuinely optional on the wire — matches `Gen.MeV10Response.incomeCents`).
    let incomeCents: Int?

    var id: Int { tgUserId }
    var isOnboarded: Bool { onboardedAt != nil }
}

enum CategoryKind: String, Decodable {
    case expense
    case income
}

struct CategoryDTO: Decodable, Identifiable, Equatable, Hashable {
    let id: Int
    let name: String
    let kind: CategoryKind
    let isArchived: Bool
    let sortOrder: Int
    let createdAt: Date?
}

enum PeriodStatus: String, Decodable {
    case active
    case closed
}

struct PeriodDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let periodStart: BusinessDate
    let periodEnd: BusinessDate
    let startingBalanceCents: Int
    let endingBalanceCents: Int?
    let status: PeriodStatus
    let closedAt: Date?
}

struct BalanceCategoryRow: Decodable, Identifiable, Equatable {
    let categoryId: Int
    let name: String
    let kind: CategoryKind
    let plannedCents: Int
    let actualCents: Int
    let deltaCents: Int

    var id: Int { categoryId }
}

struct BalanceResponse: Decodable, Equatable {
    let periodId: Int
    let periodStart: BusinessDate
    let periodEnd: BusinessDate
    let startingBalanceCents: Int
    let plannedTotalExpenseCents: Int
    let actualTotalExpenseCents: Int
    let plannedTotalIncomeCents: Int
    let actualTotalIncomeCents: Int
    let balanceNowCents: Int
    let deltaTotalCents: Int
    let byCategory: [BalanceCategoryRow]
}

struct DevExchangeRequest: Encodable {
    let secret: String
}

struct DevExchangeResponse: Decodable {
    let token: String
    let tgUserId: Int
}

struct OnboardingCompleteRequest: Encodable {
    let startingBalanceCents: Int
    let cycleStartDay: Int
    let seedDefaultCategories: Bool
}

struct OnboardingCompleteResponse: Decodable {
    let periodId: Int
    let seededCategories: Int
    let onboardedAt: Date
    let embeddingsCreated: Int
}
