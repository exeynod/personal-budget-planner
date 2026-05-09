import SwiftUI

struct AccessView: View {
    var body: some View {
        ZStack {
            AdaptiveBackground()
            VStack(spacing: Tokens.Spacing.md) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(Tokens.Accent.primary)
                Text("Доступ").font(.appTitle)
                Text("Whitelist пользователей и AI usage")
                    .font(.appBody)
                    .foregroundStyle(.secondary)
                Text("Будет в следующей фазе")
                    .font(.appCaption)
                    .foregroundStyle(.tertiary)
                    .padding(.top, Tokens.Spacing.sm)
            }
            .padding(.horizontal, Tokens.Spacing.xl)
        }
        .navigationTitle("Доступ")
        .navigationBarTitleDisplayMode(.inline)
    }
}
