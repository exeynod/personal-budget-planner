// Phase 24-11: Onboarding gateway — fetches GET /api/v1/me on appear,
// then renders OnboardingV10View when `onboarded_at == nil` or the
// Home screen otherwise. Symmetric to the web mount logic shipped in
// plan 24-10 (frontend/src/screensV10/OnboardingMount.tsx).
//
// Phase 25-07: HomePlaceholderView replaced by HomeV10View in the
// onboarded branch; gateway logic + state machine unchanged.
// HomeV10View reads @Environment(\.posterRouter) — provided by
// V10MainShell's PosterNavStack at runtime; nil-safe at the call site
// (HomeV10View uses `router?.push(...)` so a missing env is a no-op).
//
// Decision rule (CONTEXT D-01 / ONB-V10-01):
//   onboarded_at == nil → mount onboarding flow
//   onboarded_at != nil → mount HomeV10View (Phase 25-05 + 25-07 wiring)
//
// State machine extracted into `OnboardingMountModel` so XCTest can
// drive reload() / inspect isLoading / me / loadError without
// instantiating a SwiftUI view tree (CONTEXT D-01 «iOS make build
// succeeds with new files» + tests stay logic-level until Phase 28).
//
// Threat coverage:
//   - T-24-11-02 (network failure / infinite loading): catch surfaces
//     loadError; user sees retry button; AuthStore handles 401 redirect
//     to login (existing v0.x behaviour, untouched here).
//   - T-24-11-03 (replay / concurrent reload): isLoading guard at
//     reload() entry coalesces concurrent calls; covered by
//     OnboardingMountTests.testConcurrentReloadsCoalesceToOneFetch.

import Observation
import SwiftUI

// MARK: - Gateway state machine (testable)

/// Owns the gateway state — independent of SwiftUI so XCTest can drive
/// it directly. The view binds via `@Bindable` and reads the published
/// properties.
@MainActor
@Observable
final class OnboardingMountModel {
    private(set) var me: MeV10Response? = nil
    private(set) var loadError: String? = nil
    private(set) var isLoading: Bool = true

    private let apiClient: any MeV10APIClient
    private var inFlight: Bool = false

    init(apiClient: any MeV10APIClient) {
        self.apiClient = apiClient
    }

    /// Convenience for production callers — picks up the live API
    /// client from `MeV10API.shared`. Wrapped in a separate init so the
    /// `MainActor`-isolated `MeV10API.shared` reference does not leak
    /// into a default-argument expression (which Swift evaluates in a
    /// nonisolated context).
    @MainActor
    convenience init() {
        self.init(apiClient: MeV10API.shared)
    }

    /// Fetch /me and update state. Replay-safe: a second concurrent
    /// call returns immediately while the first is still in flight
    /// (T-24-11-03).
    func reload() async {
        if inFlight { return }
        inFlight = true
        defer { inFlight = false }

        isLoading = true
        loadError = nil
        do {
            me = try await apiClient.fetchMeV10()
        } catch {
            // T-24-11-02: fixed russian copy, never echo raw error.
            // AuthStore.onUnauthenticated already triggers re-auth on
            // 401, so we don't need a special case here.
            me = nil
            loadError = "не удалось загрузить профиль"
        }
        isLoading = false
    }
}

// MARK: - View

struct OnboardingMountView: View {
    @State private var model: OnboardingMountModel
    @State private var flow = OnboardingFlow()

    /// Production-init: reaches the live `MeV10API.shared` (main-actor
    /// isolated, hence the @MainActor stamp).
    @MainActor
    init() {
        _model = State(
            initialValue: OnboardingMountModel(apiClient: MeV10API.shared)
        )
    }

    /// Test / preview seam — inject a custom client.
    init(apiClient: any MeV10APIClient) {
        _model = State(initialValue: OnboardingMountModel(apiClient: apiClient))
    }

    var body: some View {
        ZStack {
            PosterTokens.Color.coral.ignoresSafeArea()

            content
        }
        .task {
            // Single initial fetch on first appear. `reload`'s in-flight
            // guard makes a re-trigger from .task harmless.
            if model.me == nil && model.loadError == nil {
                await model.reload()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.me == nil {
            LoadingPlate()
        } else if let error = model.loadError {
            ErrorPlate(message: error) {
                Task { await model.reload() }
            }
        } else if let me = model.me {
            if me.onboardedAt == nil {
                OnboardingV10View(
                    flow: flow,
                    onComplete: { _ in
                        // After 200 / 409 (response or nil-after-toast),
                        // refetch /me. The state machine re-renders to
                        // the home placeholder once the server confirms
                        // onboarded_at is set.
                        Task { await model.reload() }
                    }
                )
            } else {
                // Phase 25-07: real HomeV10View (Plan 25-05) replaces
                // HomePlaceholderView here. PosterRouter for push routes
                // is injected by V10MainShell's PosterNavStack.
                HomeV10View()
            }
        } else {
            // Fallback — should never render but keeps the type checker
            // happy and avoids EmptyView swallowing bugs silently.
            LoadingPlate()
        }
    }
}

// MARK: - Loading plate

private struct LoadingPlate: View {
    var body: some View {
        VStack(spacing: PosterTokens.Space.s18) {
            Spacer()
            ProgressView()
                .controlSize(.large)
                .tint(PosterTokens.Color.paper)
            Eyebrow("ЗАГРУЗКА", opacity: 0.6)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Error plate

private struct ErrorPlate: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            Spacer()
            Eyebrow("ОШИБКА", opacity: 0.65)
            Mass(message, italic: false, size: 28)
            Button(action: onRetry) {
                Text("ПОПРОБОВАТЬ →")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(PosterTokens.Color.coral)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(PosterTokens.Color.paper)
            }
            .buttonStyle(.plain)
            .padding(.top, PosterTokens.Space.s24)
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Home placeholder (legacy)

/// Phase 25-07: superseded by HomeV10View; kept as a graceful fallback
/// for tests/previews that don't want to instantiate the full HomeV10
/// stack (HomeV10ViewModel, networking, etc.). The onboarded branch in
/// `content` no longer references this type.
private struct HomePlaceholderView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
            Spacer()
            Eyebrow("VOL.05 · ДОМ", opacity: 0.65)
            Mass("ДОМ.", italic: false, size: 88)
            Mass("экран — впереди.", italic: true, size: 28)
            Spacer()
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Preview

#Preview("Mount · loading") {
    OnboardingMountView()
}
