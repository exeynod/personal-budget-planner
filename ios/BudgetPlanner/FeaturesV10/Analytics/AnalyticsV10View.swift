// Phase 27-10 Task 2: AnalyticsV10View — iOS «Месяц.» Analytics screen.
//
// Symmetric to web Plan 27-05 AnalyticsView.tsx. Composition:
//   - Cream bg + ink text.
//   - Header «← НАЗАД» (when canPop) + Eyebrow «ANALYTICS / МЕСЯЦ».
//   - Mass italic «Месяц.» (PT Serif Italic, 70pt, ink colour).
//   - 3-chip period row (МАР 26 / АПР 26 / МАЙ 26 (•)) — taps switch
//     `selectedMonth` and reload.
//   - 2 KPI plates (HStack 50/50):
//       · LEFT  — dark ink bg + paper text: «ПОТРАЧЕНО» + BigFig sum + delta line.
//       · RIGHT — yellow bg + ink text: «СЭКОНОМЛЕНО» + BigFig saved + «от плана».
//   - 3-chip group row («ДЕНЬ / НЕД. / КАТ.») — switches bar chart bucketing.
//   - Bar chart (HStack of Rectangles, height ∝ sum / maxSum). Bars
//     ≥ 75% of the per-category plan in `.cat` mode are tinted red
//     (T-27-10-03 div-by-zero guard inside helper).
//   - Top-5 categories list — fed by `/analytics/top-categories` (Phase 8
//     endpoint). Renders rank · name uppercase · amount · pct% (when plan>0).

import SwiftUI

struct AnalyticsV10View: View {
    @State private var model = AnalyticsV10ViewModel()
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.cream).ignoresSafeArea()
            content
        }
        .task { await model.load() }
    }

    // MARK: - Status switch

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
            Mass(msg, italic: true, size: 28)
                .foregroundColor(PosterTokens.Color.ink)
            Button {
                Task { await model.load() }
            } label: {
                Text("ПОВТОРИТЬ →")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(PosterTokens.Color.paper)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(PosterTokens.Color.ink)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
    }

    // MARK: - Ready

    private var readyState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                headerRow
                Mass("Месяц.", italic: true, size: 70)
                    .foregroundColor(PosterTokens.Color.ink)
                periodChips
                    .padding(.top, 4)
                kpiRow
                    .padding(.top, 6)
                groupChips
                    .padding(.top, 12)
                barChart
                    .padding(.top, 6)
                Eyebrow("ТОП КАТЕГОРИИ", opacity: 0.7, color: PosterTokens.Color.ink)
                    .padding(.top, 14)
                topCategoriesList
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 90)
        }
    }

    // MARK: - Header + chips

    private var headerRow: some View {
        HStack(alignment: .firstTextBaseline) {
            if let r = router, r.canPop {
                Button(action: { r.pop() }) {
                    Text("← НАЗАД")
                        .font(.posterMono(size: PosterTokens.FontSize.eye, weight: .semibold))
                        .tracking(0.14 * PosterTokens.FontSize.eye)
                        .foregroundColor(PosterTokens.Color.ink)
                        .opacity(0.7)
                }
                .buttonStyle(.plain)
                Spacer().frame(width: 12)
            }
            Spacer()
            Eyebrow("ANALYTICS / МЕСЯЦ", opacity: 0.7, color: PosterTokens.Color.ink)
        }
    }

    private var periodChips: some View {
        HStack(spacing: 8) {
            ForEach(model.monthOptions) { m in
                // Custom dark chip — Chip component uses paper-on-cobalt
                // palette which is invisible on cream. We render an
                // ink-bordered button instead so the cream bg is honoured.
                Button {
                    Task { await model.selectMonth(m) }
                } label: {
                    Text(m.label)
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                        .tracking(1.4)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 11)
                        .foregroundColor(
                            model.selectedMonth?.id == m.id
                                ? PosterTokens.Color.paper
                                : PosterTokens.Color.ink
                        )
                        .background(
                            model.selectedMonth?.id == m.id
                                ? PosterTokens.Color.ink
                                : Color.clear
                        )
                        .overlay(
                            Rectangle()
                                .stroke(PosterTokens.Color.ink.opacity(0.35), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    private var groupChips: some View {
        HStack(spacing: 8) {
            groupChip("ДЕНЬ", mode: .day)
            groupChip("НЕД.", mode: .week)
            groupChip("КАТ.", mode: .cat)
            Spacer()
        }
    }

    private func groupChip(_ label: String, mode: AnalyticsData.GroupMode) -> some View {
        let active = model.groupMode == mode
        return Button {
            model.selectGroup(mode)
        } label: {
            Text(label)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                .tracking(1.4)
                .padding(.vertical, 8)
                .padding(.horizontal, 11)
                .foregroundColor(active ? PosterTokens.Color.paper : PosterTokens.Color.ink)
                .background(active ? PosterTokens.Color.ink : Color.clear)
                .overlay(
                    Rectangle()
                        .stroke(PosterTokens.Color.ink.opacity(0.35), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - KPI plates

    private var kpiRow: some View {
        let kpi = model.kpiSpent
        let saved = model.kpiSaved
        return HStack(spacing: 10) {
            kpiSpentPlate(sumCents: kpi.sumCents, deltaPct: kpi.deltaPct)
            kpiSavedPlate(savedCents: saved)
        }
    }

    private func kpiSpentPlate(sumCents: Int, deltaPct: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow("ПОТРАЧЕНО", opacity: 0.7, color: PosterTokens.Color.paper)
            Text("\(RubleFormatter.format(cents: sumCents)) ₽")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                .foregroundColor(PosterTokens.Color.paper)
            // Delta line — sign convention: > 0 means MORE spent (bad),
            // < 0 means LESS (good). Render with explicit sign.
            Text(deltaSignedLabel(deltaPct))
                .font(.posterMono(size: 11, weight: .semibold))
                .foregroundColor(
                    deltaPct > 0
                        ? PosterTokens.Color.red
                        : PosterTokens.Color.yellow
                )
                .opacity(deltaPct == 0 ? 0.5 : 1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PosterTokens.Color.ink)
    }

    private func kpiSavedPlate(savedCents: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow("СЭКОНОМЛЕНО", opacity: 0.7, color: PosterTokens.Color.ink)
            Text("+\(RubleFormatter.format(cents: savedCents)) ₽")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                .foregroundColor(PosterTokens.Color.ink)
            Text("от плана")
                .font(.posterMono(size: 11, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PosterTokens.Color.yellow)
    }

    private func deltaSignedLabel(_ pct: Int) -> String {
        if pct > 0 { return "+\(pct)% к прошлому" }
        if pct < 0 { return "\(pct)% к прошлому" }
        return "= к прошлому"
    }

    // MARK: - Bar chart

    private var barChart: some View {
        let rows = model.barRows
        let maxSum = rows.map(\.sumCents).max() ?? 0
        let chartHeight: CGFloat = 160

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 6) {
                if rows.isEmpty {
                    Text("Нет операций.")
                        .font(.posterMassItalic(size: 18))
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.5))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(height: chartHeight, alignment: .center)
                } else {
                    ForEach(Array(rows.enumerated()), id: \.offset) { (_, row) in
                        bar(
                            sum: row.sumCents,
                            plan: row.planCents,
                            maxSum: maxSum,
                            chartHeight: chartHeight
                        )
                    }
                }
            }
            // X-axis labels (mono, opacity 0.5).
            HStack(alignment: .top, spacing: 6) {
                ForEach(Array(rows.enumerated()), id: \.offset) { (_, row) in
                    Text(row.label)
                        .font(.posterMono(size: 9))
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.55))
                        .frame(maxWidth: .infinity)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
        }
    }

    private func bar(sum: Int, plan: Int, maxSum: Int, chartHeight: CGFloat) -> some View {
        let h: CGFloat = maxSum > 0 ? CGFloat(sum) / CGFloat(maxSum) * chartHeight : 0
        let red = AnalyticsData.shouldHighlightRed(barSum: sum, barPlan: plan)
        return Rectangle()
            .fill(red ? PosterTokens.Color.red : PosterTokens.Color.ink)
            .frame(maxWidth: .infinity)
            .frame(height: max(2, h))  // 2pt floor so empty days still register visually
    }

    // MARK: - Top-5 list

    private var topCategoriesList: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.topCats.isEmpty {
                Text("Нет данных по категориям.")
                    .font(.posterMassItalic(size: 18))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.5))
                    .padding(.vertical, 8)
            } else {
                ForEach(Array(model.topCats.prefix(5).enumerated()), id: \.element.id) { (idx, item) in
                    topRow(idx: idx, item: item)
                    Rectangle()
                        .fill(PosterTokens.Color.ink.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    private func topRow(idx: Int, item: TopCategoryItemDTO) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(String(format: "%02d", idx + 1))
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.55))
                .frame(width: 24, alignment: .leading)
            Text(item.categoryName.uppercased())
                .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                .tracking(13 * 0.04)
                .foregroundColor(PosterTokens.Color.ink)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 6)
            Text("\(RubleFormatter.format(cents: item.sumCents)) ₽")
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink)
                .fixedSize(horizontal: true, vertical: false)
            if let pct = item.pctOfPlan {
                Text("\(Int(pct.rounded()))%")
                    .font(.posterMono(size: 11, weight: .semibold))
                    .foregroundColor(
                        pct >= 75
                            ? PosterTokens.Color.red
                            : PosterTokens.Color.ink.opacity(0.55)
                    )
                    .frame(width: 36, alignment: .trailing)
            } else {
                Text("—")
                    .font(.posterMono(size: 11, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.4))
                    .frame(width: 36, alignment: .trailing)
            }
        }
        .padding(.vertical, 10)
    }
}

// MARK: - Preview

#Preview("AnalyticsV10View") {
    AnalyticsV10View()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
