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

/// Three-state CTA gate (ADD-V10-05). Mirrors the web equivalent.
///   - empty → "ВВЕДИТЕ СУММУ"      (disabled gray)
///   - noCat → "ВЫБЕРИТЕ КАТЕГОРИЮ" (disabled gray)
///   - ready → "СОХРАНИТЬ ↵"        (active yellow)
enum AddSheetCtaState: Equatable {
    case empty
    case noCat
    case ready
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
    /// Rules:
    ///   - If `current == "0"` and `digit != "."`, replace lone zero.
    ///   - If `current` already contains "." and the decimal part is at
    ///     two characters, return unchanged (cap at copecks precision).
    ///   - Else: append.
    static func appendDigit(_ current: String, _ digit: String) -> String {
        // Cap decimal part at 2 chars.
        if let dotIdx = current.firstIndex(of: ".") {
            let decimalPart = current[current.index(after: dotIdx)...]
            if decimalPart.count >= 2 {
                return current
            }
        }
        if current == "0" {
            return digit
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
    static func ctaState(amountCents: Int, categoryId: Int?) -> AddSheetCtaState {
        if amountCents == 0 { return .empty }
        if categoryId == nil { return .noCat }
        return .ready
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
