import Foundation

/// Async URLSession-based API client.
///
/// Все запросы автоматически прикрепляют `Authorization: Bearer <token>` если
/// в Keychain есть валидный токен (через AuthStore). На 401/403 — token
/// инвалидируется на стороне AuthStore через onUnauthenticated callback.
@MainActor
@Observable
final class APIClient {
    static let shared = APIClient()

    var baseURL: URL
    private(set) var bearerToken: String?
    var onUnauthenticated: (() -> Void)?

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL? = nil, session: URLSession = .shared) {
        let envURL = ProcessInfo.processInfo.environment["BACKEND_URL"]
            .flatMap(URL.init(string:))
        self.baseURL = baseURL ?? envURL ?? URL(string: "http://localhost:8000")!
        self.session = session

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formats: [String] = [
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX",
                "yyyy-MM-dd'T'HH:mm:ssXXXXX",
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd",
            ]
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: str) { return d }
            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: str) { return d }
            for fmt in formats {
                let df = DateFormatter()
                df.locale = Locale(identifier: "en_US_POSIX")
                // WR-05: bare DATE-поля (yyyy-MM-dd) — это бизнес-даты в МСК
                // (period_for / worker-джобы). Без фикс. tz они декодировались
                // в timezone устройства, и MSK-calendar чтение в
                // LocalNotifications могло сместить fire-date на день восточнее
                // МСК. Пинним декод к Europe/Moscow — encode/decode/read
                // согласованы на МСК.
                if fmt == "yyyy-MM-dd" {
                    df.timeZone = TimeZone(identifier: "Europe/Moscow")
                }
                df.dateFormat = fmt
                if let d = df.date(from: str) { return d }
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unrecognized date: \(str)"
            )
        }
        self.decoder = dec

        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

    func setToken(_ token: String?) {
        bearerToken = token
    }

    func request<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [String: String]? = nil,
        body: Encodable? = nil,
        skipAuth: Bool = false,
        suppressForbiddenHandler: Bool = false
    ) async throws -> T {
        let data = try await rawRequest(
            method, path, query: query, body: body,
            skipAuth: skipAuth, suppressForbiddenHandler: suppressForbiddenHandler)
        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func requestVoid(
        _ method: String,
        _ path: String,
        query: [String: String]? = nil,
        body: Encodable? = nil,
        skipAuth: Bool = false,
        suppressForbiddenHandler: Bool = false
    ) async throws {
        _ = try await rawRequest(
            method, path, query: query, body: body,
            skipAuth: skipAuth, suppressForbiddenHandler: suppressForbiddenHandler)
    }

    private func rawRequest(
        _ method: String,
        _ path: String,
        query: [String: String]?,
        body: Encodable?,
        skipAuth: Bool,
        suppressForbiddenHandler: Bool = false
    ) async throws -> Data {
        guard
            var components = URLComponents(
                url: baseURL.appendingPathComponent("api/v1\(path)"),
                resolvingAgainstBaseURL: false
            )
        else { throw APIError.invalidURL }

        if let query, !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if !skipAuth, let token = bearerToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch http.statusCode {
        case 200...299:
            return data
        case 401:
            // WR-02: a genuine 401 (expired/invalid token) ALWAYS triggers the
            // global logout — there is no per-call suppression here. Earlier the
            // AI-suggest call swallowed 401 too via the old suppressUnauthHandler
            // flag, which was broader than its stated "require_pro 403" intent.
            // Suppression is now scoped to 403 only (suppressForbiddenHandler).
            onUnauthenticated?()
            throw APIError.unauthorized
        case 403:
            let detail = decodeErrorDetail(data) ?? "Forbidden"
            // 64-02 (T-64-02-02): require_pro 403 on /ai/suggest-category MUST
            // NOT log the owner out — suppressForbiddenHandler gates it (combined
            // with the existing !skipAuth condition). Additive, default false.
            // WR-02: this flag is intentionally 403-only; a 401 auth-expiry on
            // the same endpoint still logs out (see the 401 branch above).
            if !skipAuth, !suppressForbiddenHandler { onUnauthenticated?() }
            throw APIError.forbidden(detail)
        case 404:
            throw APIError.notFound
        case 409:
            throw APIError.conflict(decodeErrorDetail(data) ?? "Conflict")
        case 422:
            throw APIError.unprocessable(decodeErrorDetail(data) ?? "Validation error")
        case 429:
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init)
            throw APIError.rateLimited(retryAfter: retryAfter)
        default:
            throw APIError.serverError(http.statusCode, decodeErrorDetail(data) ?? "")
        }
    }

    private func decodeErrorDetail(_ data: Data) -> String? {
        guard let body = try? decoder.decode(APIErrorBody.self, from: data) else {
            return String(data: data, encoding: .utf8)
        }
        return body.detail.stringValue
    }
}

struct EmptyResponse: Decodable {}

struct AnyEncodable: Encodable {
    let value: Encodable

    init(_ value: Encodable) { self.value = value }

    func encode(to encoder: Encoder) throws {
        try value.encode(to: encoder)
    }
}
