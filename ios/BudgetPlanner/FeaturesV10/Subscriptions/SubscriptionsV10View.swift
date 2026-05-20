// Phase 26-07 Task 2: SubscriptionsV10View — iOS Subscriptions screen
// (SUBS-V10-01..04). Symmetric to web Plan 26-06 SubscriptionsView.
//
// File / type renamed `SubscriptionsV10View` (not `SubscriptionsView`) to
// avoid filename + symbol collision with legacy
// `Features/Management/SubscriptionsView.swift` and its `SubscriptionsViewModel`
// in the same Swift module. The V10 ViewModel is `SubscriptionsV10ViewModel`.
//
// Renders the maximal-poster subscriptions feed per CONTEXT:
//   - Coral background (PosterTokens.Color.coral) edge-to-edge.
//   - Header: optional «← НАЗАД» (when canPop) + Eyebrow «SUBSCRIPTIONS».
//   - Mass italic «Подписки.» (PT Serif 70pt per ADR-001).
//   - BigFig Σ monthly active / 100 with «₽/мес» suffix.
//   - Eyebrow «N АКТИВНЫХ · Y ₽ В ГОД».
//   - List of subs: name UPPER + cadence caption + amount + «···» tap target.
//
// Sheets:
//   - menuSub bound → posterSheet primary (SubscriptionMenuSheet) hides when a
//     pendingDeleteSub is set so the .confirmationDialog renders cleanly.
//   - .confirmationDialog binds to pendingDeleteSub → confirm calls
//     model.deleteSub (T-26-07-01 two-step gate).
//
// Reachable via `router?.push(SubscriptionsV10View())`. Phase 27 Mgmt-хаб will
// add the bottom-nav entry-point.

import SwiftUI

struct SubscriptionsV10View: View {
    @State private var model = SubscriptionsV10ViewModel()
    // Plan 30-04 (DEBT-04): drives the error-toast overlay. Mirrors the
    // pattern used in PlanView — toastMessage on the VM is the source of
    // truth, this @State just flips visibility for the Toast component.
    @State private var toastVisible = false
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack(alignment: .top) {
            ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea()
            content
            // Error toast overlay — DEBT-04. Renders only while
            // `toastVisible == true`; auto-dismisses after Toast's 1.7s life,
            // then the .onChange handler clears the source string so a
            // subsequent identical message still re-triggers visibility.
            Toast(message: model.toastMessage ?? "", visible: $toastVisible)
                .padding(.top, 16)
        }
        .task { await model.load() }
        .onChange(of: model.toastMessage) { _, msg in
            if msg != nil {
                toastVisible = true
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    if !toastVisible { model.toastMessage = nil }
                }
            }
        }
        // Primary menu sheet — bound to menuSub, suppressed while a destructive
        // confirm dialog is pending so the OS dialog renders without overlap.
        .posterSheet(
            isPresented: Binding(
                get: { model.menuSub != nil && model.pendingDeleteSub == nil },
                set: { newValue in if !newValue { model.menuSub = nil } }
            )
        ) {
            if let sub = model.menuSub {
                SubscriptionMenuSheet(
                    sub: sub,
                    onTogglePause: {
                        Task {
                            await model.togglePause(sub)
                            model.menuSub = nil
                        }
                    },
                    onChangeDay: { newDay in
                        Task {
                            await model.changeDay(sub, newDay: newDay)
                            model.menuSub = nil
                        }
                    },
                    onChangePrice: { newCents in
                        Task {
                            await model.changePrice(sub, newCents: newCents)
                            model.menuSub = nil
                        }
                    },
                    onRequestDelete: { model.pendingDeleteSub = sub }
                )
            }
        }
        // Two-step destructive delete (T-26-07-01).
        .confirmationDialog(
            model.pendingDeleteSub.map { "Отменить подписку «\($0.name)»?" } ?? "",
            isPresented: Binding(
                get: { model.pendingDeleteSub != nil },
                set: { newValue in if !newValue { model.pendingDeleteSub = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Удалить", role: .destructive) {
                if let sub = model.pendingDeleteSub {
                    Task {
                        await model.deleteSub(sub)
                        model.pendingDeleteSub = nil
                        model.menuSub = nil
                    }
                }
            }
            Button("Отмена", role: .cancel) { model.pendingDeleteSub = nil }
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
                    .foregroundColor(PosterTokens.Color.coral)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(PosterTokens.Color.paper)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var readyState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
                headerRow
                Mass("Подписки.", italic: true, size: 70)
                    .foregroundColor(PosterTokens.Color.paper)
                BigFig(
                    value: model.monthlyTotal / 100,
                    sup: "₽/мес",
                    size: 86,
                    color: PosterTokens.Color.paper
                )
                Eyebrow(
                    "\(model.activeCount) АКТИВНЫХ · \(RubleFormatter.format(cents: model.yearlyTotalAnnualized)) ₽ В ГОД",
                    opacity: 0.7,
                    color: PosterTokens.Color.paper
                )
                .padding(.bottom, PosterTokens.Space.s18)

                subsList
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, PosterTokens.Space.s56)
            .padding(.bottom, 90)
        }
    }

    private var headerRow: some View {
        HStack {
            if router?.canPop == true {
                Button {
                    router?.pop()
                } label: {
                    Text("← НАЗАД")
                        .font(.posterMono(size: 11, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.paper)
                }
                .buttonStyle(.plain)
            }
            Spacer()
            Eyebrow("SUBSCRIPTIONS", opacity: 0.7, color: PosterTokens.Color.paper)
        }
    }

    @ViewBuilder
    private var subsList: some View {
        let sorted = model.sortedSubs
        if sorted.isEmpty {
            Text("Нет подписок")
                .font(.posterMassItalic(size: 22))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                .padding(.top, PosterTokens.Space.s24)
        } else {
            VStack(spacing: 0) {
                ForEach(sorted) { sub in
                    subRow(sub)
                    Rectangle()
                        .fill(PosterTokens.Color.paper.opacity(0.18))
                        .frame(height: 1)
                }
            }
        }
    }

    @ViewBuilder
    private func subRow(_ sub: SubscriptionV10DTO) -> some View {
        HStack(alignment: .center, spacing: PosterTokens.Space.s10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(sub.name.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                    .foregroundColor(
                        sub.isActive
                            ? PosterTokens.Color.paper
                            : PosterTokens.Color.paper.opacity(0.4)
                    )
                Text(SubscriptionsDomain.cadenceRuV10(sub))
                    .font(.posterMono(size: 11))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
            }
            Spacer()
            Text("\(RubleFormatter.format(cents: sub.amountCents)) ₽")
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(PosterTokens.Color.paper)
            Button {
                model.menuSub = sub
            } label: {
                Text("···")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 18))
                    .foregroundColor(PosterTokens.Color.paper)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Меню для \(sub.name)")
        }
        .padding(.vertical, 12)
    }
}

#Preview("Subscriptions — Loading") {
    SubscriptionsV10View()
}
