// Phase 25-09 Task 2: data loader + filter state + delete for TransactionsV10View.
//
// Symmetric to web Plan 25-08 TransactionsView model. Loads /accounts +
// /categories + /periods/current + /periods/{id}/actual in parallel via
// `async let` and exposes computed views (filteredActuals / dayGroups /
// headerSummary) that re-evaluate when chip / actuals / categories change.
//
// Threat-model:
//   - T-25-09-02 (Repudiation): the View wraps swipe-action with
//     `.confirmationDialog` before calling `delete(_:)`. The model itself
//     does not gate — it only performs the DELETE + reload. The View is
//     responsible for the UX gate.
//   - T-25-09-03 (Concurrency: multiple reload/delete in flight):
//     `inFlight` guard mirrors HomeV10ViewModel pattern.
//
// Delete strategy: reuses the existing `ActualAPI.delete(id:)` (v0.x route
// — DELETE /actual/{id} works for both legacy and v1.0 actuals; the route
// is shared on the server). After a successful delete, `load()` is called
// to refetch the registry — simpler than splicing the deleted row out
// locally and avoids drift if another client has changed state.
//
// Phase 30-03 (DEBT-02): subscribes to `Notification.Name.txnCreated`
// (posted by AddSheetViewModel after successful POST /actual) and calls
// `load()` so the registry reflects the new row without a manual refresh.
// Observer registered in `init()`, removed in `deinit`.

import Foundation
import Observation

@MainActor
@Observable
final class TransactionsV10ViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    private(set) var status: Status = .idle
    private(set) var actuals: [ActualV10DTO] = []
    private(set) var categories: [CategoryV10DTO] = []
    private(set) var accounts: [AccountDTO] = []

    /// Banner-style transient error from a failed delete attempt.
    ///
    /// WR-25-09 (review fix): keep delete failures separate from the
    /// page-level `status` machine. Replacing `status` with `.error` after
    /// a failed delete made the View render a fullscreen error and lose
    /// the existing list (the opposite of what HomeViewModel does — its
    /// comment explicitly says "keep previously-loaded state intact so a
    /// retry does not flash empty UI"). The banner pattern preserves the
    /// list and lets the user re-attempt the delete or dismiss.
    var deleteError: String? = nil

    /// Selected filter chip — observed, mutable from the View.
    var chip: TransactionFilterChip = .all

    private var inFlight: Bool = false

    /// Calendar used for day grouping. `Europe/Moscow` per project convention
    /// (cycle TZ in CLAUDE.md). Stored so previews / tests can inject a
    /// fixed-TZ calendar without mutating the singleton.
    @ObservationIgnored
    var calendar: Calendar = TransactionsV10ViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    // MARK: - Observer lifecycle (Phase 30-03 / DEBT-02)

    /// Token kept @ObservationIgnored — internal plumbing, not surfaced to
    /// SwiftUI. Holding the reference lets `deinit` removeObserver and avoid
    /// a leak when the registry screen is popped from the nav-stack.
    @ObservationIgnored
    private var txnCreatedObserver: NSObjectProtocol?

    init() {
        self.txnCreatedObserver = NotificationCenter.default.addObserver(
            forName: .txnCreated,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.load()
            }
        }
    }

    deinit {
        if let observer = txnCreatedObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Computed views (re-evaluate on observed changes)

    var filteredActuals: [ActualV10DTO] {
        TransactionsData.applyFilterChip(actuals, categories: categories, chip: chip)
    }

    var dayGroups: [TxDayGroup] {
        TransactionsData.groupByDay(filteredActuals, today: Date(), calendar: calendar)
    }

    var headerSummary: (count: Int, sumCents: Int) {
        TransactionsData.computeHeaderSummary(filteredActuals)
    }

    // MARK: - Load (T-25-09-03 mitigation)

    /// Trigger a full reload. Re-entrant calls while a fetch is in flight
    /// are no-ops. Period 404 falls back to an empty registry so the screen
    /// renders the empty-state UI rather than an error banner (mirrors
    /// HomeV10ViewModel pattern).
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            async let categoriesTask = CategoriesV10API.list()
            async let accountsTask = AccountsAPI.list()

            // Period may legitimately 404 mid-onboarding; wrap inline since
            // `async let` variables can't be passed to helper funcs in
            // current Swift concurrency.
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }

            let cats = try await categoriesTask
            let accs = try await accountsTask

            // Actuals depend on a period — fetch only if we resolved one.
            let acts: [ActualV10DTO]
            if let pid = per?.id {
                acts = try await ActualV10API.list(periodId: pid)
            } else {
                acts = []
            }

            self.categories = cats
            self.accounts = accs
            self.actuals = acts
            self.status = .ready
        } catch {
            self.status = .error("не удалось загрузить транзакции")
        }
    }

    // MARK: - Delete (T-25-09-02 — View gates with confirmationDialog)

    /// DELETE /actual/{id} via the existing v0.x ActualAPI.delete route.
    /// On success: re-fetch the registry to reflect the change (simpler
    /// than local splice; avoids drift with concurrent changes from bot /
    /// other clients). On failure: status flips to error and the existing
    /// `actuals` snapshot stays intact so the UI does not flash empty.
    func delete(_ tx: ActualV10DTO) async {
        do {
            try await ActualAPI.delete(id: tx.id)
            self.deleteError = nil
            await load()
        } catch {
            // WR-25-09 (review fix): surface the failure as a transient
            // banner via `deleteError` rather than overwriting `status`.
            // The list (`actuals`) remains intact so the user can retry
            // or pick a different row without losing context.
            self.deleteError = "не удалось удалить операцию"
        }
    }

    /// Dismiss the delete-error banner (View call site).
    func clearDeleteError() {
        self.deleteError = nil
    }
}
