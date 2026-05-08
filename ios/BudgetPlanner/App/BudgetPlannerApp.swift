import SwiftUI

@main
struct BudgetPlannerApp: App {
    @State private var authStore = AuthStore()

    var body: some Scene {
        WindowGroup {
            AppRouter()
                .environment(authStore)
        }
    }
}
