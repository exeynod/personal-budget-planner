import SwiftUI

struct AuroraBackground: View {
    var body: some View {
        ZStack {
            Tokens.Background.cream

            // Лёгкие aurora-blobs над cream (как `AuroraBg` в web)
            Circle()
                .fill(Color(hex: 0xFFB07A).opacity(0.25))
                .blur(radius: 80)
                .frame(width: 320, height: 320)
                .offset(x: -100, y: -200)

            Circle()
                .fill(Color(hex: 0xF39A4C).opacity(0.18))
                .blur(radius: 100)
                .frame(width: 280, height: 280)
                .offset(x: 130, y: 240)
        }
        .ignoresSafeArea()
    }
}

struct MeshDarkBackground: View {
    var body: some View {
        ZStack {
            Color.black

            if #available(iOS 18.0, *) {
                MeshGradient(
                    width: 3, height: 3,
                    points: [
                        [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
                        [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
                        [0.0, 1.0], [0.5, 1.0], [1.0, 1.0]
                    ],
                    colors: [
                        Color(hex: 0x1A0F2E), Color(hex: 0x0D1B3D), Color(hex: 0x2E0F2E),
                        Color(hex: 0x3D1B5C), Color(hex: 0x000000), Color(hex: 0x5C1B3D),
                        Color(hex: 0x0D0D2E), Color(hex: 0x1A0F2E), Color(hex: 0x2E1A1A)
                    ]
                )
                .opacity(0.85)
                .ignoresSafeArea()
            } else {
                LinearGradient(
                    colors: [
                        Color(hex: 0x1A0F2E),
                        Color(hex: 0x000000),
                        Color(hex: 0x2E0F2E)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            }
        }
        .ignoresSafeArea()
    }
}

struct AdaptiveBackground: View {
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        Group {
            if colorScheme == .dark {
                MeshDarkBackground()
            } else {
                AuroraBackground()
            }
        }
    }
}
