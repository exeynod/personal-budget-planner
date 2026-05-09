import SwiftUI

@MainActor
@Observable
final class SettingsViewModel {
    var settings: SettingsDTO?
    var isLoading: Bool = false
    var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            settings = try await SettingsAPI.get()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func update(cycleStartDay: Int? = nil,
                notifyDaysBefore: Int? = nil,
                enableAi: Bool? = nil) async {
        do {
            settings = try await SettingsAPI.update(SettingsUpdateRequest(
                cycleStartDay: cycleStartDay,
                notifyDaysBefore: notifyDaysBefore,
                enableAiCategorization: enableAi
            ))
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        ZStack {
            AdaptiveBackground()
            content
        }
        .navigationTitle("Настройки")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let s = viewModel.settings {
            Form {
                Section("Бюджетный цикл") {
                    Picker("День начала", selection: Binding(
                        get: { s.cycleStartDay },
                        set: { newValue in
                            Task { await viewModel.update(cycleStartDay: newValue) }
                        }
                    )) {
                        ForEach(1...28, id: \.self) { day in
                            Text("\(day) число").tag(day)
                        }
                    }
                }

                Section("Уведомления") {
                    Stepper(
                        "За \(s.notifyDaysBefore) дней до подписки",
                        value: Binding(
                            get: { s.notifyDaysBefore },
                            set: { newValue in
                                Task { await viewModel.update(notifyDaysBefore: newValue) }
                            }
                        ),
                        in: 0...30
                    )
                }

                Section("AI") {
                    Toggle("AI-категоризация",
                           isOn: Binding(
                            get: { s.enableAiCategorization },
                            set: { newValue in
                                Task { await viewModel.update(enableAi: newValue) }
                            }
                           ))
                }

                Section {
                    Button(role: .destructive) {
                        authStore.logout()
                    } label: {
                        Text("Выйти")
                    }
                }

                if let err = viewModel.errorMessage {
                    Section {
                        Text(err).foregroundStyle(.red).font(.appLabel)
                    }
                }
            }
            .scrollContentBackground(.hidden)
        } else if viewModel.isLoading {
            ProgressView()
        } else {
            VStack {
                Text("Не удалось загрузить").font(.appTitle)
                Button("Повторить") { Task { await viewModel.load() } }
            }
        }
    }
}
