// Phase 26-05 Task 2: PlanView — iOS PLAN мая screen (PLAN-V10-01..06).
// Symmetric to web Plan 26-04 PlanView.
//
// Renders the maximal-poster plan-month surface per prototype:
//   - Cobalt background (paper text).
//   - Header row: «← НАЗАД» (when canPop) + Eyebrow «MGMT / LIMITS».
//   - Mass UPPERCASE «PLAN МЕСЯЦА.» (Archivo Black, 70pt).
//   - Surplus plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» (PLAN-V10-02): yellow when OK,
//     red when overflow — overflow blocks «СОХРАНИТЬ» CTA.
//   - 2 rollover-aggregate plates (PLAN-V10-03): «→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ».
//   - «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» block (PLAN-V10-04): list of monthly
//     subscriptions with «ПРОВЕСТИ →» / «ОТМЕНА» button per row.
//   - «КАТЕГОРИИ · N» block (PLAN-V10-05): one PosterSlider per visible
//     category (step 50_000 = 500₽, 300ms debounce built-in) + chip-pair
//     («ПРОЧЕЕ» / «НАКОПЛЕНИЯ») toggling rollover via PATCH /categories/:id.
//   - «СОХРАНИТЬ» CTA (PLAN-V10-06): primary yellow when OK, ghost when
//     overflow (disabled). On success → Toast + router.pop after ~600ms.
//
// Push integration: HomePlaceholders.PlanViewPlaceholderView's body is
// rebound to render `PlanView()` directly (zero-touch swap pattern from
// Plan 25-09 / 26-03). CategoryDetailView's «+ ПОДНЯТЬ ЛИМИТ» CTA pushes
// `PlanView(focusCategoryId: catId)` so the screen scrolls to the focused
// row on appear.

import SwiftUI

struct PlanView: View {
    let focusCategoryId: Int?

    @State private var model: PlanViewModel
    @State private var toastVisible = false
    @Environment(\.posterRouter) private var router

    init(focusCategoryId: Int? = nil) {
        self.focusCategoryId = focusCategoryId
        self._model = State(wrappedValue: PlanViewModel(focusCategoryId: focusCategoryId))
    }

    var body: some View {
        ZStack(alignment: .top) {
            PosterTokens.Color.cobalt.ignoresSafeArea()
            content
            // Toast overlay — renders only while `toastVisible == true`.
            Toast(message: model.toastMessage ?? "", visible: $toastVisible)
                .padding(.top, 16)
        }
        .task { await model.load() }
        .onChange(of: model.toastMessage) { _, msg in
            if msg != nil {
                toastVisible = true
                // Toast component auto-dismisses after 1.7s; clear the source
                // string after a small grace period so a subsequent identical
                // message still triggers .onChange.
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    if !toastVisible { model.toastMessage = nil }
                }
            }
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
            PosterButton("ПОВТОРИТЬ →", variant: .primary) {
                Task { await model.load() }
            }
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
    }

    // MARK: - Ready

    private var readyState: some View {
        let surplus = PlanData.computeSurplus(incomeCents: model.income, plans: model.plans)
        let isOverflow = PlanData.computeIsOverflow(surplus)
        let aggregates = PlanData.computeRolloverAggregates(
            categories: model.categories, plans: model.plans, actuals: model.actuals
        )
        let regulars = PlanData.computeRegularsList(subs: model.subs, categories: model.categories)
        let planByCat: [Int: Int] = Dictionary(
            uniqueKeysWithValues: model.plans.map { ($0.categoryId, $0.planCents) }
        )

        return ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    headerRow
                    Mass("PLAN МЕСЯЦА.", size: 70)
                    surplusPlate(surplus: surplus, isOverflow: isOverflow)
                        .padding(.top, 4)
                    HStack(spacing: 10) {
                        aggPlate(label: "→ ПРОЧЕЕ", cents: aggregates.miscCents)
                        aggPlate(label: "→ НАКОПЛЕНИЯ", cents: aggregates.savingsCents)
                    }
                    Eyebrow("РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ", opacity: 0.7)
                        .padding(.top, 12)
                    regularsSection(regulars)
                    Eyebrow("КАТЕГОРИИ · \(model.categories.count)", opacity: 0.7)
                        .padding(.top, 12)
                    ForEach(model.categories) { c in
                        categoryRow(c, currentPlan: planByCat[c.id] ?? c.planCents)
                            .id(c.id)
                    }
                    if let err = model.saveError {
                        Text(err)
                            .font(.posterMono(size: 12, weight: .semibold))
                            .foregroundColor(PosterTokens.Color.red)
                            .padding(.top, 6)
                    }
                    PosterButton(
                        model.submitting ? "СОХРАНЯЕМ…" : "СОХРАНИТЬ ↵",
                        variant: isOverflow ? .ghost : .primary,
                        disabled: isOverflow || model.submitting
                    ) {
                        Task {
                            let ok = await model.submit()
                            if ok {
                                // Brief grace so the user sees the «✓ ПЛАН СОХРАНЁН»
                                // toast before the screen pops.
                                try? await Task.sleep(nanoseconds: 600_000_000)
                                router?.pop()
                            }
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.top, 56)
                .padding(.bottom, 90)
            }
            .onAppear {
                // Scroll-to-focus when CategoryDetailView pushed us with a
                // specific category in mind.
                if let fid = focusCategoryId {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        withAnimation { proxy.scrollTo(fid, anchor: .center) }
                    }
                }
            }
        }
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
            Eyebrow("MGMT / LIMITS", opacity: 0.7)
        }
    }

    private func surplusPlate(surplus: Int, isOverflow: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow("ОСТАЛОСЬ РАСПРЕДЕЛИТЬ", opacity: 0.85)
            Text("\(surplus >= 0 ? "+" : "−")\(RubleFormatter.format(cents: abs(surplus))) ₽")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                .foregroundColor(isOverflow ? PosterTokens.Color.red : PosterTokens.Color.yellow)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            (isOverflow ? PosterTokens.Color.red : PosterTokens.Color.yellow)
                .opacity(0.18)
        )
    }

    private func aggPlate(label: String, cents: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(label, opacity: 0.7)
            Text("\(RubleFormatter.format(cents: cents)) ₽")
                .font(.posterMono(size: 14, weight: .semibold))
                .foregroundColor(PosterTokens.Color.paper)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PosterTokens.Color.paper.opacity(0.08))
    }

    @ViewBuilder
    private func regularsSection(_ regulars: [PlanData.RegularRow]) -> some View {
        if regulars.isEmpty {
            Text("Нет регулярных платежей в этом месяце.")
                .font(.posterMassItalic(size: 18))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                .padding(.vertical, 4)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(regulars) { r in
                    regularRow(r)
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    private func regularRow(_ r: PlanData.RegularRow) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(r.name.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .tracking(13 * 0.04)
                    .foregroundColor(PosterTokens.Color.paper)
                Text("\(r.dayOfMonth) числа · \(r.categoryName)")
                    .font(.posterMono(size: PosterTokens.FontSize.monoSm))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
            }
            Spacer(minLength: 6)
            Text("\(RubleFormatter.format(cents: r.amountCents)) ₽")
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(PosterTokens.Color.paper)
                .fixedSize(horizontal: true, vertical: false)
            if r.postedTxnId == nil {
                Button(action: { Task { await model.postRegular(r.id) } }) {
                    Text("ПРОВЕСТИ →")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                        .tracking(11 * 0.16)
                        .foregroundColor(PosterTokens.Color.paper)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 10)
                        .overlay(Rectangle().stroke(PosterTokens.Color.paper.opacity(0.45), lineWidth: 1))
                }
                .buttonStyle(.plain)
            } else {
                Button(action: { Task { await model.unpostRegular(r.id) } }) {
                    Text("ОТМЕНА")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                        .tracking(11 * 0.16)
                        .foregroundColor(PosterTokens.Color.yellow)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 10)
                        .overlay(Rectangle().stroke(PosterTokens.Color.yellow.opacity(0.45), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    private func categoryRow(_ c: CategoryV10DTO, currentPlan: Int) -> some View {
        // Slider upper bound: scale at least up to income so user can dial a
        // single category to «everything». Floor of 6_000_000 (= 60_000₽)
        // protects low-income users who still want headroom.
        let upper = Swift.max(6_000_000, Swift.max(model.income, currentPlan))
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(c.name.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .tracking(13 * 0.04)
                    .foregroundColor(PosterTokens.Color.paper)
                Spacer()
            }
            PosterSlider(
                value: Binding(
                    get: { currentPlan },
                    set: { model.updateSlider(categoryId: c.id, cents: $0) }
                ),
                in: 0...upper,
                step: 50_000
            )
            HStack(spacing: 8) {
                Chip("ПРОЧЕЕ", active: c.rollover == .misc) {
                    Task { await model.toggleRollover(categoryId: c.id, to: .misc) }
                }
                Chip("НАКОПЛЕНИЯ", active: c.rollover == .savings) {
                    Task { await model.toggleRollover(categoryId: c.id, to: .savings) }
                }
            }
            Rectangle()
                .fill(PosterTokens.Color.paper.opacity(0.18))
                .frame(height: 1)
                .padding(.top, 2)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Preview

#Preview("PlanView · loading") {
    PlanView()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
