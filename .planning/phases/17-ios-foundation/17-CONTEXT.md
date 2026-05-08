# Phase 17: iOS Foundation — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Mode:** Auto-generated from approved plan `~/.claude/plans/tender-hopping-simon.md`

<domain>
## Phase Boundary

Working "Hello World" iOS-приложение, в котором пользователь логинится через DEV_AUTH_SECRET и видит реальные данные текущего периода с backend, без поломок web-фронта. Phase 17 покрывает 10 требований: IOSAUTH-01, IOSAUTH-02, IOS-01, IOS-02, IOS-03, IOS-04, IOS-06, IOS-07, IOS-10, IOS-11.

Backend — минимальные изменения (новый endpoint `dev-exchange` + расширение `get_current_user` для Bearer-fallback). Web Mini App работает без изменений.

iOS — новый Xcode-проект в `/ios/`, дизайн-токены порт из `tokens.css`, нативный glass через `Material`, Aurora/Mesh фоны, URLSession-клиент с Codable DTO для всех endpoints, AuthStore с Keychain, Onboarding (4-step), Home с реальными данными (`GET /periods/current` + `GET /periods/{id}/balance`), BottomNav с 4 табами (3 — заглушки до Phase 18+).

</domain>

<decisions>
## Implementation Decisions

### Technology Stack (Locked)
- **Swift 5.10**, **SwiftUI**, **iOS 17.0+** — даёт `@Observable`, `NavigationStack`, `MeshGradient` (на iOS 18+).
- **Без сторонних библиотек** — vanilla URLSession + Codable + Swift Concurrency. Решено в плане.
- **Naming:** `BudgetPlanner.xcodeproj` в папке `/ios/`. Bundle ID — `com.exeynod.BudgetPlanner` (placeholder, пользователь может перебить через Xcode).
- **Min iOS 17.0** — у владельца iPhone 14 Pro Max + iPhone 17 Pro, оба поддерживают.
- **Локализация только русский** на старте.
- **Темы:** System (auto light/dark). Aurora Light для светлой, Mesh Dark для тёмной.

### Backend Auth Extension (Locked)
- **Новый endpoint** `POST /api/v1/auth/dev-exchange` с body `{secret: str}` → `{token: str, tg_user_id: int}`.
- **Бэкенд config:** `DEV_AUTH_SECRET: str | None = None`. При None → 503. При несовпадении → 403. При успехе — генерируется long-lived токен (32 байта random hex), хранится в новой таблице `auth_token` (id, token_hash через bcrypt/sha256, user_id FK, created_at, last_used_at, revoked_at).
- **`get_current_user`** расширяется: сначала пробует `Authorization: Bearer ...` (если есть → находит токен по `token_hash` и достаёт user); fallback на `X-Telegram-Init-Data` (текущая логика).
- **Token revocation:** не реализуется в Phase 17 (отложено). Сейчас токен живёт вечно.
- **Token format:** `secrets.token_hex(32)` (64-character hex string). Хранение — sha256 hash для защиты от чтения БД.

### iOS Project Structure (Locked, см. план)
```
ios/BudgetPlanner/
├── App/ — BudgetPlannerApp, AppRouter
├── Design/ — Tokens, GlassMaterial, AuroraBackground, MeshDarkBackground, CategoryVisuals
├── Networking/ — APIClient, APIError, DTO/, Endpoints/
├── Auth/ — AuthStore, DevTokenSetupView, KeychainStore
├── Domain/ — (Phase 18 fills with Period, MoneyFormatter, MoneyParser)
├── Features/Onboarding/, Features/Home/, Features/Common/ (BottomNav, заглушки)
└── Resources/, Tests/
```

### Xcode Project Creation Strategy
- **Manual user step:** пользователь создаёт пустой Xcode-проект через Xcode → File → New → Project → iOS → App → SwiftUI → Storage: None → языковой код Swift. Я даю пошаговую инструкцию с скриншотом-описанием.
- **После creation:** я заполняю всю структуру файлами через Write. Пользователь добавляет файлы через Xcode → File → Add Files (или drag-and-drop). Возможна alternative: я создам `project.yml` для XcodeGen, но это вводит зависимость — отклонено.
- **Build verification:** `xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build` — пользователь запускает после filling.

### iOS API Base URL
- **Dev:** `http://localhost:8000` (хардкод в конфиге для dev). Пользователь может изменить в Settings или через переменную окружения `BACKEND_URL` в Xcode scheme.
- **Production (для TestFlight, Phase 21):** будет `https://<cloudflare-tunnel-domain>` (известно из memory `infra-deploy.md`).

### Decisions deferred
- **Token revocation flow:** не делаем сейчас. Если токен скомпрометирован — пользователь напрямую удаляет из БД или мы добавим в Phase 18+.
- **APNs:** не делаем сейчас. Локальные нотификации в Phase 19. APNs опционально в Phase 21.
- **Telegram Login Widget:** не делаем сейчас. Заменяем dev-token в Phase 21.

### Claude's Discretion
Все imp детали Swift-кода (имена переменных, структура error-handling, способ моделирования AsyncStream для SSE — пока заглушка для Phase 20) — на моё усмотрение, пока соответствует плану и SwiftUI-конвенциям.

</decisions>

<code_context>
## Existing Code Insights

**Backend:**
- `app/api/dependencies.py` — содержит `get_current_user` с TG initData валидацией. Расширение должно сохранить current behavior для web-фронта.
- `app/core/config.py` — Pydantic Settings, добавить `DEV_AUTH_SECRET: str | None = None`.
- `app/db/models.py` — модели SQLAlchemy. Добавить `AuthToken`.
- `migrations/versions/` — Alembic. Последняя миграция — `0007_*` (split admin/app role). Новая → `0008_add_auth_token.py`.
- `app/api/router.py` — registry для public_router. Зарегистрировать новый `auth_router`.
- `app/api/routes/` — добавить `auth.py`.
- `app/api/schemas/` — добавить `auth.py` (DevExchangeRequest/Response).
- `tests/api/` — добавить `test_auth_dev_exchange.py`.
- **NB по memory `feedback-restart-services.md`:** после правок кода я сам пересобираю docker-сервисы (`docker compose up -d --build api`).

**iOS:** новая папка `/ios/`, всё новое. Xcode-проект пользователь создаст руками, дальше я заполняю.

**Web frontend (для re-use):**
- `frontend/src/styles/tokens.css` — токены для копирования в `Tokens.swift`.
- `frontend/src/utils/categoryVisuals.ts` — для копирования в `CategoryVisuals.swift` (Phase 18).
- `frontend/src/api/client.ts` — pattern для APIClient.
- Web фронт продолжает работать с TG initData без изменений.

**Existing tests:** `tests/api/` — pytest async с FastAPI TestClient. Pattern — fixture `client`, mock через `monkeypatch`.

</code_context>

<specifics>
## Specific Ideas

### Plan breakdown (anticipated, для plan-phase)

1. **17-01 backend-auth-token-model** — миграция `0008_add_auth_token.py` + модель `AuthToken` в `app/db/models.py`.
2. **17-02 backend-dev-exchange-endpoint** — `app/api/routes/auth.py` + `app/api/schemas/auth.py` + `DEV_AUTH_SECRET` в config + регистрация в `router.py`. Pytest 4 cases.
3. **17-03 backend-bearer-fallback** — расширение `get_current_user` в `app/api/dependencies.py`. Pytest 2 cases (Bearer works, initData still works).
4. **17-04 ios-xcode-setup-instructions** — пошаговая INSTR.md в `ios/SETUP.md` для пользователя + скрипт `ios/scripts/verify-build.sh` для smoke-проверки. Этот плэн blocks дальнейшие — после него пользователь должен подтвердить что Xcode-проект создан.
5. **17-05 ios-design-tokens** — `Design/Tokens.swift` (Color, Font, CGFloat extensions), `Design/GlassMaterial.swift`, `Design/AuroraBackground.swift`, `Design/MeshDarkBackground.swift`. Snapshot-test через SwiftUI preview rendering на стороне пользователя.
6. **17-06 ios-api-client** — `Networking/APIClient.swift` (URLSession + decoder + Bearer header), `APIError.swift`, `DTO/User.swift`, `DTO/Category.swift`, `DTO/Period.swift`, `DTO/Balance.swift`, `DTO/Onboarding.swift`. Endpoints: `MeAPI`, `PeriodsAPI`, `OnboardingAPI`. Stub-test через URLProtocol mock.
7. **17-07 ios-auth** — `Auth/KeychainStore.swift`, `Auth/AuthStore.swift` (@Observable), `Auth/DevTokenSetupView.swift`. POST к `/auth/dev-exchange`, кладёт token в Keychain.
8. **17-08 ios-onboarding** — `Features/Onboarding/OnboardingView.swift` + 4 степа (имя/cycle/balance/promo) + `Features/Common/MainButton.swift` + integration с `OnboardingAPI`.
9. **17-09 ios-home** — `Features/Home/HomeView.swift` + `HeroCard.swift` + `DashboardCategoryRow.swift` + `ForecastCard.swift` + `PeriodSwitcher.swift` через `PeriodsAPI`.
10. **17-10 ios-bottomnav-app-shell** — `App/BudgetPlannerApp.swift` (entry point), `App/AppRouter.swift` (auth-gate + onboarding-gate routing), `Features/Common/BottomNav.swift` с 4 табами (Home — реальный, остальные — заглушки `Text("Coming in Phase 18")`).

### Acceptance criteria (от REQUIREMENTS)

- IOSAUTH-01: pytest c valid Bearer + initData fallback
- IOSAUTH-02: pytest 4 cases (valid/invalid/no-env/repeat-exchange)
- IOS-01: `xcodebuild build` успех
- IOS-02: snapshot-тест (manual)
- IOS-03: manual smoke (theme switch)
- IOS-04: integration test через URLProtocol mock
- IOS-06: manual UAT (first launch → setup → home, restart → home)
- IOS-07: integration test (401 → unauth state)
- IOS-10: manual UAT (4-step onboarding)
- IOS-11: manual UAT (HeroCard + top-3 + Forecast + PeriodSwitcher с реальными числами)

### Тестовая стратегия

- **Backend:** pytest async, 100% покрытие новых endpoints + расширения dependency.
- **iOS:** XCTest для unit-логики (APIClient через URLProtocol mock); manual UAT для UI на Simulator.
- **Backend regression:** все существующие pytest продолжают проходить (web initData flow не сломан).

</specifics>

<deferred>
## Deferred Ideas

- Token rotation/revocation API (deferred to v0.7+)
- TG Login Widget (Phase 21)
- Sign in with Apple (Phase 21)
- APNs (Phase 21 optional)
- Periods cache offline (out of scope per REQUIREMENTS)
- Apple Watch / Widgets / iPad (post-v0.6)

</deferred>
