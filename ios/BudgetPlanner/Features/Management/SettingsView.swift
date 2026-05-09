import SwiftUI

@MainActor
@Observable
final class SettingsViewModel {
    var settings: SettingsDTO?
    var draftCycleDay: Int = 5
    var draftNotifyDays: Int = 2
    var draftEnableAi: Bool = true

    var isLoading: Bool = false
    var isSaving: Bool = false
    var errorMessage: String?
    var savedFlash: Bool = false

    var dirty: Bool {
        guard let s = settings else { return false }
        return s.cycleStartDay != draftCycleDay
            || s.notifyDaysBefore != draftNotifyDays
            || s.enableAiCategorization != draftEnableAi
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let s = try await SettingsAPI.get()
            settings = s
            draftCycleDay = s.cycleStartDay
            draftNotifyDays = s.notifyDaysBefore
            draftEnableAi = s.enableAiCategorization
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func save() async {
        guard dirty, !isSaving else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let updated = try await SettingsAPI.update(SettingsUpdateRequest(
                cycleStartDay: draftCycleDay,
                notifyDaysBefore: draftNotifyDays,
                enableAiCategorization: draftEnableAi
            ))
            settings = updated
            draftCycleDay = updated.cycleStartDay
            draftNotifyDays = updated.notifyDaysBefore
            draftEnableAi = updated.enableAiCategorization
            savedFlash = true
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            savedFlash = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Settings screen — pixel-perfect port web `frontend/src/screens/SettingsScreen.tsx`.
///
/// Layout (aurora):
///   - Back button + "Настройки" header
///   - 4 liquid-glass cards: cycle day stepper, notify days input,
///     AI categorization toggle, AI spend readout
///   - Floating "Сохранить" main button (enabled только при dirty)
///   - Saved-flash toast при успехе
struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    private var user: UserDTO? {
        if case .authenticated(let user) = authStore.state { return user }
        return nil
    }

    var body: some View {
        ZStack {
            AdaptiveBackground()
            ScrollView {
                VStack(spacing: 14) {
                    SectionHeader(title: "Настройки", onBack: { dismiss() })

                    if viewModel.isLoading {
                        Text("Загрузка…")
                            .font(.system(size: 13))
                            .foregroundStyle(Tokens.Ink.secondary)
                            .padding(.top, 24)
                    }
                    if let err = viewModel.errorMessage {
                        errorBanner(err)
                    }

                    if viewModel.settings != nil {
                        cycleDayCard
                        notifyDaysCard
                        aiCategorizationCard
                        aiSpendCard
                    }

                    if viewModel.savedFlash {
                        savedToast
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 130)
            }
            .scrollIndicators(.hidden)
        }
        .navigationBarHidden(true)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            saveBar
                .padding(.horizontal, 16)
                .padding(.bottom, 6)
        }
        .task { await viewModel.load() }
    }

    // MARK: - Cards

    private var cycleDayCard: some View {
        SettingsCard(title: "День начала периода") {
            Stepper17(value: $viewModel.draftCycleDay, range: 1...28, wrap: true)
                .padding(.vertical, 4)
            disclaimer("Изменение применится со следующего периода. Текущий период продолжается с тем же днём начала.")
        }
    }

    private var notifyDaysCard: some View {
        SettingsCard(title: "Уведомления о подписках") {
            HStack {
                Text("Напоминать за (дней до списания)")
                    .font(.system(size: 13))
                    .foregroundStyle(Tokens.Ink.secondary)
                Spacer()
                NumberInput(
                    value: $viewModel.draftNotifyDays,
                    range: 0...30
                )
            }
            disclaimer("Применяется только к новым подпискам. Существующие имеют свой настроенный override.")
        }
    }

    private var aiCategorizationCard: some View {
        SettingsCard(title: "AI-функции") {
            HStack {
                Text("AI-категоризация транзакций")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Tokens.Ink.primary)
                Spacer()
                Toggle("", isOn: $viewModel.draftEnableAi)
                    .labelsHidden()
                    .tint(Tokens.Accent.primary)
            }
            disclaimer("При вводе описания транзакции AI предложит категорию автоматически.")
        }
    }

    private var aiSpendCard: some View {
        SettingsCard(title: "AI расход") {
            if let user, user.aiSpendingCapCents == 0 {
                Text("AI отключён")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Tokens.Ink.primary)
                disclaimer("Обратитесь к администратору, если нужен доступ к AI-функциям.")
            } else if let user {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("$\(formatUsd(cents: user.aiSpendCents))")
                        .font(.system(size: 26, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Tokens.Ink.primary)
                    Text("/")
                        .font(.system(size: 22, weight: .regular))
                        .foregroundStyle(Tokens.Ink.tertiary)
                    Text("$\(formatUsd(cents: user.aiSpendingCapCents))")
                        .font(.system(size: 22, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Tokens.Ink.secondary)
                }
                disclaimer("Сбрасывается 1-го числа каждого месяца (Europe/Moscow).")
            } else {
                disclaimer("Загрузка…")
            }
        }
    }

    private func formatUsd(cents: Int) -> String {
        String(format: "%.2f", Double(cents) / 100.0)
    }

    // MARK: - Helpers

    private func disclaimer(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Ink.tertiary)
                .padding(.top, 1)
            Text(text)
                .font(.system(size: 12))
                .foregroundStyle(Tokens.Ink.secondary)
                .lineLimit(nil)
        }
    }

    private func errorBanner(_ message: String) -> some View {
        Text("Ошибка: \(message)")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Color.red)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.red.opacity(0.10))
            )
    }

    private var savedToast: some View {
        Text("✓ Сохранено")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(Color(hex: 0x2A8C4D))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(Color(hex: 0x7CC68F).opacity(0.18))
            )
            .overlay(
                Capsule().strokeBorder(Color(hex: 0x7CC68F).opacity(0.40), lineWidth: 0.5)
            )
    }

    private var saveBar: some View {
        HStack {
            Spacer()
            Button(viewModel.isSaving ? "Сохранение…" : "Сохранить") {
                Task { await viewModel.save() }
            }
            .buttonStyle(MainButtonStyle(enabled: viewModel.dirty && !viewModel.isSaving))
            .disabled(!viewModel.dirty || viewModel.isSaving)
            Spacer()
        }
    }
}

// MARK: - Reusable small components (settings/categories/template…)

struct SectionHeader: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Tokens.Ink.primary)
                    .frame(width: 32, height: 32)
                    .background(
                        Circle().fill(Color.white.opacity(0.55))
                    )
                    .overlay(
                        Circle().strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
            Text(title)
                .font(.system(size: 24, weight: .bold))
                .tracking(-0.48)
                .foregroundStyle(Tokens.Ink.primary)
            Spacer()
        }
        .padding(.bottom, 4)
    }
}

struct SettingsCard<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.44)
                .foregroundStyle(Tokens.Ink.secondary)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(radius: 22)
    }
}

struct Stepper17: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    var wrap: Bool = false

    var body: some View {
        HStack(spacing: 0) {
            stepButton(systemName: "minus") { decrement() }
            Spacer()
            Text("\(value)")
                .font(.system(size: 32, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Tokens.Ink.primary)
                .frame(minWidth: 60)
            Spacer()
            stepButton(systemName: "plus") { increment() }
        }
    }

    private func stepButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Tokens.Accent.primary)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(Tokens.Accent.primary.opacity(0.14))
                )
                .overlay(
                    Circle()
                        .strokeBorder(Tokens.Accent.primary.opacity(0.30), lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
    }

    private func decrement() {
        if value > range.lowerBound {
            value -= 1
        } else if wrap {
            value = range.upperBound
        }
    }

    private func increment() {
        if value < range.upperBound {
            value += 1
        } else if wrap {
            value = range.lowerBound
        }
    }
}

struct NumberInput: View {
    @Binding var value: Int
    let range: ClosedRange<Int>

    @State private var text: String = ""

    var body: some View {
        TextField("", text: $text)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Tokens.Ink.primary)
            .frame(width: 60, height: 38)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.55))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.black.opacity(0.08), lineWidth: 0.5)
            )
            .onAppear { text = String(value) }
            .onChange(of: text) { _, newValue in
                let cleaned = newValue.filter(\.isNumber)
                let n = Int(cleaned) ?? range.lowerBound
                let clamped = min(max(n, range.lowerBound), range.upperBound)
                if clamped != value { value = clamped }
                if cleaned != newValue { text = cleaned }
            }
            .onChange(of: value) { _, newValue in
                if String(newValue) != text { text = String(newValue) }
            }
    }
}

struct MainButtonStyle: ButtonStyle {
    let enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(
                        LinearGradient(
                            colors: [
                                Tokens.Accent.primary,
                                Tokens.Accent.primary.opacity(0.8),
                            ],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.white.opacity(0.4), lineWidth: 0.5)
                    .blendMode(.plusLighter)
            )
            .shadow(color: Tokens.Accent.primary.opacity(0.4), radius: 14, x: 0, y: 8)
            .opacity(enabled ? 1 : 0.45)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
