import Foundation
import Observation

/// Phase 61: PlanEditorViewModel — master view ViewModel.
///
/// `load()` (61-02):
///   - parallel fetch `CategoriesV10API.list()` + `MeV10API.shared.fetchMeV10()`
///     (incomeCents — nil-tolerant via `?? 0` для mid-onboarding).
///   - PeriodsAPI.current() с graceful 404 → period = nil, actuals = [].
///   - if period есть — ActualV10API.list(periodId: per.id) для fact compute;
///     actuals fetch failure → silent fallback ([]) — Aggregates collapse до 0
///     trailing без leak (T-61-03).
///
/// Pattern parallel AccountsViewModel + AccountDetailViewModel + PlanViewModel:
///   - @Observable + private(set) properties + status enum
///   - inFlight guard для re-entrancy (T-61-02)
///   - Europe/Moscow Calendar для day-based context (если потребуется)
///   - T-61-03: filtered Russian copy на failure, raw error → `print(...)` only;
///     raw localized description НИКОГДА не присваивается ни к status ни к
///     user-visible state.
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

    /// Parallel fetch categories + me (incomeCents). Period 404 tolerated.
    /// On any other failure → status = .error("Не удалось загрузить план месяца")
    /// (T-61-03 filtered copy; raw error → print() для Xcode console).
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            async let catsTask = CategoriesV10API.list()
            async let meTask = MeV10API.shared.fetchMeV10()
            let cats = try await catsTask
            let me = try await meTask

            self.categories = cats
            self.incomeCents = me.incomeCents ?? 0

            // Period 404 mid-onboarding tolerated → period=nil, actuals=[].
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }
            self.period = per

            if let pid = per?.id {
                do {
                    self.actuals = try await ActualV10API.list(periodId: pid)
                } catch {
                    // T-61-03: actuals fetch failure — silent fallback.
                    // Aggregates collapse до 0; raw error только в print.
                    print("[PlanEditorViewModel] actuals fetch failed: \(error)")
                    self.actuals = []
                }
            } else {
                self.actuals = []
            }

            status = .ready
        } catch {
            print("[PlanEditorViewModel] load failed: \(error)")
            // T-61-03: filtered Russian copy; raw error → print only.
            status = .error("Не удалось загрузить план месяца")
        }
    }

    // MARK: - Optimistic update

    /// Called by PlanRowEditorView.onSaved closure после successful PATCH
    /// в child editor. Делегирует в `PlanEditorData.applyOptimisticUpdate`
    /// (pure helper) — replace category по id в self.categories.
    func applyOptimisticUpdate(_ updated: CategoryV10DTO) {
        self.categories = PlanEditorData.applyOptimisticUpdate(
            self.categories,
            updated: updated
        )
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
