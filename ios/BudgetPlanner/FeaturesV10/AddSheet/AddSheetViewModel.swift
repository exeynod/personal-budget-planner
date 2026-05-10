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

import Foundation
import Observation

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

    var amountString: String = ""               // built via Keypad; e.g. "12.50"
    var description: String = ""
    var dateChip: AddSheetDateChip = .today
    var customDate: Date = Date()
    var categoryId: Int? = nil
    var accountId: Int? = nil

    // MARK: - Loaded data

    private(set) var categories: [CategoryV10DTO] = []
    private(set) var accounts: [AccountDTO] = []
    private(set) var loadStatus: LoadStatus = .idle
    private(set) var submitStatus: SubmitStatus = .idle

    private var inFlight: Bool = false

    // MARK: - Derived (computed via pure helpers)

    var amountCents: Int { AddSheetData.parseAmountToCents(amountString) }

    var ctaState: AddSheetCtaState {
        AddSheetData.ctaState(amountCents: amountCents, categoryId: categoryId)
    }

    /// Form is dirty when at least one user-supplied field has content.
    /// Used by V10MainShell / AddSheetView to gate the close-confirm
    /// alert (T-25-11-02 mitigation).
    var isDirty: Bool {
        !amountString.isEmpty || !description.isEmpty || categoryId != nil
    }

    /// Filter category list for the chip-scroll: drop system 'savings'
    /// and any paused categories (matches HomeV10ViewModel filter so the
    /// AddSheet can only assign expenses to user-visible buckets).
    var visibleCategories: [CategoryV10DTO] {
        categories.filter { $0.code != "savings" && !$0.paused }
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
                accountId = loadedAccs.first(where: { $0.primary })?.id
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
        let request = ActualCreateRequest(
            kind: "expense",
            amountCents: amountCents,
            categoryId: catId,
            txDate: txDateString,
            description: description.isEmpty ? nil : description,
            accountId: accountId
        )
        do {
            let result = try await ActualV10API.create(request)
            submitStatus = .success
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
