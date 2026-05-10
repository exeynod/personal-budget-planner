// Phase 27-11 Task 1: MgmtHubView — iOS Management hub screen
// (MGMT-V10-01). Symmetric to web Plan 27-06 MgmtHubView.tsx.
//
// Renders the maximal-poster management hub per CONTEXT:
//   - Black background (PosterTokens.Color.black) edge-to-edge.
//   - Header row: optional «← НАЗАД» (when canPop) + Eyebrow
//     «MANAGEMENT / УПРАВЛЕНИЕ».
//   - Mass italic «Управление.» (PT Serif 70pt per ADR-001).
//   - Numbered list of 5 (or 4 if !isOwner) rows:
//       01 PLAN МЕСЯЦА
//       02 СЧЕТА
//       03 АНАЛИТИКА
//       04 НАСТРОЙКИ
//       05 ДОСТУП    ← owner-only (T-27-11-01 mitigation: client-side
//                       filter + backend admin/* require_owner dep)
//   - Each row: [mono nn] [archivo black NAME UPPER] [arrow →].
//
// Tap routing (via @Environment(\.posterRouter)):
//   plan      → PlanView() (real, Phase 26-05)
//   accounts  → AccountsListV10ViewStub (replaced by sibling 27-08)
//   analytics → AnalyticsV10ViewStub    (replaced by sibling 27-09)
//   settings  → SettingsV10View()       (real, this plan)
//   access    → AccessV10View()         (real, this plan; owner-only)
//
// Reachable via V10MainShell.handleTabChange(.mgmt) which pushes
// MgmtHubView() onto the PosterRouter stack.

import SwiftUI

struct MgmtHubView: View {
    @State private var model = MgmtHubViewModel()
    @Environment(\.posterRouter) private var router

    private enum RowId: String { case plan, accounts, analytics, settings, access }

    private struct Row: Identifiable {
        let id: RowId
        let n: String
        let name: String
        let ownerOnly: Bool
    }

    private let rows: [Row] = [
        Row(id: .plan,      n: "01", name: "PLAN МЕСЯЦА", ownerOnly: false),
        Row(id: .accounts,  n: "02", name: "СЧЕТА",        ownerOnly: false),
        Row(id: .analytics, n: "03", name: "АНАЛИТИКА",    ownerOnly: false),
        Row(id: .settings,  n: "04", name: "НАСТРОЙКИ",    ownerOnly: false),
        Row(id: .access,    n: "05", name: "ДОСТУП",       ownerOnly: true),
    ]

    var body: some View {
        ZStack {
            PosterTokens.Color.black.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: PosterTokens.Space.s24) {
                    headerRow
                    Mass("Управление.", italic: true, size: 70)
                    listSection
                }
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.top, 56)
                .padding(.bottom, 90)
            }
        }
        .task { await model.load() }
    }

    // MARK: - Sections

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
            Eyebrow("MANAGEMENT / УПРАВЛЕНИЕ", color: PosterTokens.Color.paper)
        }
    }

    private var listSection: some View {
        VStack(spacing: 0) {
            ForEach(rows.filter { !$0.ownerOnly || model.isOwner }) { row in
                rowButton(row)
                Rectangle()
                    .fill(PosterTokens.Color.paper.opacity(0.18))
                    .frame(height: 1)
            }
        }
    }

    private func rowButton(_ row: Row) -> some View {
        Button(action: { onTap(row.id) }) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                Text(row.n)
                    .font(.posterMono(size: PosterTokens.FontSize.monoMd))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
                Text(row.name)
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 16))
                    .foregroundColor(PosterTokens.Color.paper)
                    .tracking(0.04 * 16)
                Spacer()
                Text("→")
                    .font(.posterMono(size: 16))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
            }
            .padding(.vertical, 22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Routing

    private func onTap(_ id: RowId) {
        guard let router else { return }
        switch id {
        case .plan:
            router.push(PlanView())
        case .accounts:
            // Sibling Plan 27-08 swap target.
            router.push(AccountsListV10ViewStub())
        case .analytics:
            // Sibling Plan 27-09 swap target.
            router.push(AnalyticsV10ViewStub())
        case .settings:
            router.push(SettingsV10View())
        case .access:
            router.push(AccessV10View())
        }
    }
}

// MARK: - Preview

#Preview("MgmtHubView · member") {
    MgmtHubView()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
