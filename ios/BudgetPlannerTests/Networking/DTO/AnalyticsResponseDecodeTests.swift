import XCTest

@testable import BudgetPlanner

/// Phase 71 — regression pin for the v0.6 Управление → Аналитика decode bug.
///
/// The legacy `AnalyticsAPI` enum (consumed by `Features/Management/
/// AnalyticsView.swift`) decoded into stale DTOs whose keys had drifted from
/// the live backend (`app/api/schemas/analytics.py`):
///   - `TopCategoriesResponse` expected `{categories, total_cents}` but the
///     server returns `{items: [...]}` → `keyNotFound("categories")`, which
///     produced the «⚠ Что-то пошло не так» banner on every range.
///   - `ForecastResponse` expected a flat `{projected_expense_cents, …}` but
///     the server returns a polymorphic `{mode, …}` card.
///   - `TrendPoint` expected `{period_start, …, actual_expense_cents}` but the
///     server returns `{period_label, expense_cents, income_cents}`.
///
/// These payloads are REAL captures from the live dev API (curl, May 2026,
/// ~18 seeded transactions). The test decodes them through a decoder
/// configured identically to `APIClient.shared` (`convertFromSnakeCase`) so a
/// future contract drift re-breaks this test instead of the screen.
final class AnalyticsResponseDecodeTests: XCTestCase {

    /// Mirror of `APIClient`'s production decoder strategy.
    private func decoder() -> JSONDecoder {
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        return dec
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try decoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - top-categories (root cause: keyNotFound("categories"))

    func test_topCategories_decodesRealItemsPayload() throws {
        // Real `GET /analytics/top-categories?range=1M` body.
        let json = """
            {
              "items": [
                {"category_id": 5, "name": "ДОМ", "actual_cents": 639000, "planned_cents": 0},
                {"category_id": 3, "name": "ПРОДУКТЫ", "actual_cents": 629000, "planned_cents": 0},
                {"category_id": 7, "name": "РАЗВЛЕЧ.", "actual_cents": 570000, "planned_cents": 0}
              ]
            }
            """
        let resp = try decode(TopCategoriesResponse.self, json)

        XCTAssertEqual(resp.items.count, 3)
        // Compat accessor used by AnalyticsView.
        XCTAssertEqual(resp.categories.count, 3)
        XCTAssertEqual(resp.categories.first?.categoryName, "ДОМ")
        XCTAssertEqual(resp.categories.first?.totalCents, 639000)
        XCTAssertEqual(resp.categories.first?.plannedCents, 0)
        // Derived total (backend no longer sends total_cents).
        XCTAssertEqual(resp.totalCents, 639000 + 629000 + 570000)
    }

    func test_topCategories_plannedCentsNull_doesNotThrow() throws {
        // Optional `planned_cents` — null must decode, not throw.
        let json = """
            {"items": [{"category_id": 1, "name": "X", "actual_cents": 100, "planned_cents": null}]}
            """
        let resp = try decode(TopCategoriesResponse.self, json)
        XCTAssertNil(resp.items.first?.plannedCents)
        XCTAssertEqual(resp.items.first?.totalCents, 100)
    }

    func test_topCategories_emptyItems_decodes() throws {
        let resp = try decode(TopCategoriesResponse.self, #"{"items": []}"#)
        XCTAssertTrue(resp.categories.isEmpty)
        XCTAssertEqual(resp.totalCents, 0)
    }

    // MARK: - forecast (polymorphic mode)

    func test_forecast_mode1M_forecast_decodes() throws {
        // Real `GET /analytics/forecast?range=1M`.
        let json = """
            {
              "mode": "forecast",
              "starting_balance_cents": 0,
              "planned_income_cents": 0,
              "planned_expense_cents": 0,
              "projected_end_balance_cents": 0,
              "period_end": "2026-06-04",
              "total_net_cents": null,
              "monthly_avg_cents": null,
              "periods_count": null,
              "requested_periods": null
            }
            """
        let f = try decode(ForecastResponse.self, json)
        XCTAssertEqual(f.mode, "forecast")
        XCTAssertFalse(f.isEmpty)
        XCTAssertEqual(f.projectedEndBalanceCents, 0)
        XCTAssertEqual(f.periodEnd, "2026-06-04")
        XCTAssertNil(f.totalNetCents)
    }

    func test_forecast_mode3M_cashflow_decodes() throws {
        // Real `GET /analytics/forecast?range=3M`.
        let json = """
            {
              "mode": "cashflow",
              "starting_balance_cents": null,
              "planned_income_cents": null,
              "planned_expense_cents": null,
              "projected_end_balance_cents": null,
              "period_end": null,
              "total_net_cents": -490000,
              "monthly_avg_cents": -490000,
              "periods_count": 1,
              "requested_periods": 3
            }
            """
        let f = try decode(ForecastResponse.self, json)
        XCTAssertEqual(f.mode, "cashflow")
        XCTAssertFalse(f.isEmpty)
        XCTAssertEqual(f.totalNetCents, -490000)
        XCTAssertEqual(f.monthlyAvgCents, -490000)
        XCTAssertEqual(f.periodsCount, 1)
        XCTAssertNil(f.projectedEndBalanceCents)
    }

    func test_forecast_modeEmpty_isEmpty() throws {
        let f = try decode(ForecastResponse.self, #"{"mode": "empty"}"#)
        XCTAssertTrue(f.isEmpty)
    }

    // MARK: - trend (period_label / expense_cents / income_cents)

    func test_trend_decodesRealLabelledPoints() throws {
        // Real `GET /analytics/trend?range=3M`.
        let json = """
            {
              "points": [
                {"period_label": "Апр", "expense_cents": 490000, "income_cents": 0},
                {"period_label": "Май", "expense_cents": 2825000, "income_cents": 15000000}
              ]
            }
            """
        let resp = try decode(TrendResponse.self, json)
        XCTAssertEqual(resp.points.count, 2)
        XCTAssertEqual(resp.points.first?.periodLabel, "Апр")
        XCTAssertEqual(resp.points.first?.expenseCents, 490000)
        XCTAssertEqual(resp.points.last?.periodLabel, "Май")
        XCTAssertEqual(resp.points.last?.incomeCents, 15_000_000)
    }
}
