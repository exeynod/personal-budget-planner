import SwiftUI

/// Management hub — native iOS 26 layout.
///   - NavigationStack + .navigationTitle("Управление") large title
///   - List(.insetGrouped) с Section "Профиль" + Section "Меню"
///   - NavigationLink(value:) Label rows для sub-screens
///   - Доступ — owner-only, OWNER capsule badge
struct ManagementView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var path = NavigationPath()

    private var user: UserDTO? {
        if case .authenticated(let user) = authStore.state { return user }
        return nil
    }

    private var isOwner: Bool { user?.role == "owner" }

    private var visibleItems: [ManagementItem] {
        ManagementItem.all.filter { !$0.ownerOnly || isOwner }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    profileRow
                }

                Section("Меню") {
                    ForEach(visibleItems) { item in
                        NavigationLink(value: item.id) {
                            row(for: item)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Управление")
            .navigationDestination(for: ManagementItem.ID.self) { id in
                destination(for: id)
            }
            .onAppear { handleDevAutoNav() }
        }
    }

    private var profileRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Tokens.Accent.primary.opacity(0.18))
                .overlay(
                    Text("У")
                        .font(.headline)
                        .foregroundStyle(Tokens.Accent.primary)
                )
                .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Пользователь")
                    .font(.body)
                    .foregroundStyle(.primary)
                Text(roleSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }

    private var roleSubtitle: String {
        let role = user?.role ?? "—"
        return "\(role) · —"
    }

    private func row(for item: ManagementItem) -> some View {
        HStack(spacing: 6) {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(item.label)
                            .font(.body)
                            .foregroundStyle(.primary)
                        if item.ownerOnly {
                            ownerBadge
                        }
                    }
                    Text(item.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: item.icon)
                    .foregroundStyle(Tokens.Accent.primary)
            }
        }
    }

    private var ownerBadge: some View {
        Text("OWNER")
            .font(.caption2.weight(.bold))
            .foregroundStyle(Tokens.Accent.primary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Tokens.Accent.primary.opacity(0.15), in: Capsule())
    }

    @ViewBuilder
    private func destination(for id: ManagementItem.ID) -> some View {
        switch id {
        case .analytics: AnalyticsView()
        case .subscriptions: SubscriptionsView()
        case .template: TemplateView()
        case .accounts: AccountsView()
        case .categories: CategoriesView()
        case .settings: SettingsView()
        case .access: AccessView()
        case .planEditor: PlanEditorView()
        }
    }

    private func handleDevAutoNav() {
        let defaults = UserDefaults.standard
        if let target = defaults.string(forKey: "DEV_OPEN_MANAGEMENT_SCREEN"),
           let id = ManagementItem.ID(rawValue: target),
           path.isEmpty {
            path.append(id)
        }
    }
}

// MARK: - Items

struct ManagementItem: Identifiable, Hashable {
    enum ID: String, Hashable {
        case analytics, subscriptions, template, accounts, categories, settings, access, planEditor
    }

    let id: ID
    let label: String
    let description: String
    let icon: String
    let ownerOnly: Bool

    static let all: [ManagementItem] = [
        .init(id: .analytics, label: "Аналитика",
              description: "Тренды и прогноз бюджета",
              icon: "chart.bar.fill", ownerOnly: false),
        .init(id: .planEditor, label: "План месяца",
              description: "Лимиты категорий и rollover",
              icon: "slider.horizontal.3", ownerOnly: false),
        .init(id: .subscriptions, label: "Подписки",
              description: "Регулярные платежи и напоминания",
              icon: "square.stack.3d.up.fill", ownerOnly: false),
        .init(id: .template, label: "Шаблон бюджета",
              description: "Повторяющийся план для нового периода",
              icon: "list.bullet.rectangle", ownerOnly: false),
        .init(id: .accounts, label: "Счета",
              description: "Карты и наличные, основной счёт",
              icon: "creditcard.fill", ownerOnly: false),
        .init(id: .categories, label: "Категории",
              description: "Структура расходов и доходов",
              icon: "bag.fill", ownerOnly: false),
        .init(id: .settings, label: "Настройки",
              description: "День цикла, напоминания",
              icon: "gearshape.fill", ownerOnly: false),
        .init(id: .access, label: "Доступ",
              description: "Whitelist пользователей и AI usage",
              icon: "person.2.fill", ownerOnly: true),
    ]
}
