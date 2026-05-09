# TestFlight Distribution Guide

Phase 21 (v0.6 iOS App). Этот документ — пошаговая инструкция для выпуска приложения в TestFlight для друга.

## Чек-лист prerequisites

- [ ] **Apple Developer Account** — $99/год. Регистрация: https://developer.apple.com/programs/enroll/
  - Способ оплаты: карта, привязанная к Apple ID. Российские карты не работают — нужна зарубежная (или iTunes Gift Card USA через https://offgamers.com).
  - Обработка заявки: 24-48ч обычно. После approve → доступ к App Store Connect.
- [ ] **Xcode → Settings → Accounts** — войти через Apple ID, проверить что Team имеет статус Apple Developer Program (не "Free Provisioning").
- [ ] **App ID** — зарегистрировать `com.exeynod.BudgetPlanner` в developer.apple.com → Certificates → Identifiers → App IDs.
- [ ] **App Store Connect** → Apps → "+" → New App → выбрать Bundle ID, заполнить Name, Primary Language (RU), SKU.

## Шаги распространения

### 1. Подготовка backend для production

Бэкенд должен быть доступен из публичного Cloudflare Tunnel (см. memory `infra-deploy.md`). Хардкоднутый `localhost:8000` не подойдёт — заменить на публичный URL.

В `ios/project.yml`:
```yaml
scheme:
  environmentVariables:
    BACKEND_URL: https://your-tunnel.example.com
    # DEV_AUTH_AUTOLOGIN_SECRET — НЕ ставить в prod scheme
```

После TestFlight: на bind production `.env` должна содержать новый production-grade `DEV_AUTH_SECRET` (или включён Telegram Login Widget — см. шаг 4).

### 2. Замена dev-token flow на безопасный auth

Опции:

#### Вариант А: Sign in with Apple (рекомендую)
Преимущества:
- Native UX, кнопка-стандарт.
- Apple ID = unique identifier, не нужен ручной whitelist.
- Бэкенд получает identity token → проверяет через Apple servers.

Шаги:
1. В Xcode: Project → Signing & Capabilities → "+ Capability" → "Sign In with Apple".
2. На бэке добавить endpoint `POST /api/v1/auth/apple-exchange` который принимает Apple identity_token, валидирует через apple.com/.well-known/jwks.json, проверяет sub-claim против OWNER_TG_ID или admin whitelist (Phase 13), и выдаёт Bearer token.
3. На iOS заменить DevTokenSetupView на SignInWithAppleButton:
   ```swift
   import AuthenticationServices
   SignInWithAppleButton(.signIn, onRequest: { request in
       request.requestedScopes = [.email]
   }, onCompletion: { result in
       // получить authorizationCode/identityToken → POST /auth/apple-exchange
   })
   ```

#### Вариант Б: Telegram Login Widget через WKWebView
Преимущества:
- Используем существующий TG account проекта.
- Бэкенд переиспользует HMAC-валидацию (та же что initData, но другой формат payload).

Шаги:
1. Bot @BotFather → `/setdomain` → задать домен (Cloudflare tunnel host).
2. На фронте: WKWebView загружает `https://oauth.telegram.org/auth?bot_id=<id>&origin=...&request_access=write` → пользователь логинится → callback с auth_data + hash.
3. Native iOS вытаскивает auth_data из WebView (через JS-bridge) → POST /api/v1/auth/telegram-exchange → бэк валидирует HMAC от bot_token (без `WebAppData` salt!) → выдаёт Bearer token.

### 3. Подпись и сборка

1. В Xcode → BudgetPlanner target → Signing & Capabilities:
   - Team: твой paid Developer Team (не Personal Team).
   - Provisioning Profile: Automatic.
   - Bundle Identifier: `com.exeynod.BudgetPlanner`.
2. Product → Archive (`Cmd+Shift+B`, потом `Product → Archive`).
3. После сборки откроется Organizer → выбрать архив → "Distribute App" → "App Store Connect" → "Upload".

### 4. App Store Connect

После upload:
1. App Store Connect → Apps → BudgetPlanner → TestFlight.
2. Дождаться processing (10-20 мин).
3. Под "iOS Builds" нажать на новую версию → заполнить "What to Test" + "Test Information" (email обратной связи, privacy URL).
4. Если External Testing: пройти "Beta App Review" (~24ч). Internal — не нужно.
5. **Internal Testers** → "+" → ввести email друга. Apple отправит invite-email.

### 5. Друг устанавливает

Друг получает email "BudgetPlanner is now available to test":
1. Тапает ссылку на iPhone → открывается TestFlight (если не установлен — App Store).
2. В TestFlight: "Accept" → "Install".
3. Запускает BudgetPlanner → проходит auth (Sign in with Apple / TG Login).
4. Onboarding или Home.

## Privacy manifest

`Resources/PrivacyInfo.xcprivacy` уже создан и содержит:
- `NSPrivacyCollectedDataTypeOtherFinancialInfo` (linked, для AppFunctionality, не для tracking)
- `NSPrivacyAccessedAPICategoryUserDefaults` с reason CA92.1 (хранение пользовательских настроек)
- NSPrivacyTracking = false (не трекаем рекламные ID)

**Что НЕ забыть** при first App Store submission:
- Заполнить App Privacy Details в App Store Connect → App Privacy → "+":
  - Data Type: Financial Info → Other Financial Info → Yes → "App Functionality"
  - Не linked to user identity? → Linked.
  - Used for tracking? → No.

## App Icon

Создать иконку 1024×1024 PNG (без альфа-канала, без transparency).
Варианты:
- Сгенерировать через https://www.figma.com/community/plugin/1208407829111569329 (App Icon Generator)
- Использовать Apple's Icon Composer
- Захотеть — написать SwiftUI rendering для генерации иконки (Tokens.Accent.primary lock-shield на cream-фоне).

Положить в `BudgetPlanner/Resources/Assets.xcassets/AppIcon.appiconset/`. XcodeGen автоматически подцепит.

## Launch Screen

В `Info.plist` уже задано `UILaunchScreen` (пустой dict) → Apple отрендерит дефолтный белый экран.

Для кастомного — создать `LaunchScreen.storyboard` или использовать `UILaunchStoryboardName` в Info.plist. Опционально для Phase 21.

## Build version bump

При каждом upload в App Store Connect — bump версии в `project.yml`:
```yaml
properties:
  CFBundleShortVersionString: "0.6.1"   # incrementally
  CFBundleVersion: "2"                   # always increment
```

После — `xcodegen generate` + Archive.

## Checklist на финальную сборку

- [ ] Apple Developer Account активен
- [ ] Bundle ID `com.exeynod.BudgetPlanner` зарегистрирован
- [ ] App создан в App Store Connect
- [ ] Sign in with Apple ИЛИ TG Login Widget — backend endpoint готов
- [ ] iOS: DevTokenSetupView заменён или скрыт за `#if DEBUG`
- [ ] BACKEND_URL на production tunnel
- [ ] App Icon 1024×1024 в Assets
- [ ] PrivacyInfo.xcprivacy на месте
- [ ] App Privacy Details заполнен в App Store Connect
- [ ] Build version bumped
- [ ] Archive + Upload через Organizer
- [ ] Internal Tester (друг) добавлен
