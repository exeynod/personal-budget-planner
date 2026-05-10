// Phase 27-09 Task 3: data loader for AccountDetailV10View. Symmetric to web
// Plan 27-04 AccountDetailMount.
//
// Parallel-fetches:
//   - AccountsAPI.list()         — to find this account by id (no GET /accounts/{id})
//   - CategoriesV10API.list()    — for category-name lookup on operations rows
//   - PeriodsAPI.current()       — for «В МАЕ · N ОПЕРАЦИЙ» KPI plate
// Then sequentially:
//   - ActualV10API.list(periodId:) — filtered client-side via filterByAccount.
//
// Period 404 mid-onboarding tolerated: KPI collapses to 0/0 if period missing.
// Cross-tenant id (T-27-09-03): account not found in user's list → error state
// (no existence leak — same as CategoryDetail pattern).

import Foundation
import Observation

@MainActor
@Observable
final class AccountDetailV10ViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    let accountId: Int

    private(set) var status: Status = .idle
    private(set) var account: AccountDTO?
    private(set) var categories: [CategoryV10DTO] = []
    private(set) var period: PeriodDTO?
    private(set) var actuals: [ActualV10DTO] = []

    private var inFlight = false

    @ObservationIgnored
    var calendar: Calendar = AccountDetailV10ViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    init(accountId: Int) {
        self.accountId = accountId
    }

    // MARK: - Load

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            async let accsTask = AccountsAPI.list()
            async let catsTask = CategoriesV10API.list()
            let accs = try await accsTask
            let cats = try await catsTask

            guard let acc = accs.first(where: { $0.id == accountId }) else {
                // T-27-09-03 — cross-tenant or missing id collapses to a single
                // error message. No distinguishing leak.
                status = .error("Счёт не найден")
                return
            }
            self.account = acc
            self.categories = cats

            // Period may legitimately 404 mid-onboarding — collapse to 0/0.
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }
            self.period = per

            if let pid = per?.id {
                do {
                    let allActuals = try await ActualV10API.list(periodId: pid)
                    self.actuals = AccountsData.filterByAccount(allActuals, accountId: accountId)
                } catch {
                    self.actuals = []
                }
            } else {
                self.actuals = []
            }

            status = .ready
        } catch {
            status = .error("Не удалось загрузить счёт")
        }
    }

    // MARK: - Derived

    /// (count, sumCents) of operations within the current period for this account.
    var periodOps: (count: Int, sumCents: Int) {
        guard let p = period else { return (actuals.count, actuals.reduce(0) { $0 + abs($1.amountCents) }) }
        return AccountsData.sumPeriodOps(actuals, periodStart: p.periodStart, periodEnd: p.periodEnd)
    }

    /// Russian preposition month name («МАЕ», «ИЮНЕ») derived from
    /// `period.periodStart`. Falls back to «МЕСЯЦЕ» when period is unknown.
    var monthLabel: String {
        guard let p = period else { return "МЕСЯЦЕ" }
        let monthIdx = calendar.component(.month, from: p.periodStart) - 1
        let arr = AccountDetailV10ViewModel.monthsRuPrep
        guard arr.indices.contains(monthIdx) else { return "МЕСЯЦЕ" }
        return arr[monthIdx].uppercased()
    }

    /// Russian preposition month forms (UPPERCASE for KPI eyebrow).
    /// «в январе / в феврале / в марте / в апреле / в мае / в июне /
    ///  в июле / в августе / в сентябре / в октябре / в ноябре / в декабре».
    static let monthsRuPrep: [String] = [
        "январе", "феврале", "марте", "апреле", "мае", "июне",
        "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
    ]

    /// Lookup category name by id (for operations row sub-line).
    func categoryName(_ categoryId: Int) -> String? {
        categories.first(where: { $0.id == categoryId })?.name
    }
}
