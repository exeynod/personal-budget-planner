import XCTest

@testable import BudgetPlanner

/// Phase 64 Plan 01 — wire-contract pin for the additive
/// `ActualUpdateRequest.accountId` field (ADD-V10-04).
///
/// `accountId` is optional and serialised through `encodeIfPresent`: when
/// nil, the key MUST NOT appear on the wire (mirrors `ActualCreateRequest`
/// — backend uses `exclude_unset` semantics; a literal `"account_id":null`
/// would be a contract regression). When present, the key MUST carry the
/// integer value.
///
/// Note: these assertions use a plain `JSONEncoder` and check the CodingKey
/// the DTO declares (`accountId`). The production snake_case transform lives
/// in `APIClient.encoder`; here we pin presence/absence + value round-trip.
final class ActualUpdateRequestTests: XCTestCase {

    private func encodeRaw(_ req: ActualUpdateRequest) throws -> String {
        let data = try JSONEncoder().encode(req)
        return String(data: data, encoding: .utf8) ?? ""
    }

    private func encodeToJSON(_ req: ActualUpdateRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(req)
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }

    // MARK: - accountId present → key carries value

    func test_encode_accountIdPresent_emitsKey() throws {
        let req = ActualUpdateRequest(
            amountCents: 100_00,
            categoryId: 3,
            txDate: "2026-05-20",
            description: "Кофе",
            accountId: 5
        )
        let json = try encodeToJSON(req)
        XCTAssertEqual(json["accountId"] as? Int, 5)
    }

    // MARK: - accountId nil → key omitted (encodeIfPresent)

    func test_encode_accountIdNil_omitsKey() throws {
        let req = ActualUpdateRequest(
            amountCents: 100_00,
            categoryId: 3,
            txDate: "2026-05-20",
            description: nil,
            accountId: nil
        )
        let raw = try encodeRaw(req)
        XCTAssertFalse(
            raw.contains("accountId"),
            "nil accountId must NOT appear on the wire, got: \(raw)")
        XCTAssertFalse(
            raw.contains("account_id"),
            "nil accountId must NOT appear on the wire, got: \(raw)")
    }

    // MARK: - legacy call-site (no accountId arg) still compiles + omits key

    func test_encode_legacyInitDefaultsNilAccountId() throws {
        // Mirrors the existing TransactionEditor.editActual call-site, which
        // does NOT pass accountId. The default `= nil` must keep it off-wire.
        let req = ActualUpdateRequest(
            amountCents: 50_00,
            categoryId: 1,
            txDate: "2026-05-20",
            description: nil
        )
        let raw = try encodeRaw(req)
        XCTAssertFalse(raw.contains("accountId"))
    }

    // MARK: - existing optional fields preserved

    func test_encode_existingFields_roundTrip() throws {
        let req = ActualUpdateRequest(
            amountCents: 250_00,
            categoryId: 7,
            txDate: "2026-04-01",
            description: "Обед"
        )
        let json = try encodeToJSON(req)
        XCTAssertEqual(json["amountCents"] as? Int, 250_00)
        XCTAssertEqual(json["categoryId"] as? Int, 7)
        XCTAssertEqual(json["txDate"] as? String, "2026-04-01")
        XCTAssertEqual(json["description"] as? String, "Обед")
    }

    func test_encode_nilOptionalFields_omitted() throws {
        let req = ActualUpdateRequest(
            amountCents: nil,
            categoryId: nil,
            txDate: nil,
            description: nil
        )
        let raw = try encodeRaw(req)
        // All-nil request encodes to an empty object — exclude_unset friendly.
        XCTAssertEqual(raw, "{}", "all-nil update must emit empty object, got: \(raw)")
    }
}
