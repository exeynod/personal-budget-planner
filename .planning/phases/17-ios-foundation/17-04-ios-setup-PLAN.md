# Plan 17-04..10: iOS Foundation Files

**Status:** ✓ Files written, awaiting Xcode integration by user

## Files written to `/ios/BudgetPlanner/`

### App Shell
- `App/BudgetPlannerApp.swift` — `@main` entry, инициализирует AuthStore.
- `App/AppRouter.swift` — switch по `AuthStore.state`: bootstrap → setup → onboarding → main shell.

### Design (Plan 17-05)
- `Design/Tokens.swift` — Color/Font/Spacing/Radius из tokens.css.
- `Design/GlassMaterial.swift` — `glassCard()` modifier через нативный Material.
- `Design/AuroraBackground.swift` — Aurora Light + Mesh Dark + AdaptiveBackground (auto по colorScheme). MeshGradient на iOS 18+, LinearGradient fallback.

### Networking (Plan 17-06)
- `Networking/APIClient.swift` — async URLSession с Bearer token, JSON decoder с ISO date strategy, snake_case ↔ camelCase, error handling 401/403/404/409/422/429.
- `Networking/APIError.swift` — typed error enum, APIErrorBody decode.
- `Networking/DTO/CommonDTO.swift` — UserDTO, CategoryDTO, PeriodDTO, BalanceResponse, DevExchangeRequest/Response, OnboardingCompleteRequest/Response.
- `Networking/Endpoints/AuthAPI.swift` — AuthAPI (devExchange), MeAPI, CategoriesAPI, PeriodsAPI, OnboardingAPI.

### Auth (Plan 17-07)
- `Auth/KeychainStore.swift` — wrapper над Security framework (kSecClassGenericPassword, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly).
- `Auth/AuthStore.swift` — @Observable, state machine (bootstrapping / unauthenticated / authenticated / onboardingRequired / error).
- `Auth/DevTokenSetupView.swift` — экран ввода secret с inline error feedback.

### Domain (используется уже в Phase 17, расширится в Phase 18)
- `Domain/MoneyFormatter.swift` — `format(cents:)` через NumberFormatter ru-RU; `MoneyParser.parseToCents` digit-walk без Float (порт parseRublesToKopecks).

### Onboarding (Plan 17-08)
- `Features/Onboarding/OnboardingView.swift` — 4-step `TabView(.page)` + ProgressIndicator + back/next buttons.
- `Features/Onboarding/Steps/Steps.swift` — NameStep, CycleStep, BalanceStep, PromoStep.

### Home (Plan 17-09)
- `Features/Home/HomeView.swift` — HeroCard, ForecastCard, TopCategoriesSection, DashboardCategoryRow + HomeViewModel (@Observable, async load).

### Common Shell (Plan 17-10)
- `Features/Common/BottomNav.swift` — TabView с 4 табами; Home работает, остальные = ComingSoonView.

## User Setup Required (Plan 17-04)

См. `ios/SETUP.md` — пошаговая инструкция для пользователя:
1. Создать Xcode-проект (BudgetPlanner, iOS 17.0+, SwiftUI).
2. Добавить готовые файлы из `/ios/BudgetPlanner/` в target.
3. Настроить `BACKEND_URL` env var и Info.plist `NSAllowsLocalNetworking`.
4. Cmd+R на Simulator iPhone 15 Pro.

## Acceptance (Phase 17)

После Xcode setup пользователь может проверить:
- IOS-01: проект собирается (Cmd+R)
- IOS-02: цвета совпадают с web (visual diff)
- IOS-03: фоны переключаются по светлой/тёмной теме
- IOS-04: API client декодирует endpoints (через UI flow Onboarding/Home)
- IOS-06: первый запуск → DevTokenSetupView → ввод secret → Home
- IOS-07: invalid token / 401 → возврат на DevTokenSetupView
- IOS-10: Onboarding 4 шага → POST /onboarding/complete → Home
- IOS-11: HomeView показывает реальные числа из /periods/current и /periods/{id}/balance

## Deferred to Phase 18

- IOS-08: формальные XCTest для period_for (порт сделаем в Phase 18, когда добавится Period.swift).
- IOS-09: формальные XCTest для MoneyParser (есть код, тесты в Phase 18).
- Полная domain-логика (Period, Delta).
