import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized              // 401/403 — Bearer rejected
    case forbidden(String)         // 403 detail
    case notFound
    case conflict(String)
    case unprocessable(String)
    case rateLimited(retryAfter: Int?)
    case serverError(Int, String)
    case network(Error)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Некорректный URL запроса"
        case .invalidResponse: return "Сервер вернул некорректный ответ"
        case .unauthorized: return "Требуется повторная авторизация"
        case .forbidden(let detail): return "Доступ запрещён: \(detail)"
        case .notFound: return "Ресурс не найден"
        case .conflict(let detail): return "Конфликт: \(detail)"
        case .unprocessable(let detail): return "Ошибка валидации: \(detail)"
        case .rateLimited(let retryAfter):
            if let s = retryAfter { return "Слишком много запросов. Повторите через \(s) сек." }
            return "Слишком много запросов"
        case .serverError(let code, let detail): return "Ошибка сервера (\(code)): \(detail)"
        case .network(let err): return "Сетевая ошибка: \(err.localizedDescription)"
        case .decoding: return "Не удалось разобрать ответ сервера"
        }
    }
}

struct APIErrorBody: Decodable {
    let detail: APIErrorDetail
}

enum APIErrorDetail: Decodable {
    case string(String)
    case dictionary([String: AnyCodable])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) {
            self = .string(s); return
        }
        if let d = try? container.decode([String: AnyCodable].self) {
            self = .dictionary(d); return
        }
        self = .string("Unknown error")
    }

    var stringValue: String {
        switch self {
        case .string(let s): return s
        case .dictionary(let d):
            if let err = d["error"]?.value as? String { return err }
            return d.description
        }
    }
}

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) { value = s; return }
        if let i = try? container.decode(Int.self) { value = i; return }
        if let d = try? container.decode(Double.self) { value = d; return }
        if let b = try? container.decode(Bool.self) { value = b; return }
        if container.decodeNil() { value = NSNull(); return }
        if let arr = try? container.decode([AnyCodable].self) { value = arr.map { $0.value }; return }
        if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }; return
        }
        throw DecodingError.dataCorruptedError(
            in: container,
            debugDescription: "Cannot decode AnyCodable"
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let s as String: try container.encode(s)
        case let i as Int: try container.encode(i)
        case let d as Double: try container.encode(d)
        case let b as Bool: try container.encode(b)
        case is NSNull: try container.encodeNil()
        default: try container.encodeNil()
        }
    }
}
