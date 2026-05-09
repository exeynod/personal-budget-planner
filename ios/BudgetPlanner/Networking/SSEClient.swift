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
               let delta = dict["delta"] as? String {
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
               let name = dict["name"] as? String {
                let argsAny = dict["arguments"] as? [String: Any] ?? [:]
                let args = argsAny.mapValues { AnyCodable($0) }
                self = .toolCall(name: name, arguments: args)
            } else {
                self = .unknown
            }
        case "tool_result":
            if let dict = env.data?.value as? [String: Any],
               let name = dict["name"] as? String {
                let resultAny = dict["result"] as? [String: Any] ?? [:]
                let result = resultAny.mapValues { AnyCodable($0) }
                self = .toolResult(name: name, result: result)
            } else {
                self = .unknown
            }
        case "propose":
            if let dict = env.data?.value as? [String: Any],
               let kindStr = dict["kind"] as? String,
               let kind = ProposeKind(rawValue: kindStr) {
                let amount = (dict["amount_rub"] as? Double)
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
                      let msg = dict["message"] as? String {
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
    static func stream(message: String) -> AsyncThrowingStream<SSEEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    guard let url = URL(string: APIClient.shared.baseURL.absoluteString + "api/v1/ai/chat")
                    else { throw APIError.invalidURL }

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
                        if http.statusCode == 401 || http.statusCode == 403 {
                            throw APIError.unauthorized
                        }
                        if http.statusCode == 429 {
                            let retry = http.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init)
                            throw APIError.rateLimited(retryAfter: retry)
                        }
                        throw APIError.serverError(http.statusCode, "")
                    }

                    let decoder = JSONDecoder()
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let payload = String(line.dropFirst(6))
                        guard !payload.isEmpty else { continue }
                        if let data = payload.data(using: .utf8),
                           let event = try? decoder.decode(SSEEvent.self, from: data) {
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
