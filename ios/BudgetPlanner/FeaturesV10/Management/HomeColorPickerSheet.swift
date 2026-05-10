// Phase 30-07 (DEBT-08): iOS HomeColorPickerSheet — Settings → row «Цвет Home»
// posterSheet picker.
//
// Symmetric to web `frontend/src/screensV10/Management/HomeColorPickerSheet.tsx`:
//   - 2×2 LazyVGrid of 4 swatches (coral / cobalt / black / cream).
//   - Selected swatch gets a paper-colored 2pt border for cross-color
//     legibility (works against any of the four swatch fills).
//   - Tap on swatch → updates @AppStorage value AND dismisses sheet.
//
// Used inside `.posterSheet(isPresented:content:)` modifier — see
// SettingsV10View.swift integration. Sheet body has a paper background
// because PosterSheet's default backdrop renders on top of the host view
// (sheet content sits on `.paper`).
//
// User-request 2026-05-11.

import SwiftUI

struct HomeColorPickerSheet: View {
    @Binding var selection: HomeColor
    @Binding var isPresented: Bool

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            Eyebrow("ЦВЕТ HOME", opacity: 0.6, color: PosterTokens.Color.ink)
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(HomeColor.allCases) { color in
                    Button {
                        selection = color
                        isPresented = false
                    } label: {
                        swatchLabel(for: color)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.vertical, PosterTokens.Space.s28)
    }

    @ViewBuilder
    private func swatchLabel(for color: HomeColor) -> some View {
        ZStack(alignment: .bottomLeading) {
            color.swiftColor
                .frame(height: 86)
            Text(color.ruLabel)
                .font(.posterMono(size: 11, weight: .semibold))
                .tracking(0.14 * 11)
                .foregroundColor(PosterTokens.Color.paper)
                .padding(10)
                .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
        }
        .overlay(
            Rectangle()
                .stroke(
                    selection == color
                        ? PosterTokens.Color.paper
                        : Color.clear,
                    lineWidth: 2
                )
        )
    }
}
