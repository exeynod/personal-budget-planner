// Phase 25-11 Task 1: pure-compute helpers for the iOS AddSheet form
// (ADD-V10-02..05). Symmetric to web Plan 25-10 helpers in
// `frontend/src/screensV10/AddSheet/data.ts` (same wave).
//
// All helpers are stateless static functions / enums — no Foundation deps
// beyond Date / Calendar. Lets tests run cheaply (AddSheetDataTests) and
// keeps the AddSheetViewModel thin (orchestration only).
//
// Threat-model:
//   - T-25-11-03 (Tampering: negative amountCents via state mutation):
//     parseAmountToCents always returns ≥ 0; invalid inputs collapse to 0
//     so the CTA gate (ctaState) never lets a negative submit through.

import Foundation

// MARK: - CTA state machine

/// Four-state CTA gate (ADD-V10-05). Mirrors the web equivalent.
///   - empty     → "ВВЕДИТЕ СУММУ"      (disabled gray)
///   - noCat     → "ВЫБЕРИТЕ КАТЕГОРИЮ" (disabled gray)
///   - noAccount → "НЕТ СЧЁТА"          (disabled gray; WR-25-02)
///   - ready     → "СОХРАНИТЬ ↵"        (active yellow)
///
/// WR-25-02 (review fix): gate added to mirror the web change for WR-25-01
/// — posting `account_id: nil` silently falls into the legacy backend path
/// (no wallet delta, HOME-V10-04 desync). Surface the failure to the user
/// instead of letting `submit()` fire a half-broken request.
enum AddSheetCtaState: Equatable {
    case empty
    case noCat
    case noAccount
    case ready
}

// MARK: - Kind toggle

/// Phase 71 — Доход/Расход segmented toggle on the Maximal Poster AddSheet.
///
/// Mirrors the v06 editor's Расход/Доход segmented control. The MP quick-add
/// sheet previously HARDCODED `kind: "expense"` in the submit payload, so the
/// user could never create an income actual. This enum drives both the toggle
/// state and the category-chip filter.
///
/// `wire` matches the backend `ActualKindStr` literals (`app/api/schemas/actual.py`)
/// and `CategoryKind.rawValue` so the same value filters categories and posts.
enum AddSheetKind: String, CaseIterable, Equatable {
    case expense
    case income

    /// Russian label for the segmented toggle.
    var label: String {
        switch self {
        case .expense: return "Расход"
        case .income: return "Доход"
        }
    }

    /// Wire literal for `ActualCreateRequest.kind`.
    var wire: String { rawValue }

    /// The matching category kind for chip filtering.
    var categoryKind: CategoryKind {
        switch self {
        case .expense: return .expense
        case .income: return .income
        }
    }
}

// MARK: - Date chip

/// Three date chips shown above the keypad (ADD-V10-04).
/// `.custom` opens a DatePicker; `.today` / `.yesterday` are direct buttons.
enum AddSheetDateChip: String, CaseIterable {
    case today
    case yesterday
    case custom
}

// MARK: - Pure helpers

enum AddSheetData {

    // ─────────────── amount string mutation ───────────────

    /// Append a digit (0-9) to the current amount string.
    ///
    /// Rules (matched 1:1 with web `computeAddSheet.ts::appendDigit` —
    /// WR-25-08 review fix re-orders the guards so the cross-platform
    /// state machine is identical):
    ///   - Empty input + any digit → that digit ('5' or '0').
    ///   - `current == "0"` and `digit != "0"` → replace ('0' + '5' = '5').
    ///   - `current == "0"` and `digit == "0"` → unchanged ('0' stays '0').
    ///   - In decimal mode (after dot) cap decimal at 2 chars.
    ///   - Else: append.
    static func appendDigit(_ current: String, _ digit: String) -> String {
        // 1. Empty input → first digit becomes the whole string.
        if current.isEmpty { return digit }
        // 2. Leading-zero guard — '0' alone is the implicit empty input.
        if current == "0" && digit != "0" { return digit }
        if current == "0" && digit == "0" { return current }
        // 3. Cap decimal part at 2 chars.
        if let dotIdx = current.firstIndex(of: ".") {
            let decimalPart = current[current.index(after: dotIdx)...]
            if decimalPart.count >= 2 { return current }
        }
        return current + digit
    }

    /// Append a dot to the current amount string.
    ///
    /// Rules:
    ///   - If `current` is empty, return "0." (leading zero for clarity).
    ///   - If `current` already contains ".", return unchanged.
    ///   - Else: append.
    static func appendDot(_ current: String) -> String {
        if current.contains(".") { return current }
        if current.isEmpty { return "0." }
        return current + "."
    }

    /// Drop the last character (⌫). Empty input stays empty.
    static func backspace(_ current: String) -> String {
        if current.isEmpty { return "" }
        return String(current.dropLast())
    }

    // ─────────────── parseAmountToCents ───────────────

    /// Parse an amount string ("12", "12.5", "0.05", "5.") to integer cents.
    /// Returns 0 for empty / "0" / invalid input.
    ///
    /// Examples:
    ///   - ""     → 0
    ///   - "0"    → 0
    ///   - "5"    → 500
    ///   - "5."   → 500
    ///   - "5.5"  → 550
    ///   - "5.50" → 550
    ///   - "0.05" → 5
    static func parseAmountToCents(_ s: String) -> Int {
        if s.isEmpty || s == "0" { return 0 }

        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        // 0 dots → ["123"]; 1 dot → ["123", "45"] or ["123", ""].
        // 2+ dots → invalid (e.g. "1.2.3" → 3 parts).
        if parts.count == 1 {
            // No dot — pure rubles.
            guard let rubles = Int(parts[0]) else { return 0 }
            return Swift.max(0, rubles) * 100
        }
        if parts.count == 2 {
            let rublePart = parts[0]
            let decimalPart = parts[1]
            // "." alone → invalid.
            if rublePart.isEmpty && decimalPart.isEmpty { return 0 }
            let rubles: Int
            if rublePart.isEmpty {
                rubles = 0
            } else {
                guard let r = Int(rublePart) else { return 0 }
                rubles = r
            }
            let cents: Int
            if decimalPart.isEmpty {
                cents = 0  // "5." → 500
            } else if decimalPart.count == 1 {
                guard let d = Int(decimalPart) else { return 0 }
                cents = d * 10  // "5.5" → 550 (50 cents)
            } else if decimalPart.count == 2 {
                guard let d = Int(decimalPart) else { return 0 }
                cents = d  // "5.50" → 550, "0.05" → 5
            } else {
                return 0  // > 2 decimal chars (defensive — appendDigit caps it)
            }
            return Swift.max(0, rubles) * 100 + cents
        }
        return 0
    }

    // ─────────────── CTA state ───────────────

    /// Compute the CTA gate state from current form fields.
    ///
    /// `accountId` is optional-by-default to keep prior 2-arg call sites
    /// (and tests written before WR-25-02) compiling without churn. Pass
    /// it explicitly with the actual `accountId` from the ViewModel to
    /// enable the WR-25-02 wallet-account gate.
    static func ctaState(
        amountCents: Int,
        categoryId: Int?,
        accountId: Int? = -1
    ) -> AddSheetCtaState {
        if amountCents == 0 { return .empty }
        if categoryId == nil { return .noCat }
        // Sentinel `-1` (≠ a real account id; AccountDTO.id is a positive
        // SERIAL) means "caller did not opt into the WR-25-02 gate".
        if accountId != -1 && accountId == nil { return .noAccount }
        return .ready
    }

    // ─────────────── category chip filtering (Phase 71) ───────────────

    /// Filter the category list for the chip-scroll, scoped to the selected
    /// kind (Phase 71). Drops the system 'savings' sink and paused buckets
    /// (matches `HomeData.computeCategoryAggregates` / the prior
    /// `visibleCategories` behaviour) AND keeps only categories whose
    /// `kind` matches the toggle — so Доход shows only income buckets
    /// (e.g. ЗАРПЛАТА) and Расход shows only expense buckets. Prevents the
    /// pre-fix bug where an income category could be submitted as expense.
    static func visibleCategories(
        _ categories: [CategoryV10DTO],
        for kind: AddSheetKind
    ) -> [CategoryV10DTO] {
        categories.filter {
            $0.code != "savings"
                && $0.kind == kind.categoryKind
        }
    }

    /// Returns the currently-selected categoryId if it is still valid for the
    /// `kind` (present in the kind-scoped visible list), otherwise `nil`.
    /// Called when the toggle flips so a stale selection from the other kind
    /// is cleared, forcing a re-pick (you can't submit an income category as
    /// expense or vice-versa).
    static func clearedCategoryIfInvalid(
        _ categoryId: Int?,
        in categories: [CategoryV10DTO],
        for kind: AddSheetKind
    ) -> Int? {
        guard let id = categoryId else { return nil }
        let valid = visibleCategories(categories, for: kind).contains { $0.id == id }
        return valid ? id : nil
    }

    // ─────────────── build submit payload (Phase 71) ───────────────

    /// Build the `POST /actual` request body from current form state. Pure +
    /// testable seam extracted from `AddSheetViewModel.submit()` so the
    /// kind-wiring (Phase 71: income vs expense, previously HARDCODED to
    /// "expense") can be asserted without a network round-trip.
    ///
    /// `kind.wire` matches the backend `ActualKindStr` literal — Доход posts
    /// `"income"`, Расход posts `"expense"`.
    static func buildPayload(
        kind: AddSheetKind,
        amountCents: Int,
        categoryId: Int,
        txDate: String,
        description: String,
        accountId: Int?
    ) -> ActualCreateRequest {
        ActualCreateRequest(
            kind: kind.wire,
            amountCents: amountCents,
            categoryId: categoryId,
            txDate: txDate,
            description: description.isEmpty ? nil : description,
            accountId: accountId
        )
    }

    // ─────────────── default date for chip ───────────────

    /// Resolve a Date for the currently-selected date chip.
    /// `.today` → today; `.yesterday` → today - 1 day; `.custom` → nil
    /// (caller falls back to a separate `customDate` field bound to a
    /// SwiftUI DatePicker).
    static func defaultDate(
        for chip: AddSheetDateChip,
        today: Date,
        calendar: Calendar = .current
    ) -> Date? {
        switch chip {
        case .today:
            return today
        case .yesterday:
            return calendar.date(byAdding: .day, value: -1, to: today)
        case .custom:
            return nil
        }
    }
}
