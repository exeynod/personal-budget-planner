// PosterStatusBar.swift — Phase 71 P3-STATUSBAR (re-fix).
//
// PROBLEM
// The MP shell (`V10MainShell`) forces `.preferredColorScheme(.dark)` so the
// window status-bar time / icons render as LIGHT content — correct on the dark
// MP screens (Home, Копилка, Доступ, …) but barely legible on the cream / light
// screens (Настройки, Аналитика, AI, Счета).
//
// WHY THE PREVIOUS FIX (`.preferredColorScheme(.light)`) DID NOT WORK
// The status bar is owned by the WINDOW's root view controller. With
// `UIViewControllerBasedStatusBarAppearance` = YES (the iOS default), UIKit asks
// `window.rootViewController.preferredStatusBarStyle` (after walking
// `childForStatusBarStyle`). In a pure-SwiftUI `WindowGroup`, that root is an
// internal `UIHostingController` whose `preferredStatusBarStyle` is derived from
// the *root* view's resolved color scheme — which the shell pins to `.dark`.
//
// A per-screen `.preferredColorScheme(.light)` only mutates the SwiftUI
// environment of that screen's subtree. The MP shell renders screens through a
// custom `PosterRouter` that wraps each screen in `AnyView` (no `NavigationStack`
// / no UIKit VC boundary), so that environment value never propagates UP to the
// window's root hosting controller. The root keeps resolving `.dark` → light
// status-bar content → invisible on cream. Hence the no-op.
//
// HOW THIS FIX REACHES THE WINDOW STATUS BAR
// We intercept `preferredStatusBarStyle` on the *actual* window-root hosting
// controller via a one-time method swizzle. The swizzled getter returns the
// style stored in `StatusBarStyleController` instead of the scheme-derived
// default. Because we override the very method UIKit queries on the root VC,
// the change renders regardless of how deep the SwiftUI view tree / custom
// router sits. Screens call `.posterStatusBar(.darkContent)` (cream) or
// `.posterStatusBar(.lightContent)` (dark) on appear; the modifier updates the
// controller and calls `setNeedsStatusBarAppearanceUpdate()` on the root VC so
// UIKit re-queries our swizzled getter immediately.

import SwiftUI
import UIKit

// MARK: - Style controller

/// Single source of truth for the rendered window status-bar style.
///
/// Not `@Observable`: the value is consumed by UIKit (`preferredStatusBarStyle`),
/// not by SwiftUI, so we drive updates imperatively via
/// `setNeedsStatusBarAppearanceUpdate()` rather than view invalidation.
@MainActor
final class StatusBarStyleController {
    static let shared = StatusBarStyleController()

    /// Current style returned by the swizzled root-VC getter.
    /// Defaults to `.lightContent` — the MP shell's baseline (dark screens).
    fileprivate(set) var current: UIStatusBarStyle = .lightContent

    private init() {}

    /// Update the style and ask the window root VC to re-query it.
    ///
    /// `installIfNeeded()` runs BEFORE the no-op guard so the swizzle is
    /// installed even when the requested style equals the current default
    /// (`.lightContent`) — e.g. the first dark screen on launch — and so a
    /// failed install (root VC not yet attached) is retried on the next call.
    func set(_ style: UIStatusBarStyle) {
        StatusBarSwizzle.installIfNeeded()
        guard current != style else { return }
        current = style
        rootViewController?.setNeedsStatusBarAppearanceUpdate()
    }

    /// The window-root view controller that owns the status bar.
    var rootViewController: UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    }
}

// MARK: - Root-VC swizzle

/// Installs (once) a swizzle of `preferredStatusBarStyle` on the concrete class
/// of the window's root view controller (SwiftUI's private hosting controller).
/// Swizzling the *instance's class* — rather than subclassing — is required
/// because a pure-SwiftUI `WindowGroup` owns and creates the root VC itself; we
/// never get to substitute our own subclass as the window root.
@MainActor
enum StatusBarSwizzle {
    private static var installed = false

    static func installIfNeeded() {
        guard !installed,
            let root = StatusBarStyleController.shared.rootViewController
        else { return }

        let cls: AnyClass = type(of: root)
        guard let original = class_getInstanceMethod(cls, #selector(getter: UIViewController.preferredStatusBarStyle))
        else { return }

        // Replacement getter: return the controller-driven style.
        let block: @convention(block) (UIViewController) -> UIStatusBarStyle = { _ in
            StatusBarStyleController.shared.current
        }
        let imp = imp_implementationWithBlock(block)
        method_setImplementation(original, imp)
        installed = true
    }
}

// MARK: - View modifier

extension View {
    /// Drive the window status-bar style for the lifetime this screen is the
    /// front-most MP screen. Set `.darkContent` on cream / paper screens and
    /// `.lightContent` on dark screens.
    ///
    /// Applied on the root container of each MP screen. On appear we push the
    /// style; the swizzled root-VC getter (see top-of-file) makes it render.
    func posterStatusBar(_ style: UIStatusBarStyle) -> some View {
        onAppear { StatusBarStyleController.shared.set(style) }
    }

    /// Convenience for cream / light MP screens → DARK status-bar content.
    func posterLightStatusBar() -> some View {
        posterStatusBar(.darkContent)
    }

    /// Convenience for dark MP screens → LIGHT status-bar content.
    func posterDarkStatusBar() -> some View {
        posterStatusBar(.lightContent)
    }
}
