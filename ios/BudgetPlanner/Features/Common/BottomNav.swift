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
    var showingTransactionEditor: Bool = false

    init() {
        if let initialRaw = UserDefaults.standard.string(forKey: "InitialTab"),
           let tab = AppTab(rawValue: initialRaw) {
            self.selectedTab = tab
        } else {
            self.selectedTab = .home
        }
        // Dev hook: forces TransactionEditor sheet open on launch — for visual
        // pixel-perfect debugging. Set via:
        //   xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner DEV_OPEN_TX_SHEET 1
        if UserDefaults.standard.bool(forKey: "DEV_OPEN_TX_SHEET") {
            self.showingTransactionEditor = true
        }
    }
}

struct MainShell: View {
    @State private var shell = AppShellState()
    @State private var categoriesCache: [CategoryDTO] = []

    var body: some View {
        Group {
            switch shell.selectedTab {
            case .home: HomeView()
            case .transactions: TransactionsView()
            case .ai: AIChatView()
            case .management: ManagementView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomBar(
                selected: $shell.selectedTab,
                onAdd: { shell.showingTransactionEditor = true }
            )
            .padding(.horizontal, 12)
            .padding(.bottom, 4)
            .background(Color.clear)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .task {
            if let cats = try? await CategoriesAPI.list() {
                categoriesCache = cats.filter { !$0.isArchived }
            }
        }
        .sheet(isPresented: $shell.showingTransactionEditor) {
            TransactionEditor(
                mode: .createActual,
                categories: categoriesCache,
                onSaved: {
                    if let cats = try? await CategoriesAPI.list() {
                        categoriesCache = cats.filter { !$0.isArchived }
                    }
                }
            )
        }
    }
}

private struct BottomBar: View {
    @Binding var selected: AppTab
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home)
            tabButton(.transactions)
            CenterFAB(action: onAdd)
                .frame(width: 64)
            tabButton(.ai)
            tabButton(.management)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
        .liquidGlass(radius: 28, blur: .systemUltraThinMaterial)
    }

    private func tabButton(_ tab: AppTab) -> some View {
        Button {
            selected = tab
        } label: {
            VStack(spacing: 3) {
                Image(systemName: tab.icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(tab.label)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(selected == tab ? Tokens.Accent.primary : Tokens.Ink.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

struct CenterFAB: View {
    let action: () -> Void

    var body: some View {
        FAB(action: action).offset(y: -10)
    }
}

struct FAB: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(
                    LinearGradient(
                        colors: [Tokens.Accent.primary, Tokens.Accent.hover],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ),
                    in: Circle()
                )
                .overlay(Circle().strokeBorder(Color.white.opacity(0.9), lineWidth: 1.5))
                .shadow(color: Tokens.Accent.primary.opacity(0.4), radius: 14, x: 0, y: 8)
        }
        .buttonStyle(.plain)
    }
}

struct ComingSoonView: View {
    let title: String
    let phase: Int

    var body: some View {
        ZStack {
            AuroraBackground()
            VStack(spacing: Tokens.Spacing.md) {
                Image(systemName: "hammer.fill")
                    .font(.system(size: 40)).foregroundStyle(.secondary)
                Text(title).font(.appTitle)
                Text("Будет в Phase \(phase)")
                    .font(.appBody).foregroundStyle(.secondary)
            }
        }
    }
}
