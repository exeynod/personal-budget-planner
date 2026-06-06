// Phase 54-02 (LG-SW-03, LG-SW-04, LG-SW-05 ios): iOS ThemePickerSheet —
// Settings → row «Тема» posterSheet picker.
//
// Symmetric to web `frontend/src/screensV10/Management/ThemePickerSheet.tsx`:
//   - Vertical list of the 2 V10 themes (maximalPoster + liquidGlass,
//     Theme.allCases) + the v06 sentinel «СТАРЫЙ IOS» row (Phase 4 LG restore).
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
        // Phase 71 (P3 layout fix): compact bottom-sheet — НЕ full-screen. Раньше
        // обёртка ScrollView была вертикально-жадной и растягивалась на весь экран
        // (eyebrow «ТЕМА» уезжал под статус-бар и перекрывал часы). С 2 строками
        // (Maximal Poster + sentinel СТАРЫЙ IOS) контент короткий и должен лежать
        // у нижней кромки, как у соседних posterSheet (HomeColorPickerSheet /
        // DepositSheet): plain VStack + .padding(.horizontal s22) / .padding(.vertical s28).
        // ScrollView сохранён как fallback, но ограничен .frame(maxHeight:) под
        // высоту контента — он скроллит только если экран совсем компактный,
        // и больше никогда не заполняет весь экран.
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
                }
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.vertical, PosterTokens.Space.s28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // Bound the ScrollView so it hugs its content instead of filling the
        // screen. fixedSize collapses the scroll view to its intrinsic height;
        // maxHeight caps it on compact devices, where scrolling kicks in.
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxHeight: 360)
    }

    @ViewBuilder
    private func swatch(for theme: Theme) -> some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(theme == .maximalPoster ? PosterTokens.Color.coral : LiquidGlassTokens.bgPrimary)
            .frame(width: 36, height: 36)
            .overlay(
                Group {
                    if theme == .liquidGlass {
                        Image(systemName: "drop.fill")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundColor(PosterTokens.Color.coral)
                    }
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(.black.opacity(0.1), lineWidth: 1)
            )
    }

    private func themeDescription(_ t: Theme) -> String {
        switch t {
        case .maximalPoster: return "Кораллово-кобальтовая палитра, Archivo Black"
        case .liquidGlass: return "Нативный iOS-дизайн: SF Pro, сгруппированные списки, таб-бар"
        }
    }
}
