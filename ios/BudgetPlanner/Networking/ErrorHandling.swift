import Foundation

/// Phase 70 Plan 03 (E1 / R7) — the injectable HTTP-status → domain-error +
/// logout-decision strategy extracted from `APIClient.rawRequest`'s hardcoded
/// `switch`.
///
/// WHY THIS EXISTS: the old design encoded the auth policy as an inline switch
/// plus per-call Bool flags (the `suppressForbiddenHandler` class of bug —
/// removed in 67-03). A per-endpoint auth Bool is invisible to the type system,
/// untestable in isolation, and silently masks real auth failures. This type
/// makes the policy a single, typed, injectable, unit-tested surface: there is
/// now exactly ONE place that decides "does this status log the user out?".
///
/// 429 SPLIT (PRE-SPECIFIED — do not change): `429 Retry-After` is NOT in this
/// policy. Reading the `Retry-After` header requires the `HTTPURLResponse`, and
/// this policy's `map` signature deliberately does NOT carry the response object
/// (keeping the signature header-free keeps the auth matrix exact and testable).
/// `APIClient` therefore handles 429 inline UPSTREAM and this policy NEVER sees
/// 429. The policy owns ONLY: 2xx success + 401/402/403/404/409/422/default.
///
/// `ErrorHandling` does NOT invoke `onUnauthenticated` itself — it returns a
/// `logout: Bool` inside `ErrorDecision`; `APIClient` owns the callback so the
/// policy stays a pure mapping with no side effects.

/// The outcome of mapping one HTTP response status.
enum ErrorDecision: Equatable {
    /// 2xx — the caller should return the raw `Data`.
    case success
    /// non-2xx — throw `error`; fire the global logout callback iff `logout`.
    case fail(APIError, logout: Bool)

    static func == (lhs: ErrorDecision, rhs: ErrorDecision) -> Bool {
        switch (lhs, rhs) {
        case (.success, .success):
            return true
        case (.fail(let le, let ll), .fail(let re, let rl)):
            // APIError is not Equatable (carries Error/associated payloads);
            // compare the user-facing description + the logout flag, which is
            // what the policy matrix actually pins.
            return le.errorDescription == re.errorDescription && ll == rl
        default:
            return false
        }
    }
}

/// status → (domain error, logout decision) mapping strategy.
struct ErrorHandling {
    /// - Parameters:
    ///   - status: the HTTP status code (never 429 — handled upstream).
    ///   - data: the response body, for decoding an error `detail`.
    ///   - skipAuth: whether the originating call skipped the bearer header.
    ///     This is the SINGLE transport parameter the policy reads (NOT a
    ///     per-endpoint auth Bool in the `suppressForbiddenHandler` sense).
    ///   - decodeDetail: closure that pulls a human `detail` string off `data`.
    var map:
        (_ status: Int, _ data: Data, _ skipAuth: Bool, _ decodeDetail: (Data) -> String?)
            -> ErrorDecision

    /// The default policy — byte-equivalent to the pre-70-03 `APIClient` switch.
    /// PRESERVES the 67-03/67-05 auth semantics EXACTLY:
    ///   - 401 → `.unauthorized`, logout ALWAYS (even with `skipAuth`, WR-02).
    ///   - 403 (`!skipAuth`) → `.forbidden(detail)`, logout (67-03 strict).
    ///   - 403 (`skipAuth`) → `.forbidden(detail)`, NO logout (AI-path).
    ///   - 402 (require_pro / PRO_TIER_REQUIRED) falls into `default` →
    ///     `.serverError(402, detail)`, NO logout (AISuggest silent-nil, 67-05).
    ///   - 404 → `.notFound`; 409 → `.conflict`; 422 → `.unprocessable`.
    ///   - 2xx → `.success`; everything else → `.serverError(status, detail)`.
    static let `default` = ErrorHandling { status, data, skipAuth, decodeDetail in
        switch status {
        case 200...299:
            return .success
        case 401:
            // WR-02: a genuine 401 ALWAYS logs out — no per-call suppression.
            return .fail(.unauthorized, logout: true)
        case 403:
            let detail = decodeDetail(data) ?? "Forbidden"
            // 67-03: a 403 is a genuine auth failure and logs out when the call
            // attached auth (`!skipAuth`). `skipAuth` 403 (AI-path) does not.
            return .fail(.forbidden(detail), logout: !skipAuth)
        case 404:
            return .fail(.notFound, logout: false)
        case 409:
            return .fail(.conflict(decodeDetail(data) ?? "Conflict"), logout: false)
        case 422:
            return .fail(.unprocessable(decodeDetail(data) ?? "Validation error"), logout: false)
        default:
            // 402 require_pro lands here: serverError, NO logout — AISuggest
            // swallows it to nil (67-05). All other unmapped statuses too.
            return .fail(.serverError(status, decodeDetail(data) ?? ""), logout: false)
        }
    }

    /// Composable example (ILLUSTRATIVE — not wired anywhere this phase). A
    /// feature that wants to treat certain statuses as "empty, not error" (e.g.
    /// 404 → empty list) composes a variant atop `.default`: for a tolerated
    /// status it returns a NON-logout decision the caller can interpret as
    /// empty, otherwise it defers to the default matrix. Demonstrates that new
    /// error policy is a declarative strategy, never a per-call Bool flag.
    static func tolerating(_ statuses: Set<Int>) -> ErrorHandling {
        ErrorHandling { status, data, skipAuth, decodeDetail in
            if statuses.contains(status) {
                // Non-logout, caller-interpretable-as-empty signal.
                return .fail(.notFound, logout: false)
            }
            return ErrorHandling.default.map(status, data, skipAuth, decodeDetail)
        }
    }
}
