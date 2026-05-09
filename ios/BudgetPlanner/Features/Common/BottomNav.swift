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
    var selectedTab: AppTab = .home
    var showingTransactionEditor: Bool = false
}

struct MainShell: View {
    @State private var shell = AppShellState()
    @State private var categoriesCache: [CategoryDTO] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch shell.selectedTab {
                case .home: HomeView()
                case .transactions: TransactionsView()
                case .ai: NavigationStack { AIChatView() }
                case .management: ManagementView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            BottomBar(
                selected: $shell.selectedTab,
                onAdd: { shell.showingTransactionEditor = true }
            )
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
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
        .background(
            Color.white.opacity(0.65),
            in: RoundedRectangle(cornerRadius: 28)
        )
        .background(
            RoundedRectangle(cornerRadius: 28)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28)
                .strokeBorder(Color.white.opacity(0.7), lineWidth: 0.5)
        )
        .shadow(color: Color(red: 0.24, green: 0.12, blue: 0.04, opacity: 0.10),
                radius: 24, x: 0, y: 4)
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
        .offset(y: -10)
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
