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
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    private(set) var subs: [SubscriptionV10DTO] = []
    private(set) var status: Status = .idle

    /// Subscription whose «···» button was tapped — drives the primary
    /// posterSheet menu binding. Set to nil to dismiss.
    var menuSub: SubscriptionV10DTO? = nil

    /// Subscription pending destructive delete (T-26-07-01 two-step gate).
    /// Drives the .confirmationDialog binding.
    var pendingDeleteSub: SubscriptionV10DTO? = nil

    private var inFlight = false

    // MARK: - Load

    /// Fetch subscriptions list. Re-entrant calls are no-ops.
    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        do {
            self.subs = try await SubscriptionsV10API.list()
            status = .ready
        } catch {
            status = .error("Не удалось загрузить подписки")
        }
    }

    // MARK: - Mutations (SUBS-V10-03 / SUBS-V10-04)

    /// Flip `is_active` via PATCH. Refetches on success. Silent on failure
    /// (Phase 28 polish wires a toast).
    func togglePause(_ sub: SubscriptionV10DTO) async {
        do {
            _ = try await SubscriptionsV10API.patch(
                id: sub.id,
                payload: SubscriptionV10UpdateRequest(isActive: !sub.isActive)
            )
            await load()
        } catch {
            // Silent for v1.0; Phase 28 polish: toast/banner.
        }
    }

    /// Patch `day_of_month` (requires Plan 26-05 backend v1.0 router merge —
    /// legacy SubscriptionUpdate rejects with 422 until then).
    func changeDay(_ sub: SubscriptionV10DTO, newDay: Int) async {
        do {
            _ = try await SubscriptionsV10API.patch(
                id: sub.id,
                payload: SubscriptionV10UpdateRequest(dayOfMonth: newDay)
            )
            await load()
        } catch {
            // Silent for v1.0.
        }
    }

    /// Patch `amount_cents` to a new positive value.
    func changePrice(_ sub: SubscriptionV10DTO, newCents: Int) async {
        guard newCents > 0 else { return }
        do {
            _ = try await SubscriptionsV10API.patch(
                id: sub.id,
                payload: SubscriptionV10UpdateRequest(amountCents: newCents)
            )
            await load()
        } catch {
            // Silent for v1.0.
        }
    }

    /// DELETE /subscriptions/:id (204) and refetch.
    func deleteSub(_ sub: SubscriptionV10DTO) async {
        do {
            try await SubscriptionsV10API.delete(id: sub.id)
            await load()
        } catch {
            // Silent for v1.0.
        }
    }

    // MARK: - Derived (consumed by View)

    var sortedSubs: [SubscriptionV10DTO] {
        SubscriptionsData.sortForDisplay(subs)
    }

    var activeCount: Int {
        SubscriptionsData.computeActiveCount(subs)
    }

    var monthlyTotal: Int {
        SubscriptionsData.computeMonthlyTotal(subs)
    }

    var yearlyTotalAnnualized: Int {
        SubscriptionsData.computeYearlyTotalAnnualized(subs)
    }
}
