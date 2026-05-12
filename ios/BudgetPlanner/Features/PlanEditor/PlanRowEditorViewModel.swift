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
///     Defensive VM-level clamp `Swift.max(0, planCents)` перед PATCH.
///   - T-61-02 (Concurrency multiple saves): `submitting` flag guard +
///     `inFlight` guard для load().
///   - T-61-03 (Info disclosure): filtered Russian copy banner; NO
///     raw localized description в UI — raw error → `print()` only.
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

    /// Fetch categories list + find by id. Seeds editing state (planCents,
    /// rollover, paused) из найденной DTO. Cross-tenant / missing id —
    /// single error message (T-61-03 — no existence leak).
    ///
    /// Используем list+find (нет GET /categories/{id} в API surface).
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            let cats = try await CategoriesV10API.list()
            // T-61-03: cross-tenant / missing id → single message без leak.
            guard let c = cats.first(where: { $0.id == categoryId }) else {
                status = .error("Категория не найдена")
                return
            }
            self.category = c
            // Seed local editing state из загруженной DTO.
            self.planCents = c.planCents
            self.rollover = c.rollover
            self.paused = c.paused
            status = .ready
        } catch {
            // T-61-03: filtered Russian copy; raw error → print only.
            print("[PlanRowEditorViewModel] load failed: \(error)")
            status = .error("Не удалось загрузить категорию")
        }
    }

    // MARK: - Save

    /// PATCH /categories/{id} — per-row immediate save (CONTEXT D-4).
    /// On success: self.category = updated; onSaved?(updated); saveError = nil;
    /// returns true.
    /// On failure: saveError = "Не удалось сохранить категорию" (T-61-03 filtered);
    /// returns false; raw error → print() only.
    /// T-61-02 (inFlight guard): submitting flag set true до await, defer reset.
    func save() async -> Bool {
        // Guard: nothing to save without loaded category.
        guard category != nil else { return false }
        if submitting { return false }
        submitting = true
        defer { submitting = false }

        saveError = nil

        // T-61-01: UI gate планируется во View (Stepper 0...10_000_000);
        // на ViewModel уровне — defensive clamp до 0.
        let safePlanCents = Swift.max(0, planCents)

        let payload = CategoryV10UpdateRequest(
            planCents: safePlanCents,
            rollover: rollover,
            paused: paused
        )

        do {
            let updated = try await CategoriesV10API.update(
                id: categoryId,
                payload: payload
            )
            self.category = updated
            self.planCents = updated.planCents
            self.rollover = updated.rollover
            self.paused = updated.paused
            onSaved?(updated)
            return true
        } catch {
            // T-61-03: filtered Russian copy; raw error → print only.
            print("[PlanRowEditorViewModel] save failed: \(error)")
            saveError = "Не удалось сохранить категорию"
            return false
        }
    }

    // MARK: - Dirty check

    /// True когда планируемое сохранение изменит хотя бы одно поле
    /// (planCents / rollover / paused). Disabled CTA когда !isDirty (D-3).
    /// Returns false если category == nil (no anchor для diff — защита от
    /// false-positive «грязного» state до загрузки).
    var isDirty: Bool {
        guard let c = category else { return false }
        return planCents != c.planCents
            || rollover != c.rollover
            || paused != c.paused
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
