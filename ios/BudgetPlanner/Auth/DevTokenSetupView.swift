import SwiftUI

struct DevTokenSetupView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var secret: String = ""
    @State private var isSubmitting = false

    var body: some View {
        ZStack {
            AdaptiveBackground()

            ScrollView {
                VStack(spacing: Tokens.Spacing.xl) {
                    Spacer(minLength: 80)

                    VStack(spacing: Tokens.Spacing.md) {
                        Image(systemName: "lock.shield")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(Tokens.Accent.primary)

                        Text("BudgetPlanner")
                            .font(.appTitle)

                        Text("Введите DEV_AUTH_SECRET для подключения к серверу")
                            .font(.appBody)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, Tokens.Spacing.xl)
                    }

                    VStack(spacing: Tokens.Spacing.md) {
                        SecureField("Секрет", text: $secret)
                            .textContentType(.password)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .padding(Tokens.Spacing.base)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))

                        if case .error(let message) = authStore.state {
                            Text(message)
                                .font(.appLabel)
                                .foregroundStyle(.red)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            submit()
                        } label: {
                            HStack {
                                if isSubmitting {
                                    ProgressView()
                                        .tint(.white)
                                }
                                Text(isSubmitting ? "Подключение…" : "Войти")
                                    .font(.appLabel.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Tokens.Spacing.base)
                            .background(Tokens.Accent.primary, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
                            .foregroundStyle(.white)
                        }
                        .disabled(secret.isEmpty || isSubmitting)
                    }
                    .padding(.horizontal, Tokens.Spacing.xl)

                    Spacer()
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func submit() {
        Task {
            isSubmitting = true
            await authStore.exchange(secret: secret)
            isSubmitting = false
        }
    }
}
