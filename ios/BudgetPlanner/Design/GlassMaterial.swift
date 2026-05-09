import SwiftUI
import UIKit

/// Custom liquid-glass effect через UIVisualEffectView с настраиваемым blur intensity
/// и saturation. На web эквивалент `backdrop-filter: blur(22px) saturate(175%)`.
struct LiquidGlass: UIViewRepresentable {
    var style: UIBlurEffect.Style = .systemUltraThinMaterial
    var saturation: CGFloat = 1.75

    func makeUIView(context: Context) -> UIVisualEffectView {
        let blurEffect = UIBlurEffect(style: style)
        let view = UIVisualEffectView(effect: blurEffect)
        view.contentView.isUserInteractionEnabled = false

        // Saturation booster через CALayer filter — повышает насыщенность
        // того что просвечивает через blur, как `saturate(175%)` в CSS.
        if let backdropLayer = view.layer.sublayers?.first {
            backdropLayer.setValue(saturation, forKeyPath: "filters.colorSaturate.inputAmount")
        }

        return view
    }

    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {
        uiView.effect = UIBlurEffect(style: style)
    }
}

/// Liquid-glass card modifier — реальный backdrop blur + multi-layer
/// highlights/borders как в web HeroCard.module.css.
struct LiquidGlassCard: ViewModifier {
    var radius: CGFloat = 28
    var blurStyle: UIBlurEffect.Style = .systemUltraThinMaterial
    var tintGradient: LinearGradient = LinearGradient(
        colors: [Color.white.opacity(0.42), Color(hex: 0xFFF5E8, alpha: 0.30)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    LiquidGlass(style: blurStyle)
                    tintGradient
                    LinearGradient(
                        colors: [Color.white.opacity(0.55), Color.white.opacity(0)],
                        startPoint: .top, endPoint: .center
                    )
                    .blendMode(.plusLighter)
                    .opacity(0.6)
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.85), lineWidth: 0.5)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .inset(by: 1)
                    .strokeBorder(Color.white.opacity(0.45), lineWidth: 0.5)
            )
            .shadow(color: Color(red: 0.24, green: 0.12, blue: 0.04, opacity: 0.10),
                    radius: 30, x: 0, y: 8)
            .shadow(color: Color(red: 0.24, green: 0.12, blue: 0.04, opacity: 0.06),
                    radius: 2, x: 0, y: 1)
    }
}

extension View {
    func liquidGlass(
        radius: CGFloat = 28,
        blur: UIBlurEffect.Style = .systemUltraThinMaterial,
        tint: LinearGradient? = nil
    ) -> some View {
        modifier(LiquidGlassCard(
            radius: radius,
            blurStyle: blur,
            tintGradient: tint ?? LinearGradient(
                colors: [Color.white.opacity(0.42), Color(hex: 0xFFF5E8, alpha: 0.30)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        ))
    }
}

/// Лёгкая liquid-glass pill (для sub-tabs, metrics).
struct LiquidGlassPill: ViewModifier {
    var radius: CGFloat = 16
    var accent: Bool = false

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    LiquidGlass(style: .systemThinMaterial)
                    if accent {
                        LinearGradient(
                            colors: [
                                Tokens.Accent.primary.opacity(0.28),
                                Tokens.Accent.primary.opacity(0.10)
                            ],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    } else {
                        Color.white.opacity(0.32)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(
                        accent
                        ? Tokens.Accent.primary.opacity(0.40)
                        : Color.white.opacity(0.7),
                        lineWidth: 0.5
                    )
            )
    }
}

extension View {
    func liquidGlassPill(radius: CGFloat = 16, accent: Bool = false) -> some View {
        modifier(LiquidGlassPill(radius: radius, accent: accent))
    }
}

// Legacy alias — старый glassCard теперь == liquidGlass
extension View {
    func glassCard(
        radius: CGFloat = Tokens.Radius.xl,
        material: Material = .ultraThinMaterial
    ) -> some View {
        liquidGlass(radius: radius)
    }
}
