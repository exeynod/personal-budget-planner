import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized  // 401/403 — Bearer rejected
    case forbidden(String)  // 403 detail
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

    /// Phase 67 Plan 05 (P1-3 / R1) — fixed Russian copy for user-facing
    /// banners. Unlike `errorDescription`, this NEVER interpolates
    /// server-supplied detail (`forbidden`/`conflict`/`unprocessable`/
    /// `serverError`) or raw underlying-error text — that text is an
    /// information leak (T-67-05-01 / IN-01) and a v06 fixed-copy violation.
    /// Raw errors belong only in `#if DEBUG print()`.
    var userFacingRu: String {
        switch self {
        case .unauthorized:
            return "Сессия истекла, войдите снова"
        // Phase 71 (UX-71): the SSE chat stream surfaces a paywall (402) as
        // `.serverError(402, …)` — see SSEClient. We deliberately KEEP the
        // generic fallback here (`serverError` → "Что-то пошло не так") so the
        // information-leak gate (test_serverError_mapsToGeneric) stays green:
        // the Pro-tier copy is owned by `proTierFacingRu` and the view layer
        // branches on `isProTierRequired`, not on `userFacingRu`.
        case .network:
            return "Нет связи с сервером"
        case .notFound:
            return "Не найдено"
        case .rateLimited:
            return "Слишком часто, попробуйте позже"
        case .forbidden:
            return "Доступ запрещён"
        case .conflict:
            return "Не удалось сохранить — конфликт данных"
        case .unprocessable:
            return "Проверьте введённые данные"
        case .invalidURL, .invalidResponse, .serverError, .decoding:
            return "Что-то пошло не так"
        }
    }

    /// Phase 71 (UX-71) — the paywall seam. A `require_pro` gate returns HTTP
    /// 402 with body `{"detail":{"error":"PRO_TIER_REQUIRED",...}}`. Both the
    /// REST policy (`ErrorHandling.default`) and the SSE chat stream
    /// (`SSEClient`) map that to `.serverError(402, …)`. This property lets the
    /// view layer distinguish a paywall from a genuine server failure WITHOUT
    /// re-introducing a per-call Bool flag.
    ///
    /// Detection is the 402 status code (402 is exclusively the require_pro
    /// gate in this app) OR the typed `PRO_TIER_REQUIRED` marker in the detail
    /// — belt-and-braces so a body-less 402 still classifies. The marker is
    /// matched, never rendered (no-leak policy, 67-03/67-05).
    var isProTierRequired: Bool {
        if case .serverError(let code, let detail) = self {
            return code == 402 || detail.contains("PRO_TIER_REQUIRED")
        }
        return false
    }

    /// Phase 71 (UX-71) — fixed RU copy for the Pro-tier paywall state. Like
    /// `userFacingRu`, this NEVER interpolates the server `detail` string; it is
    /// a constant. The view layer shows it only when `isProTierRequired`.
    static let proTierFacingRu = "Чат-ассистент доступен в Pro-тарифе"
}

extension Error {
    /// Phase 71 (UX-71) — route the paywall seam through the `Error` surface
    /// so view models can branch on any caught error.
    var isProTierRequired: Bool {
        (self as? APIError)?.isProTierRequired ?? false
    }
}

extension Error {
    /// Phase 67 Plan 05 (P1-3 / R1) — map any `Error` to fixed Russian copy.
    /// `APIError` routes through its `userFacingRu`; anything else collapses to
    /// the generic message so raw/PII error text never reaches the UI.
    var userFacingRu: String {
        (self as? APIError)?.userFacingRu ?? "Что-то пошло не так"
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
            self = .string(s)
            return
        }
        if let d = try? container.decode([String: AnyCodable].self) {
            self = .dictionary(d)
            return
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
        if let s = try? container.decode(String.self) {
            value = s
            return
        }
        if let i = try? container.decode(Int.self) {
            value = i
            return
        }
        if let d = try? container.decode(Double.self) {
            value = d
            return
        }
        if let b = try? container.decode(Bool.self) {
            value = b
            return
        }
        if container.decodeNil() {
            value = NSNull()
            return
        }
        if let arr = try? container.decode([AnyCodable].self) {
            value = arr.map { $0.value }
            return
        }
        if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
            return
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
