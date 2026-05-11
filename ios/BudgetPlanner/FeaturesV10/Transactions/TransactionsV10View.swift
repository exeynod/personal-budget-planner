// Phase 25-09 Task 3: TransactionsV10View — iOS Transactions registry (TXN-V10-01..05).
//
// Symmetric to web Plan 25-08 TransactionsView. Cobalt push-stack screen
// rendering eyebrow «SECTION II» + Mass italic «Реестр.» + summary eyebrow,
// single-select chip-bar (Все / Кафе / Продукты / Транспорт / Подписки /
// Копилка), day-grouped sections with DM-Serif italic 28pt headers + sums,
// rows with U+2212-formatted amounts and inline roundup/deposit spec-tag
// plates, swipe-left → confirmationDialog → DELETE /actual/{id}, row tap →
// edit sheet stub via PosterSheet (real editor lands in Phase 26).
//
// Uses native SwiftUI `List` for swipeActions support (matches v0.6
// Features/Transactions/TransactionsView.swift pattern). The list background
// is hidden via `.scrollContentBackground(.hidden)` so the cobalt ZStack
// underneath is visible; row backgrounds are also cleared via
// `.listRowBackground(Color.clear)`.
//
// Push integration: HomePlaceholders.swift's TransactionsViewPlaceholderView
// is rebound to render `TransactionsV10View()` directly (Plan 25-07's
// `router?.push(TransactionsViewPlaceholderView())` callsite from HomeV10View
// continues to work unchanged — zero-touch swap into the real screen).

import SwiftUI

struct TransactionsV10View: View {
    @State private var model = TransactionsV10ViewModel()
    @State private var editingTx: ActualV10DTO? = nil
    @State private var pendingDeleteTx: ActualV10DTO? = nil
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.cobalt).ignoresSafeArea()
            content
            // WR-25-09 (review fix): overlay banner for transient delete
            // failures. Anchored to bottom so the list keeps focus; tap
            // dismisses. Replaces the prior pattern of overwriting
            // `model.status` with `.error`, which used to flash the entire
            // list away (see ViewModel comment for rationale).
            if let msg = model.deleteError {
                deleteErrorBanner(msg)
            }
        }
        .task { await model.load() }
        .posterSheet(
            isPresented: Binding(
                get: { editingTx != nil },
                set: { if !$0 { editingTx = nil } }
            )
        ) {
            EditPlaceholderSheet(tx: editingTx, onClose: { editingTx = nil })
        }
        .confirmationDialog(
            "Удалить операцию?",
            isPresented: Binding(
                get: { pendingDeleteTx != nil },
                set: { if !$0 { pendingDeleteTx = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Удалить", role: .destructive) {
                if let tx = pendingDeleteTx {
                    Task { await model.delete(tx) }
                }
                pendingDeleteTx = nil
            }
            Button("Отмена", role: .cancel) { pendingDeleteTx = nil }
        }
    }

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

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: PosterTokens.Space.s18) {
            Spacer()
            ProgressView().controlSize(.large).tint(PosterTokens.Color.paper)
            Eyebrow("ЗАГРУЗКА", opacity: 0.6)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ msg: String) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            Spacer()
            Eyebrow("ОШИБКА", opacity: 0.65)
            Mass(msg, italic: false, size: 28)
            Button {
                Task { await model.load() }
            } label: {
                Text("ПОПРОБОВАТЬ →")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(PosterTokens.Color.cobalt)
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
    private var readyState: some View {
        // Use a List for swipeActions support (iOS requirement). Disable
        // default chrome (background, separators, row inset) so the
        // cobalt ZStack under the list shows through and rows render
        // edge-to-edge per prototype.
        List {
            Section {
                headerSection
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 12, trailing: 0))
            }

            if model.dayGroups.isEmpty {
                Section {
                    emptyState
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 24, leading: 0, bottom: 24, trailing: 0))
                }
            } else {
                ForEach(model.dayGroups) { group in
                    Section {
                        ForEach(group.rows) { tx in
                            TxRow(
                                tx: tx,
                                category: model.categories.first { $0.id == tx.categoryId },
                                account: model.accounts.first { $0.id == tx.accountId }
                            )
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(
                                EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture { editingTx = tx }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    pendingDeleteTx = tx
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                            }
                        }
                    } header: {
                        dayHeader(group: group)
                            .listRowInsets(
                                EdgeInsets(top: 16, leading: 0, bottom: 6, trailing: 0)
                            )
                    }
                    .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.top, 56)
        .padding(.bottom, 90)
    }

    // MARK: - Sections

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
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
                Eyebrow("SECTION II")
                Spacer()
            }
            Mass("Реестр.", italic: true, size: 70)
                .padding(.top, 6)
            Eyebrow(
                "\(model.headerSummary.count) ЗАПИСЕЙ · \(RubleFormatter.format(cents: model.headerSummary.sumCents)) ₽",
                opacity: 0.6
            )
            .padding(.top, 4)
            chipBar
                .padding(.top, 18)
        }
    }

    private var chipBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(TransactionFilterChip.allCases, id: \.self) { chip in
                    Chip(chip.label, active: model.chip == chip) {
                        model.chip = chip
                    }
                }
            }
        }
    }

    private func dayHeader(group: TxDayGroup) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(group.dateLabel)
                .font(.posterMassItalic(size: 28))
                .tracking(28 * -0.02)
                .foregroundColor(PosterTokens.Color.paper)
            Spacer()
            Text("\(RubleFormatter.format(cents: group.sumCents)) ₽")
                .font(.posterMono(size: PosterTokens.FontSize.bodySm))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Mass("Реестр пуст —", italic: true, size: 32)
                .foregroundColor(PosterTokens.Color.paper)
            Text("добавьте первую трату через FAB")
                .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
        }
    }

    /// WR-25-09 (review fix): bottom-anchored transient banner for delete
    /// failures. Tap to dismiss. Visible above the FAB chrome via padding.
    private func deleteErrorBanner(_ msg: String) -> some View {
        VStack {
            Spacer()
            HStack(spacing: 10) {
                Text(msg.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                    .tracking(1.6)
                    .foregroundColor(PosterTokens.Color.cobalt)
                Spacer()
                Button(action: { model.clearDeleteError() }) {
                    Text("×")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 18))
                        .foregroundColor(PosterTokens.Color.cobalt)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Скрыть сообщение об ошибке")
            }
            .padding(.horizontal, PosterTokens.Space.s14)
            .padding(.vertical, 12)
            .background(PosterTokens.Color.yellow)
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.bottom, 110) // clear of FAB / bottom nav chrome
        }
    }
}

// MARK: - TxRow

private struct TxRow: View {
    let tx: ActualV10DTO
    let category: CategoryV10DTO?
    let account: AccountDTO?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(V10Formatters.formatTimeHM(tx.createdAt ?? tx.txDate))
                .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
                .frame(width: 52, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text(tx.description ?? category?.name ?? "—")
                    .font(.posterBody(size: PosterTokens.FontSize.monoMd).weight(.semibold))
                    .foregroundColor(PosterTokens.Color.paper)
                    .lineLimit(2)
                rowMetaLine
            }
            Spacer(minLength: 6)
            Text(TransactionsData.formatTxAmount(tx.amountCents))
                .font(.posterMono(size: 16, weight: .semibold))
                .foregroundColor(amountColor)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(PosterTokens.Color.paper.opacity(0.18))
                .frame(height: 1)
        }
    }

    /// «категория · СЧЁТ ····MASK   [↻ ОКРУГЛ. | → КОПИЛКА]»
    private var rowMetaLine: some View {
        HStack(spacing: 6) {
            if let cat = category {
                Text(cat.name.uppercased())
                    .font(.posterMono(size: PosterTokens.FontSize.eye))
                    .tracking(0.06 * PosterTokens.FontSize.eye)
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
            }
            if let acc = account {
                Text("·")
                    .font(.posterMono(size: PosterTokens.FontSize.eye))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
                Text(accountLabel(acc))
                    .font(.posterMono(size: PosterTokens.FontSize.eye))
                    .tracking(0.06 * PosterTokens.FontSize.eye)
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
            }
            if let tag = TransactionsData.tagFor(tx) {
                switch tag {
                case .roundup:
                    TagPlate(text: "↻ ОКРУГЛ.", bg: PosterTokens.Color.yellow, fg: PosterTokens.Color.cobalt)
                case .deposit:
                    TagPlate(text: "→ КОПИЛКА", bg: PosterTokens.Color.paper, fg: PosterTokens.Color.cobalt)
                }
            }
        }
    }

    private func accountLabel(_ acc: AccountDTO) -> String {
        var s = acc.bank.uppercased()
        if let mask = acc.mask, !mask.isEmpty { s += " " + mask }
        return s
    }

    /// Roundup / deposit rows render the amount in yellow per prototype line 374.
    private var amountColor: Color {
        if tx.kind == .roundup || tx.kind == .deposit {
            return PosterTokens.Color.yellow
        }
        return PosterTokens.Color.paper
    }
}

// MARK: - Inline spec-tag plate

private struct TagPlate: View {
    let text: String
    let bg: Color
    let fg: Color

    var body: some View {
        Text(text)
            .font(.custom(PosterTokens.Font.archivoBlack, size: 9))
            .tracking(9 * 0.14)
            .padding(.vertical, 1)
            .padding(.horizontal, 5)
            .background(bg)
            .foregroundColor(fg)
    }
}

// MARK: - Edit sheet placeholder (real editor lands in Phase 26)

private struct EditPlaceholderSheet: View {
    let tx: ActualV10DTO?
    let onClose: () -> Void

    var body: some View {
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.paper).ignoresSafeArea()
            VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
                HStack {
                    Eyebrow("РЕДАКТИРОВАТЬ · #\(tx?.id ?? 0)", opacity: 0.7, color: PosterTokens.Color.ink)
                    Spacer()
                    Button(action: onClose) {
                        Text("×")
                            .font(.custom(PosterTokens.Font.archivoBlack, size: 28))
                            .foregroundColor(PosterTokens.Color.ink)
                    }
                    .buttonStyle(.plain)
                }
                Mass("Editor —", italic: true, size: 36)
                    .foregroundColor(PosterTokens.Color.ink)
                Text("WIP — TransactionEditor poster retrofit shipped in Phase 26.")
                    .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
                Spacer()
                Button(action: onClose) {
                    Text("ЗАКРЫТЬ")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                        .kerning(13 * 0.16)
                        .foregroundColor(PosterTokens.Color.paper)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(PosterTokens.Color.ink)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 28)
            .padding(.bottom, 22)
        }
        .frame(maxWidth: .infinity, maxHeight: 360, alignment: .topLeading)
    }
}

// MARK: - Preview

#Preview("TransactionsV10View · loading") {
    TransactionsV10View()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
