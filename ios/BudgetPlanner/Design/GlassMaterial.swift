import SwiftUI

struct GlassCard: ViewModifier {
    var radius: CGFloat = Tokens.Radius.xl
    var material: Material = .ultraThinMaterial

    func body(content: Content) -> some View {
        content
            .background(material, in: RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(Color.white.opacity(0.18), lineWidth: 0.5)
            )
            .shadow(color: .black.opacity(0.08), radius: 14, x: 0, y: 6)
    }
}

extension View {
    func glassCard(
        radius: CGFloat = Tokens.Radius.xl,
        material: Material = .ultraThinMaterial
    ) -> some View {
        modifier(GlassCard(radius: radius, material: material))
    }
}
