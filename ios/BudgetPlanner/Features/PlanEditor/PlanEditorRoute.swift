import Foundation

/// Phase 61 — typed-route enum для PlanEditor NavigationLinks.
///
/// Используется вместо `Int` чтобы избежать collision с
/// `AccountsView.navigationDestination(for: Int.self)` в shared
/// ManagementView NavigationStack. Когда user находится на /accounts,
/// Int-binding уже занят AccountDetailView push'ем — поэтому PlanEditor
/// использует свой typed enum.
///
/// Hashable conformance обязательна для NavigationLink(value:) API.
enum PlanEditorRoute: Hashable {
    /// Push на детальный editor для одной категории.
    case row(categoryId: Int)
}
