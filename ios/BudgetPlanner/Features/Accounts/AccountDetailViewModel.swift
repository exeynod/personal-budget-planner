import Foundation
import Observation

/// Phase 60 (v06 Native Rebuild) — Plan 60-04: ViewModel для AccountDetailView.
///
/// `load()`:
///   - параллельно фетчит список аккаунтов (для lookup по id — нет
///     GET /accounts/{id}) и список категорий (для category-name lookup
///     в History rows);
///   - sequentially после account-resolve пробует получить текущий период
///     (mid-onboarding 404 / любая ошибка → period = nil, actuals = []);
///   - если period есть — список actuals + клиентский фильтр по
///     accountId (нет server-side filter в /actual list).
///
/// T-60-03 (Information Disclosure) — mitigation:
///   - cross-tenant / missing id collapses в одно сообщение «Счёт не
///     найден» — без existence leak (так же как CategoryDetail / V10
///     pattern);
///   - catch на верхнем уровне выдаёт фиксированный Russian copy «Не
///     удалось загрузить счёт»; raw Swift error печатается ТОЛЬКО через
///     `print(...)` в Xcode console;
///   - filter for actuals fetch fails — actuals = [] (no banner —
///     hero отображается, history collapses до empty).
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

    // MARK: - Load

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            // Параллельно: accounts + categories.
            async let accsTask = AccountsAPI.list()
            async let catsTask = CategoriesV10API.list()
            let accs = try await accsTask
            let cats = try await catsTask

            // T-60-03: cross-tenant / missing id → single message без leak.
            guard let acc = accs.first(where: { $0.id == accountId }) else {
                status = .error("Счёт не найден")
                return
            }
            self.account = acc
            self.categories = cats

            // Period 404 mid-onboarding tolerated.
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }
            self.period = per

            if let pid = per?.id {
                do {
                    let allActuals = try await ActualV10API.list(periodId: pid)
                    self.actuals = AccountsData.filterByAccount(allActuals, accountId: accountId)
                } catch {
                    // Actuals fetch failed — history collapses до empty.
                    // T-60-03: raw error → print only.
                    print("[AccountDetailViewModel] actuals fetch failed: \(error)")
                    self.actuals = []
                }
            } else {
                self.actuals = []
            }

            status = .ready
        } catch {
            // T-60-03: filtered Russian copy; raw error → print only.
            print("[AccountDetailViewModel] load failed: \(error)")
            status = .error("Не удалось загрузить счёт")
        }
    }

    // MARK: - Derived (computed)

    /// History day groups — Europe/Moscow Calendar; `today: Date()`
    /// для «Сегодня / Вчера» label-flagging внутри `V10Formatters.formatDay`.
    var dayGroups: [TxDayGroup] {
        TransactionsData.groupByDay(actuals, today: Date(), calendar: calendar)
    }

    /// Lookup category name по id (для history row sub-line).
    func categoryName(_ categoryId: Int) -> String? {
        categories.first(where: { $0.id == categoryId })?.name
    }

    /// Есть ли хоть одна операция (после фильтра accountId) в текущем периоде?
    var hasActuals: Bool {
        !actuals.isEmpty
    }

    // MARK: - DEBUG test backdoor

    #if DEBUG
    /// Backdoor для unit tests (обход `private(set)`). Mirror 60-02 pattern.
    func _setStateForTesting(
        account: AccountDTO? = nil,
        actuals: [ActualV10DTO] = [],
        categories: [CategoryV10DTO] = [],
        period: PeriodDTO? = nil
    ) {
        self.account = account
        self.actuals = actuals
        self.categories = categories
        self.period = period
    }
    #endif
}
