// Phase 25-11 Task 3: data loader + form state + submit orchestrator for
// AddSheetView (ADD-V10-02..05). Symmetric to web Plan 25-10 ViewModel.
//
// Pattern (mirrors HomeV10ViewModel from Plan 25-05):
//   - @MainActor @Observable class.
//   - Two state machines: `loadStatus` (idle/loading/ready/error) for
//     accounts + categories fetch; `submitStatus` (idle/submitting/
//     success/error(msg)) for the POST /actual round-trip.
//   - `inFlight` re-entrancy guard on loadFormData.
//
// All form mutation goes through AddSheetData pure helpers — the
// ViewModel is a thin orchestrator over them, keeping mutations testable
// without instantiating SwiftUI.
//
// Phase 30-03 (DEBT-02): после успешного создания транзакции
// постится `Notification.Name.txnCreated` в `NotificationCenter.default`.
// HomeV10ViewModel и TransactionsV10ViewModel слушают это уведомление и
// перезагружают данные — закрывает iOS-сторону DEBT-02 (web уже делает
// рефетч через reloadToken).

import Foundation
import Observation

extension Notification.Name {
    /// Phase 30-03 (DEBT-02): posted by `AddSheetViewModel.submit()`
    /// after a successful POST /actual. Observers (HomeV10ViewModel,
    /// TransactionsV10ViewModel) call their `load()` to refetch state.
    /// userInfo carries `"id": Int` — the new transaction id (currently
    /// informational; observers refetch wholesale rather than splicing).
    static let txnCreated = Notification.Name("budgetplanner.txnCreated")
}

@MainActor
@Observable
final class AddSheetViewModel {

    // MARK: - State machines

    enum LoadStatus: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    enum SubmitStatus: Equatable {
        case idle
        case submitting
        case success
        case error(String)
    }

    // MARK: - Form state (driven by KeypadView + chips + pickers)

    var amountString: String = ""  // built via Keypad; e.g. "12.50"
    var description: String = ""
    var dateChip: AddSheetDateChip = .today
    var customDate: Date = Date()
    var categoryId: Int? = nil
    var accountId: Int? = nil

    /// Phase 71 — Доход/Расход toggle. Default `.expense` preserves the prior
    /// hardcoded-expense behaviour. Drives both the submit payload `kind` and
    /// the category-chip filter (`visibleCategories`). Mutate via `setKind`
    /// (not directly) so a stale cross-kind category selection is cleared.
    private(set) var kind: AddSheetKind = .expense

    // MARK: - Loaded data

    private(set) var categories: [CategoryV10DTO] = []
    private(set) var accounts: [AccountDTO] = []
    private(set) var loadStatus: LoadStatus = .idle
    private(set) var submitStatus: SubmitStatus = .idle

    private var inFlight: Bool = false

    // MARK: - Derived (computed via pure helpers)

    var amountCents: Int { AddSheetData.parseAmountToCents(amountString) }

    var ctaState: AddSheetCtaState {
        // WR-25-02 (review fix): pass `accountId` so the CTA collapses to
        // `.noAccount` if `loadFormData()` failed or the user has zero
        // accounts. Without this gate, `submit()` would POST `accountId: nil`
        // and the server would silently take the legacy path → wallet
        // balance never updates (HOME-V10-04 desync).
        AddSheetData.ctaState(
            amountCents: amountCents,
            categoryId: categoryId,
            accountId: accountId
        )
    }

    /// Form is dirty when at least one user-supplied field has content.
    /// Used by V10MainShell / AddSheetView to gate the close-confirm
    /// alert (T-25-11-02 mitigation).
    var isDirty: Bool {
        !amountString.isEmpty || !description.isEmpty || categoryId != nil
    }

    /// Filter category list for the chip-scroll: drop system 'savings' and
    /// any paused categories, AND scope to the selected `kind` (Phase 71) so
    /// Расход shows only expense buckets and Доход only income buckets
    /// (e.g. ЗАРПЛАТА). Delegates to the pure `AddSheetData` helper.
    var visibleCategories: [CategoryV10DTO] {
        AddSheetData.visibleCategories(categories, for: kind)
    }

    /// Phase 71 — flip the Доход/Расход toggle. If the currently-selected
    /// category is not valid for the new kind, clear `categoryId` (force a
    /// re-pick) so an income category can never be posted as expense (and
    /// vice-versa). No-op if `newKind` equals the current kind.
    func setKind(_ newKind: AddSheetKind) {
        guard newKind != kind else { return }
        kind = newKind
        categoryId = AddSheetData.clearedCategoryIfInvalid(
            categoryId, in: categories, for: newKind
        )
    }

    /// Resolved tx_date based on selected chip (today/yesterday/customDate).
    var resolvedTxDate: Date {
        switch dateChip {
        case .today:
            return Date()
        case .yesterday:
            return AddSheetData.defaultDate(
                for: .yesterday, today: Date()
            ) ?? Date()
        case .custom:
            return customDate
        }
    }

    // MARK: - Load form data

    /// Fetch categories + accounts in parallel. Default account = primary
    /// (per AccountsAPI ordering: `is_primary DESC, id ASC`).
    /// Re-entrant calls are no-ops (T-25-11 DoS guard, mirrors HomeV10ViewModel).
    func loadFormData() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }
        loadStatus = .loading
        do {
            async let cats = CategoriesV10API.list()
            async let accs = AccountsAPI.list()
            let loadedCats = try await cats
            let loadedAccs = try await accs
            self.categories = loadedCats
            self.accounts = loadedAccs
            if accountId == nil {
                accountId =
                    loadedAccs.first(where: { $0.primary })?.id
                    ?? loadedAccs.first?.id
            }
            loadStatus = .ready
        } catch {
            loadStatus = .error("не удалось загрузить категории/счета")
        }
    }

    // MARK: - Submit

    /// POST /actual via ActualV10API.create. Returns the new transaction
    /// id on success (caller dismisses sheet); returns nil + sets
    /// submitStatus on failure.
    ///
    /// Encodes tx_date as `yyyy-MM-dd` (DATE on the wire; ActualCreateRequest
    /// expects a String, not Date).
    func submit() async -> Int? {
        guard ctaState == .ready, let catId = categoryId else { return nil }
        submitStatus = .submitting

        let txDateString = Self.txDateFormatter.string(from: resolvedTxDate)
        // Phase 71: payload (incl. kind) built via the pure AddSheetData
        // seam — kind is no longer hardcoded "expense"; it follows the
        // Доход/Расход toggle.
        let request = AddSheetData.buildPayload(
            kind: kind,
            amountCents: amountCents,
            categoryId: catId,
            txDate: txDateString,
            description: description,
            accountId: accountId
        )
        do {
            let result = try await ActualV10API.create(request)
            submitStatus = .success
            // Phase 30-03 (DEBT-02): broadcast so Home + Transactions
            // ViewModels refetch and reflect the new fact-line without a
            // manual pull-to-refresh. userInfo carries the new id for
            // future incremental observers; current observers refetch
            // wholesale (simpler, matches the v0.x ActualAPI.delete →
            // load() pattern in TransactionsV10ViewModel.delete).
            NotificationCenter.default.post(
                name: .txnCreated,
                object: nil,
                userInfo: ["id": result.id]
            )
            return result.id
        } catch {
            submitStatus = .error("не удалось сохранить — попробуйте снова")
            return nil
        }
    }

    /// Reset form back to a fresh-open state (called after successful
    /// submit / cancel-confirm so the next FAB tap starts clean).
    func reset() {
        amountString = ""
        description = ""
        dateChip = .today
        customDate = Date()
        categoryId = nil
        kind = .expense  // Phase 71 — back to the default expense flow.
        // accountId stays — primary account default is sticky across sessions.
        submitStatus = .idle
    }

    // MARK: - Keypad bindings (call sites in AddSheetView)

    func onAppendDigit(_ d: String) {
        amountString = AddSheetData.appendDigit(amountString, d)
    }
    func onAppendDot() {
        amountString = AddSheetData.appendDot(amountString)
    }
    func onBackspace() {
        amountString = AddSheetData.backspace(amountString)
    }

    // MARK: - Wire date format (DATE on the API)

    /// Static DateFormatter — `yyyy-MM-dd`, business TZ `Europe/Moscow`.
    ///
    /// CR-25-02 (review fix): formatting `Date()` in UTC shifts the calendar
    /// day for users east of UTC after their local 21:00, sending the txn
    /// to the wrong budget period. CLAUDE.md §Conventions pins period
    /// boundaries to `Europe/Moscow`; the web `computeAddSheet.ts` uses
    /// local-time components for the same reason. Falls back to `.current`
    /// only if the named TZ is unknown (defensive — should never happen on
    /// supported iOS versions).
    /// Lazy-initialized once per process.
    private static let txDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}
