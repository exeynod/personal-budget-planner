// Phase 25-11 Task 2: 3×4 numeric keypad for the AddSheet (ADD-V10-02).
//
// Symmetric to web Plan 25-10 Keypad.tsx — same 3×4 layout (1..9, ., 0, ⌫),
// same closures (onAppendDigit/onAppendDot/onBackspace) so the parent
// ViewModel logic is identical across surfaces.
//
// Visual: paper-coloured key cells on the black AddSheet background, ink
// glyphs (Manrope 24pt). The accent flag on the ⌫ key uses a translucent
// paper background so it reads as a soft destructive cue without breaking
// the monochrome grid.

import SwiftUI

/// 3×4 numeric keypad. Caller binds three closures; KeypadView owns no
/// state of its own (amount-string mutation lives in AddSheetData).
struct KeypadView: View {
    let onAppendDigit: (String) -> Void
    let onAppendDot: () -> Void
    let onBackspace: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            KeypadRow(items: ["1", "2", "3"], onTap: onAppendDigit)
            KeypadRow(items: ["4", "5", "6"], onTap: onAppendDigit)
            KeypadRow(items: ["7", "8", "9"], onTap: onAppendDigit)
            HStack(spacing: 8) {
                KeyButton(label: ".", action: onAppendDot)
                KeyButton(label: "0", action: { onAppendDigit("0") })
                KeyButton(label: "⌫", action: onBackspace, accent: true)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// One row of three digit keys.
private struct KeypadRow: View {
    let items: [String]
    let onTap: (String) -> Void
    var body: some View {
        HStack(spacing: 8) {
            ForEach(items, id: \.self) { d in
                KeyButton(label: d, action: { onTap(d) })
            }
        }
    }
}

/// Single keypad cell. `accent=true` flips background to translucent paper
/// (used for the ⌫ destructive key).
private struct KeyButton: View {
    let label: String
    let action: () -> Void
    var accent: Bool = false
    @State private var pressed: Bool = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.custom(PosterTokens.Font.manrope, size: 24))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(accent
                            ? PosterTokens.Color.paper.opacity(0.18)
                            : PosterTokens.Color.paper)
                .foregroundColor(accent
                                 ? PosterTokens.Color.paper
                                 : PosterTokens.Color.ink)
        }
        .buttonStyle(.plain)
        .scaleEffect(pressed ? 0.95 : 1.0)
        .animation(.easeOut(duration: 0.08), value: pressed)
        .pressEvents(onPress: { pressed = true }, onRelease: { pressed = false })
    }
}

// Press-feedback helper — minimal replacement for the missing built-in.
// Uses simultaneousGesture so the underlying Button still fires its action.
private extension View {
    func pressEvents(onPress: @escaping () -> Void,
                     onRelease: @escaping () -> Void) -> some View {
        simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in onPress() }
                .onEnded { _ in onRelease() }
        )
    }
}

#Preview("KeypadView") {
    ZStack {
        PosterTokens.Color.black.ignoresSafeArea()
        KeypadView(
            onAppendDigit: { d in print("digit \(d)") },
            onAppendDot: { print("dot") },
            onBackspace: { print("⌫") }
        )
        .padding()
    }
}
