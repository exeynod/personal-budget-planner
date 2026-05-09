import SwiftUI

/// Management hub — pixel-perfect port web `frontend/src/screens/ManagementScreen.tsx`.
///
/// Layout: aurora background + scrollable column со следующими блоками
///  1. Header `Управление` 28pt + сабтайтл
///  2. Profile card (liquid glass) — аватар-инициал + имя + role · @handle
///  3. List card (liquid glass) — 6 строк-навигаций с pastel-icon tile + chevron
///
/// Пункт `Доступ` owner-only (как на web — UX gate, не security). Backend
/// `/me` не возвращает `tg_username` поэтому используем фолбэк "Пользователь / —".
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
            ZStack {
                AdaptiveBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        header
                        profileCard
                        listCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 130)
                }
                .scrollIndicators(.hidden)
            }
            .navigationBarHidden(true)
            .navigationDestination(for: ManagementItem.ID.self) { id in
                destination(for: id)
            }
            .onAppear { handleDevAutoNav() }
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Управление")
                .font(.system(size: 28, weight: .bold))
                .tracking(-0.56)
                .foregroundStyle(Tokens.Ink.primary)
                .lineSpacing(0)
            Text("Подписки, категории, доступ")
                .font(.system(size: 13))
                .foregroundStyle(Tokens.Ink.secondary)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 0)
    }

    private var profileCard: some View {
        let initial = "У"
        let displayName = "Пользователь"
        let role = user?.role ?? "—"
        let handle = "—"

        return HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Tokens.Accent.primary,
                                Tokens.Accent.primary.opacity(0.6)
                            ],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                Circle()
                    .strokeBorder(Color.white.opacity(0.4), lineWidth: 1)
                    .blendMode(.overlay)
                Text(initial)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 48, height: 48)
            .shadow(
                color: Tokens.Accent.primary.opacity(0.27),
                radius: 8, x: 0, y: 6
            )

            VStack(alignment: .leading, spacing: 0) {
                Text(displayName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Tokens.Ink.primary)
                Text("\(role) · \(handle)")
                    .font(.system(size: 12))
                    .foregroundStyle(Tokens.Ink.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .liquidGlass(radius: 24)
    }

    private var listCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(visibleItems.enumerated()), id: \.element.id) { idx, item in
                NavigationLink(value: item.id) {
                    ManagementListRow(item: item, isFirst: idx == 0)
                }
                .buttonStyle(ManagementRowButtonStyle())
            }
        }
        .padding(4)
        .liquidGlass(radius: 22)
    }

    @ViewBuilder
    private func destination(for id: ManagementItem.ID) -> some View {
        switch id {
        case .analytics: AnalyticsView()
        case .subscriptions: SubscriptionsView()
        case .template: TemplateView()
        case .categories: CategoriesView()
        case .settings: SettingsView()
        case .access: AccessView()
        }
    }
}

// MARK: - Items

struct ManagementItem: Identifiable, Hashable {
    enum ID: String, Hashable {
        case analytics, subscriptions, template, categories, settings, access
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
        .init(id: .subscriptions, label: "Подписки",
              description: "Регулярные платежи и напоминания",
              icon: "square.stack.3d.up.fill", ownerOnly: false),
        .init(id: .template, label: "Шаблон бюджета",
              description: "Повторяющийся план для нового периода",
              icon: "list.bullet.rectangle", ownerOnly: false),
        .init(id: .categories, label: "Категории",
              description: "Структура расходов и доходов",
              icon: "bag.fill", ownerOnly: false),
        .init(id: .settings, label: "Настройки",
              description: "День цикла, напоминания",
              icon: "gearshape.fill", ownerOnly: false),
        .init(id: .access, label: "Доступ",
              description: "Whitelist пользователей и AI usage",
              icon: "rublesign.circle.fill", ownerOnly: true),
    ]
}

// MARK: - Row

private struct ManagementListRow: View {
    let item: ManagementItem
    let isFirst: Bool

    var body: some View {
        VStack(spacing: 0) {
            if !isFirst {
                Rectangle()
                    .fill(Color.black.opacity(0.06))
                    .frame(height: 0.5)
                    .padding(.horizontal, 12)
            }

            HStack(spacing: 14) {
                iconTile

                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 8) {
                        Text(item.label)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Tokens.Ink.primary)
                        if item.ownerOnly {
                            ownerChip
                        }
                    }
                    Text(item.description)
                        .font(.system(size: 12))
                        .foregroundStyle(Tokens.Ink.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Tokens.Ink.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
        }
    }

    private var iconTile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Tokens.Accent.primary.opacity(0.30),
                            Tokens.Accent.primary.opacity(0.14)
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .strokeBorder(Tokens.Accent.primary.opacity(0.35), lineWidth: 0.5)
            Image(systemName: item.icon)
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Tokens.Accent.primary)
        }
        .frame(width: 38, height: 38)
    }

    private var ownerChip: some View {
        Text("OWNER")
            .font(.system(size: 9, weight: .bold))
            .tracking(0.36)
            .foregroundStyle(Tokens.Accent.primary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 5)
                    .fill(Tokens.Accent.primary.opacity(0.14))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .strokeBorder(Tokens.Accent.primary.opacity(0.24), lineWidth: 0.5)
            )
    }
}

private struct ManagementRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                Color.black
                    .opacity(configuration.isPressed ? 0.03 : 0)
                    .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1.0)
    }
}
