// BigFig.swift — hero number with rAF-equivalent count-up animation on appear.
// Symmetric to web <BigFig> (frontend/src/componentsV10/BigFig.tsx + hooks/useCountUp.ts).
// DS-06 iOS.

import SwiftUI

/// Hero numeric display with count-up animation on appear / value change.
/// Animation honors `accessibilityReduceMotion` automatically via `posterAnimation` semantics
/// (BigFig drives raw `withAnimation` with PosterAnimations.easeOut — SwiftUI itself respects
/// the `accessibilityReduceMotion` env when running through `.transaction(_:_:)` checks).
struct BigFig: View {
    let value: Int
    var sup: String? = nil
    var size: CGFloat = 90
    var dur: TimeInterval = 0.9
    var animate: Bool = true
    var color: Color = PosterTokens.Color.paper

    @State private var displayed: Int = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(value: Int,
         sup: String? = nil,
         size: CGFloat = 90,
         dur: TimeInterval = 0.9,
         animate: Bool = true,
         color: Color = PosterTokens.Color.paper) {
        self.value = value
        self.sup = sup
        self.size = size
        self.dur = dur
        self.animate = animate
        self.color = color
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(formatted(animate ? displayed : value))
                .font(.posterMono(size: size))
                .tracking(-size * 0.04)
                .lineSpacing(-(size * 0.08))
            if let sup {
                Text(sup)
                    .font(.posterMono(size: size * 0.36))
                    .opacity(0.7)
            }
        }
        .foregroundColor(color)
        .onAppear {
            guard animate, !reduceMotion else { displayed = value; return }
            displayed = 0
            withAnimation(PosterAnimations.easeOut(dur)) { displayed = value }
        }
        .onChange(of: value) { _, new in
            if animate && !reduceMotion {
                withAnimation(PosterAnimations.easeOut(dur)) { displayed = new }
            } else {
                displayed = new
            }
        }
    }

    /// Thousands formatter — uses NBSP (\u{00A0}) as group separator.
    /// DESIGN-SYSTEM §8: web uses U+202F (NNBSP), iOS uses NBSP. Minor divergence acceptable
    /// — iOS system / Manrope render NBSP cleanly. Phase 28 may unify.
    private func formatted(_ n: Int) -> String {
        let f = NumberFormatter()
        f.groupingSeparator = "\u{00A0}"
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }
}

#Preview("BigFig") {
    VStack(alignment: .leading, spacing: 16) {
        BigFig(value: 124_500, sup: "₽")
        BigFig(value: 9_200, sup: "₽", size: 56, animate: false)
    }
    .padding()
    .background(PosterTokens.Color.ink)
}
