---
phase: 17
status: human_needed
backend_status: passed
ios_status: human_needed
date: 2026-05-08
---

# Phase 17 Verification: iOS Foundation

## Backend Auth Extension

### IOSAUTH-01 (Bearer fallback в get_current_user) — ✅ passed
- pytest 4 cases в `tests/api/test_dependencies_bearer_auth.py` — все требуют DATABASE_URL fixture, pytest сам skip-нёт без БД.
- Smoke-проверено через curl:
  - `GET /me` с `Authorization: Bearer <valid>` → 200 + role:owner ✓
  - `GET /me` без headers (DEV_MODE=true) → 200 + owner (legacy initData/dev-bypass не сломан) ✓
- File: `app/api/dependencies.py` (+75 lines)

### IOSAUTH-02 (POST /auth/dev-exchange) — ✅ passed
- pytest 5 cases в `tests/api/test_auth_dev_exchange.py`.
- Smoke-проверено через curl (после `docker compose up -d --build api`):
  - Valid secret → 200, 64-char hex token, tg_user_id == OWNER_TG_ID ✓
  - Invalid secret → 403 "Invalid secret" ✓
  - Без env DEV_AUTH_SECRET → 503 (verified до .env update) ✓
  - Repeat exchange → новый токен, старый продолжает работать ✓
- Files: `app/api/routes/auth.py` (новый), `app/api/schemas/auth.py` (новый), `alembic/versions/0011_auth_token.py`, `app/db/models.py` (AuthToken), `app/core/settings.py` (DEV_AUTH_SECRET).

## iOS Foundation Files (написан код, ожидает Xcode integration)

### IOS-01..03 (Xcode + design + backgrounds) — human_needed
**Что готово:**
- Все Swift-файлы лежат в `/ios/BudgetPlanner/` с правильной структурой папок (App/Design/Networking/Auth/Domain/Features/Common).
- `Tokens.swift`, `GlassMaterial.swift`, `AuroraBackground.swift` (Aurora + Mesh Dark + Adaptive).

**Что нужно от пользователя:**
1. Создать Xcode-проект `BudgetPlanner` в `/ios/` (iOS 17.0+, SwiftUI). Подробности — `ios/SETUP.md` шаг 1.
2. Добавить файлы в target (drag-and-drop).
3. Настроить `BACKEND_URL` env var в Xcode scheme.
4. Cmd+R → должен открыться `DevTokenSetupView`.

### IOS-04 (Networking) — human_needed
- `APIClient`, DTO, AuthAPI/MeAPI/CategoriesAPI/PeriodsAPI/OnboardingAPI готовы.
- Интеграционные XCTest — отложены, проверяются через Onboarding/Home flow на Simulator.

### IOS-06..07 (Auth via Keychain) — human_needed
- `KeychainStore`, `AuthStore`, `DevTokenSetupView` готовы.
- Acceptance проверяется UAT-ом: первый запуск → setup → home; перезапуск → home сразу; invalid token → возврат на setup.

### IOS-10..11 (Onboarding + Home) — human_needed
- `OnboardingView` (4 шага: имя/cycle/balance/promo), `HomeView` (HeroCard + Forecast + Top categories) готовы.
- Acceptance: 4 шага → POST /onboarding/complete → Home показывает балансы того же периода что web.

## Human Verification Steps

1. **Xcode build smoke:**
   ```
   cd ios/  # после Xcode-проект создан
   xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build
   ```
   Ожидание: BUILD SUCCEEDED.

2. **Auth flow (IOS-06):**
   - Удалить приложение из Simulator (если стояло раньше).
   - Cmd+R → должен открыться DevTokenSetupView.
   - Ввести `DEV_AUTH_SECRET` (то же что в `.env` корня репо) → tap "Войти".
   - Ожидание: либо OnboardingView (если onboarding не пройден), либо HomeView с реальными балансами.

3. **Onboarding flow (IOS-10):**
   - На свежем юзере: 4 шага → submit.
   - Ожидание: переход на HomeView, период создан в БД (видно в web: refresh `https://localhost`).

4. **Home parity (IOS-11):**
   - Открыть web Mini App в TG, посмотреть HomeScreen.
   - Сравнить числа в HeroCard на iOS — должны совпадать.

5. **Persistent auth (IOS-07):**
   - Закрыть приложение (force quit на iOS) → reopen.
   - Ожидание: сразу HomeView без DevTokenSetupView.

## Deferred Items

- Tests для `period_for` (`PeriodForTests.swift`) — Phase 18.
- Tests для MoneyParser (`MoneyParserTests.swift`) — Phase 18 (пока проверяется визуально через Onboarding balance step).
- AccessScreen / Settings / Categories sub-screens — Phase 18-19.
- AI chat (Phase 20).
- TestFlight (Phase 21).

## Files Touched (Phase 17)

**Backend:**
- `app/core/settings.py` — DEV_AUTH_SECRET
- `app/db/models.py` — AuthToken
- `alembic/versions/0011_auth_token.py` — новая миграция
- `app/api/routes/auth.py` — новый
- `app/api/schemas/auth.py` — новый
- `app/api/router.py` — register auth_router
- `app/api/dependencies.py` — _resolve_bearer + extended get_current_user
- `docker-compose.yml` — DEV_AUTH_SECRET env forward
- `tests/api/test_auth_dev_exchange.py` — новый
- `tests/api/test_dependencies_bearer_auth.py` — новый

**iOS:**
- `ios/SETUP.md` — пошаговая инструкция для пользователя
- `ios/BudgetPlanner/App/{BudgetPlannerApp,AppRouter}.swift`
- `ios/BudgetPlanner/Design/{Tokens,GlassMaterial,AuroraBackground}.swift`
- `ios/BudgetPlanner/Networking/{APIClient,APIError}.swift` + `DTO/CommonDTO.swift` + `Endpoints/AuthAPI.swift`
- `ios/BudgetPlanner/Auth/{KeychainStore,AuthStore,DevTokenSetupView}.swift`
- `ios/BudgetPlanner/Domain/MoneyFormatter.swift`
- `ios/BudgetPlanner/Features/Onboarding/{OnboardingView}.swift` + `Steps/Steps.swift`
- `ios/BudgetPlanner/Features/Home/HomeView.swift`
- `ios/BudgetPlanner/Features/Common/BottomNav.swift`

**Planning:**
- `.planning/phases/17-ios-foundation/{17-CONTEXT,17-01..04 PLANs,17-VERIFICATION}.md`
