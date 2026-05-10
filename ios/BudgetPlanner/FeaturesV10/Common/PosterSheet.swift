// PosterSheet.swift — Custom slide-up sheet for V10 shell (DS-07 / ADR-002 + CONTEXT Area 3).
// Replaces system .sheet because sheetEase is not customizable on system sheet.
// Backdrop opacity 0.45 + tap-to-dismiss + drag-to-close
// (translation.height > 100pt OR velocityY > 800 per CONTEXT Area 3).

import SwiftUI

/// Slide-up sheet with cubic-bezier(0.32, 0.72, 0, 1) `sheetEase` + backdrop 0.45.
/// Tap-to-dismiss on backdrop; drag-to-close on the sheet content.
struct PosterSheet<SheetBody: View>: ViewModifier {
    @Binding var isPresented: Bool
    @ViewBuilder let sheetContent: () -> SheetBody

    @State private var dragOffset: CGFloat = 0
    @GestureState private var isDragging: Bool = false

    func body(content: Content) -> some View {
        ZStack {
            content
            if isPresented {
                // Backdrop
                Color.black
                    .opacity(0.45)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(PosterAnimations.sheetEase(0.35)) { isPresented = false }
                    }
                    .posterTransition(.opacity)
                    .zIndex(10)

                // Sheet body, anchored to bottom, supports drag-to-close.
                GeometryReader { geo in
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)
                        sheetContent()
                            .frame(maxWidth: .infinity)
                            .background(PosterTokens.Color.paper)
                            .offset(y: dragOffset)
                            .gesture(
                                DragGesture()
                                    .updating($isDragging) { _, state, _ in state = true }
                                    .onChanged { v in
                                        // only allow downward drag
                                        dragOffset = max(0, v.translation.height)
                                    }
                                    .onEnded { v in
                                        // CONTEXT Area 3: close if translation > 100 OR velocity > 800
                                        let velocityY = v.predictedEndTranslation.height - v.translation.height
                                        if v.translation.height > 100 || velocityY > 800 {
                                            withAnimation(PosterAnimations.sheetEase(0.35)) {
                                                isPresented = false
                                                dragOffset = 0
                                            }
                                        } else {
                                            withAnimation(PosterAnimations.sheetEase(0.25)) {
                                                dragOffset = 0
                                            }
                                        }
                                    }
                            )
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                }
                .posterTransition(.move(edge: .bottom))
                .zIndex(20)
            }
        }
        .posterAnimation(PosterAnimations.sheetEase(0.35), value: isPresented)
    }
}

extension View {
    /// Present a custom poster-styled bottom sheet.
    /// Drag-to-close: translation.height > 100pt OR velocityY > 800 (CONTEXT Area 3).
    func posterSheet<Content: View>(
        isPresented: Binding<Bool>,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        modifier(PosterSheet(isPresented: isPresented, sheetContent: content))
    }
}
