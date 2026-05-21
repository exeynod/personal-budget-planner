import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case home, transactions, ai, management

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: return "Главная"
        case .transactions: return "Транзакции"
        case .ai: return "AI"
        case .management: return "Управление"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house.fill"
        case .transactions: return "list.bullet"
        case .ai: return "sparkles"
        case .management: return "gearshape.fill"
        }
    }
}

@MainActor
@Observable
final class AppShellState {
    var selectedTab: AppTab

    init() {
        if let initialRaw = UserDefaults.standard.string(forKey: "InitialTab"),
            let tab = AppTab(rawValue: initialRaw)
        {
            self.selectedTab = tab
        } else {
            self.selectedTab = .home
        }
    }
}

/// Native iOS 26 TabView shell. Glass apply'тся автоматически системой
/// на TabBar; контент экранов рендерится через NavigationStack-обёртки
/// внутри каждого тейба.
///
/// Quick-add `+` находится в HomeView toolbar (не FAB) — Apple-native
/// pattern (как Notes/Reminders).
struct MainShell: View {
    @State private var shell = AppShellState()

    var body: some View {
        TabView(selection: $shell.selectedTab) {
            Tab("Главная", systemImage: "house.fill", value: AppTab.home) {
                HomeView()
            }
            Tab("Транзакции", systemImage: "list.bullet", value: AppTab.transactions) {
                TransactionsView()
            }
            Tab("AI", systemImage: "sparkles", value: AppTab.ai) {
                AIChatView()
            }
            Tab("Управление", systemImage: "gearshape.fill", value: AppTab.management) {
                ManagementView()
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}

struct ComingSoonView: View {
    let title: String
    let phase: Int

    var body: some View {
        ContentUnavailableView(
            title,
            systemImage: "hammer.fill",
            description: Text("Будет в Phase \(phase)")
        )
    }
}
