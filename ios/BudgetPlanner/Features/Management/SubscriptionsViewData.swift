// Phase 63 Plan 01 — pure-compute helpers для v06 Subscriptions (Подписки)
// master screen + editor draft validation.
//
// Symmetric в духе FeaturesV10/Subscriptions/SubscriptionsData.swift, но:
//   - enum переименован в `SubscriptionsViewData` — Swift запрещает два
//     symbol с одинаковым именем в одном таргете (BudgetPlanner);
//   - file basename `SubscriptionsViewData.swift` (НЕ `SubscriptionsData.swift`):
//     Swift запрещает два файла с одинаковым basename в одном таргете
//     ("Filename used twice") — урок Phase 62-01 (SavingsViewData rename);
//   - формулы переняты заново под SubscriptionV10DTO: monthlyLoad annualises
//     yearly через integer /12 (как текущий legacy SubscriptionsViewModel),
//     а не computeMonthlyTotal (V10 считал только monthly) — v06 «В месяц»
//     карточка показывает совокупную месячную нагрузку всех активных;
//   - formatCadenceRu — v06 RU-копия: "ежемесячно, N числа" / "ежемесячно"
//     / "ежегодно" (без day/month genitive расчёта — proще sibling-копии).
//
// Foundation only — no SwiftUI imports — unit-test cheaply. Деньги — Int
// cents, без float. day_of_month — ordinal 1..28, без timezone.

import Foundation

enum SubscriptionsViewData {

    /// Число подписок с `isActive == true`.
    static func computeActiveCount(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy.filter { $0.isActive }.count
    }

    /// Совокупная месячная нагрузка по активным подпискам, в копейках.
    ///
    /// monthly → amountCents целиком; yearly → amountCents / 12 (integer
    /// деление, как текущий legacy VM — без float). Неактивные исключены.
    static func computeMonthlyLoadCents(_ subs: [SubscriptionV10DTO]) -> Int {
        subs.lazy
            .filter { $0.isActive }
            .reduce(0) { acc, s in
                acc + (s.cycle == .monthly ? s.amountCents : s.amountCents / 12)
            }
    }

    /// Сортировка для master-list — по nextChargeDate ASC (ближайшее списание
    /// первым), как текущий load sort. Возвращает новый массив.
    static func sortForDisplay(_ subs: [SubscriptionV10DTO]) -> [SubscriptionV10DTO] {
        subs.sorted { $0.nextChargeDate < $1.nextChargeDate }
    }

    /// RU-копия каденции для row caption.
    ///
    /// Cases:
    ///   - cycle == .monthly && dayOfMonth != nil → "ежемесячно, N числа"
    ///   - cycle == .monthly && dayOfMonth == nil → "ежемесячно"
    ///   - cycle == .yearly                       → "ежегодно"
    static func formatCadenceRu(cycle: SubCycle, dayOfMonth: Int?) -> String {
        switch cycle {
        case .monthly:
            if let day = dayOfMonth {
                return "ежемесячно, \(day) числа"
            }
            return "ежемесячно"
        case .yearly:
            return "ежегодно"
        }
    }

    /// `postedTxnId != nil` — подписка проведена (создана транзакция).
    static func isPosted(_ sub: SubscriptionV10DTO) -> Bool {
        sub.postedTxnId != nil
    }

    /// Validation gate для editor «Создать»/«Сохранить» button.
    ///
    /// name non-empty после trim AND amountCents > 0 AND categoryId != nil
    /// AND !submitting (double-submit guard zeroes button).
    static func isValidDraft(
        name: String,
        amountCents: Int,
        categoryId: Int?,
        submitting: Bool
    ) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && amountCents > 0 && categoryId != nil && !submitting
    }
}
