// Phase 25-05 Task 2: data loader for HomeView (HOME-V10-01..06).
//
// Symmetric to web Plan 25-04 HomeMount fetcher. Loads /me + /accounts +
// /categories + /actual in parallel via `async let` and pipes the results
// through the pure helpers in HomeData.swift to derive screen state.
//
// Threat-model:
//   - T-25-05-03 (DoS via concurrent reload on rapid tab switching):
//     `inFlight` guard mirrors the OnboardingMountModel pattern (Plan 24-11).
//
// Status state machine:
//   .idle → .loading → (.ready | .error(msg)). On error, the ViewModel keeps
//   any previously-loaded state intact so a retry does not flash empty UI.

import Foundation
import Observation

@MainActor
@Observable
final class HomeV10ViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    private(set) var status: Status = .idle
    private(set) var eyebrow: String = ""
    private(set) var dailyPaceCents: Int = 0
    private(set) var daysLeft: Int = 0
    private(set) var walletCents: Int = 0
    private(set) var surplusCents: Int = 0
    private(set) var planTotalCents: Int = 0
    private(set) var factTotalCents: Int = 0
    private(set) var categoryRows: [CategoryAggregateRow] = []

    private var inFlight = false

    /// Calendar used for day arithmetic. Stored so SwiftUI Previews / tests
    /// can inject a fixed-TZ calendar without mutating the singleton. Default
    /// is Europe/Moscow per project convention (cycle TZ in CLAUDE.md).
    ///
    /// `@ObservationIgnored` because Swift's @Observable macro can't infer the
    /// keypath for `var calendar: Calendar` (`Foundation.Calendar` shadows the
    /// macro's generated `KeyPath<Self, Calendar>` lookup somehow). Calendar
    /// only changes for tests anyway — UI does not need to react to it.
    @ObservationIgnored
    var calendar: Calendar = HomeV10ViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    /// Trigger a full reload. Re-entrancy is guarded — a second call while a
    /// fetch is in flight is a no-op (T-25-05-03).
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            async let accountsTask = AccountsAPI.list()
            async let categoriesTask = CategoriesV10API.list()

            // Period may legitimately 404 when the user is mid-onboarding —
            // wrap the call in a do/catch and fall back to nil so the rest
            // of the home screen still renders (zeros instead of error).
            // (`async let` variables can't be passed to helper funcs in
            // current Swift concurrency; resolve inline.)
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }

            let accs = try await accountsTask
            let cats = try await categoriesTask

            // Actuals depend on having a period — fetch only if we resolved one.
            let acts: [ActualV10DTO]
            if let pid = per?.id {
                acts = try await ActualV10API.list(periodId: pid)
            } else {
                acts = []
            }

            // Compute via pure helpers.
            let now = Date()
            let aggregates = HomeData.sortForHome(
                HomeData.computeCategoryAggregates(categories: cats, actuals: acts)
            )
            let filtered = cats.filter { $0.code != "savings" && !$0.paused }
            let plan = HomeData.planTotal(filtered)
            let fact = aggregates.reduce(0) { $0 + $1.factCents }

            // daysLeft = lastDay - today + 1 (today counts as remaining).
            let lastDayOfMonth = calendar.range(of: .day, in: .month, for: now)
                .map { $0.upperBound - 1 } ?? 30
            let todayDay = calendar.component(.day, from: now)
            // WR-25-04 (review fix): clamp to 1 (not 0) for cross-platform
            // parity with web (`HomeMount.tsx` + `format.ts` both use
            // `Math.max(1, ...)`). Showing "0 ДНЕЙ" on the last day of the
            // month while web shows "1 ДЕНЬ" was a parity bug.
            let computedDaysLeft = Swift.max(1, lastDayOfMonth - todayDay + 1)

            self.daysLeft = computedDaysLeft
            self.walletCents = HomeData.computeWalletTotal(accs)
            self.planTotalCents = plan
            self.factTotalCents = fact
            self.surplusCents = HomeData.computeSurplus(
                planTotalCents: plan, factTotalExpenseCents: fact
            )
            self.dailyPaceCents = HomeData.computeDailyPace(
                planTotalCents: plan,
                factTotalExpenseCents: fact,
                daysLeft: computedDaysLeft
            )
            self.eyebrow = V10Formatters.formatPeriodEyebrow(now, calendar: calendar)
            self.categoryRows = aggregates
            self.status = .ready
        } catch {
            self.status = .error("Не удалось загрузить главный экран")
        }
    }

}
