// Phase 27-08 Task 2: SavingsV10View — iOS Savings (Копилка) screen
// (SAV-V10-01..04). Symmetric to web Plan 27-03 SavingsView.
//
// Renders the poster-black push-stack screen:
//   - Header: optional «← НАЗАД» (when router.canPop) + Eyebrow
//     «SAVINGS / КОПИЛКА» (right-aligned).
//   - Mass italic «Копилка.» (PT Serif italic 70pt per ADR-001).
//   - Yellow Plate: Eyebrow «НАКОПЛЕНО ВСЕГО» (ink) + BigFig
//     (totalCents/100) + sup "₽" (ink, 86pt).
//   - Eyebrow «В <MONTH> + Y ₽» — current month inflows from
//     `month_in_cents` (paper, semi-transparent).
//   - Section «ОКРУГЛЕНИЕ ТРАТ»: ВКЛ/ВЫКЛ toggle + 3 chips (10/50/100).
//   - Section «ЦЕЛИ»: list of goal cards (name + dueRu caption + numbers
//     + 6pt-tall posterBarFill bar) OR italic empty-state «Нет целей».
//   - CTAs row: PosterButton .primary «+ НОВАЯ ЦЕЛЬ» + .ghost «ПОПОЛНИТЬ».
//
// Sheets (nested .posterSheet ViewModifier — same pattern as
// SubscriptionMenuSheet):
//   - .newGoal mode → NewGoalSheet → VM.createGoal → reload.
//   - .deposit(goalId:) mode → DepositSheet (with initialGoalId) →
//     VM.deposit → reload.
//
// Goal-card tap pre-selects deposit mode via .deposit(goalId: id).
//
// Reached via router?.push(SavingsV10View()) — Phase 27 plan 27-11 wires
// the bottom-nav 'savings' tab to push this view.

import SwiftUI

struct SavingsV10View: View {
    @State private var model = SavingsV10ViewModel()
    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.black).ignoresSafeArea()
            content
        }
        .posterDarkStatusBar()  // P3-STATUSBAR: light status-bar content on black
        .task { await model.load() }
        // Primary: NewGoalSheet.
        .posterSheet(
            isPresented: Binding(
                get: { model.sheet == .newGoal },
                set: { newValue in
                    if !newValue, model.sheet == .newGoal { model.sheet = .none }
                }
            )
        ) {
            NewGoalSheet(
                onSave: { name, targetCents, due in
                    Task { await model.createGoal(name: name, targetCents: targetCents, due: due) }
                },
                onClose: { model.sheet = .none },
                submitting: model.submitting
            )
        }
        // Secondary: DepositSheet — bound to any .deposit(...) variant.
        .posterSheet(
            isPresented: Binding(
                get: {
                    if case .deposit = model.sheet { return true }
                    return false
                },
                set: { newValue in
                    if !newValue {
                        if case .deposit = model.sheet { model.sheet = .none }
                    }
                }
            )
        ) {
            let goalId: Int? = {
                if case .deposit(let gid) = model.sheet { return gid }
                return nil
            }()
            DepositSheet(
                accounts: model.accounts,
                goals: model.snapshot?.goals ?? [],
                initialGoalId: goalId,
                onSave: { amount, accId, gid in
                    Task { await model.deposit(amountCents: amount, accountId: accId, goalId: gid) }
                },
                onClose: { model.sheet = .none },
                submitting: model.submitting
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
                    .foregroundColor(PosterTokens.Color.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(PosterTokens.Color.yellow)
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
                Mass("Копилка.", italic: true, size: 70)
                    .foregroundColor(PosterTokens.Color.paper)

                if let snap = model.snapshot {
                    totalPlate(snap: snap)
                    monthInEyebrow(snap: snap)
                        .padding(.top, -PosterTokens.Space.s8)

                    Spacer().frame(height: PosterTokens.Space.s18)
                    roundupSection(snap: snap)

                    Spacer().frame(height: PosterTokens.Space.s24)
                    goalsSection(snap: snap)

                    Spacer().frame(height: PosterTokens.Space.s24)
                    ctasRow
                }
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
            Eyebrow("SAVINGS / КОПИЛКА", opacity: 0.7, color: PosterTokens.Color.paper)
        }
    }

    private func totalPlate(snap: SavingsSummaryDTO) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s8) {
            Eyebrow("НАКОПЛЕНО ВСЕГО", opacity: 0.7, color: PosterTokens.Color.ink)
            BigFig(
                value: snap.totalCents / 100,
                sup: "₽",
                size: 86,
                color: PosterTokens.Color.ink
            )
        }
        .padding(PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PosterTokens.Color.yellow)
    }

    private func monthInEyebrow(snap: SavingsSummaryDTO) -> some View {
        let monthIdx = max(0, min(11, Calendar.current.component(.month, from: Date()) - 1))
        let monthName = V10Formatters.monthsEn[monthIdx]
        return Eyebrow(
            "В \(monthName) + \(RubleFormatter.format(cents: snap.monthInCents)) ₽",
            opacity: 0.7,
            color: PosterTokens.Color.paper
        )
        .padding(.top, PosterTokens.Space.s8)
    }

    @ViewBuilder
    private func roundupSection(snap: SavingsSummaryDTO) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s10) {
            Eyebrow("ОКРУГЛЕНИЕ ТРАТ", opacity: 0.7, color: PosterTokens.Color.paper)

            // Toggle row: button «ВКЛ» / «ВЫКЛ».
            Button {
                Task { await model.toggleRoundup(!snap.config.roundupEnabled) }
            } label: {
                Text(snap.config.roundupEnabled ? "ВКЛ" : "ВЫКЛ")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(
                        snap.config.roundupEnabled
                            ? PosterTokens.Color.ink
                            : PosterTokens.Color.paper
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        snap.config.roundupEnabled
                            ? PosterTokens.Color.yellow
                            : Color.clear
                    )
                    .overlay(
                        Rectangle()
                            .stroke(
                                snap.config.roundupEnabled
                                    ? .clear
                                    : PosterTokens.Color.paper.opacity(0.45),
                                lineWidth: 1
                            )
                    )
            }
            .buttonStyle(.plain)

            // Base chips 10/50/100.
            HStack(spacing: PosterTokens.Space.s8) {
                ForEach([10, 50, 100], id: \.self) { base in
                    Chip(
                        "\(base) ₽",
                        active: snap.config.roundupBase == base
                    ) {
                        Task { await model.selectBase(base) }
                    }
                }
                Spacer()
            }
        }
    }

    @ViewBuilder
    private func goalsSection(snap: SavingsSummaryDTO) -> some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow("ЦЕЛИ", opacity: 0.7, color: PosterTokens.Color.paper)

            if snap.goals.isEmpty {
                Text("Нет целей — добавьте первую")
                    .font(.posterMassItalic(size: 22))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                    .padding(.top, PosterTokens.Space.s8)
            } else {
                VStack(spacing: 0) {
                    ForEach(snap.goals) { goal in
                        goalCard(goal)
                        Rectangle()
                            .fill(PosterTokens.Color.paper.opacity(0.18))
                            .frame(height: 1)
                    }
                }
            }
        }
    }

    private func goalCard(_ goal: GoalDTO) -> some View {
        let pct = SavingsData.computeProgressPct(
            currentCents: goal.currentCents,
            targetCents: goal.targetCents
        )
        let dueRu = SavingsData.formatDueRu(goal.due?.date)
        return Button {
            model.sheet = .deposit(goalId: goal.id)
        } label: {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s4) {
                Text(goal.name.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                    .foregroundColor(PosterTokens.Color.paper)
                if let dueRu {
                    Text("срок · \(dueRu)")
                        .font(.posterMono(size: 11))
                        .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                }
                HStack {
                    Text(
                        "\(RubleFormatter.format(cents: goal.currentCents)) / \(RubleFormatter.format(cents: goal.targetCents)) ₽"
                    )
                    .font(.posterMono(size: 13, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.paper)
                    Spacer()
                    Text("\(pct)%")
                        .font(.posterMono(size: 13, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.yellow)
                }
                GoalProgressBar(pct: pct)
                    .frame(height: 6)
                    .padding(.top, 2)
            }
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Цель \(goal.name), прогресс \(pct) процентов")
    }

    private var ctasRow: some View {
        HStack(spacing: PosterTokens.Space.s10) {
            PosterButton("+ НОВАЯ ЦЕЛЬ", variant: .primary) {
                model.sheet = .newGoal
            }
            PosterButton("ПОПОЛНИТЬ", variant: .ghost) {
                model.sheet = .deposit(goalId: nil)
            }
        }
    }
}

// MARK: - Progress bar

/// posterBarFill — animated horizontal progress bar.
///
/// Mirrors web Plan 27-03's `.goalProgressFill` CSS animation:
/// width=0 on mount, grows to `pct%` via easeOut 0.7s. Reads the
/// container width via GeometryReader so we don't need to thread a
/// containerWidth prop through the view.
struct GoalProgressBar: View {
    let pct: Int
    @State private var animated: Double = 0

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(PosterTokens.Color.paper.opacity(0.18))
                Rectangle()
                    .fill(PosterTokens.Color.yellow)
                    .frame(width: geo.size.width * animated)
            }
            .onAppear {
                animated = 0
                withAnimation(.easeOut(duration: 0.7)) {
                    animated = Double(pct) / 100.0
                }
            }
            .onChange(of: pct) { _, new in
                withAnimation(.easeOut(duration: 0.7)) {
                    animated = Double(new) / 100.0
                }
            }
        }
    }
}

#Preview("Savings — Loading") {
    SavingsV10View()
}
