// Phase 27-11 Task 2: AccessV10View — iOS Access (admin) screen
// (MGMT-V10-03). Symmetric to web Plan 27-06 AccessView.tsx.
//
// Renders the maximal-poster admin surface per CONTEXT:
//   - Black background (PosterTokens.Color.black) edge-to-edge.
//   - Header: «← НАЗАД» (when canPop) + Eyebrow «ACCESS / ДОСТУП».
//   - Mass italic «Доступ.» (PT Serif 56pt per ADR-001), paper fg.
//   - 2 chip-style tabs: «Пользователи» / «AI Usage» — drives activeTab.
//   - Users tab: list of AdminUserDTO with role badge.
//   - AI Usage tab: list of AdminAiUsageRowDTO with cost cents + pct cap.
//   - Forbidden state (403) → friendly «Только для владельца» banner.
//
// Reachable via MgmtHubView row tap «05 ДОСТУП» (only visible to
// owners — defence-in-depth atop the backend require_owner gate).

import SwiftUI

struct AccessV10View: View {
    @State private var model = AccessV10ViewModel()
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            PosterTokens.Color.black.ignoresSafeArea()
            content
        }
        .task { await model.load() }
    }

    // MARK: - States

    @ViewBuilder
    private var content: some View {
        switch model.status {
        case .idle, .loading:
            loadingState
        case .forbidden:
            forbiddenState
        case .error(let msg):
            errorState(msg)
        case .ready:
            readyState
        }
    }

    private var loadingState: some View {
        VStack(spacing: PosterTokens.Space.s18) {
            Spacer()
            ProgressView().controlSize(.large).tint(PosterTokens.Color.paper)
            Eyebrow("ЗАГРУЗКА", opacity: 0.6)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var forbiddenState: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            headerRow
            Spacer()
            Eyebrow("ACCESS DENIED", opacity: 0.7)
            Mass("Только для владельца.", italic: true, size: 36)
            Text("Этот экран доступен только владельцу аккаунта.")
                .font(.posterBody(size: 14))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.top, 56)
    }

    private func errorState(_ msg: String) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            headerRow
            Spacer()
            Eyebrow("ОШИБКА", opacity: 0.65)
            Mass(msg, italic: false, size: 28)
            PosterButton("ПОВТОРИТЬ →", variant: .primary) {
                Task { await model.load() }
            }
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.top, 56)
    }

    private var readyState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s24) {
                headerRow
                Mass("Доступ.", italic: true, size: 56)

                tabSwitcher

                if model.activeTab == .users {
                    usersList
                } else {
                    aiUsageList
                }
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 90)
        }
    }

    // MARK: - Header / tabs

    private var headerRow: some View {
        HStack(alignment: .firstTextBaseline) {
            if let r = router, r.canPop {
                Button(action: { r.pop() }) {
                    Text("← НАЗАД")
                        .font(.posterMono(size: PosterTokens.FontSize.eye, weight: .semibold))
                        .tracking(0.14 * PosterTokens.FontSize.eye)
                        .foregroundColor(PosterTokens.Color.paper)
                        .opacity(0.7)
                }
                .buttonStyle(.plain)
                Spacer().frame(width: 12)
            }
            Spacer()
            Eyebrow("ACCESS / ДОСТУП", color: PosterTokens.Color.paper)
        }
    }

    private var tabSwitcher: some View {
        HStack(spacing: 8) {
            Chip("Пользователи", active: model.activeTab == .users) {
                model.activeTab = .users
            }
            Chip("AI Usage", active: model.activeTab == .aiUsage) {
                model.activeTab = .aiUsage
            }
            Spacer()
        }
    }

    // MARK: - Users list

    @ViewBuilder
    private var usersList: some View {
        if model.users.isEmpty {
            emptyHint("Нет пользователей.")
        } else {
            VStack(spacing: 0) {
                ForEach(model.users) { user in
                    userRow(user)
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    private func userRow(_ user: AdminUserDTO) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ID \(user.tgUserId)")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .tracking(13 * 0.04)
                    .foregroundColor(PosterTokens.Color.paper)
                Text(user.role.uppercased())
                    .font(.posterMono(size: 11, weight: .semibold))
                    .foregroundColor(roleColor(user.role))
                    .tracking(0.12 * 11)
            }
            Spacer()
            Text("$\(formatCents(user.spendingCapCents))")
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
        }
        .padding(.vertical, 14)
    }

    // MARK: - AI usage list

    @ViewBuilder
    private var aiUsageList: some View {
        if model.aiUsage.isEmpty {
            emptyHint("Нет данных по AI.")
        } else {
            VStack(spacing: 0) {
                ForEach(model.aiUsage) { row in
                    aiUsageRow(row)
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    private func aiUsageRow(_ row: AdminAiUsageRowDTO) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ID \(row.tgUserId)")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .tracking(13 * 0.04)
                    .foregroundColor(PosterTokens.Color.paper)
                Text(row.role.uppercased())
                    .font(.posterMono(size: 11, weight: .semibold))
                    .foregroundColor(roleColor(row.role))
                    .tracking(0.12 * 11)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text("$\(formatCents(row.estCostCentsCurrentMonth))")
                    .font(.posterMono(size: 13, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.paper)
                Text("\(Int(row.pctOfCap * 100))% / $\(formatCents(row.spendingCapCents))")
                    .font(.posterMono(size: 11))
                    .foregroundColor(pctColor(row.pctOfCap))
            }
        }
        .padding(.vertical, 14)
    }

    private func emptyHint(_ text: String) -> some View {
        Text(text)
            .font(.posterMassItalic(size: 18))
            .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
            .padding(.vertical, 28)
    }

    // MARK: - Helpers

    private func formatCents(_ cents: Int) -> String {
        String(format: "%.2f", Double(cents) / 100.0)
    }

    private func roleColor(_ role: String) -> Color {
        switch role {
        case "owner":
            return PosterTokens.Color.yellow
        case "revoked":
            return PosterTokens.Color.red
        default:
            return PosterTokens.Color.paper.opacity(0.6)
        }
    }

    private func pctColor(_ pct: Double) -> Color {
        if pct >= 1.0 { return PosterTokens.Color.red }
        if pct >= 0.8 { return PosterTokens.Color.yellow }
        return PosterTokens.Color.paper.opacity(0.6)
    }
}

// MARK: - Preview

#Preview("AccessV10View") {
    AccessV10View()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
