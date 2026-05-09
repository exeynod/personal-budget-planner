import Foundation

enum SubCycle: String, Codable, CaseIterable {
    case monthly
    case yearly
}

struct SubscriptionDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let amountCents: Int
    let cycle: SubCycle
    let nextChargeDate: Date
    let categoryId: Int
    let notifyDaysBefore: Int
    let isActive: Bool
    let category: CategoryDTO?
}

struct SubscriptionCreateRequest: Encodable {
    let name: String
    let amountCents: Int
    let cycle: String
    let nextChargeDate: String
    let categoryId: Int
    let notifyDaysBefore: Int
}

struct SubscriptionUpdateRequest: Encodable {
    let name: String?
    let amountCents: Int?
    let cycle: String?
    let nextChargeDate: String?
    let categoryId: Int?
    let notifyDaysBefore: Int?
    let isActive: Bool?
}

struct TemplateItemDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let amountCents: Int
    let kind: CategoryKind
    let categoryId: Int
    let sortOrder: Int
}

struct TemplateItemCreateRequest: Encodable {
    let name: String
    let amountCents: Int
    let kind: String
    let categoryId: Int
}

struct ApplyTemplateResponse: Decodable {
    let createdCount: Int
    let skippedCount: Int
}

struct TopCategoryRow: Decodable, Identifiable {
    let categoryId: Int
    let categoryName: String
    let totalCents: Int
    let percentage: Double

    var id: Int { categoryId }
}

struct TopCategoriesResponse: Decodable {
    let categories: [TopCategoryRow]
    let totalCents: Int
}

struct ForecastResponse: Decodable {
    let projectedExpenseCents: Int
    let projectedBalanceCents: Int
    let runRateCentsPerDay: Int
    let daysRemaining: Int
}

struct TrendPoint: Decodable {
    let periodStart: Date
    let periodEnd: Date
    let actualExpenseCents: Int
    let plannedExpenseCents: Int
}

struct TrendResponse: Decodable {
    let points: [TrendPoint]
}
