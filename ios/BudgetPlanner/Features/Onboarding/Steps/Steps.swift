import SwiftUI

struct NameStep: View {
    @Bindable var state: OnboardingState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.lg) {
                Text("Как тебя зовут?")
                    .font(.appTitle)

                Text("Имя не уйдёт никуда — храним только локально для приветствия.")
                    .font(.appBody)
                    .foregroundStyle(.secondary)

                TextField("Имя", text: $state.name)
                    .textContentType(.givenName)
                    .padding(Tokens.Spacing.base)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
            }
            .padding(.horizontal, Tokens.Spacing.xl)
            .padding(.top, Tokens.Spacing.xl)
        }
    }
}

struct CycleStep: View {
    @Bindable var state: OnboardingState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.lg) {
                Text("День начала бюджетного цикла")
                    .font(.appTitle)

                Text("Обычно совпадает с датой получения зарплаты. Можно поменять позже в Настройках.")
                    .font(.appBody)
                    .foregroundStyle(.secondary)

                Picker("День", selection: $state.cycleStartDay) {
                    ForEach(1...28, id: \.self) { day in
                        Text("\(day) число").tag(day)
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 180)
            }
            .padding(.horizontal, Tokens.Spacing.xl)
            .padding(.top, Tokens.Spacing.xl)
        }
    }
}

struct BalanceStep: View {
    @Bindable var state: OnboardingState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.lg) {
                Text("Стартовый баланс")
                    .font(.appTitle)

                Text("Сумма на счетах в начале первого периода. Может быть отрицательной (долг).")
                    .font(.appBody)
                    .foregroundStyle(.secondary)

                HStack {
                    TextField("0", text: $state.startingBalanceText)
                        .keyboardType(.numbersAndPunctuation)
                        .font(.appHero)
                        .multilineTextAlignment(.trailing)

                    Text("₽")
                        .font(.appHero)
                        .foregroundStyle(.secondary)
                }
                .padding(Tokens.Spacing.base)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))

                if state.startingBalanceText.isEmpty == false && state.startingBalanceCents == nil {
                    Text("Не удаётся распознать число. Пример: 1 500,50")
                        .font(.appLabel)
                        .foregroundStyle(.red)
                }
            }
            .padding(.horizontal, Tokens.Spacing.xl)
            .padding(.top, Tokens.Spacing.xl)
        }
    }
}

struct PromoStep: View {
    @Bindable var state: OnboardingState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.lg) {
                Text("Готово!")
                    .font(.appTitle)

                Text("Создадим первый бюджетный период с твоим балансом и заполним типовые категории — потом можно подправить под себя.")
                    .font(.appBody)
                    .foregroundStyle(.secondary)

                Toggle("Создать стандартные категории (14 шт.)",
                       isOn: $state.seedDefaultCategories)
                    .padding(Tokens.Spacing.base)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tokens.Radius.md))
            }
            .padding(.horizontal, Tokens.Spacing.xl)
            .padding(.top, Tokens.Spacing.xl)
        }
    }
}
