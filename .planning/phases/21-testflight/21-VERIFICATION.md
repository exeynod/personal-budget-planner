---
phase: 21
status: human_needed
date: 2026-05-09
---

# Phase 21 Verification: TestFlight Distribution

## Code/Doc Status

**BUILD SUCCEEDED** на Simulator с подключённым `PrivacyInfo.xcprivacy`.

Файлы готовы:
- `ios/BudgetPlanner/Resources/PrivacyInfo.xcprivacy` — privacy manifest
  (NSPrivacyCollectedDataTypeOtherFinancialInfo для AppFunctionality, не tracking;
  UserDefaults usage с reason CA92.1).
- `ios/TESTFLIGHT.md` — пошаговая дистрибуция (8 шагов от Apple Developer
  enrollment до internal tester invitation).
- `project.yml` обновлён для включения PrivacyInfo.xcprivacy в build phase.

## Acceptance per REQ

| REQ | Status |
|---|---|
| IOS-17 (Apple Developer + auth swap) | ⏳ требует $99 + manual enrollment |
| IOS-18 (App Store Connect upload) | ⏳ требует $99 + Archive + Upload |

## Что нужно от пользователя

1. **Купить Apple Developer Program** — $99/год (https://developer.apple.com/programs/enroll/).
   Российские карты не работают; через iTunes Gift Card USA или зарубежная карта.
2. **Решить auth-стратегию:**
   - **Sign in with Apple** (рекомендую) — native UX, минимум backend изменений.
     Требует backend endpoint `/auth/apple-exchange` с JWT валидацией.
   - **Telegram Login Widget** — переиспользует TG account. Требует
     `/auth/telegram-exchange` + WKWebView в iOS.
3. **Backend на public Cloudflare Tunnel** — заменить `BACKEND_URL=http://localhost:8000`
   на public URL.
4. **Создать App Icon 1024×1024 PNG** и положить в Assets.xcassets/AppIcon.
5. **Регистрация в App Store Connect** — создать App, заполнить Privacy Details.
6. **Archive + Upload через Xcode Organizer.**
7. **TestFlight Internal Tester** — добавить email друга.
8. **Друг ставит TestFlight + ваше приложение по invite link.**

## Manual UAT после установки другом

1. Друг получает email от TestFlight.
2. Открывает на iPhone → переход в TestFlight → Install.
3. Запускает BudgetPlanner → видит auth-экран (Apple Sign-in или TG Login).
4. После auth → Onboarding или Home.
5. Создаёт транзакцию через FAB → видна в HistoryView.

Phase 21 — финиш milestone v0.6 iOS App.
