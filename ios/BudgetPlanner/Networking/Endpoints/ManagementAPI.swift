import Foundation

@MainActor
enum SubscriptionsAPI {
    static func list() async throws -> [SubscriptionDTO] {
        try await APIClient.shared.request("GET", "/subscriptions")
    }

    static func create(_ request: SubscriptionCreateRequest) async throws -> SubscriptionDTO {
        try await APIClient.shared.request("POST", "/subscriptions", body: request)
    }

    static func update(id: Int, _ request: SubscriptionUpdateRequest) async throws
    -> SubscriptionDTO {
        try await APIClient.shared.request("PATCH", "/subscriptions/\(id)", body: request)
    }

    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/subscriptions/\(id)")
    }
}

@MainActor
enum TemplateAPI {
    static func list() async throws -> [TemplateItemDTO] {
        try await APIClient.shared.request("GET", "/template/items")
    }

    static func create(_ request: TemplateItemCreateRequest) async throws -> TemplateItemDTO {
        try await APIClient.shared.request("POST", "/template/items", body: request)
    }

    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/template/items/\(id)")
    }

    static func apply(periodId: Int) async throws -> ApplyTemplateResponse {
        try await APIClient.shared.request("POST", "/periods/\(periodId)/apply-template")
    }
}

@MainActor
enum AnalyticsAPI {
    static func topCategories(range: String = "1M") async throws -> TopCategoriesResponse {
        try await APIClient.shared.request(
            "GET", "/analytics/top-categories", query: ["range": range]
        )
    }

    static func forecast() async throws -> ForecastResponse {
        try await APIClient.shared.request("GET", "/analytics/forecast")
    }

    static func trend(range: String = "3M") async throws -> TrendResponse {
        try await APIClient.shared.request("GET", "/analytics/trend", query: ["range": range])
    }
}
