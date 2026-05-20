import SwiftUI

/// Phase 62 — native Form sheet для создания цели.
///
/// **Symbol-collision avoidance**: FeaturesV10/Savings/NewGoalSheet.swift
/// уже определяет `struct NewGoalSheet` в том же модуле BudgetPlanner.
/// Swift не разрешает два struct с одинаковым именем в одном модуле,
/// поэтому v06 native sheet называется `SavingsNewGoalSheet`.
///
/// **Composition (Plan 62-03)**:
///   - NavigationStack (self-contained sheet).
///   - Form: «Название» TextField + «Целевая сумма» .decimalPad через
///     MoneyParser.parseToCents + optional Toggle/DatePicker «Срок».
///   - Toolbar: «Отмена» (.cancellationAction) + «Создать»
///     (.confirmationAction, disabled до canCreate; label «Создание…»
///     во время submitting).
///   - DatePicker диапазон `tomorrow...` — backend требует due строго в
///     будущем (T-22-12-07); MSK day-shift фиксится в GoalCreateRequest
///     (IN-04).
///
/// **WR-02 awareness**: SavingsViewModel.createGoal сейчас dismiss'ит
/// sheet через `sheet = .none` и на success, и на failure — это НЕ скоуп
/// данного плана. Здесь НЕ добавляем локальный presented-flag: sheet
/// binding в SavingsView реагирует на viewModel.sheet. Просто вызываем
/// onCreate.
struct SavingsNewGoalSheet: View {
    let submitting: Bool
    let onCreate: (_ name: String, _ targetCents: Int, _ due: Date?) async -> Bool
    let onCancel: () -> Void

    /// WR-04: picker calendar MUST be Europe/Moscow, matching
    /// GoalCreateRequest.encode (которое форматирует `due` в MSK). На
    /// устройстве восточнее MSK Calendar.current выбрала бы local-midnight,
    /// который маппится на ПРЕДЫДУЩИЙ календарный день в MSK → off-by-one
    /// на wire. Считаем «завтра» от MSK-now тем же календарём, что и encoder.
    private static let mskCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        return c
    }()

    @State private var name: String = ""
    @State private var targetText: String = ""
    @State private var hasDue: Bool = false
    @State private var dueDate: Date =
        SavingsNewGoalSheet.mskCalendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()

    // MARK: - Derived

    private var targetCents: Int {
        MoneyParser.parseToCents(targetText) ?? 0
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canCreate: Bool {
        SavingsViewData.isValidGoalDraft(name: name, targetCents: targetCents) && !submitting
    }

    private var minDueDate: Date {
        SavingsNewGoalSheet.mskCalendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Например, Отпуск", text: $name)
                        .textInputAutocapitalization(.sentences)
                }

                Section("Целевая сумма") {
                    HStack {
                        TextField("0", text: $targetText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                        Text("₽").foregroundStyle(.secondary)
                    }
                }

                Section {
                    Toggle("Добавить срок", isOn: $hasDue)
                    if hasDue {
                        DatePicker(
                            "Срок",
                            selection: $dueDate,
                            in: minDueDate...,
                            displayedComponents: .date
                        )
                        .datePickerStyle(.compact)
                    }
                }
            }
            .navigationTitle("Новая цель")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { onCancel() }
                        .disabled(submitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(submitting ? "Создание…" : "Создать") {
                        Task {
                            _ = await onCreate(trimmedName, targetCents, hasDue ? dueDate : nil)
                        }
                    }
                    .disabled(!canCreate)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(submitting)
    }
}
