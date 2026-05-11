import SwiftUI

/// Translucent surface для Liquid Glass theme.
/// iOS 26+: uses native `.glassEffect()` API (Apple HIG iOS 26).
/// iOS < 26: fallback `.background(.ultraThinMaterial)` (iOS 15+ Material).
struct GlassCard<Content: View>: View {
    enum MaterialLevel {
        case ultraThin
        case thin
        case regular
        case thick

        var swiftUIMaterial: Material {
            switch self {
            case .ultraThin: return .ultraThinMaterial
            case .thin: return .thinMaterial
            case .regular: return .regularMaterial
            case .thick: return .thickMaterial
            }
        }
    }

    enum Elevation {
        case flat
        case elevated
        case floating
        case floatingStrong

        var shadowRadius: CGFloat {
            switch self {
            case .flat: return 0
            case .elevated: return 8
            case .floating: return 24
            case .floatingStrong: return 48
            }
        }

        var shadowOpacity: Double {
            switch self {
            case .flat: return 0
            case .elevated: return 0.08
            case .floating: return 0.12
            case .floatingStrong: return 0.18
            }
        }

        var shadowY: CGFloat {
            switch self {
            case .flat: return 0
            case .elevated: return 2
            case .floating: return 8
            case .floatingStrong: return 16
            }
        }
    }

    let material: MaterialLevel
    let elevation: Elevation
    let radius: CGFloat
    let innerBorder: Bool
    let onTap: (() -> Void)?
    @ViewBuilder let content: () -> Content

    init(
        material: MaterialLevel = .regular,
        elevation: Elevation = .elevated,
        radius: CGFloat = LiquidGlassTokens.Radius.card,
        innerBorder: Bool = true,
        onTap: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.material = material
        self.elevation = elevation
        self.radius = radius
        self.innerBorder = innerBorder
        self.onTap = onTap
        self.content = content
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let card = content()
            .background(material.swiftUIMaterial, in: shape)
            .overlay(
                shape
                    .strokeBorder(
                        innerBorder
                            ? LinearGradient(
                                colors: [Color.white.opacity(0.2), Color.white.opacity(0.05)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            : LinearGradient(colors: [.clear], startPoint: .top, endPoint: .bottom),
                        lineWidth: innerBorder ? 0.5 : 0
                    )
            )
            .clipShape(shape)
            .shadow(
                color: .black.opacity(elevation.shadowOpacity),
                radius: elevation.shadowRadius,
                x: 0,
                y: elevation.shadowY
            )

        if let onTap {
            Button(action: onTap) {
                card
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
        } else {
            card
        }
    }
}

#if DEBUG
struct GlassCard_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                GlassCard {
                    Text("Ultra thin")
                        .padding(24)
                        .frame(maxWidth: .infinity)
                }
                GlassCard(material: .thick, elevation: .floating) {
                    Text("Thick + floating")
                        .padding(24)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding()
        }
    }
}
#endif
