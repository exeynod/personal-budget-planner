// Phase 26-07 Task 2: data loader + mutation glue for SubscriptionsV10View.
//
// Symmetric to web Plan 26-06 SubscriptionsMount fetcher. Loads
// /api/v1/subscriptions and exposes mutations via SubscriptionsV10API.
//
// Type renamed `SubscriptionsV10ViewModel` (not `SubscriptionsViewModel`) to
// avoid symbol collision with legacy
// `Features/Management/SubscriptionsView.swift`'s class of the same name in
// the same Swift module.
//
// Mutations (SUBS-V10-03 / SUBS-V10-04):
//   - togglePause(_:)  flips `is_active` via PATCH /subscriptions/:id.
//   - changeDay(_:newDay:)   patches `day_of_month` (requires Plan 26-05
//                            backend ext — legacy SubscriptionUpdate rejects
//                            with 422 if not yet shipped).
//   - changePrice(_:newCents:) patches `amount_cents`.
//   - deleteSub(_:)    DELETE /subscriptions/:id (204).
//
// Threat-model:
//   - T-26-07-01 (accidental delete) — `pendingDeleteSub` two-step gate
//     enforced View-side via .confirmationDialog.
//   - T-26-07-04 (cross-tenant info-disc) — listSubscriptionsV10 RLS-protected
//     at backend; failures collapse to a single error string.
//
// Re-entrancy: `inFlight` guard in load(). Toggle methods serialise via
// @MainActor and trigger a refetch on success.

import Foundation
import Observation

@MainActor
@Observable
final class SubscriptionsV10ViewModel {
    typealias Status = SubscriptionsStore.Status

    /// Phase 70-05 (D/R6): load + mutation domain logic extracted into the
    /// shared `SubscriptionsStore`. This VM is now a thin V10-shell adapter
    /// that keeps only presentation state (menu/delete/toast) and maps store
    /// mutation outcomes to a toast. V10 lists subs only
    /// (loadsCategoriesAccounts: false) and keeps identity store-order, sorting
    /// V10-style in its own `sortedSubs` derived getter — display order is
    /// byte-identical to pre-refactor.
    @ObservationIgnored
    private let store: SubscriptionsStore

    init(api: SubscriptionsStore.API = .live) {
        self.store = SubscriptionsStore(api: api, loadsCategoriesAccounts: false)
    }

    /// Store-backed subscriptions (read by derived getters + the View).
    var subs: [SubscriptionV10DTO] { store.subscriptions }
    var status: Status { store.status }

    /// Subscription whose «···» button was tapped — drives the primary
    /// posterSheet menu binding. Set to nil to dismiss.
    var menuSub: SubscriptionV10DTO? = nil

    /// Subscription pending destructive delete (T-26-07-01 two-step gate).
    /// Drives the .confirmationDialog binding.
    var pendingDeleteSub: SubscriptionV10DTO? = nil

    /// DEBT-04 / Plan 30-04: error toast text — non-nil triggers `toastVisible`
    /// in the view. Set on PATCH/DELETE failure so users see the failure
    /// instead of a silent fail. Presentation state — stays per-shell.
    var toastMessage: String? = nil

    // MARK: - Load

    /// Fetch subscriptions list. Re-entrant calls coalesce in the store (WR-01).
    func load() async {
        await store.load()
    }

    // MARK: - Mutations (SUBS-V10-03 / SUBS-V10-04) — delegate to store

    /// Flip `is_active` via the store's PATCH. Store refetches on success. On
    /// failure surfaces a toast (DEBT-04 — replaces silent fail).
    func togglePause(_ sub: SubscriptionV10DTO) async {
        let ok = await store.patch(
            id: sub.id,
            payload: SubscriptionV10UpdateRequest(isActive: !sub.isActive)
        )
        if !ok { toastMessage = "Не удалось обновить · статус не сохранён" }
    }

    /// Patch `day_of_month` via the store (requires Plan 26-05 backend v1.0
    /// router merge — legacy SubscriptionUpdate rejects with 422 until then).
    func changeDay(_ sub: SubscriptionV10DTO, newDay: Int) async {
        let ok = await store.patch(
            id: sub.id,
            payload: SubscriptionV10UpdateRequest(dayOfMonth: newDay)
        )
        if !ok { toastMessage = "Не удалось обновить · день не сохранён" }
    }

    /// Patch `amount_cents` to a new positive value via the store.
    func changePrice(_ sub: SubscriptionV10DTO, newCents: Int) async {
        guard newCents > 0 else { return }
        let ok = await store.patch(
            id: sub.id,
            payload: SubscriptionV10UpdateRequest(amountCents: newCents)
        )
        if !ok { toastMessage = "Не удалось обновить · цена не сохранена" }
    }

    /// DELETE /subscriptions/:id (204) via the store and refetch.
    func deleteSub(_ sub: SubscriptionV10DTO) async {
        let ok = await store.delete(sub.id)
        if !ok { toastMessage = "Не удалось удалить · подписка не удалена" }
    }

    // MARK: - Derived (consumed by View)

    var sortedSubs: [SubscriptionV10DTO] {
        SubscriptionsDomain.sortV10(subs)
    }

    var activeCount: Int {
        SubscriptionsDomain.activeCount(subs)
    }

    var monthlyTotal: Int {
        SubscriptionsDomain.monthlyTotalV10(subs)
    }

    var yearlyTotalAnnualized: Int {
        SubscriptionsDomain.yearlyTotalAnnualizedV10(subs)
    }
}
