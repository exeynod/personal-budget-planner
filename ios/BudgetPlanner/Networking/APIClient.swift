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
                "yyyy-MM-dd"
            ]
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: str) { return d }
            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: str) { return d }
            for fmt in formats {
                let df = DateFormatter()
                df.locale = Locale(identifier: "en_US_POSIX")
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
        skipAuth: Bool = false
    ) async throws -> T {
        let data = try await rawRequest(method, path, query: query, body: body, skipAuth: skipAuth)
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
        _ = try await rawRequest(method, path, query: query, body: body, skipAuth: skipAuth)
    }

    private func rawRequest(
        _ method: String,
        _ path: String,
        query: [String: String]?,
        body: Encodable?,
        skipAuth: Bool
    ) async throws -> Data {
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent("api/v1\(path)"),
            resolvingAgainstBaseURL: false
        ) else { throw APIError.invalidURL }

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
            onUnauthenticated?()
            throw APIError.unauthorized
        case 403:
            let detail = decodeErrorDetail(data) ?? "Forbidden"
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
