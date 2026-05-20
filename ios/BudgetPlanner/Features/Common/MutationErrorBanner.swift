import SwiftUI

/// Phase 67 Plan 05 (R1) — single shared mutation-error banner.
///
/// Previously SavingsView (T-62-03), GoalDetailView (T-62-03) and
/// SubscriptionsView (T-63-02) each carried a byte-identical private
/// `mutationErrorBanner(_:)` returning a `Section`-wrapped dismissible red
/// row. This collapses them into one reusable `Section` view + a `View`
/// modifier convenience so the markup, copy and a11y label live in one place.
///
/// The dismiss action is injected (each screen clears its own view-model's
/// `mutationError`), so this view stays decoupled from the Savings /
/// Subscriptions view-models (owned by 67-07).
struct MutationErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.primary)
                Spacer(minLength: 8)
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Скрыть ошибку")
            }
        }
    }
}

extension View {
    /// Convenience: render a `MutationErrorBanner` Section when `message` is
    /// non-nil. Intended for use inside a `List` / `Form` where the banner is
    /// one of several Sections.
    @ViewBuilder
    func mutationErrorBanner(_ message: String?, onDismiss: @escaping () -> Void) -> some View {
        if let message {
            MutationErrorBanner(message: message, onDismiss: onDismiss)
        }
    }
}
