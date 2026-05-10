import Foundation

/// Wire-level enum for `account.kind`. Mirrors `AccountKindStr` from
/// `app/api/schemas/accounts.py` (Phase 22 BE-02).
enum AccountKind: String, Decodable {
    case card
    case cash
    case savings
}

/// Phase 25-03 — Decodable mirror of `AccountRead`
/// (`app/api/schemas/accounts.py`).
///
/// **Wire field naming**: the backend exposes the ORM `is_primary` attribute
/// as `primary` on the wire (via `serialization_alias` in the Pydantic
/// schema). `APIClient.shared.decoder` uses `keyDecodingStrategy =
/// .convertFromSnakeCase`, which leaves single-word keys untouched —
/// so the Swift property name stays `primary` (no transform needed).
///
/// Used by `AccountsAPI.list()` (Phase 25-03), Home wallet link
/// (HOME-V10-04), AddSheet account picker (ADD-V10-04).
struct AccountDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let bank: String
    let mask: String?
    let kind: AccountKind
    let balanceCents: Int
    let primary: Bool
    let createdAt: Date?
}
