// Phase 70-05 (D / R6) — shared Subscriptions domain store.
//
// Extracts the load + mutation logic that had drifted across the two shells'
// ViewModels (v06 `SubscriptionsViewModel` in Features/Management, V10
// `SubscriptionsV10ViewModel` in FeaturesV10) into a single @Observable store
// consumed by BOTH. The per-shell ViewModels become thin adapters that own
// only shell-specific presentation state:
//   - v06 maps store outcomes to a fixed-RU `mutationError` banner;
//   - V10 keeps menuSub / pendingDeleteSub / toastMessage.
//
// The bodies ported here are the v06 *superset* (verbatim): submitting-guard
// (T-63-01), reload-on-success (T-63-04), WR-06 stale-4xx reload, and the
// `reloadPending` re-entrancy (WR-01). V10 previously lacked `reloadPending`;
// adopting it is behaviourally safe because `reloadPending` only fires when a
// second `load()` arrives while one is in flight — a path V10 already
// serialised by no-op'ing the second load. With the superset V10 now *coalesces*
// (re-runs) instead of dropping the second load, which is strictly safer and
// never changes ordering or surfaces a different state.
//
// The injectable `API` seam (v06's WR-04 closure struct) is lifted here so
// BOTH shells' domain logic is unit-testable without network.
//
// Sort: presentation order stays per-shell. The store holds subscriptions in
// the order returned by an injectable `sort:` closure — v06 passes
// `SubscriptionsDomain.sortV06` (so its View binds `store.subscriptions`
// pre-sorted exactly as before); V10 passes identity (`{ $0 }`) and keeps its
// own `sortedSubs` derived getter calling `SubscriptionsDomain.sortV10`. This
// keeps BOTH shells' displayed order byte-identical to pre-refactor.

import Foundation
import Observation

@MainActor
@Observable
final class SubscriptionsStore {
    /// Injectable network-seam (WR-04, lifted from the v06 VM). Defaults proxy
    /// `SubscriptionsV10API`/`Categories`/`Accounts` static methods — prod
    /// behaviour is unchanged. Tests substitute closures with stubs to assert
    /// submitting-guard / reload-on-success / re-entrancy without network.
    struct API {
        var listSubs: () async throws -> [SubscriptionV10DTO]
        var listCategories: () async throws -> [CategoryDTO]
        var listAccounts: () async throws -> [AccountDTO]
        var reschedule: ([SubscriptionV10DTO]) async -> Void
        var post: (Int) async throws -> Void
        var unpost: (Int) async throws -> Void
        var delete: (Int) async throws -> Void
        var patch: (Int, SubscriptionV10UpdateRequest) async throws -> Void

        static let live = API(
            listSubs: { try await SubscriptionsV10API.list() },
            listCategories: { try await CategoriesAPI.list() },
            listAccounts: { try await AccountsAPI.list() },
            reschedule: { await LocalNotifications.reschedule(subscriptionsV10: $0) },
            post: { _ = try await SubscriptionsV10API.post(id: $0) },
            unpost: { try await SubscriptionsV10API.unpost(id: $0) },
            delete: { try await SubscriptionsV10API.delete(id: $0) },
            patch: { _ = try await SubscriptionsV10API.patch(id: $0, payload: $1) }
        )
    }

    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    @ObservationIgnored
    private let api: API

    /// Whether `load()` also fetches categories + accounts and reschedules
    /// notifications (v06 needs them for the editor + local pushes; V10 lists
    /// subs only). When false, `categories`/`accounts` stay empty and
    /// `reschedule` is not called.
    @ObservationIgnored
    private let loadsCategoriesAccounts: Bool

    /// Stored-order projection applied to the freshly fetched list. v06 passes
    /// `SubscriptionsDomain.sortV06`; V10 passes identity and sorts in its own
    /// derived layer.
    @ObservationIgnored
    private let sort: ([SubscriptionV10DTO]) -> [SubscriptionV10DTO]

    init(
        api: API = .live,
        loadsCategoriesAccounts: Bool,
        sort: @escaping ([SubscriptionV10DTO]) -> [SubscriptionV10DTO] = { $0 }
    ) {
        self.api = api
        self.loadsCategoriesAccounts = loadsCategoriesAccounts
        self.sort = sort
    }

    private(set) var subscriptions: [SubscriptionV10DTO] = []
    private(set) var categories: [CategoryDTO] = []
    private(set) var accounts: [AccountDTO] = []
    private(set) var status: Status = .idle
    private(set) var submitting: Bool = false

    @ObservationIgnored
    private var inFlight: Bool = false

    /// WR-01: if a mutation calls load() while another load() is already in
    /// flight (e.g. .refreshable / .task), the reload must not be silently
    /// dropped. The flag is set on skip and re-invokes load() in the in-flight
    /// load()'s defer.
    @ObservationIgnored
    private var reloadPending: Bool = false

    // MARK: - Load

    func load() async {
        if inFlight {
            reloadPending = true
            return
        }
        inFlight = true
        defer {
            inFlight = false
            if reloadPending {
                reloadPending = false
                Task { await load() }
            }
        }

        status = .loading
        do {
            if loadsCategoriesAccounts {
                async let subsTask = api.listSubs()
                async let catsTask = api.listCategories()
                async let accsTask = api.listAccounts()
                let (subs, cats, accs) = try await (subsTask, catsTask, accsTask)
                self.subscriptions = sort(subs)
                self.categories = cats.filter { !$0.isArchived }
                self.accounts = accs
                // Notifications reschedule (v06 path) — restored via V10DTO
                // overload (63-01 known-gap closed).
                await api.reschedule(self.subscriptions)
            } else {
                let subs = try await api.listSubs()
                self.subscriptions = sort(subs)
            }
            status = .ready
        } catch {
            print("[SubscriptionsStore] load failed: \(error)")
            status = .error("Не удалось загрузить подписки")
        }
    }

    // MARK: - Mutations

    /// Post a subscription charge (creates a transaction). Submitting guard
    /// (T-63-01) + reload (T-63-04) on success.
    @discardableResult
    func post(_ id: Int) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await api.post(id)
            await load()
            return true
        } catch {
            print("[SubscriptionsStore] post failed: \(error)")
            // WR-06: a stale-state 4xx (e.g. already posted) could leave a row
            // with a stale posted badge. Reload reflects real state.
            await load()
            return false
        }
    }

    /// Cancel a subscription charge. Submitting guard + reload.
    @discardableResult
    func unpost(_ id: Int) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await api.unpost(id)
            await load()
            return true
        } catch {
            print("[SubscriptionsStore] unpost failed: \(error)")
            // WR-06: a stale-state 4xx (e.g. already unposted) could leave a
            // row with a stale posted badge. Reload reflects real state.
            await load()
            return false
        }
    }

    /// Delete a subscription (hard delete). Submitting guard + reload.
    @discardableResult
    func delete(_ id: Int) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await api.delete(id)
            await load()
            return true
        } catch {
            print("[SubscriptionsStore] delete failed: \(error)")
            return false
        }
    }

    /// PATCH a subscription by id (V10-extension fields day_of_month/account_id
    /// for the v06 editor; is_active/amount_cents/day_of_month for the V10
    /// menu). Submitting guard + reload on success.
    @discardableResult
    func patch(id: Int, payload: SubscriptionV10UpdateRequest) async -> Bool {
        guard !submitting else { return false }
        submitting = true
        defer { submitting = false }
        do {
            try await api.patch(id, payload)
            await load()
            return true
        } catch {
            print("[SubscriptionsStore] patch failed: \(error)")
            return false
        }
    }
}
