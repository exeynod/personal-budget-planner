// Phase 25-05 Task 3: HomeView (HOME-V10-01..06).
//
// Symmetric to web Plan 25-04 HomeView. Renders the maximal-poster home screen
// per prototype (poster-screens.jsx PosterHome lines 202-299):
//
//   - Coral background.
//   - Eyebrow VOL.NN / MONTH YYYY · N ДНЕЙ.
//   - Italic «Дневной темп —» + BigFig with count-up.
//   - Wallet line «· осталось N дней · в кошельке X ₽ →» (tap → push Accounts).
//   - Plan-bar plate «PLAN МЕСЯЦА  ± X ₽ ›» (tap → push PlanView).
//   - Section header «КАТЕГОРИИ … ВСЕ ОПЕРАЦИИ →».
//   - Category rows (sorted by ratio DESC): ord + name + (OVER plate if isOver)
//     + pct% + chevron, then a 3pt bar (paper or yellow when over) with
//     posterRowIn stagger (delay 0.08 + i*0.045s) + posterBarFill (0.7s).
//
// Renamed to `HomeV10View` to coexist with the v0.6 `HomeView` in Features/Home
// (Swift module-level name collision). v0.6 stays untouched (theme=v06 path).
//
// Push routing: `@Environment(\.posterRouter) private var router` — taps call
// `router?.push(...)` with the four placeholder views from HomePlaceholders.swift.
// V10MainShell.swift wires the router root in Plan 25-10; this view DOES NOT
// modify the shell yet.

import SwiftUI

struct HomeV10View: View {
    @State private var model = HomeV10ViewModel()
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            PosterTokens.Color.coral.ignoresSafeArea()
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
                    .foregroundColor(PosterTokens.Color.coral)
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
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowRow
                heroBlock
                walletLine
                    .padding(.top, 6)
                planBar
                    .padding(.top, 14)
                categoriesSection
                    .padding(.top, 22)
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 90)
        }
    }

    // MARK: - Sections

    private var eyebrowRow: some View {
        HStack(alignment: .firstTextBaseline) {
            Eyebrow(model.eyebrow)
            Spacer()
            // Right-side menu hint mirrors prototype line 216 (MЕНЮ ↗); currently
            // a no-op until v10 menu is wired in Phase 26+.
            Text("МЕНЮ ↗")
                .font(.posterMono(size: PosterTokens.FontSize.monoSm, weight: .semibold))
                .tracking(0.06 * PosterTokens.FontSize.monoSm)
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.7)
        }
    }

    private var heroBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            // «Дневной темп —» — italic serif at 28pt, opacity 0.75
            Mass("Дневной темп —", italic: true, size: 28)
                .opacity(0.75)
                .padding(.top, 6)

            // BigFig with count-up; HomeV10ViewModel exposes dailyPaceCents in
            // copecks → divide by 100 for the displayed integer rubles.
            BigFig(
                value: model.dailyPaceCents / 100,
                sup: "₽",
                size: 88,
                color: PosterTokens.Color.paper
            )
            .padding(.top, 14)
        }
    }

    private var walletLine: some View {
        HStack(spacing: 0) {
            Text("· осталось \(model.daysLeft) дней · в кошельке ")
                .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                .tracking(0.06 * PosterTokens.FontSize.monoSm)
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.7)
            // Wallet link: dashed-underline approximation via `.underline`
            // (SwiftUI has no native dashed underline; readable result and
            // we keep a single line of text). Prototype uses `border-bottom:
            // 1px dashed rgba(255,246,232,0.4)` — equivalent semantics here.
            Text("\(RubleFormatter.format(cents: model.walletCents)) ₽ →")
                .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                .tracking(0.06 * PosterTokens.FontSize.monoSm)
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.7)
                .underline(true, color: PosterTokens.Color.paper.opacity(0.4))
                .onTapGesture { router?.push(AccountsListPlaceholderView()) }
            Spacer()
        }
    }

    private var planBar: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("PLAN МЕСЯЦА")
                .font(.posterMono(size: PosterTokens.FontSize.monoSm, weight: .semibold))
                .tracking(0.14 * PosterTokens.FontSize.monoSm)
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.7)
            Spacer()
            HStack(spacing: 10) {
                let isPositive = model.surplusCents >= 0
                Text("\(isPositive ? "+ " : "− ")\(RubleFormatter.format(cents: model.surplusCents)) ₽")
                    .font(.posterMono(size: PosterTokens.FontSize.body, weight: .semibold))
                    .foregroundColor(isPositive ? PosterTokens.Color.yellow : PosterTokens.Color.red)
                Text("›")
                    .font(.posterMono(size: PosterTokens.FontSize.monoMd))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.55)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.22))
        .contentShape(Rectangle())
        .onTapGesture { router?.push(PlanViewPlaceholderView()) }
    }

    private var categoriesSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Eyebrow("КАТЕГОРИИ")
                Spacer()
                Text("ВСЕ ОПЕРАЦИИ →")
                    .font(.posterMono(size: PosterTokens.FontSize.monoSm, weight: .bold))
                    .tracking(0.14 * PosterTokens.FontSize.monoSm)
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.7)
                    .underline(true, color: PosterTokens.Color.paper.opacity(0.4))
                    .onTapGesture { router?.push(TransactionsViewPlaceholderView()) }
            }
            .padding(.bottom, 6)

            ForEach(Array(model.categoryRows.enumerated()), id: \.element.id) { (i, row) in
                CategoryRowView(row: row, index: i)
                    .onTapGesture {
                        router?.push(CategoryDetailPlaceholderView(categoryId: row.id))
                    }
            }
        }
    }
}

// MARK: - Category row

private struct CategoryRowView: View {
    let row: CategoryAggregateRow
    let index: Int

    @State private var appeared: Bool = false
    @State private var barFilled: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top: ord + name + OVER plate + pct% + chevron
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                if let ord = row.ord {
                    Text(ord)
                        .font(.posterMono(size: PosterTokens.FontSize.eye, weight: .semibold))
                        .tracking(0.08 * PosterTokens.FontSize.eye)
                        .foregroundColor(PosterTokens.Color.paper)
                        .opacity(0.5)
                }
                Text(row.name.uppercased())
                    .font(.posterBody(size: PosterTokens.FontSize.body).weight(.bold))
                    .tracking(0.04 * PosterTokens.FontSize.body)
                    .foregroundColor(PosterTokens.Color.paper)
                    .lineLimit(1)
                Spacer(minLength: 6)
                if row.isOver {
                    Text("OVER")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: PosterTokens.FontSize.eye))
                        .tracking(0.14 * PosterTokens.FontSize.eye)
                        .foregroundColor(PosterTokens.Color.ink)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(PosterTokens.Color.paper)
                }
                Text("\(percentText)%")
                    .font(.posterMono(size: PosterTokens.FontSize.body))
                    .foregroundColor(PosterTokens.Color.paper)
                Text("›")
                    .font(.posterMono(size: PosterTokens.FontSize.body))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.5)
                    .frame(width: 14, alignment: .trailing)
            }
            // Bar: 3pt high, paper / yellow when over, scaleX from 0 → barPct.
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(PosterTokens.Color.paper.opacity(0.15))
                GeometryReader { geo in
                    let pct = clampedRatio
                    Rectangle()
                        .fill(row.isOver ? PosterTokens.Color.yellow : PosterTokens.Color.paper)
                        .frame(width: geo.size.width * (barFilled ? pct : 0))
                    if row.isOver, row.factCents > 0 {
                        // 1pt-tall plan tick at the planCents/factCents position.
                        let tickX = geo.size.width * (Double(row.planCents) / Double(row.factCents))
                        Rectangle()
                            .fill(PosterTokens.Color.paper.opacity(0.6))
                            .frame(width: 1, height: 7)
                            .offset(x: tickX, y: -2)
                    }
                }
            }
            .frame(height: 3)
            .padding(.top, 6)

            // Bottom row: «{fact} ₽ ... из {plan}»
            HStack {
                Text("\(RubleFormatter.format(cents: row.factCents)) ₽")
                    .font(.posterMono(size: PosterTokens.FontSize.eye))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.6)
                Spacer()
                Text("из \(RubleFormatter.format(cents: row.planCents))")
                    .font(.posterMono(size: PosterTokens.FontSize.eye))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.6)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(PosterTokens.Color.paper.opacity(0.22))
                .frame(height: 1)
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 8)
        .contentShape(Rectangle())
        .onAppear {
            // Stagger: 0.08 + i*0.045s for the row reveal, then 0.18 + i*0.05s
            // for the bar fill (mirrors web posterRowIn / posterBarFill timings).
            let rowDelay = 0.08 + Double(index) * 0.045
            let barDelay = 0.18 + Double(index) * 0.05
            withAnimation(PosterAnimations.posterRowIn(delay: rowDelay)) {
                appeared = true
            }
            withAnimation(PosterAnimations.posterBarFill(delay: barDelay)) {
                barFilled = true
            }
        }
    }

    private var percentText: String {
        if row.ratio.isInfinite { return "∞" }
        let pct = Int((row.ratio * 100).rounded())
        return "\(pct)"
    }

    /// Bar width ratio capped at 1.0. Over-budget rows still display a full bar
    /// (the OVER plate + yellow colour communicate the breach).
    private var clampedRatio: Double {
        if row.ratio.isInfinite { return 1.0 }
        return min(1.0, row.ratio)
    }
}

// MARK: - Preview

#Preview("HomeView · ready") {
    let m = HomeV10ViewModel()
    // Seed mock data via private setters? They're `private(set)` — we use the
    // production load() flow at runtime. For Preview we ship a stub model that
    // renders the same shape with hard-coded values via a child wrapper.
    return HomeV10ViewPreviewWrapper()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}

private struct HomeV10ViewPreviewWrapper: View {
    var body: some View {
        ZStack {
            PosterTokens.Color.coral.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Eyebrow("VOL.17 / MAY 2026 · 23 ДНЯ")
                        Spacer()
                        Text("МЕНЮ ↗")
                            .font(.posterMono(size: 11, weight: .semibold))
                            .foregroundColor(PosterTokens.Color.paper)
                            .opacity(0.7)
                    }
                    Mass("Дневной темп —", italic: true, size: 28)
                        .opacity(0.75)
                        .padding(.top, 6)
                    BigFig(value: 1500, sup: "₽", size: 88, color: PosterTokens.Color.paper)
                        .padding(.top, 14)
                    Text("· осталось 23 дней · в кошельке 67\u{202F}500 ₽ →")
                        .font(.posterMono(size: 11))
                        .foregroundColor(PosterTokens.Color.paper)
                        .opacity(0.7)
                        .padding(.top, 6)
                    HStack {
                        Text("PLAN МЕСЯЦА")
                            .font(.posterMono(size: 11, weight: .semibold))
                            .foregroundColor(PosterTokens.Color.paper)
                            .opacity(0.7)
                        Spacer()
                        Text("+ 21\u{202F}170 ₽ ›")
                            .font(.posterMono(size: 13, weight: .semibold))
                            .foregroundColor(PosterTokens.Color.yellow)
                    }
                    .padding(12)
                    .background(Color.black.opacity(0.22))
                    .padding(.top, 14)
                }
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.top, 56)
            }
        }
    }
}
