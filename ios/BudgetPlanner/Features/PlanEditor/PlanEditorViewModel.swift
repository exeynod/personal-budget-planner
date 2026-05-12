import Foundation
import Observation

/// Phase 61: PlanEditorViewModel — master view ViewModel.
///
/// `load()`:
///   - parallel fetch CategoriesV10API.list() + MeV10API.fetchMeV10() (incomeCents);
///   - PeriodsAPI.current() с graceful 404 → period = nil, actuals = [];
///   - if period есть — ActualV10API.list(periodId: per.id) для fact compute.
///
/// Pattern parallel AccountsViewModel + PlanViewModel:
///   - @Observable + private(set) properties + status enum
///   - inFlight guard для re-entrancy (T-61-02)
///   - Europe/Moscow Calendar для day-based context (если потребуется)
///   - filtered Russian copy на failure (T-61-03)
///
/// Scaffold (61-01): load() — empty. Реализация в 61-02 Task 1.
@MainActor
@Observable
final class PlanEditorViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    private(set) var status: Status = .idle
    private(set) var categories: [CategoryV10DTO] = []
    private(set) var actuals: [ActualV10DTO] = []
    private(set) var period: PeriodDTO?
    private(set) var incomeCents: Int = 0

    @ObservationIgnored
    private var inFlight: Bool = false

    @ObservationIgnored
    var calendar: Calendar = PlanEditorViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    init() {}

    // MARK: - Load

    /// 61-02: реализация parallel fetch + period-404 grace + filtered copy.
    func load() async {
        // 61-02: заполняем
    }

    // MARK: - Optimistic update (called from PlanRowEditorViewModel.onSaved)

    /// 61-02: реализация — replace category в self.categories по id.
    func applyOptimisticUpdate(_ updated: CategoryV10DTO) {
        // 61-02: заполняем
    }

    // MARK: - DEBUG test backdoor

    #if DEBUG
    func _setStateForTesting(
        categories: [CategoryV10DTO] = [],
        actuals: [ActualV10DTO] = [],
        period: PeriodDTO? = nil,
        incomeCents: Int = 0
    ) {
        self.categories = categories
        self.actuals = actuals
        self.period = period
        self.incomeCents = incomeCents
    }
    #endif
}
