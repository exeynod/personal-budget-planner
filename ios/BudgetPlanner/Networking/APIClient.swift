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
            // E2/R7: this strategy now serves AUDIT-TIME `Date` only (ISO-8601
            // timestamps: `created_at`, `closed_at`, …). Wire business dates
            // (`due`, `next_charge_date`, `tx_date`, `planned_date`,
            // `period_start/end`) are typed `BusinessDate` and self-decode from
            // their own singleValueContainer — they never reach this closure, so
            // the old `yyyy-MM-dd → MSK` format heuristic (WR-05 band-aid) is
            // gone. MSK-midnight semantics now live in `BusinessDate`.
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: str) { return d }
            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: str) { return d }
            // No-zone fallback (DateFormatter без явной tz → device tz) for
            // legacy timestamp shapes that omit the zone.
            let df = DateFormatter()
            df.locale = Locale(identifier: "en_US_POSIX")
            df.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
            if let d = df.date(from: str) { return d }
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
        skipAuth: Bool = false
    ) async throws -> T {
        let data = try await rawRequest(
            method, path, query: query, body: body,
            skipAuth: skipAuth)
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
        skipAuth: Bool = false
    ) async throws {
        _ = try await rawRequest(
            method, path, query: query, body: body,
            skipAuth: skipAuth)
    }

    private func rawRequest(
        _ method: String,
        _ path: String,
        query: [String: String]?,
        body: Encodable?,
        skipAuth: Bool
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
            // global logout — there is no per-call suppression here.
            onUnauthenticated?()
            throw APIError.unauthorized
        case 403:
            let detail = decodeErrorDetail(data) ?? "Forbidden"
            // P0-3 (T-67-03-01): a 403 is a genuine auth failure (broken/forbidden
            // owner token) and ALWAYS logs out when !skipAuth — there is no
            // per-call suppression. The old per-call 403-suppress flag was
            // removed: require_pro returns 402 (PRO_TIER_REQUIRED), NOT 403, so
            // the flag guarded a non-existent case while masking real 403s on the
            // AI path. A non-pro 402 falls through to the default serverError
            // branch and is swallowed to nil by AISuggestCategoryAPI (no logout).
            if !skipAuth { onUnauthenticated?() }
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
