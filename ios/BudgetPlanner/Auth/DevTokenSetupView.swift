import SwiftUI

struct DevTokenSetupView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var secret: String = ""
    @State private var isSubmitting = false

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    Spacer(minLength: 80)

                    VStack(spacing: 12) {
                        Image(systemName: "lock.shield")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(Tokens.Accent.primary)

                        Text("BudgetPlanner")
                            .font(.title2.weight(.bold))

                        Text("Введите DEV_AUTH_SECRET для подключения к серверу")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    VStack(spacing: 12) {
                        SecureField("Секрет", text: $secret)
                            .textContentType(.password)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .padding(16)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                        if case .error(let message) = authStore.state {
                            Label(message, systemImage: "exclamationmark.triangle")
                                .font(.callout)
                                .foregroundStyle(.red)
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
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .frame(maxWidth: .infinity)
                        .disabled(secret.isEmpty || isSubmitting)
                    }
                    .padding(.horizontal, 24)

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
