import SwiftUI

struct AIProposalSheet: View {
    let proposal: ProposalDraft
    let categories: [CategoryDTO]
    let onConfirm: () -> Void
    let onCancel: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var amountText: String = ""
    @State private var categoryId: Int?
    @State private var description: String = ""
    @State private var date: Date = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("Предложено AI") {
                    Text(proposal.kind == .actual ? "Создать факт-транзакцию" : "Создать план")
                        .font(.appBody)
                }

                Section("Сумма") {
                    HStack {
                        TextField("0", text: $amountText)
                            .keyboardType(.numbersAndPunctuation)
                        Text("₽").foregroundStyle(.secondary)
                    }
                }

                Section("Категория") {
                    let expenses = categories.filter { $0.kind == .expense && !$0.isArchived }
                    Picker("Категория", selection: $categoryId) {
                        ForEach(expenses) { c in
                            Text(c.name).tag(c.id as Int?)
                        }
                    }
                }

                if proposal.kind == .actual {
                    Section("Дата") {
                        DatePicker("Дата", selection: $date, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "ru_RU"))
                    }
                }

                Section("Описание") {
                    TextField("Опционально", text: $description)
                }
            }
            .navigationTitle("Предложение AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        onCancel()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        onConfirm()
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            amountText = MoneyFormatter.format(cents: proposal.amountCents)
            categoryId = proposal.categoryId
            description = proposal.description ?? ""
            date = proposal.txDate ?? Date()
        }
        .presentationDetents([.medium, .large])
    }
}
