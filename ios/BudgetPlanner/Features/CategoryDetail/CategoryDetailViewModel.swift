// Phase 26-03 Task 2: data loader + mutation glue for CategoryDetailView.
//
// Symmetric to web Plan 26-02 CategoryDetailMount fetcher. Loads
// /categories + /periods/current + /periods/{id}/actual in parallel and
// derives screen state via CategoryDetailData pure helpers (Phase 26-03 Task 1).
//
// Mutations (CAT-V10-04 / CAT-V10-05):
//   - toggleRollover() flips the category's rollover policy via PATCH
//     /categories/:id (Phase 26-01 backend ext).
//   - togglePause()    flips the paused flag via the same endpoint.
//
// Threat-model:
//   - T-26-03-02 (Information Disclosure: cross-tenant id) — `cats.first(where:)`
//     returns nil → "Категория не найдена" error state (no leak).
//   - T-26-03-03 (Repudiation: silent toggle failure) — caught + logged for now;
//     Phase 28 polish wires a toast.
//   - T-26-03-04 (DoS via concurrent toggle taps) — `inFlight` re-entrancy guard
//     in load(); toggle methods serialise via @MainActor naturally.

import Foundation
import Observation

@MainActor
@Observable
final class CategoryDetailViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    let categoryId: Int

    private(set) var status: Status = .idle
    private(set) var category: CategoryV10DTO?
    private(set) var actuals: [ActualV10DTO] = []
    private(set) var periodId: Int?

    private var inFlight = false

    /// Calendar used for day-grouping the operations list. Stored so SwiftUI
    /// Previews / tests can inject a fixed-TZ calendar without mutating the
    /// singleton. Default: Europe/Moscow (cycle TZ per CLAUDE.md).
    ///
    /// `@ObservationIgnored` mirrors the same `@Observable`-macro Foundation
    /// type quirk noted in HomeV10ViewModel (Plan 25-05 key-decisions).
    @ObservationIgnored
    var calendar: Calendar = CategoryDetailViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    init(categoryId: Int) {
        self.categoryId = categoryId
    }

    // MARK: - Load

    /// Trigger a full reload. Re-entrancy is guarded — a second call while a
    /// fetch is in flight is a no-op (T-26-03-04).
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            async let categoriesTask = CategoriesV10API.list()

            // Period may legitimately 404 mid-onboarding — wrap so the rest
            // of the screen renders zeros instead of an error.
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }

            let cats = try await categoriesTask

            guard let cat = cats.first(where: { $0.id == categoryId }) else {
                // T-26-03-02 — cross-tenant or missing id collapses to a
                // single error message; we do NOT distinguish (no existence
                // leak).
                status = .error("Категория не найдена")
                return
            }
            self.category = cat

            if let pid = per?.id {
                self.periodId = pid
                let acts = try await ActualV10API.list(periodId: pid)
                self.actuals = acts
            } else {
                self.periodId = nil
                self.actuals = []
            }

            status = .ready
        } catch {
            status = .error("Не удалось загрузить категорию")
        }
    }

    // MARK: - Derived (consumed by the View)

    /// Σ |amount_cents| where category matches AND kind == .expense.
    var factCents: Int {
        CategoryDetailData.computeFactForCategory(actuals, categoryId: categoryId)
    }

    /// True when fact > planCents (drives the red background + over subtitle).
    var isOver: Bool {
        guard let cat = category else { return false }
        return factCents > cat.planCents
    }

    /// Bar segments for the 6pt progress bar at the top of the screen.
    var barSegments: CategoryDetailData.BarSegments {
        guard let cat = category else { return .init(fillRatio: 0, tickAt: nil) }
        return CategoryDetailData.computeBarSegments(
            factCents: factCents,
            planCents: cat.planCents
        )
    }

    /// Operations list grouped by day (Today / Yesterday / N {month_genitive}).
    var dayGroups: [TxDayGroup] {
        let filtered = CategoryDetailData.filterActualsForCategory(actuals, categoryId: categoryId)
        return TransactionsData.groupByDay(filtered, today: Date(), calendar: calendar)
    }
}
