import Foundation

@testable import BudgetPlanner

/// Phase 67 Plan 07 (P1-7 / QA-F3-F4) — minimal `URLProtocol` stub for
/// `APIClient` regression tests. Injected via a custom `URLSessionConfiguration`
/// → `APIClient(baseURL:session:)`. Lets tests pin status code + body for the
/// next request without touching the network.
///
/// Single-shot per test: set `URLProtocolStub.stub` before the request; the
/// protocol returns that response for every intercepted request.
final class URLProtocolStub: URLProtocol {
    struct Stub {
        let statusCode: Int
        let data: Data
        let headers: [String: String]
    }

    /// Configured by the test before issuing a request. `nonisolated(unsafe)`
    /// — tests are serial and set this synchronously before the async call.
    nonisolated(unsafe) static var stub: Stub?

    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [URLProtocolStub.self]
        return URLSession(configuration: config)
    }

    static func reset() {
        stub = nil
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let stub = URLProtocolStub.stub else {
            client?.urlProtocol(
                self,
                didFailWithError: NSError(
                    domain: "URLProtocolStub", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "No stub configured"]))
            return
        }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: stub.headers
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
