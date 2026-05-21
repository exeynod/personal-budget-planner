import SwiftUI

/// Доступ (Access) — native iOS v06 shell for the owner-only admin surface.
///
/// Phase 71 follow-up. Replaces the placeholder with a real screen showing
/// the SAME data as the maximal-poster `AccessV10View`:
///   - ПОЛЬЗОВАТЕЛИ — whitelist of users (tg id, role/owner, AI cap);
///   - AI USAGE — per-user AI spend / budget ($X.XX / $Y.YY + % of cap).
///
/// Data/loading layer is REUSED, not duplicated: this view drives the same
/// `AccessV10ViewModel` (parallel GET /admin/users + /admin/ai-usage,
/// 403 → `.forbidden`) the V10 view uses, and renders via the shared pure
/// `AccessFormatting` helpers — so figures match EXACTLY between shells
/// (Phase 70 R6 «shared domain logic, per-shell Views»). Presentation here
/// is native SwiftUI (List/.insetGrouped, sections, segmented tab) matching
/// the other v06 management screens (Settings/Categories/Subscriptions).
///
/// Owner-only: the ManagementView row is already owner-gated (defence in
/// depth), and the backend `require_owner` 403 surfaces as a graceful
/// «Только для владельца» state — no raw error or data leak (phases 67/70).
///
/// Money: AI usage is USD (cost_cents = US cents). Rendered with `$` exactly
/// like the Настройки AI-limit row — never converted to ₽.
struct AccessView: View {
    @State private var model = AccessV10ViewModel()

    /// Local tab mirror so the native segmented control binds two-way to the
    /// VM's `activeTab` (which is shared, single-source-of-truth state).
    private var tabBinding: Binding<AccessV10ViewModel.Tab> {
        Binding(
            get: { model.activeTab },
            set: { model.activeTab = $0 }
        )
    }

    var body: some View {
        List {
            switch model.status {
            case .idle, .loading:
                loadingSection
            case .forbidden:
                forbiddenSection
            case .error(let msg):
                errorSection(msg)
            case .ready:
                tabPickerSection
                if model.activeTab == .users {
                    usersSection
                } else {
                    aiUsageSection
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Доступ")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    // MARK: - State sections

    private var loadingSection: some View {
        Section {
            ProgressView()
                .frame(maxWidth: .infinity)
        }
    }

    private var forbiddenSection: some View {
        Section {
            ContentUnavailableView {
                Label("Только для владельца", systemImage: "lock.fill")
            } description: {
                Text("Этот экран доступен только владельцу аккаунта.")
            }
            .listRowBackground(Color.clear)
        }
    }

    private func errorSection(_ msg: String) -> some View {
        Section {
            ContentUnavailableView {
                Label("Не удалось загрузить", systemImage: "exclamationmark.triangle")
            } description: {
                Text(msg)
            } actions: {
                Button("Повторить") {
                    Task { await model.load() }
                }
            }
            .listRowBackground(Color.clear)
        }
    }

    // MARK: - Tab picker

    private var tabPickerSection: some View {
        Section {
            Picker("Раздел", selection: tabBinding) {
                Text("Пользователи").tag(AccessV10ViewModel.Tab.users)
                Text("AI Usage").tag(AccessV10ViewModel.Tab.aiUsage)
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
        }
    }

    // MARK: - Users

    @ViewBuilder
    private var usersSection: some View {
        Section("Пользователи") {
            if model.users.isEmpty {
                ContentUnavailableView(
                    "Нет пользователей",
                    systemImage: "person.2.slash",
                    description: Text("Whitelist пуст.")
                )
                .listRowBackground(Color.clear)
            } else {
                ForEach(model.users) { user in
                    userRow(user)
                }
            }
        }
    }

    private func userRow(_ user: AdminUserDTO) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.fill")
                .font(.title3)
                .foregroundStyle(roleTint(user.role))
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text("ID \(user.tgUserId)")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.primary)
                roleLabel(user.role)
            }

            Spacer(minLength: 8)

            Text(AccessFormatting.usdAmount(user.spendingCapCents))
                .font(.body.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    // MARK: - AI usage

    @ViewBuilder
    private var aiUsageSection: some View {
        Section {
            if model.aiUsage.isEmpty {
                ContentUnavailableView(
                    "Нет данных по AI",
                    systemImage: "sparkles",
                    description: Text("Использование AI ещё не зафиксировано.")
                )
                .listRowBackground(Color.clear)
            } else {
                ForEach(model.aiUsage) { row in
                    aiUsageRow(row)
                }
            }
        } header: {
            Text("AI Usage")
        } footer: {
            Text("Расход в USD. Сбрасывается 1-го числа каждого месяца (Europe/Moscow).")
        }
    }

    private func aiUsageRow(_ row: AdminAiUsageRowDTO) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.body)
                .foregroundStyle(pctTint(row.pctOfCap))
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text("ID \(row.tgUserId)")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.primary)
                roleLabel(row.role)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                Text(
                    AccessFormatting.spendOverCap(
                        spendCents: row.estCostCentsCurrentMonth,
                        capCents: row.spendingCapCents)
                )
                .font(.body.monospacedDigit())
                .foregroundStyle(.primary)
                Text("\(AccessFormatting.pctInt(row.pctOfCap))% от лимита")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(pctTint(row.pctOfCap))
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Shared bits

    @ViewBuilder
    private func roleLabel(_ role: String) -> some View {
        Text(AccessFormatting.roleLabel(role))
            .font(.caption2.weight(.bold))
            .foregroundStyle(roleTint(role))
    }

    private func roleTint(_ role: String) -> Color {
        switch role {
        case "owner": return Tokens.Accent.primary
        case "revoked": return .red
        default: return .secondary
        }
    }

    private func pctTint(_ pct: Double) -> Color {
        if pct >= 1.0 { return .red }
        if pct >= 0.8 { return .orange }
        return .secondary
    }
}
