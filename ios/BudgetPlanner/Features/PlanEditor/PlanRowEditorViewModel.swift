import Foundation
import Observation

/// Phase 61: PlanRowEditorViewModel — detail editor ViewModel.
///
/// `load()`:
///   - CategoriesV10API.list() → find by categoryId (cross-tenant guard
///     T-61-03: missing id → status = .error("Категория не найдена")).
///   - Seed local editing state (planCents / rollover / paused) из загруженной DTO.
///
/// `save()`:
///   - CategoriesV10API.update(id:, payload: CategoryV10UpdateRequest(...))
///     immediate per-row save (CONTEXT D-4 — NO PlanMonthAPI batch).
///   - On success: self.onSaved?(updated) → parent VM optimistic refresh.
///   - On failure: saveError = filtered Russian copy (T-61-03).
///
/// `onSaved` closure инжектируется родительским View — это **interface
/// contract зафиксирован в 61-01** для parallel 61-02 / 61-03 work.
///
/// Threat-model:
///   - T-61-01 (Tampering planCents): UI gate planCents ≥ 0; backend
///     CategoryV10UpdateRequest Pydantic validation; server overflow guard.
///   - T-61-02 (Concurrency multiple saves): `inFlight` guard.
///   - T-61-03 (Info disclosure): filtered Russian copy banner; NO
///     `error.localizedDescription` в UI.
///
/// Scaffold (61-01): load()/save() empty. Реализация в 61-03 Task 1.
@MainActor
@Observable
final class PlanRowEditorViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    let categoryId: Int

    private(set) var status: Status = .idle
    private(set) var category: CategoryV10DTO?

    /// Local editing state — seeded из category на load; mutated UI bindings.
    var planCents: Int = 0
    var rollover: CategoryRollover = .misc
    var paused: Bool = false

    /// True пока CategoriesV10API.update в flight (disables CTA — T-61-02).
    private(set) var submitting: Bool = false

    /// Inline banner copy на save failure (T-61-03 filtered).
    var saveError: String? = nil

    /// Closure, инжектируемая родительским View. PlanRowEditorViewModel.save()
    /// вызывает её после successful PATCH /categories/:id для optimistic-refresh
    /// master list (61-02 wiring).
    var onSaved: ((CategoryV10DTO) -> Void)?

    @ObservationIgnored
    private var inFlight: Bool = false

    init(categoryId: Int) {
        self.categoryId = categoryId
    }

    // MARK: - Load

    /// 61-03: реализация — fetch CategoriesV10API.list() + find + seed
    /// editing state.
    func load() async {
        // 61-03: заполняем
    }

    // MARK: - Save

    /// 61-03: реализация — PATCH /categories/{id} → on success вызывает
    /// onSaved closure + dismiss caller (через @Environment dismiss);
    /// on failure — set saveError filtered Russian copy.
    func save() async -> Bool {
        // 61-03: заполняем
        return false
    }

    // MARK: - Dirty check

    /// True когда планируемое сохранение изменит хотя бы одно поле
    /// (planCents / rollover / paused). Disabled CTA когда !isDirty (D-3).
    /// 61-03: реализация.
    var isDirty: Bool {
        // 61-03: заполняем
        return false
    }

    // MARK: - DEBUG test backdoor

    #if DEBUG
    func _setStateForTesting(
        category: CategoryV10DTO? = nil,
        planCents: Int = 0,
        rollover: CategoryRollover = .misc,
        paused: Bool = false
    ) {
        self.category = category
        self.planCents = planCents
        self.rollover = rollover
        self.paused = paused
    }
    #endif
}
