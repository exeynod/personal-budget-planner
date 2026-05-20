import Foundation

/// Phase 62 — typed-route enum для Savings (Копилка) NavigationLinks.
///
/// Используется вместо `Int` чтобы избежать collision с
/// `AccountsView.navigationDestination(for: Int.self)` и
/// `PlanEditorView.navigationDestination(for: PlanEditorRoute.self)`
/// в shared ManagementView NavigationStack. Когда user находится
/// на /accounts, Int-binding уже занят AccountDetailView push'ем —
/// поэтому Savings использует свой typed enum.
///
/// Hashable conformance обязательна для NavigationLink(value:) API.
enum SavingsRoute: Hashable {
    /// Push на детальный view одной цели.
    case goal(id: Int)
}
