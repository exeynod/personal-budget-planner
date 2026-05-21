// Phase 27-07 Task 2 — V10 AI screen view.
//
// Symmetric to web Plan 27-02 AiView. Black poster surface (paper text)
// with two states:
//
//   • Initial (messages.isEmpty && !isStreaming):
//     - Header: optional «← НАЗАД» + Eyebrow «AI · ASSISTANT / ONLINE» right.
//     - Observation block:
//         · loading  → ProgressView + Eyebrow «…».
//         · error    → red italic 18pt fallback text.
//         · ready    → DM Serif Display italic 36pt observation paragraph
//                      (PT Serif Italic for cyrillic per ADR-001).
//     - Eyebrow «— ИЗ ВАШИХ ДАННЫХ, {todayRu}».
//     - Eyebrow «ПОДСКАЗКИ · ТАПНИ».
//     - 4 chip rows: italic 18pt + «→», tap → send(chip).
//
//   • Active (any messages OR streaming):
//     - ScrollView with messages list:
//         · .user → black plate align trailing, mono 13pt paper text.
//         · .ai   → italic paper text in framed paper-border block, leading.
//     - if isStreaming: 3-dot typing indicator with posterDot animation.
//
//   • Composer (sticky bottom):
//     - TextField mono input «напишите или тапните подсказку…».
//     - PosterButton primary «↵ ОТПРАВИТЬ» (disabled when input empty
//       or streaming).
//
// Navigation: optional `← НАЗАД` via @Environment(\.posterRouter) — visible
// only when the router can pop. AiV10View is mounted both root-tab (no back)
// and via push from elsewhere (back visible).

import SwiftUI

struct AiV10View: View {
    @State private var model = AiV10ViewModel()
    @Environment(\.posterRouter) private var router

    var body: some View {
        // Phase 29-04 §8 AI iOS-8 BLOCKER — DESIGN-SYSTEM §1 palette rule
        // «AI → cream / ink / red»: background flipped from black → cream,
        // foreground tokens paper → ink across the view. Matches the web
        // equivalent fix in AiView.module.css.
        ZStack {
            ThemedBackground(maximal: PosterTokens.Color.cream).ignoresSafeArea()
            content
        }
        .posterLightStatusBar()  // P3-STATUSBAR: dark status-bar content on cream
        .task { await model.loadObservation() }
    }

    private var isInitial: Bool {
        model.messages.isEmpty && !model.isStreaming
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            headerRow
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.top, PosterTokens.Space.s56)
                .padding(.bottom, PosterTokens.Space.s12)

            if isInitial {
                initialState
            } else {
                activeState
            }

            composer
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.vertical, PosterTokens.Space.s12)
                // Phase 29-04 §8 BLOCKER #5 — composer plate is ink-bg
                // (matches the web composer with bg var(--poster-ink)).
                .background(PosterTokens.Color.ink)
        }
    }

    // MARK: - Header row

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
            }
            Spacer()
            Eyebrow("AI · ASSISTANT / ONLINE", opacity: 0.7)
        }
    }

    // MARK: - Initial state

    private var initialState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
                observationBlock
                    .padding(.top, PosterTokens.Space.s12)

                Eyebrow("— из ваших данных, \(AiData.todayRu(Date()))", opacity: 0.55)
                    .padding(.top, PosterTokens.Space.s8)

                Eyebrow("ПОДСКАЗКИ · ТАПНИ", opacity: 0.7)
                    .padding(.top, PosterTokens.Space.s24)

                ForEach(Array(AiData.DEFAULT_SUGGESTION_CHIPS.enumerated()), id: \.offset) { _, chip in
                    chipRow(chip)
                }
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.bottom, PosterTokens.Space.s24)
        }
    }

    @ViewBuilder
    private var observationBlock: some View {
        switch model.status {
        case .idle,
            .loading where model.observation == nil:
            HStack(spacing: 10) {
                ProgressView().controlSize(.small).tint(PosterTokens.Color.ink)
                Eyebrow("…", opacity: 0.6)
            }
        case .error:
            // Reserved for terminal load failures (not currently triggered).
            Text("Не удалось загрузить наблюдение")
                .font(.custom(PosterTokens.Font.ptSerifItalic, size: 18).italic())
                .foregroundColor(PosterTokens.Color.red)
        default:
            if let err = model.observationError {
                Text(err)
                    .font(.custom(PosterTokens.Font.ptSerifItalic, size: 18).italic())
                    .foregroundColor(PosterTokens.Color.red)
            } else if let text = model.observation {
                Text(text)
                    .font(.custom(PosterTokens.Font.ptSerifItalic, size: 36).italic())
                    .foregroundColor(PosterTokens.Color.ink)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small).tint(PosterTokens.Color.ink)
                    Eyebrow("…", opacity: 0.6)
                }
            }
        }
    }

    private func chipRow(_ chip: String) -> some View {
        Button {
            Task { await model.sendChip(chip) }
        } label: {
            HStack(alignment: .firstTextBaseline) {
                Text(chip)
                    .font(.custom(PosterTokens.Font.ptSerifItalic, size: 18).italic())
                    .foregroundColor(PosterTokens.Color.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Text("→")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                    .foregroundColor(PosterTokens.Color.yellow)
            }
            .padding(.vertical, 10)
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.18)),
                alignment: .bottom
            )
        }
        .buttonStyle(.plain)
        .disabled(model.isStreaming)
    }

    // MARK: - Active state

    private var activeState: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(model.messages) { msg in
                        bubble(msg).id(msg.id)
                    }
                    if model.isStreaming {
                        typingIndicator
                            .id("typing-indicator")
                    }
                    Color.clear.frame(height: 16).id("ai-bottom-spacer")
                }
                .padding(.horizontal, PosterTokens.Space.s22)
                .padding(.top, PosterTokens.Space.s12)
                .padding(.bottom, PosterTokens.Space.s12)
            }
            .scrollIndicators(.hidden)
            .onChange(of: model.messages.count) { _, _ in
                if let last = model.messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            .onChange(of: model.isStreaming) { _, streaming in
                if streaming {
                    withAnimation { proxy.scrollTo("typing-indicator", anchor: .bottom) }
                }
            }
        }
        .frame(maxHeight: .infinity)
    }

    @ViewBuilder
    private func bubble(_ msg: AiV10ViewModel.Message) -> some View {
        switch msg.role {
        case .user:
            // Phase 29-04 §8 BLOCKER #4 — user bubble retains ink-on-cream
            // contrast: ink plate background with cream text (mirrors web's
            // .msgUser background: var(--poster-ink); color: var(--poster-paper)).
            HStack {
                Spacer(minLength: 40)
                Text(msg.text)
                    .font(.posterMono(size: PosterTokens.FontSize.body))
                    .foregroundColor(PosterTokens.Color.cream)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(PosterTokens.Color.ink)
                    .frame(maxWidth: 320, alignment: .trailing)
            }
        case .ai:
            HStack {
                Text(msg.text)
                    .font(.custom(PosterTokens.Font.ptSerifItalic, size: 16).italic())
                    .foregroundColor(PosterTokens.Color.ink)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .overlay(
                        Rectangle()
                            .stroke(PosterTokens.Color.ink.opacity(0.32), lineWidth: 1)
                    )
                    .frame(maxWidth: 340, alignment: .leading)
                Spacer(minLength: 24)
            }
        }
    }

    private var typingIndicator: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { i in
                TypingDot(delay: PosterAnimations.dotPhase(i: i))
            }
            Spacer()
        }
        .padding(.vertical, 6)
    }

    // MARK: - Composer

    private var composer: some View {
        let canSend = !model.input.trimmingCharacters(in: .whitespaces).isEmpty && !model.isStreaming

        return HStack(spacing: 8) {
            TextField(
                "напишите или тапните подсказку…",
                text: $model.input,
                axis: .vertical
            )
            // Phase 29-04 §8 BLOCKER #5 — composer input is now cream-on-ink
            // (transparent over the parent ink composer plate) to match the
            // web .composerInput restyle. Background opacity dropped to 0
            // so the input shares the plate surface (single-layer per
            // prototype line 486-501).
            .lineLimit(1...3)
            .font(.posterMono(size: PosterTokens.FontSize.body))
            .foregroundColor(PosterTokens.Color.cream)
            .tint(PosterTokens.Color.yellow)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.clear)
            .submitLabel(.send)
            .onSubmit {
                if canSend { Task { await model.send(model.input) } }
            }
            .disabled(model.isStreaming)

            PosterButton(
                "↵ ОТПРАВИТЬ",
                variant: .primary,
                disabled: !canSend
            ) {
                Task { await model.send(model.input) }
            }
            .frame(maxWidth: 160)
        }
    }
}

// MARK: - Typing dot

private struct TypingDot: View {
    let delay: Double
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        Circle()
            .fill(PosterTokens.Color.ink.opacity(on ? 0.85 : 0.25))
            .frame(width: 6, height: 6)
            .onAppear {
                guard !reduce else { return }
                withAnimation(PosterAnimations.posterDot.delay(delay)) {
                    on.toggle()
                }
            }
    }
}

#Preview("AiV10View — initial") {
    AiV10View()
}
