// Phase 26-05 Task 2: PlanViewModel — data loader + mutation glue for PlanView.
//
// Symmetric to web Plan 26-04 PlanMount fetcher. Loads /me + /categories +
// /periods/current + /periods/{id}/actual + /subscriptions in parallel, derives
// state via PlanData pure helpers (Plan 26-05 Task 1), and orchestrates the
// three mutating flows:
//   - rollover toggle per category   → PATCH /categories/:id (CAT-V10-04 reused)
//   - regular post / unpost          → POST /subscriptions/:id/post|unpost
//   - atomic save plan-month         → PATCH /plan-month (T-P-06)
//
// Threat-model:
//   - T-26-05-01 (Tampering: PATCH /plan-month body) — type-safe
//     `PlanMonthItem` Encodable + backend Pydantic validation (Phase 26-01).
//   - T-26-05-02 (Repudiation: accidental post tap) — Toast confirms; «ОТМЕНА»
//     row inline → two taps before final mutation.
//   - T-26-05-03 (DoS: spam slider commits) — local @Observable update; PATCH
//     only on Submit; PosterSlider 300ms debounce upstream of any action.
//   - T-26-05-04 (Tampering: rollover chip arbitrary) — `CategoryRollover` enum
//     limits the chip-pair to 2 known values.
//
// Status state machine: .idle → .loading → (.ready | .error). saveError is
// surfaced inline (not a status transition) so the user keeps the loaded
// state when a save fails.

import Foundation
import Observation

@MainActor
@Observable
final class PlanViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    let focusCategoryId: Int?

    private(set) var income: Int = 0
    private(set) var categories: [CategoryV10DTO] = []
    private(set) var actuals: [ActualV10DTO] = []
    private(set) var subs: [SubscriptionV10DTO] = []
    /// Local working copy of the plan list — mutated by sliders, sent to the
    /// server on Submit. Seeded from `plansFromCategories(categories)` after load.
    var plans: [PlanMonthItem] = []
    private(set) var status: Status = .idle
    /// True while the atomic plan-month PATCH is in flight (disables CTA).
    var submitting: Bool = false
    /// Inline error displayed under the «СОХРАНИТЬ» CTA (Σplan>income or net err).
    var saveError: String? = nil
    /// Current toast text — non-nil triggers visibility flag in the view.
    var toastMessage: String? = nil

    @ObservationIgnored
    var calendar: Calendar = PlanViewModel.defaultCalendar()

    private static func defaultCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }

    private var inFlight = false

    init(focusCategoryId: Int? = nil) {
        self.focusCategoryId = focusCategoryId
    }

    // MARK: - Load

    /// Trigger a full reload. Re-entrancy is guarded — a second call while a
    /// fetch is in flight is a no-op (T-26-05-03 mitigation).
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading

        do {
            async let categoriesTask = CategoriesV10API.list()
            async let subsTask = SubscriptionsV10API.list()
            async let meTask = MeV10API.shared.fetchMeV10()

            // Period may legitimately 404 mid-onboarding — wrap and degrade.
            // (`async let` results can't be passed to helper funcs in current
            // Swift concurrency; resolve inline same as HomeV10ViewModel.)
            let per: PeriodDTO?
            do { per = try await PeriodsAPI.current() } catch { per = nil }

            let allCats = try await categoriesTask
            let s = try await subsTask
            let m = try await meTask

            // Filter savings + paused for the slider/aggregate views; sort by ord.
            let visibleCats = allCats
                .filter { $0.code != "savings" && !$0.paused }
                .sorted { ($0.ord ?? "99") < ($1.ord ?? "99") }
            self.categories = visibleCats
            self.subs = s
            self.income = m.incomeCents ?? 0
            self.plans = PlanData.plansFromCategories(visibleCats)

            // Actuals only when we have a period — otherwise rollover plates show 0.
            if let pid = per?.id {
                self.actuals = try await ActualV10API.list(periodId: pid)
            } else {
                self.actuals = []
            }

            status = .ready
        } catch {
            status = .error("Не удалось загрузить план месяца")
        }
    }

    // MARK: - Slider mutations (local only — no network until submit)

    /// Update the slider value for one category. Pure local mutation —
    /// `applyPlanEdit` is immutable so subsequent observers see the new array.
    /// PATCH only fires from `submit()` (T-P-06 atomic batch).
    func updateSlider(categoryId: Int, cents: Int) {
        plans = PlanData.applyPlanEdit(plans, categoryId: categoryId, newCents: cents)
    }

    // MARK: - Rollover chip toggle (per-category PATCH)

    /// Flip rollover policy for one category via PATCH /categories/:id.
    /// Optimistic refresh — server response replaces the local DTO.
    func toggleRollover(categoryId: Int, to next: CategoryRollover) async {
        do {
            let updated = try await CategoriesV10API.update(
                id: categoryId,
                payload: CategoryV10UpdateRequest(rollover: next)
            )
            if let idx = categories.firstIndex(where: { $0.id == categoryId }) {
                categories[idx] = updated
            }
        } catch {
            // Phase 28 polish wires a toast; silent for v1.0.
        }
    }

    // MARK: - Regulars post / unpost (T-P-04)

    /// Post a regular subscription's monthly charge into actuals + reload.
    /// Toast surfaces on success — user can see «✓ ПРОВЕДЕНО → реестр».
    func postRegular(_ subId: Int) async {
        do {
            _ = try await SubscriptionsV10API.post(id: subId)
            toastMessage = "✓ ПРОВЕДЕНО → РЕЕСТР"
            await load()
        } catch {
            // Silent — Phase 28 polish.
        }
    }

    /// Reverse a posted regular (deletes the actual row, clears posted_txn_id).
    func unpostRegular(_ subId: Int) async {
        do {
            try await SubscriptionsV10API.unpost(id: subId)
            toastMessage = "ОТМЕНЕНО"
            await load()
        } catch {
            // Silent — Phase 28 polish.
        }
    }

    // MARK: - Atomic save (T-P-06)

    /// PATCH /plan-month with the current local `plans` array. Returns true on
    /// success so the caller can chain a `router.pop()` after a brief Toast
    /// preview. 400 plan_overflow surfaces inline via `saveError`.
    ///
    /// Note: APIError doesn't expose the HTTP status code on
    /// `serverError(code, detail)` directly without pattern-matching the
    /// associated values; legacy Plan 26-01 backend returns 400 for overflow,
    /// so we discriminate on the ApiError variant pattern below.
    func submit() async -> Bool {
        submitting = true
        defer { submitting = false }
        saveError = nil

        do {
            _ = try await PlanMonthAPI.patch(plans: plans)
            toastMessage = "✓ ПЛАН СОХРАНЁН"
            return true
        } catch APIError.serverError(let code, let detail) where code == 400 {
            // Backend detail = `{error: "plan_overflow", income_cents, sum_plan_cents}`.
            // Surface a localised inline message — user can adjust sliders.
            saveError = "Σplan превышает доход — уменьшите лимиты (\(detail))"
            return false
        } catch APIError.serverError(let code, _) {
            saveError = "Не удалось сохранить план (HTTP \(code))"
            return false
        } catch {
            saveError = error.localizedDescription
            return false
        }
    }
}
