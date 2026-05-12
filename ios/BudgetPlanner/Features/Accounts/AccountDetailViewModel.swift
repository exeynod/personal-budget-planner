import Foundation
import Observation

/// Phase 60 (v06 Native Rebuild): ViewModel для AccountDetailView.
///
/// Stub (Plan 60-01). Полная реализация load() / periodOps / day grouping
/// — Plan 60-04.
@MainActor
@Observable
final class AccountDetailViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    let accountId: Int

    private(set) var status: Status = .idle
    private(set) var account: AccountDTO?
    private(set) var actuals: [ActualV10DTO] = []
    private(set) var categories: [CategoryV10DTO] = []
    private(set) var period: PeriodDTO?

    @ObservationIgnored
    private var inFlight: Bool = false

    @ObservationIgnored
    var calendar: Calendar = AccountDetailViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    init(accountId: Int) {
        self.accountId = accountId
    }

    func load() async {
        // Plan 60-04 fills this body.
    }
}
