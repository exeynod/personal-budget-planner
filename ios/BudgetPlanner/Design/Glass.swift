import SwiftUI

/// Тонкая обёртка над iOS 26 native Liquid Glass API. Используется только
/// на nav chrome (TabBar, Toolbar, Sheet headers) и floating actions.
/// На контент карточек/строк glass НЕ применяется — используем native
/// List/Form section backgrounds.
extension View {
    /// Default Liquid Glass effect внутри `.continuous` rounded rect.
    func appGlass(radius: CGFloat = Tokens.Radius.regular) -> some View {
        glassEffect(.regular, in: .rect(cornerRadius: radius, style: .continuous))
    }

    /// Glass с capsule shape — подходит для pills, floating actions.
    func appGlassCapsule() -> some View {
        glassEffect(.regular, in: .capsule)
    }

    /// Tinted prominent glass — accent surface для primary CTAs.
    func appGlassProminent(radius: CGFloat = Tokens.Radius.regular) -> some View {
        glassEffect(.regular.tint(Tokens.Accent.primary), in: .rect(cornerRadius: radius, style: .continuous))
    }
}
