// Toast.swift — fly-in success toast with stroke-drawn checkmark + auto-dismiss.
// Symmetric to web <Toast> (frontend/src/componentsV10/Toast.tsx).
// DS-06 iOS.

import SwiftUI

/// Fly-in toast with overshoot, ✓ checkmark stroke draw (PosterAnimations.posterCheck), 1700ms life.
struct Toast: View {
    let message: String
    @Binding var visible: Bool
    var duration: TimeInterval = 1.7

    @State private var checkProgress: CGFloat = 0

    var body: some View {
        ZStack {
            if visible {
                HStack(spacing: 8) {
                    // Stroke-drawn checkmark — DESIGN-SYSTEM §7.2 posterCheck
                    CheckPath(progress: checkProgress)
                        .stroke(PosterTokens.Color.ink,
                                style: StrokeStyle(lineWidth: 2.5, lineCap: .square))
                        .frame(width: 14, height: 14)
                    Text(message.uppercased())
                        .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11).weight(.bold))
                        .tracking(2)
                        .foregroundColor(PosterTokens.Color.ink)
                }
                .padding(.horizontal, PosterTokens.Space.s14)
                .padding(.vertical, PosterTokens.Space.s10)
                .background(PosterTokens.Color.yellow)
                .shadow(color: .black.opacity(0.25), radius: 20, x: 0, y: 6)
                .posterTransition(.scale(scale: 0.9).combined(with: .opacity))
                .onAppear {
                    // Fire posterCheck stroke draw
                    checkProgress = 0
                    withAnimation(PosterAnimations.posterCheck) { checkProgress = 1 }
                    // Auto-dismiss after duration
                    DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
                        visible = false
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 64)
        .posterAnimation(PosterAnimations.posterToastIn, value: visible)
    }
}

/// 24×24 viewBox checkmark drawn proportionally; `progress` controls stroke length.
private struct CheckPath: Shape {
    var progress: CGFloat                                  // 0 → 1

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        // Two-segment polyline: (4,12) → (10,18) → (20,6) on 24×24 viewBox
        let p1 = CGPoint(x: rect.minX + rect.width * (4.0  / 24), y: rect.minY + rect.height * (12.0 / 24))
        let p2 = CGPoint(x: rect.minX + rect.width * (10.0 / 24), y: rect.minY + rect.height * (18.0 / 24))
        let p3 = CGPoint(x: rect.minX + rect.width * (20.0 / 24), y: rect.minY + rect.height * ( 6.0 / 24))

        let l1 = hypot(p2.x - p1.x, p2.y - p1.y)
        let l2 = hypot(p3.x - p2.x, p3.y - p2.y)
        let total = l1 + l2
        let drawLen = total * progress

        var p = Path()
        p.move(to: p1)
        if drawLen <= l1 {
            let t = drawLen / l1
            p.addLine(to: CGPoint(x: p1.x + (p2.x - p1.x) * t,
                                  y: p1.y + (p2.y - p1.y) * t))
        } else {
            p.addLine(to: p2)
            let remain = drawLen - l1
            let t = min(1, remain / l2)
            p.addLine(to: CGPoint(x: p2.x + (p3.x - p2.x) * t,
                                  y: p2.y + (p3.y - p2.y) * t))
        }
        return p
    }
}

#Preview("Toast") {
    struct Demo: View {
        @State private var visible: Bool = true
        var body: some View {
            VStack {
                Toast(message: "Saved", visible: $visible)
                Spacer()
                Button("Toggle") { visible.toggle() }
            }
            .background(PosterTokens.Color.ink)
        }
    }
    return Demo()
}
