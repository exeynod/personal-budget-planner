// Phase 27-09 Task 2: data loader + new-account mutation glue for
// AccountsListV10View. Symmetric to web Plan 27-04 AccountsListMount.
//
// Loads /api/v1/accounts; exposes a sheet binding for «+ ДОБАВИТЬ СЧЁТ»
// and a `createAccount` mutation that POSTs the form payload and refetches.
//
// Threat-model:
//   - T-27-09-01 / T-27-09-02 mitigations live in NewAccountSheet (UI gates
//     + sanitisation) — ViewModel forwards the validated draft as-is.
//   - T-27-09-03 (cross-tenant) accepted — RLS server-side.
// Re-entrancy: `inFlight` guard for load(), `submitting` flag for create.

import Foundation
import Observation

@MainActor
@Observable
final class AccountsListV10ViewModel {
    enum Status: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    enum SheetMode: Equatable {
        case none
        case newAccount
    }

    private(set) var status: Status = .idle
    private(set) var accounts: [AccountDTO] = []
    var sheet: SheetMode = .none
    private(set) var submitting: Bool = false

    private var inFlight: Bool = false

    // MARK: - Load

    func load() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        status = .loading
        do {
            self.accounts = try await AccountsAPI.list()
            status = .ready
        } catch {
            status = .error("Не удалось загрузить счета")
        }
    }

    // MARK: - Mutations (ACCT-V10-02)

    /// POST /accounts and refetch on success. Silent on failure (Phase 28
    /// polish wires a poster-styled toast).
    func createAccount(
        bank: String,
        kind: AccountKind,
        mask: String?,
        balanceCents: Int,
        primary: Bool
    ) async {
        submitting = true
        defer { submitting = false }

        do {
            let normalisedMask: String? = (mask?.isEmpty == false && kind == .card) ? mask : nil
            _ = try await AccountsAPI.create(
                AccountCreateRequest(
                    bank: bank.trimmingCharacters(in: .whitespacesAndNewlines),
                    kind: kind,
                    mask: normalisedMask,
                    balanceCents: balanceCents,
                    primary: primary ? true : nil
                )
            )
            sheet = .none
            await load()
        } catch {
            // Silent for v1.0; Phase 28: toast/banner.
        }
    }

    // MARK: - Derived (consumed by View)

    var totalBalanceCents: Int {
        AccountsData.sumBalances(accounts)
    }

    var accountCount: Int {
        AccountsData.count(accounts)
    }
}
