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
        } else {
            state = .unauthenticated
        }
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
