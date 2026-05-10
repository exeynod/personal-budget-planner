// Phase 24-11: Gateway tests for OnboardingMountView — verifies the
// state machine that decides whether to render OnboardingV10View
// (when /me returns onboarded_at == nil) or the home placeholder
// (when onboarded_at != nil), plus the error / reload paths.
//
// Symmetric to the web mount logic shipped in plan 24-10.
//
// Logic-level only — we drive the gateway state machine
// (`OnboardingMountModel`) which holds isLoading / me / loadError
// and exposes `reload()`. The SwiftUI view tree is NOT introspected.
// XCUI flows are deferred to Phase 28 acceptance per CONTEXT D-01.
//
// Persistence isolation: each draft-related test creates a fresh
// UserDefaults suite to avoid cross-test pollution.

import XCTest

@testable import BudgetPlanner

// MARK: - Fakes

/// Test fake for the MeV10API. Configurable to return success with a
/// stub response or to throw an error. The closure-based
/// `nextResponse` lets a single fake change behaviour between calls
/// (used by the reload-after-complete test).
@MainActor
final class FakeMeAPIClient: MeV10APIClient {
    enum Mode {
        case success(MeV10Response)
        case failure(Error)
    }

    var mode: Mode
    private(set) var fetchCount = 0

    init(mode: Mode) {
        self.mode = mode
    }

    func fetchMeV10() async throws -> MeV10Response {
        fetchCount += 1
        switch mode {
        case .success(let me):
            return me
        case .failure(let err):
            throw err
        }
    }
}

// MARK: - Helpers

@MainActor
private func makeMe(onboardedAt: String?) -> MeV10Response {
    MeV10Response(
        tgUserId: 1,
        tgChatId: 100,
        cycleStartDay: 1,
        onboardedAt: onboardedAt,
        chatIdKnown: true,
        role: "user",
        aiSpendCents: 0,
        aiSpendingCapCents: 100_00,
        incomeCents: onboardedAt == nil ? nil : 80_000_00
    )
}

@MainActor
final class OnboardingMountTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.mount"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: - Initial state

    func testInitialStateIsLoading() {
        let model = OnboardingMountModel(
            apiClient: FakeMeAPIClient(mode: .success(makeMe(onboardedAt: nil)))
        )
        XCTAssertTrue(model.isLoading, "initial state must be isLoading=true")
        XCTAssertNil(model.me)
        XCTAssertNil(model.loadError)
    }

    // MARK: - Success: not onboarded → render onboarding

    func testFetchSuccessRendersOnboardingWhenNotOnboarded() async {
        let fake = FakeMeAPIClient(mode: .success(makeMe(onboardedAt: nil)))
        let model = OnboardingMountModel(apiClient: fake)

        await model.reload()

        XCTAssertFalse(model.isLoading)
        XCTAssertNil(model.loadError)
        XCTAssertNotNil(model.me)
        XCTAssertNil(model.me?.onboardedAt, "non-onboarded state must surface as nil onboardedAt")
        XCTAssertEqual(fake.fetchCount, 1)
    }

    // MARK: - Success: onboarded → render home placeholder

    func testFetchSuccessRendersHomeWhenOnboarded() async {
        let fake = FakeMeAPIClient(
            mode: .success(makeMe(onboardedAt: "2026-05-10T12:00:00Z"))
        )
        let model = OnboardingMountModel(apiClient: fake)

        await model.reload()

        XCTAssertFalse(model.isLoading)
        XCTAssertNil(model.loadError)
        XCTAssertNotNil(model.me?.onboardedAt)
    }

    // MARK: - Failure → error state

    func testFetchFailureSetsErrorState() async {
        let fake = FakeMeAPIClient(mode: .failure(APIError.network(URLError(.notConnectedToInternet))))
        let model = OnboardingMountModel(apiClient: fake)

        await model.reload()

        XCTAssertFalse(model.isLoading)
        XCTAssertNil(model.me)
        XCTAssertNotNil(model.loadError, "loadError must be set on fetch failure")
        // T-24-11-03 / Plan rule: error copy is fixed russian, never echoes raw error.
        XCTAssertEqual(model.loadError, "не удалось загрузить профиль")
    }

    // MARK: - Reload after submit

    func testReloadAfterCompleteRefetches() async {
        let fake = FakeMeAPIClient(mode: .success(makeMe(onboardedAt: nil)))
        let model = OnboardingMountModel(apiClient: fake)

        await model.reload()
        XCTAssertNil(model.me?.onboardedAt)
        XCTAssertEqual(fake.fetchCount, 1)

        // Simulate post-submit: server now reports onboarded.
        fake.mode = .success(makeMe(onboardedAt: "2026-05-10T12:00:00Z"))
        await model.reload()

        XCTAssertNotNil(model.me?.onboardedAt, "second reload must observe the new server state")
        XCTAssertEqual(fake.fetchCount, 2)
    }

    // MARK: - Replay guard (T-24-11-03)

    func testConcurrentReloadsCoalesceToOneFetch() async {
        // Slow fake so the second concurrent call hits the in-flight guard.
        final class SlowFake: MeV10APIClient, @unchecked Sendable {
            var fetchCount = 0
            func fetchMeV10() async throws -> MeV10Response {
                fetchCount += 1
                try? await Task.sleep(nanoseconds: 30_000_000)  // 30 ms
                return MeV10Response(
                    tgUserId: 1, tgChatId: nil, cycleStartDay: 1,
                    onboardedAt: nil, chatIdKnown: false, role: "user",
                    aiSpendCents: 0, aiSpendingCapCents: 0, incomeCents: nil
                )
            }
        }
        let fake = SlowFake()
        let model = OnboardingMountModel(apiClient: fake)

        async let a: Void = model.reload()
        async let b: Void = model.reload()
        _ = await (a, b)

        XCTAssertEqual(fake.fetchCount, 1, "concurrent reloads must coalesce")
    }

    // MARK: - Draft clear on 200 (integration with OnboardingSubmitter)

    func testDraftClearOn200Submit() async {
        // Build a flow with the test defaults so we can verify draft state.
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
        XCTAssertNotNil(
            defaults.data(forKey: OnboardingFlow.draftKey),
            "draft must exist before submit"
        )

        // Stub a 200 response.
        let stubJson = """
            {
              "user_id": 1,
              "income_cents": 8000000,
              "account_ids": [10],
              "category_ids_by_code": {"food": 100},
              "savings_category_id": 200,
              "savings_config": {"roundup_enabled": false, "roundup_base": 10},
              "onboarded_at": "2026-05-10T00:00:00Z"
            }
            """
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        let stub = try! dec.decode(
            OnboardingAPIResponse.self,
            from: stubJson.data(using: .utf8)!
        )

        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in stub }
        )
        await submitter.start { _ in }

        XCTAssertNil(
            defaults.data(forKey: OnboardingFlow.draftKey),
            "draft must be cleared after 200 submit"
        )
    }

    // MARK: - Draft preserved on 422

    func testDraftKeptOn422() async {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        let originalBlob = defaults.data(forKey: OnboardingFlow.draftKey)
        XCTAssertNotNil(originalBlob)

        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in throw APIError.unprocessable("plan exceeds income") }
        )
        await submitter.start { _ in }

        XCTAssertEqual(
            defaults.data(forKey: OnboardingFlow.draftKey),
            originalBlob,
            "draft must be preserved after 422"
        )
    }
}
