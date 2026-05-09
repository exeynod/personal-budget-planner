import SwiftUI

struct AccessView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Доступ", systemImage: "person.2.fill")
        } description: {
            Text("Whitelist пользователей и AI usage. Будет в следующей фазе.")
        }
        .navigationTitle("Доступ")
        .navigationBarTitleDisplayMode(.inline)
    }
}
