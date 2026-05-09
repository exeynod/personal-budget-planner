import SwiftUI

@MainActor
@Observable
final class OnboardingState {
    var balanceText: String = ""
    var cycleStartDay: Int = 5
    var seedDefaultCategories: Bool = true
    var isSubmitting: Bool = false
    var errorMessage: String?

    var balanceCents: Int? {
        let trimmed = balanceText.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return nil }
        return MoneyParser.parseToCents(trimmed)
    }

    var canSubmit: Bool {
        balanceCents != nil
            && (1...28).contains(cycleStartDay)
            && !isSubmitting
    }
}

private let CYCLE_PRESETS: [Int] = [1, 5, 10, 15, 20, 25, 28]
private let BOT_USERNAME = "tg_budget_planner_bot"

/// Onboarding — native iOS Form layout.
///   - Hero header (SF Symbol rublesign + tagline) — простой Section header
///   - 4 Sections: Баланс, День цикла, Подключить бота, Категории
///   - "Начать" Button(.borderedProminent) в .toolbar
struct OnboardingView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var state = OnboardingState()
    let initialUser: UserDTO

    private var headingText: String {
        initialUser.role == "member" ? "Добро пожаловать в команду" : "Бюджет в одном касании"
    }

    private var subtitleText: String {
        initialUser.role == "member"
            ? "Несколько шагов и вы готовы вести бюджет"
            : "Запиши траты, держи план, смотри тренды."
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "rublesign.circle.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(Tokens.Accent.primary)
                        Text(headingText)
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text(subtitleText)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .listRowBackground(Color.clear)
                }

                Section {
                    HStack {
                        Text("Стартовый баланс")
                        Spacer()
                        TextField("0", text: $state.balanceText)
                            .keyboardType(.numbersAndPunctuation)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                            .frame(maxWidth: 140)
                        Text("₽").foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Можно ввести 0 или отрицательное (долг).")
                }

                Section {
                    Stepper(value: $state.cycleStartDay, in: 1...28) {
                        LabeledContent("День начала бюджета") {
                            Text("\(state.cycleStartDay)").monospacedDigit()
                        }
                    }
                    HStack(spacing: 8) {
                        ForEach(CYCLE_PRESETS, id: \.self) { day in
                            Button("\(day)") {
                                state.cycleStartDay = day
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .tint(state.cycleStartDay == day ? Tokens.Accent.primary : .secondary)
                        }
                    }
                } footer: {
                    Text("Например, день зарплаты.")
                }

                Section {
                    Toggle("Готовые категории", isOn: $state.seedDefaultCategories)
                } footer: {
                    Text("Добавить 14 преднастроенных категорий (Продукты, Дом, Транспорт и т.д.) — можно отредактировать позже.")
                }

                Section {
                    if initialUser.tgChatId != nil {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Бот подключён")
                                    .font(.body)
                                Text("@\(BOT_USERNAME)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    } else {
                        Button {
                            openTelegramBot()
                        } label: {
                            Label("Открыть @\(BOT_USERNAME)", systemImage: "paperplane.fill")
                        }
                    }
                } header: {
                    Text("Telegram-бот")
                } footer: {
                    Text("Нужен для напоминаний и быстрого ввода трат.")
                }

                if let err = state.errorMessage {
                    Section {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationBarHidden(true)
            .safeAreaInset(edge: .bottom) {
                Button(state.isSubmitting ? "Сохранение…" : "Начать") {
                    submit()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!state.canSubmit)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }
        }
    }

    private func submit() {
        guard let cents = state.balanceCents else { return }
        Task {
            state.isSubmitting = true
            state.errorMessage = nil
            do {
                _ = try await OnboardingAPI.complete(
                    OnboardingCompleteRequest(
                        startingBalanceCents: cents,
                        cycleStartDay: state.cycleStartDay,
                        seedDefaultCategories: state.seedDefaultCategories
                    )
                )
                await authStore.refreshUser()
            } catch {
                state.errorMessage = error.localizedDescription
            }
            state.isSubmitting = false
        }
    }

    private func openTelegramBot() {
        guard let url = URL(string: "https://t.me/\(BOT_USERNAME)?start=onboard") else { return }
        UIApplication.shared.open(url)
    }
}
