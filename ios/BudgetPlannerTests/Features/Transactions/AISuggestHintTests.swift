// Phase 64-02 (AI-V10-03) — unit specs for `AISuggestHint`.
//
// Exercises the debounce/cancel/silent logic via the injectable `suggest`
// closure seam (no network). debounce is set to .zero so tests don't wait the
// production 500ms. Coverage:
//  - q < minChars → closure NOT called, suggestion nil
//  - q >= minChars → closure called with trimmed q, suggestion = result
//  - stale-race: a slow first query is cancelled by a fast second → final
//    suggestion is the SECOND query (old slow response never overwrites)
//  - closure returns nil (403/error/category_id=nil) → suggestion nil (silent)
//  - clear() resets suggestion
//  - helper never mutates categoryId (it has no such API — structurally enforced)

import XCTest

@testable import BudgetPlanner

@MainActor
final class AISuggestHintTests: XCTestCase {

    // MARK: - Fixtures

    private func makeDTO(categoryId: Int?, name: String?, confidence: Double) -> SuggestCategoryDTO {
        var dict: [String: Any] = ["confidence": confidence]
        dict["category_id"] = categoryId ?? NSNull()
        dict["name"] = name ?? NSNull()
        let data = try! JSONSerialization.data(withJSONObject: dict)
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return try! dec.decode(SuggestCategoryDTO.self, from: data)
    }

    /// Spins the run loop until `condition` is true or a timeout elapses, so the
    /// detached debounce Task gets a chance to run on the main actor.
    private func waitUntil(
        timeout: TimeInterval = 2.0,
        _ condition: () -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            await Task.yield()
            try? await Task.sleep(for: .milliseconds(5))
        }
    }

    // MARK: - Below minimum length

    func test_belowMinChars_doesNotCallClosure_suggestionNil() async {
        var calls = 0
        let hint = AISuggestHint(debounce: .zero) { _ in
            calls += 1
            return nil
        }

        hint.descriptionChanged("ab")  // 2 chars < minChars 3
        await waitUntil(timeout: 0.3) { false }  // give the (non-)task time

        XCTAssertEqual(calls, 0)
        XCTAssertNil(hint.suggestion)
    }

    // MARK: - Happy path

    func test_atOrAboveMinChars_callsClosureWithTrimmedQ_setsSuggestion() async {
        var received: String?
        let dto = makeDTO(categoryId: 7, name: "Кафе", confidence: 0.9)
        let hint = AISuggestHint(debounce: .zero) { q in
            received = q
            return dto
        }

        hint.descriptionChanged("  кофе  ")  // trims to "кофе" (4 chars)
        await waitUntil { hint.suggestion != nil }

        XCTAssertEqual(received, "кофе")
        XCTAssertEqual(hint.suggestion?.categoryId, 7)
        XCTAssertEqual(hint.suggestion?.name, "Кафе")
    }

    // MARK: - Stale-request cancellation

    func test_fastSecondQuery_cancelsSlowFirst_finalSuggestionIsSecond() async {
        // First query awaits a gate that we never open until after the second
        // query has cancelled it; the second resolves immediately. The final
        // suggestion must be the SECOND query — the slow first must not win.
        let gate = AsyncGate()
        let slowDTO = makeDTO(categoryId: 1, name: "Старая", confidence: 0.9)
        let fastDTO = makeDTO(categoryId: 2, name: "Новая", confidence: 0.9)

        let hint = AISuggestHint(debounce: .zero) { q in
            if q == "перв" {
                await gate.wait()  // stale slow response
                return slowDTO
            }
            return fastDTO
        }

        hint.descriptionChanged("перв")
        await Task.yield()
        hint.descriptionChanged("втор")  // cancels the first Task
        await waitUntil { hint.suggestion?.categoryId == 2 }

        // Open the gate; the cancelled first Task's late return must not overwrite.
        await gate.open()
        await waitUntil(timeout: 0.3) { false }

        XCTAssertEqual(hint.suggestion?.categoryId, 2)
        XCTAssertEqual(hint.suggestion?.name, "Новая")
    }

    // MARK: - Silent failure

    func test_closureReturnsNil_suggestionStaysNil() async {
        let hint = AISuggestHint(debounce: .zero) { _ in nil }  // 403/error/below-threshold

        hint.descriptionChanged("такси")
        await waitUntil(timeout: 0.3) { false }

        XCTAssertNil(hint.suggestion)
    }

    // MARK: - clear()

    func test_clear_resetsSuggestion() async {
        let dto = makeDTO(categoryId: 5, name: "Транспорт", confidence: 0.8)
        let hint = AISuggestHint(debounce: .zero) { _ in dto }

        hint.descriptionChanged("метро")
        await waitUntil { hint.suggestion != nil }
        XCTAssertNotNil(hint.suggestion)

        hint.clear()
        XCTAssertNil(hint.suggestion)
    }

    // MARK: - clear() cancels the in-flight Task (WR-01)

    func test_clearWhileInFlight_cancelsTask_suggestionStaysNil() async {
        // Simulates the editor being dismissed (.onDisappear → aiHint.clear())
        // while an AI-suggest request is still in flight. The in-flight Task
        // must be cancelled and its late response must NOT write `suggestion`,
        // so no post-dismiss PII write/leak occurs.
        let gate = AsyncGate()
        let dto = makeDTO(categoryId: 9, name: "Кафе", confidence: 0.9)
        let hint = AISuggestHint(debounce: .zero) { _ in
            await gate.wait()  // hold the response open (in flight)
            return dto
        }

        hint.descriptionChanged("кофе")
        await Task.yield()
        hint.clear()  // dismiss-equivalent: cancel the in-flight Task

        // Release the held response; the cancelled Task must bail before write.
        await gate.open()
        await waitUntil(timeout: 0.3) { false }

        XCTAssertNil(hint.suggestion)
    }
}

/// Minimal async gate so the stale-request test can hold a stubbed response open
/// until after the second query has cancelled the first.
private actor AsyncGate {
    private var opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if opened { return }
        await withCheckedContinuation { cont in
            waiters.append(cont)
        }
    }

    func open() {
        opened = true
        for w in waiters { w.resume() }
        waiters.removeAll()
    }
}
