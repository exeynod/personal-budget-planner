// GENERATED — do not edit.
// Source: contract/openapi.json (Phase 69 B1).
// Regenerate: python3 contract/gen_swift_dto.py  (after `make contract`).
//
// Vanilla `Codable` DTOs decoded through the EXISTING APIClient
// JSONDecoder (.convertFromSnakeCase + ISO-8601 date-time strategy).
// Wire `date-time` audit instants decode as `Date`; wire `date`
// business dates are typed `BusinessDate`, which self-decodes its
// own MSK-pinned `yyyy-MM-dd` string and bypasses the decoder's
// dateDecodingStrategy.
// No transport / decoder change. Nullability follows the OpenAPI
// `required` set: required -> non-optional; absent -> Swift optional.
// Namespaced under `enum Gen` to avoid colliding with the
// handwritten DTO/*.swift types until 69-05 migrates consumers.

import Foundation

enum Gen {
    struct AccountCreate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case card
            case cash
            case savings
        }

        let balanceCents: Int?
        let bank: String
        let kind: Kind
        let mask: String?
        let primary: Bool?
    }

    struct AccountDeleteResponse: Codable, Equatable {
        let deletedAt: String
        let message: String
        let purgeAfterDays: Int
    }

    struct AccountRead: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case card
            case cash
            case savings
        }

        let balanceCents: Int
        let bank: String
        let createdAt: Date
        let id: Int
        let kind: Kind
        let mask: String?
        let primary: Bool
    }

    struct AccountUpdate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case card
            case cash
            case savings
        }

        let balanceCents: Int?
        let bank: String?
        let kind: Kind?
        let mask: String?
        let primary: Bool?
    }

    struct ActualCreate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
            case roundup
            case deposit
        }

        enum Tag: String, Codable, Equatable {
            case personal
            case business
            case mixed
        }

        let accountId: Int?
        let amountCents: Int
        let categoryId: Int
        let description: String?
        let kind: Kind
        let tag: Tag?
        let txDate: BusinessDate
    }

    struct ActualRead: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
            case roundup
            case deposit
        }

        enum Source: String, Codable, Equatable {
            case miniApp = "mini_app"
            case bot
        }

        enum Tag: String, Codable, Equatable {
            case personal
            case business
            case mixed
        }

        let accountId: Int?
        let amountCents: Int
        let categoryId: Int
        let createdAt: Date
        let description: String?
        let id: Int
        let kind: Kind
        let parentTxnId: Int?
        let periodId: Int
        let source: Source
        let tag: Tag?
        let txDate: BusinessDate
    }

    struct ActualUpdate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
            case roundup
            case deposit
        }

        enum Tag: String, Codable, Equatable {
            case personal
            case business
            case mixed
        }

        let amountCents: Int?
        let categoryId: Int?
        let description: String?
        let kind: Kind?
        let tag: Tag?
        let txDate: BusinessDate?
    }

    struct AdminAiUsageResponse: Codable, Equatable {
        let generatedAt: Date
        let users: [Gen.AdminAiUsageRow]
    }

    struct AdminAiUsageRow: Codable, Equatable {
        enum Role: String, Codable, Equatable {
            case owner
            case member
            case revoked
        }

        let currentMonth: Gen.UsageBucket
        let estCostCentsCurrentMonth: Int
        let last30d: Gen.UsageBucket
        let name: String?
        let pctOfCap: Double
        let role: Role
        let spendingCapCents: Int
        let tgUserId: Int
        let userId: Int
    }

    struct AdminUserCreateRequest: Codable, Equatable {
        let tgUserId: Int
    }

    struct AdminUserResponse: Codable, Equatable {
        enum Role: String, Codable, Equatable {
            case owner
            case member
            case revoked
        }

        let createdAt: Date
        let id: Int
        let lastSeenAt: Date?
        let onboardedAt: Date?
        let role: Role
        let spendingCapCents: Int?
        let tgChatId: Int?
        let tgUserId: Int
    }

    struct ApplyTemplateResponse: Codable, Equatable {
        let created: Int
        let periodId: Int
        let planned: [Gen.PlannedRead]
    }

    struct BalanceCategoryRow: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
        }

        let actualCents: Int
        let categoryId: Int
        let deltaCents: Int
        let kind: Kind
        let name: String
        let plannedCents: Int
    }

    struct BalanceResponse: Codable, Equatable {
        let actualTotalExpenseCents: Int
        let actualTotalIncomeCents: Int
        let balanceNowCents: Int
        let byCategory: [Gen.BalanceCategoryRow]
        let deltaTotalCents: Int
        let periodEnd: BusinessDate
        let periodId: Int
        let periodStart: BusinessDate
        let plannedTotalExpenseCents: Int
        let plannedTotalIncomeCents: Int
        let startingBalanceCents: Int
    }

    struct BotActualRequest: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
            case roundup
            case deposit
        }

        let amountCents: Int
        let categoryId: Int?
        let categoryQuery: String?
        let description: String?
        let kind: Kind
        let tgUserId: Int
        let txDate: BusinessDate?
    }

    struct BotActualResponse: Codable, Equatable {
        enum Status: String, Codable, Equatable {
            case created
            case ambiguous
            case notFound = "not_found"
        }

        let actual: Gen.ActualRead?
        let candidates: [Gen.CategoryCandidate]?
        let category: Gen.CategoryCandidate?
        let categoryBalanceCents: Int?
        let status: Status
    }

    struct BotBalanceRequest: Codable, Equatable {
        let tgUserId: Int
    }

    struct BotBalanceResponse: Codable, Equatable {
        let actualTotalExpenseCents: Int
        let actualTotalIncomeCents: Int
        let balanceNowCents: Int
        let byCategory: [Gen.BalanceCategoryRow]
        let deltaTotalCents: Int
        let periodEnd: BusinessDate
        let periodId: Int
        let periodStart: BusinessDate
        let plannedTotalExpenseCents: Int
        let plannedTotalIncomeCents: Int
    }

    struct BotTodayActualRow: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
            case roundup
            case deposit
        }

        let amountCents: Int
        let categoryId: Int
        let categoryName: String
        let description: String?
        let id: Int
        let kind: Kind
    }

    struct BotTodayRequest: Codable, Equatable {
        let tgUserId: Int
    }

    struct BotTodayResponse: Codable, Equatable {
        let actuals: [Gen.BotTodayActualRow]
        let totalExpenseCents: Int
        let totalIncomeCents: Int
    }

    struct CapUpdate: Codable, Equatable {
        let spendingCapCents: Int
    }

    struct CategoryCandidate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
            case roundup
            case deposit
        }

        let id: Int
        let kind: Kind
        let name: String
    }

    struct CategoryCreate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
        }

        enum Tag: String, Codable, Equatable {
            case personal
            case business
            case mixed
        }

        let kind: Kind
        let name: String
        let sortOrder: Int?
        let tag: Tag?
    }

    struct CategoryRead: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
        }

        enum Rollover: String, Codable, Equatable {
            case misc
            case savings
        }

        enum Tag: String, Codable, Equatable {
            case personal
            case business
            case mixed
        }

        let code: String
        let createdAt: Date
        let id: Int
        let isArchived: Bool
        let kind: Kind
        let name: String
        let ord: String
        let parentId: Int?
        let paused: Bool?
        let planCents: Int?
        let rollover: Rollover?
        let sortOrder: Int
        let tag: Tag?
    }

    struct CategoryUpdate: Codable, Equatable {
        enum Rollover: String, Codable, Equatable {
            case misc
            case savings
        }

        enum Tag: String, Codable, Equatable {
            case personal
            case business
            case mixed
        }

        let isArchived: Bool?
        let name: String?
        let parentId: Int?
        let paused: Bool?
        let planCents: Int?
        let rollover: Rollover?
        let sortOrder: Int?
        let tag: Tag?
    }

    struct ChargeNowResponse: Codable, Equatable {
        let nextChargeDate: BusinessDate
        let plannedId: Int
    }

    struct ChatBindRequest: Codable, Equatable {
        let tgChatId: Int
        let tgUserId: Int
    }

    struct ChatHistoryResponse: Codable, Equatable {
        let messages: [Gen.ChatMessageRead]
    }

    struct ChatMessageRead: Codable, Equatable {
        let content: String?
        let createdAt: String
        let id: Int
        let role: String
        let toolName: String?
    }

    struct ChatRequest: Codable, Equatable {
        let message: String
    }

    struct ConsentGrantResponse: Codable, Equatable {
        let pdnConsentAt: String
        let policyVersion: String
    }

    struct ConsentRevokeResponse: Codable, Equatable {
        let pdnConsentAt: String?
        let revoked: Bool
    }

    struct DepositCreate: Codable, Equatable {
        let accountId: Int
        let amountCents: Int
        let goalId: Int?
    }

    struct DepositResponse: Codable, Equatable {
        let accountId: Int?
        let amountCents: Int
        let categoryId: Int
        let description: String?
        let id: Int
        let txDate: BusinessDate
    }

    struct DevExchangeRequest: Codable, Equatable {
        let secret: String
    }

    struct DevExchangeResponse: Codable, Equatable {
        let tgUserId: Int
        let token: String
    }

    struct ForecastResponse: Codable, Equatable {
        let mode: String
        let monthlyAvgCents: Int?
        let periodEnd: String?
        let periodsCount: Int?
        let plannedExpenseCents: Int?
        let plannedIncomeCents: Int?
        let projectedEndBalanceCents: Int?
        let requestedPeriods: Int?
        let startingBalanceCents: Int?
        let totalNetCents: Int?
    }

    struct GoalCreate: Codable, Equatable {
        let due: BusinessDate?
        let name: String
        let targetCents: Int
    }

    struct GoalRead: Codable, Equatable {
        let createdAt: Date
        let currentCents: Int
        let due: BusinessDate?
        let id: Int
        let name: String
        let targetCents: Int
    }

    struct GoalUpdate: Codable, Equatable {
        let due: BusinessDate?
        let name: String?
        let targetCents: Int?
    }

    struct MePatchV10: Codable, Equatable {
        let incomeCents: Int?
    }

    struct MeV10Response: Codable, Equatable {
        let aiSpendCents: Int
        let aiSpendingCapCents: Int
        let chatIdKnown: Bool
        let cycleStartDay: Int
        let incomeCents: Int?
        let onboardedAt: String?
        let role: String
        let tgChatId: Int?
        let tgUserId: Int
    }

    struct ObservationResponse: Codable, Equatable {
        let generatedAt: Date
        let text: String
    }

    struct OnboardingAccountItem: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case card
            case cash
            case savings
        }

        let balanceCents: Int?
        let bank: String
        let kind: Kind
        let mask: String?
        let primary: Bool?
    }

    struct OnboardingGoalItem: Codable, Equatable {
        let due: BusinessDate?
        let name: String
        let targetCents: Int
    }

    struct OnboardingSavingsConfigItem: Codable, Equatable {
        let base: Int?
        let roundupEnabled: Bool?
    }

    struct OnboardingV10Body: Codable, Equatable {
        let accounts: [Gen.OnboardingAccountItem]
        let categoryPlans: [String: Int]
        let goal: Gen.OnboardingGoalItem?
        let incomeCents: Int
        let savingsConfig: Gen.OnboardingSavingsConfigItem?
    }

    struct OnboardingV10Response: Codable, Equatable {
        let accountIds: [Int]
        let categoryIdsByCode: [String: Int]
        let goalId: Int?
        let incomeCents: Int
        let onboardedAt: String
        let savingsCategoryId: Int
        let savingsConfig: Gen.OnboardingV10SavingsConfigRead
        let userId: Int
    }

    struct OnboardingV10SavingsConfigRead: Codable, Equatable {
        let roundupBase: Int
        let roundupEnabled: Bool
    }

    struct OverspendItem: Codable, Equatable {
        let actualCents: Int
        let categoryId: Int
        let name: String
        let overspendPct: Double?
        let plannedCents: Int
    }

    struct PaymentCreateRequest: Codable, Equatable {
        let amountCents: Int
        let description: String?
        let returnUrl: String
    }

    struct PaymentCreateResponse: Codable, Equatable {
        let confirmationUrl: String
        let paymentId: Int
    }

    struct PaymentRead: Codable, Equatable {
        let amountCents: Int
        let createdAt: Date
        let id: Int
        let paidAt: Date?
        let refundedAt: Date?
        let status: String
        let yookassaPaymentId: String
    }

    struct PeriodRead: Codable, Equatable {
        enum Status: String, Codable, Equatable {
            case active
            case closed
        }

        let closedAt: Date?
        let endingBalanceCents: Int?
        let id: Int
        let periodEnd: BusinessDate
        let periodStart: BusinessDate
        let startingBalanceCents: Int
        let status: Status
    }

    struct PlanMonthItem: Codable, Equatable {
        let categoryId: Int
        let planCents: Int
    }

    struct PlanMonthPatch: Codable, Equatable {
        let plans: [Gen.PlanMonthItem]
    }

    struct PlanMonthResponse: Codable, Equatable {
        let categories: [Gen.CategoryRead]
    }

    struct PlannedCreate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
        }

        let amountCents: Int
        let categoryId: Int
        let description: String?
        let kind: Kind
        let plannedDate: BusinessDate?
    }

    struct PlannedRead: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
        }

        enum Source: String, Codable, Equatable {
            case template
            case manual
            case subscriptionAuto = "subscription_auto"
        }

        let amountCents: Int
        let categoryId: Int
        let description: String?
        let id: Int
        let kind: Kind
        let periodId: Int
        let plannedDate: BusinessDate?
        let source: Source
        let subscriptionId: Int?
    }

    struct PlannedUpdate: Codable, Equatable {
        enum Kind: String, Codable, Equatable {
            case expense
            case income
        }

        let amountCents: Int?
        let categoryId: Int?
        let description: String?
        let kind: Kind?
        let plannedDate: BusinessDate?
    }

    struct SavingsConfigPatch: Codable, Equatable {
        let roundupBase: Int?
        let roundupEnabled: Bool?
    }

    struct SavingsConfigRead: Codable, Equatable {
        let roundupBase: Int
        let roundupEnabled: Bool
    }

    struct SavingsSnapshotResponse: Codable, Equatable {
        let config: Gen.SavingsConfigRead
        let goals: [Gen.GoalRead]
        let monthInCents: Int
        let totalCents: Int
    }

    struct SettingsRead: Codable, Equatable {
        let cycleStartDay: Int
        let enableAiCategorization: Bool
        let isBotBound: Bool
        let notifyDaysBefore: Int
    }

    struct SettingsUpdate: Codable, Equatable {
        let cycleStartDay: Int?
        let enableAiCategorization: Bool?
        let notifyDaysBefore: Int?
    }

    enum SubCycle: String, Codable, Equatable {
        case monthly
        case yearly
    }

    struct SubscriptionCancelResponse: Codable, Equatable {
        let status: String
    }

    struct SubscriptionCreate: Codable, Equatable {
        let accountId: Int?
        let amountCents: Int
        let categoryId: Int
        let cycle: Gen.SubCycle
        let dayOfMonth: Int?
        let isActive: Bool?
        let name: String
        let nextChargeDate: BusinessDate
        let notifyDaysBefore: Int?
    }

    struct SubscriptionPostResponse: Codable, Equatable {
        let postedAt: String
        let subscriptionId: Int
        let txnId: Int
    }

    struct SubscriptionRead: Codable, Equatable {
        let periodEnd: BusinessDate
        let periodStart: BusinessDate
        let status: String
        let tier: String
    }

    struct SubscriptionReadV10: Codable, Equatable {
        let accountId: Int?
        let amountCents: Int
        let category: Gen.CategoryRead
        let categoryId: Int
        let cycle: Gen.SubCycle
        let dayOfMonth: Int?
        let id: Int
        let isActive: Bool
        let name: String
        let nextChargeDate: BusinessDate
        let notifyDaysBefore: Int
        let postedTxnId: Int?
    }

    struct SubscriptionUpdate: Codable, Equatable {
        let accountId: Int?
        let amountCents: Int?
        let categoryId: Int?
        let cycle: Gen.SubCycle?
        let dayOfMonth: Int?
        let isActive: Bool?
        let name: String?
        let nextChargeDate: BusinessDate?
        let notifyDaysBefore: Int?
    }

    struct SuggestCategoryResponse: Codable, Equatable {
        let categoryId: Int?
        let confidence: Double
        let name: String?
    }

    struct TaxReserveResponse: Codable, Equatable {
        let businessIncomeCents: Int
        let incomeCents: Int
        let periodEnd: BusinessDate
        let periodStart: BusinessDate
        let regime: String
        let reserveRecommendedCents: Int
        let taxOwedCents: Int
    }

    struct TemplateItemRead: Codable, Equatable {
        let amountCents: Int
        let categoryId: Int
        let dayOfPeriod: Int?
        let description: String?
        let id: Int
        let sortOrder: Int
    }

    struct TierResponse: Codable, Equatable {
        let isTrialActive: Bool
        let proActiveUntil: String?
        let tier: String
        let trialEndsAt: String?
    }

    struct TopCategoriesResponse: Codable, Equatable {
        let items: [Gen.TopCategoryItem]
    }

    struct TopCategoryItem: Codable, Equatable {
        let actualCents: Int
        let categoryId: Int
        let name: String
        let plannedCents: Int
    }

    struct TopOverspendResponse: Codable, Equatable {
        let items: [Gen.OverspendItem]
    }

    struct TrendPoint: Codable, Equatable {
        let expenseCents: Int
        let incomeCents: Int
        let periodLabel: String
    }

    struct TrendResponse: Codable, Equatable {
        let points: [Gen.TrendPoint]
    }

    struct UsageBucket: Codable, Equatable {
        let cachedTokens: Int
        let completionTokens: Int
        let estCostUsd: Double
        let promptTokens: Int
        let requests: Int
        let totalTokens: Int
    }

    struct UsageResponse: Codable, Equatable {
        let bufferMax: Int
        let bufferSize: Int
        let capCents: Int?
        let remainingCents: Int?
        let sessionTotal: Gen.UsageBucket
        let spentCentsPeriod: Int?
        let today: Gen.UsageBucket
    }
}
