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

/// Settings — native iOS Form.
///   - Form { Section } pattern с Stepper, TextField, Toggle, LabeledContent
///   - Save в navigation toolbar (disabled когда нет dirty)
///   - .navigationTitle("Настройки") large title (когда нужно)
struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @Environment(AuthStore.self) private var authStore

    private var user: UserDTO? {
        if case .authenticated(let user) = authStore.state { return user }
        return nil
    }

    var body: some View {
        Form {
            if viewModel.settings != nil {
                cycleSection
                notifySection
                aiSection
                aiSpendSection
            } else if viewModel.isLoading {
                Section { ProgressView() }
            }
            if let err = viewModel.errorMessage {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Настройки")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Сохранить") {
                    Task { await viewModel.save() }
                }
                .disabled(!viewModel.dirty || viewModel.isSaving)
            }
        }
        .overlay(alignment: .top) {
            if viewModel.savedFlash {
                Label("Сохранено", systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.green.gradient, in: Capsule())
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: viewModel.savedFlash)
        .task { await viewModel.load() }
    }

    private var cycleSection: some View {
        Section {
            Stepper(value: $viewModel.draftCycleDay, in: 1...28) {
                LabeledContent("День начала периода") {
                    Text("\(viewModel.draftCycleDay)")
                        .monospacedDigit()
                }
            }
        } footer: {
            Text("Изменение применится со следующего периода. Текущий период продолжается с тем же днём начала.")
        }
    }

    private var notifySection: some View {
        Section {
            HStack {
                Text("Напоминать за (дней)")
                Spacer()
                TextField("2", value: $viewModel.draftNotifyDays, format: .number)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .frame(maxWidth: 60)
            }
        } header: {
            Text("Уведомления о подписках")
        } footer: {
            Text("Применяется только к новым подпискам. Существующие имеют свой настроенный override.")
        }
    }

    private var aiSection: some View {
        Section {
            Toggle("AI-категоризация транзакций", isOn: $viewModel.draftEnableAi)
        } header: {
            Text("AI-функции")
        } footer: {
            Text("При вводе описания транзакции AI предложит категорию автоматически.")
        }
    }

    @ViewBuilder
    private var aiSpendSection: some View {
        if let user, user.aiSpendingCapCents == 0 {
            Section {
                LabeledContent("AI-расход", value: "Отключён")
            } footer: {
                Text("Обратитесь к администратору, если нужен доступ к AI-функциям.")
            }
        } else if let user {
            Section {
                LabeledContent("AI-расход") {
                    Text(spendText(spend: user.aiSpendCents, cap: user.aiSpendingCapCents))
                        .monospacedDigit()
                }
            } header: {
                Text("AI-расход")
            } footer: {
                Text("Сбрасывается 1-го числа каждого месяца (Europe/Moscow).")
            }
        }
    }

    private func spendText(spend: Int, cap: Int) -> String {
        let s = String(format: "%.2f", Double(spend) / 100.0)
        let c = String(format: "%.2f", Double(cap) / 100.0)
        return "$\(s) / $\(c)"
    }
}
