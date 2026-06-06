// Phase 26-03 Task 2: CategoryDetailView — iOS Category Detail screen
// (CAT-V10-01..06). Symmetric to web Plan 26-02 CategoryDetailView.
//
// Renders the maximal-poster category detail per prototype:
//   - Cobalt background (red when isOver — `fact > plan`).
//   - Header row: «← НАЗАД» (when canPop) + Eyebrow «CATEGORY · NN».
//   - Mass UPPERCASE name (Archivo Black, 70pt) + italic subtitle
//     («— превышено на N%» when isOver, «— на N% плана» otherwise).
//   - BigFig fact count-up (88pt, paper colour) with «₽» suffix.
//   - 6pt progress bar with break-tick at plan/fact for over-budget rows.
//   - «из X ₽» plan caption (mono).
//   - Rollover plate toggle (paper bg, ink text) — labels:
//       .savings → «ОСТАТОК → НАКОПЛЕНИЯ»
//       .misc    → «ОСТАТОК → ПРОЧЕЕ»
//   - CTA row: «+ ПОДНЯТЬ ЛИМИТ» (push PlanViewPlaceholderView — Plan 26-04
//     swaps to real PlanView with focus param) and «ПАУЗА» / «ВКЛЮЧИТЬ»
//     (toggles paused via PATCH /categories/:id).
//   - Operations list (CAT-V10-06): re-uses TransactionsData.groupByDay +
//     formatTxAmount; renders day-grouped sections with PT-Serif italic
//     28pt headers and TxRow entries (time / description / amount).
//
// Push integration: HomePlaceholders.CategoryDetailPlaceholderView's body is
// rebound to render `CategoryDetailView(categoryId:)` directly (Plan 25-05's
// `router?.push(CategoryDetailPlaceholderView(categoryId:))` callsite from
// HomeV10View continues to work unchanged — zero-touch swap into the real
// screen, mirrors the Plan 25-09 pattern for TransactionsViewPlaceholderView).

import SwiftUI

struct CategoryDetailView: View {
    let categoryId: Int

    @State private var model: CategoryDetailViewModel
    @Environment(\.posterRouter) private var router

    init(categoryId: Int) {
        self.categoryId = categoryId
        self._model = State(wrappedValue: CategoryDetailViewModel(categoryId: categoryId))
    }

    var body: some View {
        ZStack {
            ThemedBackground(maximal: backgroundColor).ignoresSafeArea()
            content
        }
        .posterDarkStatusBar()  // P3-STATUSBAR: light status-bar content on cobalt/red
        .task { await model.load() }
    }

    /// Cobalt by default; switches to red the moment fact > plan.
    private var backgroundColor: Color {
        model.isOver ? PosterTokens.Color.red : PosterTokens.Color.cobalt
    }

    @ViewBuilder
    private var content: some View {
        switch model.status {
        case .idle, .loading:
            loadingState
        case .error(let msg):
            errorState(msg)
        case .ready:
            if let cat = model.category {
                readyState(cat: cat)
            } else {
                // Defensive — .ready without category is impossible by VM
                // construction, but render the error state if it ever happens.
                errorState("Категория не найдена")
            }
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
    private func readyState(cat: CategoryV10DTO) -> some View {
        let fact = model.factCents
        let isOver = model.isOver
        let segments = model.barSegments
        let subtitle: String =
            isOver
            ? "— превышено на \(CategoryDetailData.computeOverPercent(factCents: fact, planCents: cat.planCents))%"
            : "— на \(CategoryDetailData.computeUnderPercent(factCents: fact, planCents: cat.planCents))% плана"
        let groups = model.dayGroups

        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                headerRow(cat: cat)
                Mass(cat.name, size: 70, fit: true)  // Mass uppercases for non-italic mode; fit: shrink-to-fit single line (no mid-word break)
                Mass(subtitle, italic: true, size: 28)
                    .opacity(0.85)
                    .padding(.top, 2)
                BigFig(
                    value: fact / 100,
                    sup: "₽",
                    size: 88,
                    color: PosterTokens.Color.paper
                )
                .padding(.top, 4)
                barView(segments: segments)
                    .padding(.top, 6)
                Text("из \(RubleFormatter.format(cents: cat.planCents)) ₽")
                    .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                ctaRow(cat: cat)
                    .padding(.top, 12)
                Eyebrow("ОПЕРАЦИИ ПО КАТЕГОРИИ", opacity: 0.65)
                    .padding(.top, 16)
                operationsSection(groups: groups)
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 90)
        }
    }

    // MARK: - Sections

    private func headerRow(cat: CategoryV10DTO) -> some View {
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
            Eyebrow("CATEGORY · \(cat.ord ?? "00")", opacity: 0.7)
        }
    }

    private func barView(segments: CategoryDetailData.BarSegments) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(PosterTokens.Color.paper.opacity(0.18))
                    .frame(height: 6)
                Rectangle()
                    .fill(PosterTokens.Color.paper)
                    .frame(width: geo.size.width * segments.fillRatio, height: 6)
                if let tick = segments.tickAt {
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.6))
                        .frame(width: 1, height: 10)
                        .offset(x: geo.size.width * tick, y: -2)
                }
            }
        }
        .frame(height: 6)
    }

    private func ctaRow(cat: CategoryV10DTO) -> some View {
        HStack(spacing: 10) {
            PosterButton("+ ПОДНЯТЬ ЛИМИТ", variant: .ghost) {
                // Phase 26-05 wiring: push the real PlanView with focus on
                // this category. PlanView's ScrollViewReader scrolls to the
                // matching `.id(c.id)` row on appear so the user lands at
                // the slider they came to adjust.
                router?.push(PlanView(focusCategoryId: cat.id))
            }
        }
    }

    @ViewBuilder
    private func operationsSection(groups: [TxDayGroup]) -> some View {
        if groups.isEmpty {
            Text("Операций пока нет")
                .font(.posterMassItalic(size: 18))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                .padding(.top, 6)
        } else {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(groups) { group in
                    daySection(group)
                }
            }
        }
    }

    private func daySection(_ group: TxDayGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
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
            ForEach(group.rows) { tx in
                txRow(tx)
            }
        }
    }

    private func txRow(_ tx: ActualV10DTO) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(V10Formatters.formatTimeHM(tx.createdAt ?? tx.txDate.date, calendar: model.calendar))
                .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.55))
                .frame(width: 50, alignment: .leading)
            Text(tx.description ?? "—")
                .font(.posterBody(size: PosterTokens.FontSize.monoMd).weight(.semibold))
                .foregroundColor(PosterTokens.Color.paper)
                .lineLimit(2)
            Spacer(minLength: 6)
            Text(TransactionsData.formatTxAmount(tx.amountCents, kind: tx.kind))
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(amountColor(for: tx.kind))
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 6)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(PosterTokens.Color.paper.opacity(0.18))
                .frame(height: 1)
        }
    }

    /// Roundup / deposit kinds render in yellow (matches Transactions registry
    /// convention from Plan 25-09); expense / income render in paper.
    private func amountColor(for kind: ActualKindV10) -> Color {
        switch kind {
        case .roundup, .deposit: return PosterTokens.Color.yellow
        case .expense, .income: return PosterTokens.Color.paper
        }
    }
}

// MARK: - Preview

#Preview("CategoryDetailView · loading") {
    CategoryDetailView(categoryId: 1)
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
