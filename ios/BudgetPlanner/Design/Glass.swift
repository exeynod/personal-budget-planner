import SwiftUI

/// Тонкая обёртка над iOS 26 native Liquid Glass API. Используется только
/// на nav chrome (TabBar, Toolbar, Sheet headers) и floating actions.
/// На контент карточек/строк glass НЕ применяется — используем native
/// List/Form section backgrounds.
///
/// Deployment target = iOS 26.0, поэтому `glassEffect`/`.buttonStyle(.glass)`
/// доступны нативно. `#available`-гейты добавлены как безопасный фолбэк
/// (`.ultraThinMaterial`) на случай понижения target в будущем — см.
/// `.planning/ux-redesign/LIQUID-GLASS-RESEARCH-2026-06-07.md` §B.
extension View {
    /// Default Liquid Glass effect внутри `.continuous` rounded rect.
    @ViewBuilder
    func appGlass(radius: CGFloat = Tokens.Radius.regular) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(.regular, in: .rect(cornerRadius: radius, style: .continuous))
        } else {
            background(
                .ultraThinMaterial,
                in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
    }

    /// Glass с capsule shape — подходит для pills, floating actions.
    @ViewBuilder
    func appGlassCapsule() -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(.regular, in: .capsule)
        } else {
            background(.ultraThinMaterial, in: Capsule())
        }
    }

    /// Tinted prominent glass — accent surface для primary CTAs.
    @ViewBuilder
    func appGlassProminent(radius: CGFloat = Tokens.Radius.regular) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(
                .regular.tint(Tokens.Accent.primary),
                in: .rect(cornerRadius: radius, style: .continuous))
        } else {
            background(
                Tokens.Accent.primary.opacity(0.18),
                in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
    }
}

extension Button {
    /// Круглая стеклянная кнопка для floating actions (FAB-like).
    /// `prominent == true` → accent-tinted `.glassProminent`; круглые primary
    /// держим на нём аккуратно, остальное — нейтральный `.glass`.
    /// Фолбэк до iOS 26 — `.borderedProminent`/`.bordered` в круге.
    @ViewBuilder
    func appGlassCircle(prominent: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            if prominent {
                buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                    .tint(Tokens.Accent.primary)
            } else {
                buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
            }
        } else {
            buttonStyle(prominent ? AnyButtonStyle(.borderedProminent) : AnyButtonStyle(.bordered))
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .tint(Tokens.Accent.primary)
        }
    }
}

/// Type-erased button style для ветви фолбэка (`prominent ? A : B`), где обе
/// ветви должны иметь одинаковый тип.
private struct AnyButtonStyle: PrimitiveButtonStyle {
    private let _make: (Configuration) -> AnyView

    init<S: PrimitiveButtonStyle>(_ style: S) {
        _make = { config in AnyView(style.makeBody(configuration: config)) }
    }

    func makeBody(configuration: Configuration) -> some View {
        _make(configuration)
    }
}
