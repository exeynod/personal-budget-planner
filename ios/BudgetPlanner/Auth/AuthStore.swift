import Foundation

@MainActor
@Observable
final class AuthStore {
    enum State: Equatable {
        case bootstrapping
        case unauthenticated
        case authenticated(UserDTO)
        case onboardingRequired(UserDTO)
        case error(String)
    }

    private(set) var state: State = .bootstrapping

    init() {
        APIClient.shared.onUnauthenticated = { [weak self] in
            Task { @MainActor in
                self?.handleUnauthenticated()
            }
        }
    }

    func bootstrap() async {
        if let token = KeychainStore.load() {
            APIClient.shared.setToken(token)
            await refreshUser()
            return
        }

        // Dev-only auto-login: secret выставляется через
        // `xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner
        //   DEV_AUTH_AUTOLOGIN_SECRET <secret>`
        // Используется для smoke-тестов на Simulator без ручного ввода.
        let defaults = UserDefaults.standard
        if let secret = defaults.string(forKey: "DEV_AUTH_AUTOLOGIN_SECRET"),
           !secret.isEmpty {
            await exchange(secret: secret)
            return
        }

        // Fallback: env vars (work если запускать через xcodebuild, не simctl)
        let env = ProcessInfo.processInfo.environment
        if env["DEV_AUTH_AUTOLOGIN"] == "1",
           let secret = env["DEV_AUTH_SECRET"], !secret.isEmpty {
            await exchange(secret: secret)
            return
        }

        state = .unauthenticated
    }

    func exchange(secret: String) async {
        do {
            let response = try await AuthAPI.devExchange(secret: secret)
            try KeychainStore.save(response.token)
            APIClient.shared.setToken(response.token)
            await refreshUser()
        } catch APIError.forbidden {
            state = .error("Неверный секрет")
        } catch APIError.serverError(503, _) {
            state = .error("DEV_AUTH_SECRET не настроен на сервере")
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func refreshUser() async {
        do {
            let user = try await MeAPI.current()
            if user.isOnboarded {
                state = .authenticated(user)
            } else {
                state = .onboardingRequired(user)
            }
        } catch APIError.unauthorized, APIError.forbidden {
            handleUnauthenticated()
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func logout() {
        KeychainStore.delete()
        APIClient.shared.setToken(nil)
        state = .unauthenticated
    }

    func markOnboarded(user: UserDTO) {
        state = .authenticated(user)
    }

    private func handleUnauthenticated() {
        KeychainStore.delete()
        APIClient.shared.setToken(nil)
        state = .unauthenticated
    }
}
