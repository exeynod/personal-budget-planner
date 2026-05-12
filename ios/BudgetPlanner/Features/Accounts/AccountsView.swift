import SwiftUI

/// Phase 60 (v06 Native Rebuild) — Plan 60-02: AccountsView body.
///
/// Native iOS-26 List(.insetGrouped) с 4 рендер-состояниями (loading /
/// error / empty / ready) + Hero summary section (без header) + Section
/// «Счета» с rows + ContentUnavailableView empty state + toolbar `+`
/// (открывает AccountsNewSheet — body заполнен в 60-03) + tap-to-detail
/// через `NavigationLink(value: account.id)` + `.navigationDestination(for:
/// Int.self) { id in AccountDetailView(accountId: id) }`.
///
/// NavigationStack принадлежит родителю (ManagementView) — здесь только
/// `.navigationTitle("Счета")` + destination dispatch для Int (account id).
/// Sheet content — AccountsNewSheet (60-01 stub; 60-03 заполнит реальный
/// Form). `viewModel.createAccount(...)` пока возвращает false (60-03).
struct AccountsView: View {
    @State private var viewModel = AccountsViewModel()

    var body: some View {
        List {
            switch viewModel.status {
            case .idle, .loading:
                loadingSection
            case .error(let msg):
                errorSection(msg)
            case .ready:
                if viewModel.accounts.isEmpty {
                    emptySection
                } else {
                    heroSection
                    accountsSection
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Счета")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    viewModel.sheet = .newAccount
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .accessibilityLabel("Добавить счёт")
            }
        }
        .navigationDestination(for: Int.self) { id in
            AccountDetailView(accountId: id)
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(isPresented: sheetBinding) {
            AccountsNewSheet(
                submitting: viewModel.submitting,
                onCreate: { bank, kind, mask, balanceCents, primary in
                    await viewModel.createAccount(
                        bank: bank,
                        kind: kind,
                        mask: mask,
                        balanceCents: balanceCents,
                        primary: primary
                    )
                },
                onCancel: {
                    viewModel.sheet = .none
                }
            )
        }
    }

    // MARK: - Sheet binding

    private var sheetBinding: Binding<Bool> {
        Binding(
            get: { viewModel.sheet == .newAccount },
            set: { if !$0 { viewModel.sheet = .none } }
        )
    }

    // MARK: - State sections

    private var loadingSection: some View {
        Section {
            ProgressView()
                .frame(maxWidth: .infinity)
        }
    }

    private func errorSection(_ msg: String) -> some View {
        Section {
            Label(msg, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
        }
    }

    private var emptySection: some View {
        Section {
            ContentUnavailableView(
                "Нет счетов",
                systemImage: "creditcard",
                description: Text("Добавьте первый счёт через «+»")
            )
            .listRowBackground(Color.clear)
        }
    }

    // MARK: - Hero section (без header)

    private var heroSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("Всего на счетах")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(MoneyFormatter.format(cents: viewModel.sumBalancesCents))
                        .font(.title.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("₽")
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                Text(accountCountLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }

    /// Russian pluralization для «счёт / счёта / счетов».
    private var accountCountLabel: String {
        let n = viewModel.accountCount
        let mod10 = n % 10
        let mod100 = n % 100
        let word: String
        if mod10 == 1 && mod100 != 11 {
            word = "счёт"
        } else if (2...4).contains(mod10) && !(12...14).contains(mod100) {
            word = "счёта"
        } else {
            word = "счетов"
        }
        return "\(n) \(word)"
    }

    // MARK: - Accounts section

    private var accountsSection: some View {
        Section("Счета") {
            ForEach(viewModel.accounts) { acct in
                NavigationLink(value: acct.id) {
                    AccountRow(account: acct)
                }
            }
        }
    }
}

// MARK: - Row

private struct AccountRow: View {
    let account: AccountDTO

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconForKind(account.kind))
                .foregroundStyle(Tokens.Accent.primary)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.bank)
                    .font(.body)
                    .foregroundStyle(.primary)
                Text(subtitleFor(account))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            HStack(spacing: 6) {
                Text(MoneyFormatter.format(cents: account.balanceCents))
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.primary)
                Text("₽")
                    .foregroundStyle(.secondary)
                if account.primary {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.orange)
                        .accessibilityLabel("Основной счёт")
                }
            }
        }
    }

    private func iconForKind(_ kind: AccountKind) -> String {
        switch kind {
        case .card: return "creditcard.fill"
        case .cash: return "banknote"
        case .savings: return "tray.full.fill"
        }
    }

    private func subtitleFor(_ a: AccountDTO) -> String {
        switch a.kind {
        case .card:
            if let mask = a.mask, !mask.isEmpty {
                return "Карта •\(mask)"
            }
            return "Карта"
        case .cash:
            return "Наличные"
        case .savings:
            return "Накопительный счёт"
        }
    }
}
