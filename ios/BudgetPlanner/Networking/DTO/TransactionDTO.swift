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

struct ActualCreateRequest: Encodable {
    let kind: String
    let amountCents: Int
    let categoryId: Int
    let txDate: String
    let description: String?
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
