// Phase 27-09 Task 3: AccountDetailV10View — iOS Account Detail screen
// (ACCT-V10-04). Symmetric to web Plan 27-04 AccountDetailView.
//
// Composition (BLACK bg, paper text):
//   - ZStack: PosterTokens.Color.black.ignoresSafeArea() + content.
//   - Header: «← НАЗАД» + Eyebrow «ACCOUNT».
//   - Mass italic bank-name 70pt (paper).
//   - Subtitle (mono 11pt 0.7): formatBankSubtitle(account).
//   - HStack 2 KPI plates:
//     - Left  (yellow on ink text): Eyebrow «БАЛАНС» + BigFig balance/100 ₽.
//     - Right (dark on paper text): Eyebrow «В {МЕСЯЦЕ} · N ОПЕРАЦИЙ» +
//       BigFig sumPeriodOps.sumCents/100 ₽.
//   - Operations list (per-account, period-filtered): time + description +
//     «category · BANK MASK» sub-line + signed amount (yellow positive,
//     paper negative — TransactionsData.formatTxAmount conventions).
//   - Empty state: «Нет операций по этому счёту» italic 22pt.
//   - .task { await model.load() } first appear.

import SwiftUI

struct AccountDetailV10View: View {
    let accountId: Int

    @State private var model: AccountDetailV10ViewModel
    @Environment(\.posterRouter) private var router

    init(accountId: Int) {
        self.accountId = accountId
        self._model = State(wrappedValue: AccountDetailV10ViewModel(accountId: accountId))
    }

    var body: some View {
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.black).ignoresSafeArea()
            content
        }
        .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.status {
        case .idle, .loading:
            loadingState
        case .error(let msg):
            errorState(msg)
        case .ready:
            if let acc = model.account {
                readyState(acc: acc)
            } else {
                errorState("Счёт не найден")
            }
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: PosterTokens.Space.s18) {
            Spacer()
            ProgressView().controlSize(.large).tint(PosterTokens.Color.paper)
            Eyebrow("ЗАГРУЗКА", opacity: 0.6, color: PosterTokens.Color.paper)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ msg: String) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            Spacer()
            Eyebrow("ОШИБКА", opacity: 0.65, color: PosterTokens.Color.paper)
            Text(msg)
                .font(.posterMassItalic(size: 28))
                .foregroundColor(PosterTokens.Color.paper)
            Button {
                Task { await model.load() }
            } label: {
                Text("ПОПРОБОВАТЬ →")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(PosterTokens.Color.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(PosterTokens.Color.paper)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
    }

    @ViewBuilder
    private func readyState(acc: AccountDTO) -> some View {
        let ops = model.periodOps
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
                headerRow

                Mass(acc.bank, italic: true, size: 70)
                    .foregroundColor(PosterTokens.Color.paper)

                Text(AccountsData.formatBankSubtitle(acc))
                    .font(.posterMono(size: 11))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.7))

                kpiRow(acc: acc, ops: ops)
                    .padding(.top, PosterTokens.Space.s8)

                Eyebrow("ОПЕРАЦИИ ПО СЧЁТУ", opacity: 0.65, color: PosterTokens.Color.paper)
                    .padding(.top, PosterTokens.Space.s18)

                operationsSection(acc: acc)
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
                        .foregroundColor(PosterTokens.Color.paper)
                        .opacity(0.7)
                }
                .buttonStyle(.plain)
            }
            Spacer()
            Eyebrow("ACCOUNT", opacity: 0.7, color: PosterTokens.Color.paper)
        }
    }

    @ViewBuilder
    private func kpiRow(acc: AccountDTO, ops: (count: Int, sumCents: Int)) -> some View {
        HStack(alignment: .top, spacing: 10) {
            // Left — yellow plate, ink text — БАЛАНС
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("БАЛАНС", opacity: 0.7, color: PosterTokens.Color.ink)
                BigFig(
                    value: acc.balanceCents / 100,
                    sup: "₽",
                    size: 56,
                    color: PosterTokens.Color.ink
                )
            }
            .padding(PosterTokens.Space.s14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PosterTokens.Color.yellow)

            // Right — dark plate, paper text — В МАЕ · N ОПЕРАЦИЙ
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(
                    "В \(model.monthLabel) · \(ops.count) ОПЕРАЦИЙ",
                    opacity: 0.7,
                    color: PosterTokens.Color.paper
                )
                BigFig(
                    value: ops.sumCents / 100,
                    sup: "₽",
                    size: 56,
                    color: PosterTokens.Color.paper
                )
            }
            .padding(PosterTokens.Space.s14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PosterTokens.Color.ink)
        }
    }

    @ViewBuilder
    private func operationsSection(acc: AccountDTO) -> some View {
        if model.actuals.isEmpty {
            Text("Нет операций по этому счёту")
                .font(.posterMassItalic(size: 22))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
                .padding(.top, 6)
        } else {
            VStack(spacing: 0) {
                ForEach(model.actuals) { tx in
                    txRow(tx, acc: acc)
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    private func txRow(_ tx: ActualV10DTO, acc: AccountDTO) -> some View {
        let catName = model.categoryName(tx.categoryId) ?? "—"
        let maskStr = acc.mask.map { " ·· \($0)" } ?? ""
        let subline = "\(catName) · \(acc.bank.uppercased())\(maskStr)"

        return HStack(alignment: .top, spacing: 10) {
            Text(V10Formatters.formatTimeHM(tx.createdAt ?? tx.txDate, calendar: model.calendar))
                .font(.posterMono(size: 11))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
                .frame(width: 50, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(tx.description ?? "—")
                    .font(.posterBody(size: 13).weight(.semibold))
                    .foregroundColor(PosterTokens.Color.paper)
                    .lineLimit(2)
                Text(subline)
                    .font(.posterMono(size: 10))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(TransactionsData.formatTxAmount(tx.amountCents))
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(amountColor(for: tx.kind))
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 10)
    }

    private func amountColor(for kind: ActualKindV10) -> Color {
        switch kind {
        case .roundup, .deposit: return PosterTokens.Color.yellow
        case .expense, .income:  return PosterTokens.Color.paper
        }
    }
}

#Preview("AccountDetailV10View · loading") {
    AccountDetailV10View(accountId: 1)
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
