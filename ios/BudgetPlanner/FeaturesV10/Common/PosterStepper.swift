// PosterStepper.swift — Phase 71 P3-STEPPER.
//
// The native SwiftUI `Stepper(...).labelsHidden()` renders Apple's default
// light-gray −/+ capsule, which is borderline illegible on the cream MP
// Settings background. This is a poster-styled replacement: two square ink
// buttons («−» / «+») with a high-contrast stroke + ink glyphs, matching the
// rest of the MP control palette. The value display stays in the parent row
// (Archivo Black), so this control owns only the two stepper buttons.
//
// Behaviour mirrors the native stepper: clamps to `range`, disables (and dims)
// the button at each bound. Each tap fires `onChange(newValue)` once.

import SwiftUI

struct PosterStepper: View {
    /// Current value (the parent owns the source of truth; this reflects it).
    let value: Int
    /// Inclusive allowed range; buttons disable at the bounds.
    let range: ClosedRange<Int>
    /// Fired with the clamped new value on each − / + tap.
    let onChange: (Int) -> Void

    private var canDecrement: Bool { value > range.lowerBound }
    private var canIncrement: Bool { value < range.upperBound }

    var body: some View {
        HStack(spacing: 8) {
            button(symbol: "−", enabled: canDecrement) {
                let next = max(range.lowerBound, value - 1)
                if next != value { onChange(next) }
            }
            .accessibilityLabel("Уменьшить")
            button(symbol: "+", enabled: canIncrement) {
                let next = min(range.upperBound, value + 1)
                if next != value { onChange(next) }
            }
            .accessibilityLabel("Увеличить")
        }
    }

    private func button(symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(symbol)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 20))
                .foregroundColor(PosterTokens.Color.ink)
                .frame(width: 40, height: 36)
                .overlay(
                    Rectangle()
                        .stroke(PosterTokens.Color.ink, lineWidth: 1.5)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(enabled ? 1.0 : 0.3)
        .disabled(!enabled)
    }
}

#if DEBUG
#Preview("PosterStepper") {
    VStack(spacing: 24) {
        PosterStepper(value: 1, range: 1...28, onChange: { _ in })
        PosterStepper(value: 15, range: 1...28, onChange: { _ in })
        PosterStepper(value: 28, range: 1...28, onChange: { _ in })
    }
    .padding()
    .background(PosterTokens.Color.paper)
}
#endif
