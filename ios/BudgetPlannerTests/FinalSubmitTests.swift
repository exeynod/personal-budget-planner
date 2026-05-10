// Phase 24-09: XCTest specs for Final submit handler — atomic
// /onboarding/complete flow with 200 / 409 / 422 / network branches.
//
// Symmetric to web Plan 24-08 vitest suite
// (frontend/src/screensV10/Onboarding/__tests__/Final.test.tsx). We don't
// drive the SwiftUI view tree; instead we drive the pure submit handler
// (`OnboardingSubmitter`) which receives an injected
// `submit: (OnboardingAPIBody) async throws -> OnboardingAPIResponse`
// closure to fake network behaviour deterministically.
//
// Coverage:
//   1. JSON wire body — keys are snake_case, goal omitted when nil,
//      goal present when set, account fields present.
//   2. 200 path: clearDraft() called; onComplete fired with response.
//   3. 409 path: clearDraft() called BEFORE onComplete(nil)
//      (T-24-09-04 logic-flaw: never observe stale draft mid-transition).
//   4. 422 path: draft preserved; onComplete NOT called; errorMsg set.
//   5. Replay guard (T-24-09-02): rapid double-submit dispatches once.
//
// Persistence isolated via fresh UserDefaults suite per test.

import XCTest

@testable import BudgetPlanner

@MainActor
final class FinalSubmitTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "test.onboarding.v10.final"

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

    // MARK: - Helpers

    /// Build a fully-populated flow + persisted draft for a typical
    /// happy-path submit.
    private func makeFlow(withGoal: Bool = true) -> OnboardingFlow {
        let flow = OnboardingFlow(defaults: defaults)
        flow.setIncome(80_000_00)
        flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
        flow.addAccount(bank: "СБЕР", kind: .card, balanceCents: 1_200_000)
        flow.next()  // → 2
        flow.next()  // → 3
        flow.next()  // → 4
        if withGoal {
            flow.setGoal(
                OnboardingGoal(name: "Подушка", targetCents: 200_000_00, due: nil)
            )
        }
        flow.next()  // → 5
        return flow
    }

    private func makeStubResponse() -> OnboardingAPIResponse {
        // Decode from JSON since OnboardingAPIResponse properties are `let`.
        let json = """
            {
              "user_id": 1,
              "income_cents": 8000000,
              "account_ids": [10, 11],
              "category_ids_by_code": {"food": 100, "cafe": 101},
              "savings_category_id": 200,
              "goal_id": 300,
              "savings_config": {"roundup_enabled": false, "roundup_base": 10},
              "onboarded_at": "2026-05-10T00:00:00Z"
            }
            """
        let data = json.data(using: .utf8)!
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(OnboardingAPIResponse.self, from: data)
    }

    /// Encode a body using APIClient's strategy (snake_case) for assertion.
    private func encodeWireBody(_ body: OnboardingAPIBody) throws -> [String: Any] {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let data = try enc.encode(body)
        let any = try JSONSerialization.jsonObject(with: data, options: [])
        return any as? [String: Any] ?? [:]
    }

    // MARK: - Wire body shape

    func testToAPIBodyOmitsNilGoal() throws {
        let flow = makeFlow(withGoal: false)
        let body = flow.toAPIBody()
        let dict = try encodeWireBody(body)
        XCTAssertNil(dict["goal"], "goal key should be absent when goal is nil")
    }

    func testToAPIBodyIncludesGoalWhenSet() throws {
        let flow = makeFlow(withGoal: true)
        let body = flow.toAPIBody()
        let dict = try encodeWireBody(body)
        let goalDict = dict["goal"] as? [String: Any]
        XCTAssertNotNil(goalDict, "goal key must be present when set")
        XCTAssertEqual(goalDict?["name"] as? String, "Подушка")
        XCTAssertEqual(goalDict?["target_cents"] as? Int, 200_000_00)
    }

    func testToAPIBodyMatchesServerSchema() throws {
        let flow = makeFlow(withGoal: true)
        let body = flow.toAPIBody()
        let dict = try encodeWireBody(body)

        // Top-level keys (savings_config absent because flow has no savingsConfig).
        XCTAssertNotNil(dict["income_cents"])
        XCTAssertNotNil(dict["accounts"])
        XCTAssertNotNil(dict["category_plans"])
        XCTAssertNotNil(dict["goal"])
        XCTAssertNil(dict["savings_config"])

        // No `step` leak (UI-only field).
        XCTAssertNil(dict["step"])

        // accounts[0] keys.
        let accounts = dict["accounts"] as? [[String: Any]] ?? []
        XCTAssertEqual(accounts.count, 2)
        let acc0 = accounts[0]
        XCTAssertNotNil(acc0["bank"])
        XCTAssertTrue(acc0.keys.contains("mask"))
        XCTAssertNotNil(acc0["kind"])
        XCTAssertNotNil(acc0["balance_cents"])
        XCTAssertNotNil(acc0["primary"])
        XCTAssertNil(acc0["balanceCents"], "camelCase must not leak through encoder")
    }

    // MARK: - 200 path

    func testSubmitSuccessClearsDraftAndCallsOnComplete() async {
        let flow = makeFlow(withGoal: true)
        // Sanity: draft exists before submit.
        XCTAssertNotNil(defaults.data(forKey: OnboardingFlow.draftKey))

        let stub = makeStubResponse()
        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in stub }
        )

        var received: OnboardingAPIResponse??  // double Optional: outer is "was called"
        await submitter.start { received = $0 }

        XCTAssertNotNil(received, "onComplete must fire on 200")
        let inner = received!  // unwrap "was called"
        XCTAssertNotNil(inner, "200 must deliver a non-nil response")
        XCTAssertEqual(inner?.userId, 1)

        // Draft cleared.
        XCTAssertNil(defaults.data(forKey: OnboardingFlow.draftKey))
        XCTAssertNil(submitter.errorMessage)
    }

    // MARK: - 409 path (already onboarded)

    func testSubmit409ClearsDraftAndDelaysOnCompleteNil() async {
        let flow = makeFlow(withGoal: true)
        XCTAssertNotNil(defaults.data(forKey: OnboardingFlow.draftKey))

        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in throw APIError.conflict("already onboarded") },
            // Tests use 0 ms delay so we don't pause the test runner.
            conflictDelay: 0
        )

        var received: OnboardingAPIResponse??
        await submitter.start { received = $0 }

        // T-24-09-04: draft cleared BEFORE onComplete fires (we can only
        // observe the post-call state, but the order is enforced by the
        // implementation; the test asserts both side-effects landed).
        XCTAssertNil(defaults.data(forKey: OnboardingFlow.draftKey))
        XCTAssertNotNil(received, "onComplete must fire after 409")
        XCTAssertNil(received!, "409 must deliver nil to caller")
        XCTAssertEqual(submitter.errorMessage, "вы уже завершили онбординг")
    }

    // MARK: - 422 path (validation)

    func testSubmit422KeepsDraftAndDoesNotCallOnComplete() async {
        let flow = makeFlow(withGoal: true)
        let originalBlob = defaults.data(forKey: OnboardingFlow.draftKey)
        XCTAssertNotNil(originalBlob)

        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in throw APIError.unprocessable("plan exceeds income") }
        )

        var received: OnboardingAPIResponse??
        await submitter.start { received = $0 }

        // Draft preserved.
        XCTAssertEqual(defaults.data(forKey: OnboardingFlow.draftKey), originalBlob)
        XCTAssertNil(received, "onComplete must NOT fire on 422")
        XCTAssertEqual(
            submitter.errorMessage,
            "Проверьте план: сумма не может превышать доход"
        )
    }

    // MARK: - Network / unknown errors

    func testSubmitNetworkErrorKeepsDraftAndShowsGenericError() async {
        let flow = makeFlow(withGoal: true)
        let originalBlob = defaults.data(forKey: OnboardingFlow.draftKey)

        struct NotAnAPIError: Error {}
        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in throw NotAnAPIError() }
        )

        var received: OnboardingAPIResponse??
        await submitter.start { received = $0 }

        XCTAssertEqual(defaults.data(forKey: OnboardingFlow.draftKey), originalBlob)
        XCTAssertNil(received)
        XCTAssertEqual(submitter.errorMessage, "Ошибка сети, попробуйте ещё раз")
    }

    // MARK: - Replay guard (T-24-09-02)

    func testReplayGuardSubmitsOnce() async {
        let flow = makeFlow(withGoal: true)
        let stub = makeStubResponse()

        // Counter on a class so the closure sees mutations.
        final class Counter: @unchecked Sendable { var n = 0 }
        let counter = Counter()

        let submitter = OnboardingSubmitter(
            flow: flow,
            submit: { _ in
                counter.n += 1
                return stub
            }
        )

        // Two concurrent starts should still dispatch the network call once.
        async let a: Void = submitter.start { _ in }
        async let b: Void = submitter.start { _ in }
        _ = await (a, b)

        XCTAssertEqual(counter.n, 1, "replay guard must coalesce concurrent starts")
    }
}
