# iOS Setup Instructions

Phase 17 (v0.6 iOS App). Follow these steps once — потом просто Cmd+R в Xcode.

## 1. Создать Xcode-проект

1. Open **Xcode** → File → New → Project
2. Выбрать **iOS → App** → Next
3. Заполнить:
   - **Product Name:** `BudgetPlanner`
   - **Team:** твой Apple ID (Personal Team — без $99 на dev-фазе)
   - **Organization Identifier:** `com.exeynod` (или другой свой)
   - **Bundle Identifier:** auto = `com.exeynod.BudgetPlanner`
   - **Interface:** SwiftUI
   - **Language:** Swift
   - **Storage:** None
   - ☐ Include Tests (unchecked — тесты добавим вручную позже)
4. **Save location:** `/Users/exy/pet_projects/tg-budget-planner/ios/` ⚠️ **Создать здесь, чтобы папка совпала с уже подготовленной структурой.**
5. Если Xcode создаст вложенную папку `ios/BudgetPlanner/BudgetPlanner/...` — двинь содержимое одной директорией выше или просто оставь как есть (мы потом добавим файлы из готовой `ios/BudgetPlanner/`).

## 2. Настроить минимальную iOS-версию

1. В Project Navigator выделить **BudgetPlanner** project (top item).
2. Выбрать target **BudgetPlanner**.
3. Tab **General → Minimum Deployments** → **iOS 17.0**

## 3. Добавить готовые файлы из `ios/BudgetPlanner/`

В Xcode: File → Add Files to "BudgetPlanner"... → выбрать все папки кроме того что Xcode уже создал:

- `App/` (заменит существующий `BudgetPlannerApp.swift`)
- `Design/`
- `Networking/`
- `Auth/`
- `Domain/`
- `Features/`
- `Resources/Localizable.xcstrings` если есть

В диалоге выбрать:
- ☑ Copy items if needed: **uncheck** (ссылки на уже существующие файлы)
- ☑ Create groups
- Add to targets: ☑ BudgetPlanner

## 4. Настроить Backend URL

В Xcode → Edit Scheme → Run → Arguments → Environment Variables — добавить:

| Name | Value |
|---|---|
| `BACKEND_URL` | `http://localhost:8000` |
| `DEV_AUTH_SECRET` | (значение из `.env` корня проекта — нужно для первого запуска DevTokenSetupView) |

> Альтернатива: захардкодить в `Networking/APIClient.swift` (на dev). Production URL для TestFlight — задавать в Phase 21.

## 5. Настроить Info.plist для localhost HTTP

Симулятор не разрешает clear-text HTTP по умолчанию. Добавить в Info.plist:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

Или через Xcode → BudgetPlanner target → Info → Custom iOS Target Properties → плюс →
- Key: `App Transport Security Settings`
- Type: Dictionary
- Внутри: `Allow Local Networking` = `YES`

## 6. Запуск

1. **Simulator:** Cmd+R на BudgetPlanner scheme, destination = iPhone 15 Pro (или iPhone 17 Pro)
2. **Real device (iPhone 14 Pro Max или 17 Pro):**
   - Подключить USB-C / Lightning
   - В Xcode выбрать своё устройство как destination
   - На iPhone: **Settings → General → VPN & Device Management** → доверить Personal Team profile (только при первой сборке)
   - Cmd+R
   - Сборка протухает через 7 дней без $99 Developer Account

## 7. Verify

После Cmd+R должен открыться **DevTokenSetupView** — экран ввода секрета.

Шаги UAT:
1. Ввести значение `DEV_AUTH_SECRET` из `.env` → Submit
2. iOS вызывает `POST http://localhost:8000/api/v1/auth/dev-exchange` → получает Bearer-токен → кладёт в Keychain.
3. Если onboarding не завершён → показывается **OnboardingView** (4 шага).
4. После onboarding → **HomeView** с балансом текущего периода.
5. Перезапуск приложения — DevTokenSetupView НЕ показывается, сразу Home.

Если backend недоступен — UI покажет error-state.

---

## Troubleshooting

- **"App Transport Security blocked"**: повторить шаг 5.
- **"Untrusted Developer"**: шаг 6 — доверить Personal Team на iPhone.
- **"DEV_AUTH_SECRET not configured" → 503 от endpoint**: проверить что переменная в `.env` корня проекта установлена и api-контейнер пересобран (`docker compose up -d --build api`).
- **Cmd+R не находит файлы**: убедиться что папки добавлены в target (Xcode → File Inspector → Target Membership ✓ BudgetPlanner для каждого .swift).
