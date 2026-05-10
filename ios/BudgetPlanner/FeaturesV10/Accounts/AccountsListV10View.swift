// Phase 27-09 Task 2: AccountsListV10View — iOS Accounts list screen
// (ACCT-V10-01..03). Symmetric to web Plan 27-04 AccountsListView.
//
// Composition (CREAM bg, ink text):
//   - ZStack: PosterTokens.Color.cream.ignoresSafeArea() + content.
//   - Header HStack: «← НАЗАД» (when canPop) + Eyebrow «ACCOUNTS / СЧЕТА».
//   - Mass italic «Счета.» size 70.
//   - Dark plate (ink bg, paper text): Eyebrow «СУММАРНО» + BigFig
//     sumBalances/100 ₽ + Eyebrow «N счетов».
//   - Per-account row (button → router push to AccountDetailV10View):
//     bank UPPER (Archivo Black 14) + formatBankSubtitle (mono 11 0.7) +
//     «история →» (mono 10) + Spacer + balance (mono 14 semibold) +
//     ОСНОВНОЙ yellow badge for primary.
//   - 1pt ink/0.18 separator between rows.
//   - HStack CTAs: «+ ДОБАВИТЬ СЧЁТ» (primary) + «ПЕРЕВОД» (ghost disabled
//     with «SOON» badge — DF-V11-01 deferred per T-27-09-04).
//
// .posterSheet wraps NewAccountSheet for the create flow.
// .task { await model.load() } first appear.
//
// Push integration: row tap pushes AccountDetailV10View(accountId: a.id) via
// the environment PosterRouter; «+ ДОБАВИТЬ СЧЁТ» opens the sheet.

import SwiftUI

struct AccountsListV10View: View {
    @State private var model = AccountsListV10ViewModel()
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            PosterTokens.Color.cream.ignoresSafeArea()
            content
        }
        .task { await model.load() }
        .posterSheet(
            isPresented: Binding(
                get: { model.sheet == .newAccount },
                set: { newVal in if !newVal { model.sheet = .none } }
            )
        ) {
            NewAccountSheet(
                submitting: model.submitting,
                onSave: { bank, kind, mask, balanceCents, primary in
                    Task {
                        await model.createAccount(
                            bank: bank,
                            kind: kind,
                            mask: mask,
                            balanceCents: balanceCents,
                            primary: primary
                        )
                    }
                },
                onCancel: { model.sheet = .none }
            )
        }
    }

    // MARK: - States

    @ViewBuilder
    private var content: some View {
        switch model.status {
        case .idle, .loading:
            loadingState
        case .error(let msg):
            errorState(msg)
        case .ready:
            readyState
        }
    }

    private var loadingState: some View {
        VStack(spacing: PosterTokens.Space.s18) {
            Spacer()
            ProgressView().controlSize(.large).tint(PosterTokens.Color.ink)
            Eyebrow("ЗАГРУЗКА", opacity: 0.6, color: PosterTokens.Color.ink)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ msg: String) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            Spacer()
            Eyebrow("ОШИБКА", opacity: 0.65, color: PosterTokens.Color.ink)
            Text(msg)
                .font(.posterMassItalic(size: 28))
                .foregroundColor(PosterTokens.Color.ink)
            Button {
                Task { await model.load() }
            } label: {
                Text("ПОПРОБОВАТЬ →")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(PosterTokens.Color.cream)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(PosterTokens.Color.ink)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
    }

    private var readyState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
                headerRow

                Mass("Счета.", italic: true, size: 70)
                    .foregroundColor(PosterTokens.Color.ink)

                summaryPlate
                    .padding(.top, PosterTokens.Space.s8)

                accountsList
                    .padding(.top, PosterTokens.Space.s14)

                ctaRow
                    .padding(.top, PosterTokens.Space.s18)
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, PosterTokens.Space.s56)
            .padding(.bottom, 90)
        }
    }

    // MARK: - Sections

    private var headerRow: some View {
        HStack {
            if router?.canPop == true {
                Button {
                    router?.pop()
                } label: {
                    Text("← НАЗАД")
                        .font(.posterMono(size: 11, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.ink)
                        .opacity(0.7)
                }
                .buttonStyle(.plain)
            }
            Spacer()
            Eyebrow("ACCOUNTS / СЧЕТА", opacity: 0.7, color: PosterTokens.Color.ink)
        }
    }

    private var summaryPlate: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow("СУММАРНО", opacity: 0.6, color: PosterTokens.Color.paper)
            BigFig(
                value: model.totalBalanceCents / 100,
                sup: "₽",
                size: 64,
                color: PosterTokens.Color.paper
            )
            Eyebrow(
                "\(model.accountCount) СЧЕТОВ",
                opacity: 0.7,
                color: PosterTokens.Color.paper
            )
        }
        .padding(PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PosterTokens.Color.ink)
    }

    @ViewBuilder
    private var accountsList: some View {
        if model.accounts.isEmpty {
            Text("Нет счетов")
                .font(.posterMassItalic(size: 22))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
                .padding(.top, PosterTokens.Space.s24)
        } else {
            VStack(spacing: 0) {
                ForEach(model.accounts) { acc in
                    accountRow(acc)
                    Rectangle()
                        .fill(PosterTokens.Color.ink.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    @ViewBuilder
    private func accountRow(_ a: AccountDTO) -> some View {
        Button {
            router?.push(AccountDetailV10View(accountId: a.id))
        } label: {
            HStack(alignment: .center, spacing: PosterTokens.Space.s10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(a.bank.uppercased())
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                        .tracking(0.6)
                        .foregroundColor(PosterTokens.Color.ink)
                    Text(AccountsData.formatBankSubtitle(a))
                        .font(.posterMono(size: 11))
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.7))
                    Text("история →")
                        .font(.posterMono(size: 10))
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.45))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("\(RubleFormatter.format(cents: a.balanceCents)) ₽")
                        .font(.posterMono(size: 14, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.ink)
                    if a.primary {
                        Text("ОСНОВНОЙ")
                            .font(.custom(PosterTokens.Font.archivoBlack, size: 9))
                            .tracking(1.2)
                            .foregroundColor(PosterTokens.Color.ink)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(PosterTokens.Color.yellow)
                    }
                }
            }
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var ctaRow: some View {
        HStack(spacing: 10) {
            PosterButton("+ ДОБАВИТЬ СЧЁТ", variant: .primary) {
                model.sheet = .newAccount
            }
            ZStack(alignment: .topTrailing) {
                PosterButton("ПЕРЕВОД", variant: .ghost, disabled: true) {
                    // T-27-09-04 (DF-V11-01 deferred) — no-op until backend ships.
                }
                Text("SOON")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 8))
                    .tracking(1)
                    .foregroundColor(PosterTokens.Color.ink)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(PosterTokens.Color.yellow)
                    .offset(x: -6, y: 6)
            }
        }
    }
}

#Preview("AccountsListV10View · loading") {
    AccountsListV10View()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
