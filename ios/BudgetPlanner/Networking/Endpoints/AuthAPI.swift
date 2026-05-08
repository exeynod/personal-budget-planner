import Foundation

@MainActor
enum AuthAPI {
    static func devExchange(secret: String) async throws -> DevExchangeResponse {
        try await APIClient.shared.request(
            "POST",
            "/auth/dev-exchange",
            body: DevExchangeRequest(secret: secret),
            skipAuth: true
        )
    }
}

@MainActor
enum MeAPI {
    static func current() async throws -> UserDTO {
        try await APIClient.shared.request("GET", "/me")
    }
}

@MainActor
enum CategoriesAPI {
    static func list() async throws -> [CategoryDTO] {
        try await APIClient.shared.request("GET", "/categories")
    }
}

@MainActor
enum PeriodsAPI {
    static func current() async throws -> PeriodDTO {
        try await APIClient.shared.request("GET", "/periods/current")
    }

    static func balance(periodId: Int) async throws -> BalanceResponse {
        try await APIClient.shared.request("GET", "/periods/\(periodId)/balance")
    }

    static func list() async throws -> [PeriodDTO] {
        try await APIClient.shared.request("GET", "/periods")
    }
}

@MainActor
enum OnboardingAPI {
    static func complete(_ request: OnboardingCompleteRequest) async throws
    -> OnboardingCompleteResponse {
        try await APIClient.shared.request(
            "POST",
            "/onboarding/complete",
            body: request
        )
    }
}
