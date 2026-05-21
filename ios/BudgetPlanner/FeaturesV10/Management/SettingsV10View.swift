// Phase 27-11 Task 2: SettingsV10View — iOS Settings screen
// (MGMT-V10-02). Symmetric to web Plan 27-06 SettingsView.tsx.
//
// Renders the maximal-poster settings form per CONTEXT:
//   - Paper background (PosterTokens.Color.paper) edge-to-edge.
//   - Header row: «← НАЗАД» (when canPop) + Eyebrow «SETTINGS / НАСТРОЙКИ».
//   - Mass italic «Настройки.» (PT Serif 56pt per ADR-001), ink fg.
//   - 4 form rows:
//       1. День начала цикла       — Stepper 1..28 (T-27-11-02 bound)
//       2. Напоминать за дней     — Stepper 0..30
//       3. AI авто-категоризация  — Toggle (text «ВКЛ»/«ВЫКЛ»)
//       4. AI лимит расходов      — read-only «$N.NN / $M.MM» mono
//
// Optimistic PATCH-on-change with rollback (handled by VM). Loaded on
// first appear; Stepper / Toggle changes fire .onChange triggers.

import SwiftUI

struct SettingsV10View: View {
    @State private var model = SettingsV10ViewModel()
    @Environment(\.posterRouter) private var router

    // Phase 30-07 (DEBT-08): Home background color preference (client-only,
    // no API call). Same storage key as web `localStorage['ui.home-color']`.
    @AppStorage("ui.home-color") private var homeColorRaw: String = HomeColor.coral.rawValue
    @State private var homeColorPickerOpen = false

    // Phase 54-02 (LG-SW-03, LG-SW-04, LG-SW-05 ios): Theme + picker sheet state.
    @AppStorage("ui.theme") private var themeRaw: String = Theme.maximalPoster.rawValue
    @State private var themePickerOpen = false

    /// Two-way binding bridging the raw string in @AppStorage with the
    /// enum type that HomeColorPickerSheet operates on. Whitelist-resolve
    /// on read; write back the rawValue.
    private var homeColorBinding: Binding<HomeColor> {
        Binding(
            get: { HomeColor.resolve(homeColorRaw) },
            set: { homeColorRaw = $0.rawValue }
        )
    }

    var body: some View {
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.paper).ignoresSafeArea()
            content
        }
        .posterLightStatusBar()  // P3-STATUSBAR: dark status-bar content on cream
        .task { await model.load() }
        .posterSheet(isPresented: $homeColorPickerOpen) {
            HomeColorPickerSheet(
                selection: homeColorBinding,
                isPresented: $homeColorPickerOpen
            )
        }
        .posterSheet(isPresented: $themePickerOpen) {
            ThemePickerSheet(isPresented: $themePickerOpen)
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
            Mass(msg, italic: false, size: 28)
                .foregroundColor(PosterTokens.Color.ink)
            PosterButton("ПОВТОРИТЬ →", variant: .primary) {
                Task { await model.load() }
            }
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
    }

    private var readyState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s24) {
                headerRow
                Mass("Настройки.", italic: true, size: 56)
                    .foregroundColor(PosterTokens.Color.ink)

                cycleRow
                divider
                notifyRow
                divider
                aiToggleRow
                divider
                aiCapRow
                divider
                homeColorRow
                divider
                themeRow

                if let err = model.saveError {
                    Text(err)
                        .font(.posterMono(size: 12, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.red)
                        .padding(.top, 6)
                }
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 90)
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
                        .foregroundColor(PosterTokens.Color.ink)
                        .opacity(0.7)
                }
                .buttonStyle(.plain)
                Spacer().frame(width: 12)
            }
            Spacer()
            Eyebrow("SETTINGS / НАСТРОЙКИ", color: PosterTokens.Color.ink)
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(PosterTokens.Color.ink.opacity(0.18))
            .frame(height: 1)
    }

    private var cycleRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow("ДЕНЬ НАЧАЛА ЦИКЛА", color: PosterTokens.Color.ink)
            HStack {
                Text("\(model.cycleStartDay)")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                    .foregroundColor(PosterTokens.Color.ink)
                    .frame(minWidth: 36, alignment: .leading)
                Spacer()
                PosterStepper(
                    value: model.cycleStartDay,
                    range: SettingsV10ViewModel.cycleMin...SettingsV10ViewModel.cycleMax,
                    onChange: { newVal in Task { await model.changeCycleStartDay(newVal) } }
                )
            }
        }
        .padding(.vertical, 12)
    }

    private var notifyRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow("НАПОМИНАТЬ ЗА ДНЕЙ ДО ПОДПИСКИ", color: PosterTokens.Color.ink)
            HStack {
                Text("\(model.notifyDaysBefore)")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                    .foregroundColor(PosterTokens.Color.ink)
                    .frame(minWidth: 36, alignment: .leading)
                Spacer()
                PosterStepper(
                    value: model.notifyDaysBefore,
                    range: SettingsV10ViewModel.notifyMin...SettingsV10ViewModel.notifyMax,
                    onChange: { newVal in Task { await model.changeNotifyDaysBefore(newVal) } }
                )
            }
        }
        .padding(.vertical, 12)
    }

    private var aiToggleRow: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow("AI АВТО-КАТЕГОРИЗАЦИЯ", color: PosterTokens.Color.ink)
                Text(model.enableAiCategorization ? "ВКЛ" : "ВЫКЛ")
                    .font(.posterMono(size: 14, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.7))
            }
            Spacer()
            Toggle(
                "",
                isOn: Binding(
                    get: { model.enableAiCategorization },
                    set: { newVal in Task { await model.toggleEnableAiCategorization(newVal) } }
                )
            )
            .labelsHidden()
            .tint(PosterTokens.Color.coral)
        }
        .padding(.vertical, 12)
    }

    private var aiCapRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow("AI ЛИМИТ РАСХОДОВ", color: PosterTokens.Color.ink)
            Text(formatCap(spend: model.aiSpendCents, cap: model.aiSpendingCapCents))
                .font(.posterMono(size: 14, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.85))
        }
        .padding(.vertical, 12)
    }

    private func formatCap(spend: Int, cap: Int) -> String {
        let s = String(format: "%.2f", Double(spend) / 100.0)
        let c = String(format: "%.2f", Double(cap) / 100.0)
        return "$\(s) / $\(c)"
    }

    // MARK: - Phase 30-07 (DEBT-08): Home color row

    /// Tappable row in Settings: shows current Home color preview (small
    /// swatch + RU label) + chevron. Tap opens HomeColorPickerSheet via
    /// `.posterSheet(isPresented:)` modifier attached on `body`.
    private var homeColorRow: some View {
        let current = HomeColor.resolve(homeColorRaw)
        return Button {
            homeColorPickerOpen = true
        } label: {
            HStack(alignment: .center, spacing: 8) {
                Eyebrow("ЦВЕТ HOME", color: PosterTokens.Color.ink)
                Spacer()
                Rectangle()
                    .fill(current.swiftColor)
                    .frame(width: 14, height: 14)
                    .overlay(
                        Rectangle()
                            .stroke(PosterTokens.Color.ink.opacity(0.2), lineWidth: 1)
                    )
                Text(current.ruLabel)
                    .font(.posterMono(size: 11, weight: .semibold))
                    .tracking(0.14 * 11)
                    .foregroundColor(PosterTokens.Color.ink)
                Text("→")
                    .font(.posterMono(size: 14))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.4))
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-color-row")
    }

    // MARK: - Phase 54-02 (LG-SW-04): Theme row

    /// Tappable row in Settings: shows current theme label + chevron.
    /// Tap opens `ThemePickerSheet` via `.posterSheet(isPresented:)` modifier
    /// attached on `body`.
    private var themeRow: some View {
        let current = Theme.resolve(themeRaw)
        return Button {
            themePickerOpen = true
        } label: {
            HStack(alignment: .center, spacing: 8) {
                Eyebrow("ТЕМА", color: PosterTokens.Color.ink)
                Spacer()
                Text(current.ruLabel)
                    .font(.posterMono(size: 11, weight: .semibold))
                    .tracking(0.14 * 11)
                    .foregroundColor(PosterTokens.Color.ink)
                Text("→")
                    .font(.posterMono(size: 14))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.4))
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("theme-row")
    }
}

// MARK: - Preview

#Preview("SettingsV10View") {
    SettingsV10View()
        .environment(\.posterRouter, PosterRouter(root: EmptyView()))
}
