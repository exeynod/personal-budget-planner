import Foundation

enum SSEEvent: Decodable {
    case messageDelta(String)
    case messageComplete(content: String, role: String)
    case toolCall(name: String, arguments: [String: AnyCodable])
    case toolResult(name: String, result: [String: AnyCodable])
    case propose(kind: ProposeKind, amountRub: Double, categoryId: Int?, description: String?, txDate: String?)
    case usage([String: AnyCodable])
    case error(String)
    case done
    case unknown

    enum ProposeKind: String { case actual, planned }

    private struct Envelope: Decodable {
        let type: String
        let data: AnyCodable?
    }

    init(from decoder: Decoder) throws {
        let env = try Envelope(from: decoder)

        switch env.type {
        case "message_delta":
            if let dict = env.data?.value as? [String: Any],
                let delta = dict["delta"] as? String
            {
                self = .messageDelta(delta)
            } else {
                self = .unknown
            }
        case "message_complete":
            if let dict = env.data?.value as? [String: Any] {
                let content = dict["content"] as? String ?? ""
                let role = dict["role"] as? String ?? "assistant"
                self = .messageComplete(content: content, role: role)
            } else {
                self = .unknown
            }
        case "tool_call":
            if let dict = env.data?.value as? [String: Any],
                let name = dict["name"] as? String
            {
                let argsAny = dict["arguments"] as? [String: Any] ?? [:]
                let args = argsAny.mapValues { AnyCodable($0) }
                self = .toolCall(name: name, arguments: args)
            } else {
                self = .unknown
            }
        case "tool_result":
            if let dict = env.data?.value as? [String: Any],
                let name = dict["name"] as? String
            {
                let resultAny = dict["result"] as? [String: Any] ?? [:]
                let result = resultAny.mapValues { AnyCodable($0) }
                self = .toolResult(name: name, result: result)
            } else {
                self = .unknown
            }
        case "propose":
            if let dict = env.data?.value as? [String: Any],
                let kindStr = dict["kind"] as? String,
                let kind = ProposeKind(rawValue: kindStr)
            {
                let amount =
                    (dict["amount_rub"] as? Double)
                    ?? Double(dict["amount_rub"] as? Int ?? 0)
                let categoryId = dict["category_id"] as? Int
                let description = dict["description"] as? String
                let txDate = dict["tx_date"] as? String
                self = .propose(
                    kind: kind, amountRub: amount, categoryId: categoryId,
                    description: description, txDate: txDate
                )
            } else {
                self = .unknown
            }
        case "usage":
            if let dict = env.data?.value as? [String: Any] {
                self = .usage(dict.mapValues { AnyCodable($0) })
            } else {
                self = .unknown
            }
        case "error":
            if let s = env.data?.value as? String {
                self = .error(s)
            } else if let dict = env.data?.value as? [String: Any],
                let msg = dict["message"] as? String
            {
                self = .error(msg)
            } else {
                self = .error("Unknown error")
            }
        case "done":
            self = .done
        default:
            self = .unknown
        }
    }
}

@MainActor
enum AIChatAPI {
    /// Phase 71 (P0 fix): build the SSE chat URL the SAME way `APIClient`
    /// constructs REST URLs (`baseURL.appendingPathComponent("api/v1\(path)")`).
    ///
    /// The previous implementation concatenated `baseURL.absoluteString +
    /// "api/v1/ai/chat"`. `baseURL` carries NO trailing slash (default
    /// `URL(string: "http://localhost:8000")`, env `BACKEND_URL=http://host:8000`),
    /// so the concatenation produced `http://host:8000api/v1/ai/chat` — the `/`
    /// between port and `api` was missing → the request never reached the
    /// backend → generic «⚠️ Ошибка». `appendingPathComponent` inserts the path
    /// separator correctly whether or not `base` ends in a slash, so this is
    /// safe in both cases (verified by unit test).
    static func chatURL(base: URL) -> URL {
        base.appendingPathComponent("api/v1/ai/chat")
    }

    static func stream(message: String) -> AsyncThrowingStream<SSEEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let url = chatURL(base: APIClient.shared.baseURL)

                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    let token = APIClient.shared.bearerToken
                    if let token {
                        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    }

                    let body: [String: Any] = ["message": message]
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                        // P1-5 (T-67-05-02): split 401 vs 403 to mirror the final
                        // post-67-03 REST APIClient auth semantics. The AI chat
                        // stream is ALWAYS authed (no skipAuth path), so both a
                        // genuine 401 (expired token) and a 403 (broken/forbidden
                        // owner token) are auth failures that MUST trigger the
                        // global logout — otherwise an expired token in chat
                        // silently fails without re-auth.
                        if http.statusCode == 401 {
                            APIClient.shared.onUnauthenticated?()
                            throw APIError.unauthorized
                        }
                        if http.statusCode == 403 {
                            APIClient.shared.onUnauthenticated?()
                            throw APIError.forbidden("")
                        }
                        if http.statusCode == 429 {
                            let retry = http.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init)
                            throw APIError.rateLimited(retryAfter: retry)
                        }
                        // Phase 71 (UX-71): a 402 on the chat stream is the
                        // require_pro paywall (body `{"detail":{"error":
                        // "PRO_TIER_REQUIRED",...}}`). We mirror the REST policy
                        // (ErrorHandling.default) and surface it as
                        // `serverError(402, …)` — NO logout, NO rate-limit. The
                        // view layer branches on `APIError.isProTierRequired` to
                        // show the Pro-tier state instead of the generic error.
                        //
                        // Phase 71 follow-up: throw `serverError(402, "")`
                        // DIRECTLY without draining `bytes.lines`. Draining the
                        // body of the already-received 402 response was fragile —
                        // the async iteration can itself throw (cancellation /
                        // URLError on the short, completed stream body), and that
                        // DIFFERENT error then propagated out of the VM's
                        // `for try await` loop into the generic `catch`, so
                        // `isProTierRequired` was never consulted and the user
                        // saw «⚠️ Ошибка». `APIError.isProTierRequired` already
                        // returns true for `code == 402` alone, so the body /
                        // PRO_TIER_REQUIRED marker is unnecessary for
                        // classification — and the detail is never rendered anyway
                        // (fixed-copy / no-leak policy, 67-03/67-05).
                        if http.statusCode == 402 {
                            throw APIError.serverError(402, "")
                        }
                        throw APIError.serverError(http.statusCode, "")
                    }

                    let decoder = JSONDecoder()
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let payload = String(line.dropFirst(6))
                        guard !payload.isEmpty else { continue }
                        if let data = payload.data(using: .utf8),
                            let event = try? decoder.decode(SSEEvent.self, from: data)
                        {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

@MainActor
enum AIHistoryAPI {
    static func history() async throws -> ChatHistoryResponse {
        try await APIClient.shared.request("GET", "/ai/history")
    }

    static func clear() async throws {
        try await APIClient.shared.requestVoid("DELETE", "/ai/conversation")
    }
}

struct ChatHistoryResponse: Decodable {
    let messages: [ChatMessageRecord]
}

struct ChatMessageRecord: Decodable, Identifiable, Equatable {
    let id: Int
    let role: String
    let content: String?
    let toolName: String?
    let createdAt: Date?
}
