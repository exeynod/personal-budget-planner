# iOS Setup

Phase 17 (v0.6 iOS App). Проект использует **XcodeGen** — `.xcodeproj` генерируется из `project.yml`, не хранится в git.

## Quick start (Mac)

```bash
brew install xcodegen          # один раз
cd ios && xcodegen generate    # создаёт BudgetPlanner.xcodeproj
open BudgetPlanner.xcodeproj   # открывает в Xcode
```

В Xcode: Cmd+R (по умолчанию destination — iPhone 17 Pro Simulator).

## Что уже подготовлено

- ✅ `project.yml` — XcodeGen конфиг (iOS 17.0+, SwiftUI, Bundle ID `com.exeynod.BudgetPlanner`).
- ✅ `BudgetPlanner/Info.plist` с `NSAllowsLocalNetworking` + localhost ATS exception.
- ✅ Все Swift-файлы в `BudgetPlanner/` уже распределены по группам (App / Design / Networking / Auth / Domain / Features).
- ✅ Schema env vars: `BACKEND_URL=http://localhost:8000` (xcodegen из `project.yml`).
- ✅ `.gitignore` — `.xcodeproj`, DerivedData, xcuserdata.

## Backend prerequisites

1. Backend запущен (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`).
2. В корневом `.env` выставлен `DEV_AUTH_SECRET=<your-secret>` (это значение ты вводишь в первом экране приложения).
3. Если правил `.env` — пересобрать api: `docker compose up -d --build api`.

Smoke-проверка backend:
```bash
curl -X POST http://localhost:8000/api/v1/auth/dev-exchange \
  -H "Content-Type: application/json" \
  -d '{"secret":"<your-secret>"}'
# → {"token":"...","tg_user_id":<owner_tg_id>}
```

## Запуск

### Simulator (без $99 Apple Developer)

```bash
cd ios
xcodegen generate
open BudgetPlanner.xcodeproj
# В Xcode: select iPhone 17 Pro destination → Cmd+R
```

Альтернатива через CLI без открытия Xcode:
```bash
xcodebuild -scheme BudgetPlanner \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null
APP=$(xcodebuild -showBuildSettings -scheme BudgetPlanner | awk '/BUILT_PRODUCTS_DIR/ {print $3}' | head -1)
xcrun simctl install booted "$APP/BudgetPlanner.app"
xcrun simctl launch booted com.exeynod.BudgetPlanner
open -a Simulator
```

### Real device (iPhone 14 Pro Max / 17 Pro)

1. Подключить iPhone к Mac.
2. В Xcode: Project → Signing & Capabilities → выбрать твой Apple ID как Team (Personal Team — без $99).
3. Edit Scheme → Run → Destination → твой iPhone.
4. Cmd+R (на iPhone после первой установки: Settings → General → VPN & Device Management → trust Personal Team profile).
5. Сборка протухает через 7 дней без $99 Developer Account.

> ⚠️ На устройстве `localhost` не работает. Для real-device теста — поднять backend на LAN IP Mac (`http://192.168.x.x:8000`) или использовать Tailscale (см. memory `infra-deploy.md`). Изменить `BACKEND_URL` в Edit Scheme → Environment Variables.

## Что проверить (UAT Phase 17)

1. **Первый запуск:** открывается экран "BudgetPlanner / Введите DEV_AUTH_SECRET". Aurora фон работает.
2. **Auth:** ввести значение `DEV_AUTH_SECRET` → "Войти".
   - Если onboarded → Home с балансом периода.
   - Если не onboarded → 4-шаговый Onboarding.
3. **Onboarding flow:** имя → cycle_start_day (picker) → starting_balance (поддерживает "1 500,50") → toggle "Создать категории" → "Готово" → переход на Home.
4. **Home parity:** числа HeroCard совпадают с web Mini App для того же периода.
5. **Persistence:** force-quit + reopen → сразу Home (без DevTokenSetupView).
6. **Tab navigation:** 4 таба внизу. Home — рабочий, остальные — заглушки "Будет в Phase N" (это норма для Phase 17).

## Перегенерация при добавлении файлов

При добавлении новых `.swift` файлов в `BudgetPlanner/` (Phase 18-21):
```bash
cd ios && xcodegen generate
# → новые файлы автоматически попадут в target
```

Никаких ручных шагов в Xcode.

## Troubleshooting

- **"unable to find utility xcodebuild":** Xcode Command Line Tools не выбраны. `sudo xcode-select -s /Applications/Xcode.app`.
- **Build fails с "No Account for Team":** в Xcode → Settings → Accounts → войти через Apple ID. Затем в `project.yml` settings.base.DEVELOPMENT_TEAM выставить свой Team ID, или оставить пустым и подписать через Xcode UI.
- **Network error в приложении:** проверить что api контейнер healthy (`docker compose ps`) и `curl http://localhost:8000/api/v1/me` отвечает 200 (DEV_MODE bypass).
- **DevTokenSetupView показывает "DEV_AUTH_SECRET не настроен":** в корневом `.env` нет переменной, либо api не пересобран после правок (`docker compose up -d --build api`).
