// Phase 27-07 Task 2 — V10 AI screen ViewModel.
//
// Symmetric to web Plan 27-02 AiMount. Two responsibilities:
//   1. Load the rule-engine observation on first appear (Phase 27-01 endpoint).
//   2. Stream chat responses through the v0.6 SSE infrastructure
//      (`AIChatAPI.stream(message:)` → `AsyncThrowingStream<SSEEvent, Error>`).
//
// State machine (`Status`):
//   .idle      — pre-load, nothing rendered yet.
//   .loading   — observation fetch in flight; chips still render in the view.
//   .ready     — observation fetched (or failed gracefully) — view shows
//                obs-text or obs-error, chips always visible.
//   .error(_)  — terminal load failure (only used if some unrecoverable bug
//                surfaces; observation failures don't transition here, they
//                set `observationError` and remain `.ready`).
//
// Threat-model:
//   - T-27-07-02 (DoS chip-spam) — `if isStreaming return` gate at top of send().
//   - Re-entrancy on observation load — `inFlight` guard.
//
// Active-state messages use a small `Message` value type with a stable id so
// SwiftUI list diffing and the typing-indicator targeting work reliably.

import Foundation
import Observation

@MainActor
@Observable
final class AiV10ViewModel {

    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    enum Role: String, Equatable { case user, ai }

    struct Message: Identifiable, Equatable {
        let id: String
        let role: Role
        var text: String
    }

    // MARK: - Published state (observed by AiV10View)

    var status: Status = .idle
    var observation: String? = nil
    var observationGeneratedAt: Date? = nil
    var observationError: String? = nil
    var messages: [Message] = []
    var isStreaming: Bool = false
    var input: String = ""

    // MARK: - Internals

    private var inFlight: Bool = false
    private var idCounter: Int = 0

    private func nextId(_ prefix: String) -> String {
        idCounter += 1
        return "\(prefix)-\(Int(Date().timeIntervalSince1970 * 1000))-\(idCounter)"
    }

    // MARK: - Observation load

    /// Fetch the rule-engine observation. Re-entrancy is guarded — a second
    /// call while a fetch is in flight is a no-op. On error the screen still
    /// becomes `.ready` so the user can use the chips and composer (chips
    /// fallback contract per plan §<must_haves>).
    func loadObservation() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        do {
            let dto = try await AIObservationAPI.fetch()
            observation = dto.text
            observationGeneratedAt = dto.generatedAt
            observationError = nil
        } catch {
            observation = nil
            observationError = "Не удалось загрузить наблюдение"
        }
        status = .ready
    }

    // MARK: - Send (SSE chat)

    /// Append a user message + empty AI bubble, then drive `AIChatAPI.stream`.
    /// `isStreaming` gate prevents double-fire (T-27-07-02 mitigation).
    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isStreaming else { return }

        messages.append(Message(id: nextId("u"), role: .user, text: trimmed))
        let aiId = nextId("a")
        messages.append(Message(id: aiId, role: .ai, text: ""))
        // Clear composer if this came from the input field.
        if input.trimmingCharacters(in: .whitespacesAndNewlines) == trimmed {
            input = ""
        }
        isStreaming = true

        do {
            for try await event in AIChatAPI.stream(message: trimmed) {
                switch event {
                case .messageDelta(let delta):
                    appendToAi(aiId, delta)
                case .messageComplete(let content, _):
                    setAi(aiId, content)
                case .error(let msg):
                    appendToAi(aiId, " ⚠ \(msg)")
                case .toolCall, .toolResult, .propose, .usage, .done, .unknown:
                    // V10 shell defers tool/proposal UI to a future polish plan.
                    break
                }
            }
        } catch APIError.unauthorized {
            appendToAi(aiId, " ⚠ Сессия истекла")
        } catch APIError.rateLimited(let retry) {
            appendToAi(aiId, " ⚠ Лимит запросов. Повторите через \(retry ?? 60) сек.")
        } catch {
            appendToAi(aiId, " ⚠ Ошибка")
        }

        isStreaming = false
    }

    /// Convenience for chip taps — same path as composer submit.
    func sendChip(_ chip: String) async {
        await send(chip)
    }

    // MARK: - Mutators

    private func appendToAi(_ id: String, _ text: String) {
        guard let idx = messages.firstIndex(where: { $0.id == id }) else { return }
        var msg = messages[idx]
        msg.text += text
        messages[idx] = msg
    }

    private func setAi(_ id: String, _ text: String) {
        guard let idx = messages.firstIndex(where: { $0.id == id }) else { return }
        var msg = messages[idx]
        msg.text = text
        messages[idx] = msg
    }
}
