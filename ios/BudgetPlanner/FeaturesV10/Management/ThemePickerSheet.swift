// Phase 54-02 (LG-SW-03, LG-SW-04, LG-SW-05 ios): iOS ThemePickerSheet —
// Settings → row «Тема» posterSheet picker.
//
// Symmetric to web `frontend/src/screensV10/Management/ThemePickerSheet.tsx`:
//   - Vertical list of 2 options: maximalPoster (Theme.allCases) + the v06
//     sentinel «СТАРЫЙ IOS» row (Phase 71).
//   - Each row: colour swatch (36×36 rounded) + label + description + ✓ marker
//     на текущем.
//   - Tap on row → updates @AppStorage("ui.theme") value AND dismisses sheet.
//
// Instant apply: SwiftUI @AppStorage binding automatically propagates через
// все View, observing this key — no manual notification posting (LG-SW-05).
//
// Used inside `.posterSheet(isPresented:content:)` modifier — see
// SettingsV10View.swift integration.
//
// User-request 2026-05-11.

import SwiftUI

struct ThemePickerSheet: View {
    @AppStorage("ui.theme") private var themeRaw: String = Theme.maximalPoster.rawValue
    @Binding var isPresented: Bool

    private let themes: [Theme] = Theme.allCases

    var body: some View {
        // Phase 56 (v06 Native Rebuild — Foundation): обёртка в ScrollView, чтобы
        // опция СТАРЫЙ IOS не отсекалась таб-баром на компактных экранах. Sheet
        // всё равно фиксированной высоты, но контент скроллится.
        ScrollView {
            VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
                Eyebrow("ТЕМА", opacity: 0.6, color: PosterTokens.Color.ink)
                VStack(spacing: 0) {
                    ForEach(Array(themes.enumerated()), id: \.element) { index, theme in
                        Button {
                            themeRaw = theme.rawValue
                            isPresented = false
                        } label: {
                            HStack(spacing: 14) {
                                swatch(for: theme)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(theme.ruLabel)
                                        .font(.custom(PosterTokens.Font.jetBrainsMono, size: 12).weight(.semibold))
                                        .kerning(12 * 0.14)
                                        .foregroundColor(PosterTokens.Color.ink)
                                    Text(themeDescription(theme))
                                        .font(.custom(PosterTokens.Font.manrope, size: 12))
                                        .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
                                        .multilineTextAlignment(.leading)
                                }
                                Spacer()
                                if theme.rawValue == themeRaw {
                                    Text("✓")
                                        .font(.custom(PosterTokens.Font.archivoBlack, size: 18))
                                        .foregroundColor(PosterTokens.Color.coral)
                                }
                            }
                            .padding(.vertical, 14)
                            .padding(.horizontal, 4)
                            .contentShape(Rectangle())
                            .overlay(
                                Rectangle()
                                    .frame(height: 1)
                                    .foregroundColor(.black.opacity(0.08))
                                    .opacity(index == 0 ? 0 : 1),
                                alignment: .top
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("theme-\(theme.rawValue)")
                    }

                    // Phase 56 (v06 Native Rebuild — Foundation): legacy v06 shell.
                    // Special row: переключает на нативный iOS MainShell. `"v06"` —
                    // sentinel, не входит в Theme.allCases.
                    Button {
                        themeRaw = legacyV06Value
                        isPresented = false
                    } label: {
                        HStack(spacing: 14) {
                            legacySwatch
                            VStack(alignment: .leading, spacing: 2) {
                                Text("СТАРЫЙ IOS")
                                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 12).weight(.semibold))
                                    .kerning(12 * 0.14)
                                    .foregroundColor(PosterTokens.Color.ink)
                                Text("Нативный SwiftUI: Form, TabView, system colors")
                                    .font(.custom(PosterTokens.Font.manrope, size: 12))
                                    .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer()
                            if themeRaw == legacyV06Value {
                                Text("✓")
                                    .font(.custom(PosterTokens.Font.archivoBlack, size: 18))
                                    .foregroundColor(PosterTokens.Color.coral)
                            }
                        }
                        .padding(.vertical, 14)
                        .padding(.horizontal, 4)
                        .contentShape(Rectangle())
                        .overlay(
                            Rectangle()
                                .frame(height: 1)
                                .foregroundColor(.black.opacity(0.08)),
                            alignment: .top
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("theme-v06")
                }
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.vertical, PosterTokens.Space.s28)
        }
    }

    private var legacyV06Value: String { "v06" }

    private var legacySwatch: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(Color(.systemGroupedBackground))
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: "house.fill")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(PosterTokens.Color.coral)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(.black.opacity(0.1), lineWidth: 1)
            )
    }

    @ViewBuilder
    private func swatch(for theme: Theme) -> some View {
        let color: Color = {
            switch theme {
            case .maximalPoster: return PosterTokens.Color.coral
            }
        }()
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(color)
            .frame(width: 36, height: 36)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(.black.opacity(0.1), lineWidth: 1)
            )
    }

    private func themeDescription(_ t: Theme) -> String {
        switch t {
        case .maximalPoster: return "Кораллово-кобальтовая палитра, Archivo Black"
        }
    }
}
