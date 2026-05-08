import SwiftUI

@MainActor
@Observable
final class OnboardingState {
    var step: Int = 0
    var name: String = ""
    var cycleStartDay: Int = 5
    var startingBalanceText: String = ""
    var seedDefaultCategories: Bool = true
    var isSubmitting: Bool = false
    var errorMessage: String?

    var startingBalanceCents: Int? {
        let trimmed = startingBalanceText.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return 0 }
        return MoneyParser.parseToCents(trimmed)
    }

    var canProceed: Bool {
        switch step {
        case 0: return !name.trimmingCharacters(in: .whitespaces).isEmpty
        case 1: return (1...28).contains(cycleStartDay)
        case 2: return startingBalanceCents != nil
        default: return true
        }
    }
}

struct OnboardingView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var stateModel = OnboardingState()
    let initialUser: UserDTO

    var body: some View {
        ZStack {
            AdaptiveBackground()

            VStack(spacing: 0) {
                ProgressIndicator(step: stateModel.step, total: 4)
                    .padding(.top, Tokens.Spacing.xl)
                    .padding(.horizontal, Tokens.Spacing.xl)

                TabView(selection: $stateModel.step) {
                    NameStep(state: stateModel).tag(0)
                    CycleStep(state: stateModel).tag(1)
                    BalanceStep(state: stateModel).tag(2)
                    PromoStep(state: stateModel).tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: stateModel.step)

                if let error = stateModel.errorMessage {
                    Text(error)
                        .font(.appLabel)
                        .foregroundStyle(.red)
                        .padding(.horizontal, Tokens.Spacing.xl)
                }

                HStack(spacing: Tokens.Spacing.md) {
                    if stateModel.step > 0 {
                        Button("Назад") {
                            withAnimation { stateModel.step -= 1 }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Tokens.Spacing.base)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
                    }

                    Button(stateModel.step == 3 ? "Готово" : "Далее") {
                        advance()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Tokens.Spacing.base)
                    .background(Tokens.Accent.primary, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
                    .foregroundStyle(.white)
                    .font(.appLabel.weight(.semibold))
                    .disabled(!stateModel.canProceed || stateModel.isSubmitting)
                }
                .padding(.horizontal, Tokens.Spacing.xl)
                .padding(.vertical, Tokens.Spacing.lg)
            }
        }
    }

    private func advance() {
        if stateModel.step < 3 {
            withAnimation { stateModel.step += 1 }
        } else {
            submit()
        }
    }

    private func submit() {
        Task {
            stateModel.isSubmitting = true
            stateModel.errorMessage = nil
            do {
                _ = try await OnboardingAPI.complete(
                    OnboardingCompleteRequest(
                        startingBalanceCents: stateModel.startingBalanceCents ?? 0,
                        cycleStartDay: stateModel.cycleStartDay,
                        seedDefaultCategories: stateModel.seedDefaultCategories
                    )
                )
                await authStore.refreshUser()
            } catch {
                stateModel.errorMessage = error.localizedDescription
            }
            stateModel.isSubmitting = false
        }
    }
}

private struct ProgressIndicator: View {
    let step: Int
    let total: Int

    var body: some View {
        HStack(spacing: Tokens.Spacing.sm) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? Tokens.Accent.primary : Color.gray.opacity(0.2))
                    .frame(height: 4)
            }
        }
    }
}
