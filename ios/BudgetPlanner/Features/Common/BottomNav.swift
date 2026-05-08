import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case home, transactions, ai, management

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: return "Главная"
        case .transactions: return "Транзакции"
        case .ai: return "AI"
        case .management: return "Меню"
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house.fill"
        case .transactions: return "list.bullet.clipboard"
        case .ai: return "sparkles"
        case .management: return "slider.horizontal.3"
        }
    }
}

struct MainShell: View {
    @State private var selectedTab: AppTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label(AppTab.home.label, systemImage: AppTab.home.systemImage)
                }
                .tag(AppTab.home)

            ComingSoonView(title: "Транзакции", phase: 18)
                .tabItem {
                    Label(AppTab.transactions.label, systemImage: AppTab.transactions.systemImage)
                }
                .tag(AppTab.transactions)

            ComingSoonView(title: "AI", phase: 20)
                .tabItem {
                    Label(AppTab.ai.label, systemImage: AppTab.ai.systemImage)
                }
                .tag(AppTab.ai)

            ComingSoonView(title: "Меню", phase: 19)
                .tabItem {
                    Label(AppTab.management.label, systemImage: AppTab.management.systemImage)
                }
                .tag(AppTab.management)
        }
        .tint(Tokens.Accent.primary)
    }
}

struct ComingSoonView: View {
    let title: String
    let phase: Int

    var body: some View {
        ZStack {
            AdaptiveBackground()

            VStack(spacing: Tokens.Spacing.md) {
                Image(systemName: "hammer.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.appTitle)
                Text("Будет в Phase \(phase)")
                    .font(.appBody)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
