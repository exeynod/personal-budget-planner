// Phase 27-11 Task 1 (TDD RED → GREEN): unit tests for MgmtHubViewModel.
//
// Verifies the owner-gate state machine that decides whether the
// «05 ДОСТУП» row is visible. Mirrors the web Plan 27-06 owner-gate
// fail-closed pattern: default isOwner = false; only flips true when
// /me succeeds AND returns role == "owner". Any error path leaves the
// flag false (T-27-11-01 mitigation — defence-in-depth atop the
// backend require_owner dep).
//
// Logic-level only — the SwiftUI view tree is NOT introspected (XCUI
// flows are deferred to Phase 28 acceptance per project policy).

import XCTest

@testable import BudgetPlanner

@MainActor
private func makeMe(role: String) -> MeV10Response {
    MeV10Response(
        tgUserId: 1,
        tgChatId: 100,
        cycleStartDay: 1,
        onboardedAt: "2026-05-10T12:00:00Z",
        chatIdKnown: true,
        role: role,
        aiSpendCents: 0,
        aiSpendingCapCents: 100_00,
        incomeCents: 80_000_00
    )
}

/// Test fake for the MeV10API. Configurable to return a stub response or
/// throw. (Previously shared from OnboardingMountTests, inlined here after
/// the V10 onboarding-mount tests were removed.)
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

@MainActor
final class MgmtHubTests: XCTestCase {
    private var originalShared: (any MeV10APIClient)!

    override func setUp() {
        super.setUp()
        originalShared = MeV10API.shared
    }

    override func tearDown() {
        MeV10API.shared = originalShared
        super.tearDown()
    }

    // MARK: - Default state

    func testInitialIsOwnerIsFalse() {
        let model = MgmtHubViewModel()
        XCTAssertFalse(model.isOwner, "fail-closed: isOwner must default to false")
    }

    // MARK: - Success: role=owner → isOwner = true

    func testLoadFlipsIsOwnerWhenRoleIsOwner() async {
        MeV10API.shared = FakeMeAPIClient(mode: .success(makeMe(role: "owner")))
        let model = MgmtHubViewModel()

        await model.load()

        XCTAssertTrue(model.isOwner, "role=='owner' must flip isOwner to true")
    }

    // MARK: - Success: role!=owner → isOwner stays false

    func testLoadKeepsIsOwnerFalseWhenRoleIsMember() async {
        MeV10API.shared = FakeMeAPIClient(mode: .success(makeMe(role: "member")))
        let model = MgmtHubViewModel()

        await model.load()

        XCTAssertFalse(model.isOwner, "role!='owner' must keep isOwner=false")
    }

    // MARK: - Failure: error → isOwner stays false (fail-closed)

    func testLoadSilentOnErrorKeepsIsOwnerFalse() async {
        MeV10API.shared = FakeMeAPIClient(
            mode: .failure(APIError.network(URLError(.notConnectedToInternet)))
        )
        let model = MgmtHubViewModel()

        await model.load()

        XCTAssertFalse(model.isOwner, "fetch failure must leave isOwner=false (fail-closed)")
    }

    // MARK: - Re-entrance guard (concurrent loads coalesce)

    func testConcurrentLoadsCoalesce() async {
        // Slow fake so two concurrent calls overlap.
        final class SlowOwnerFake: MeV10APIClient, @unchecked Sendable {
            var fetchCount = 0
            func fetchMeV10() async throws -> MeV10Response {
                fetchCount += 1
                try? await Task.sleep(nanoseconds: 30_000_000)  // 30 ms
                return MeV10Response(
                    tgUserId: 1, tgChatId: nil, cycleStartDay: 1,
                    onboardedAt: "2026-05-10T12:00:00Z",
                    chatIdKnown: true, role: "owner",
                    aiSpendCents: 0, aiSpendingCapCents: 0, incomeCents: nil
                )
            }
        }
        let fake = SlowOwnerFake()
        MeV10API.shared = fake
        let model = MgmtHubViewModel()

        async let a: Void = model.load()
        async let b: Void = model.load()
        _ = await (a, b)

        XCTAssertEqual(fake.fetchCount, 1, "concurrent loads must coalesce via in-flight guard")
        XCTAssertTrue(model.isOwner)
    }
}
