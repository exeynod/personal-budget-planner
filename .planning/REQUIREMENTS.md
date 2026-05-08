# Requirements: TG Budget Planner — v0.6 iOS App

**Defined:** 2026-05-08
**Core Value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.
**Milestone Goal:** Native iOS-приложение (SwiftUI), эквивалентное существующему TG Mini App. Backend остаётся неизменным — добавляется только альтернативный auth-механизм для нативного клиента (Bearer token вместо TG initData). MVP — личное использование на iPhone владельца, расширение до TestFlight для друга после оплаты Apple Developer Account.

**План и архитектура:** `~/.claude/plans/tender-hopping-simon.md`

## v1 Requirements

Требования сформулированы как user-feature («пользователь может X») и system-property для backend-частей. Каждое — atomic, с конкретным acceptance test. REQ-ID continue numbering: используются новые префиксы `IOS-*`, `IOSAUTH-*`, `IOSAI-*` чтобы не конфликтовать с web-аналогами.

### Backend Auth Extension

- [ ] **IOSAUTH-01**: Backend принимает `Authorization: Bearer <token>` как альтернативу `X-Telegram-Init-Data` — `get_current_user` пытается Bearer-валидацию первой, fallback на initData при отсутствии заголовка.
  - **Acceptance:** pytest с двумя test-cases: (a) запрос с валидным Bearer возвращает 200 и правильный `tg_user_id`; (b) запрос с `X-Telegram-Init-Data` без Bearer всё ещё работает (web-фронт не сломан).
  - **File:** `app/api/dependencies.py`
- [ ] **IOSAUTH-02**: Endpoint `POST /api/v1/auth/dev-exchange` принимает `{secret: str}` и при совпадении с `DEV_AUTH_SECRET` возвращает long-lived Bearer-токен для `OWNER_TG_ID`.
  - **Acceptance:** pytest 4 cases — (a) валидный secret → 200 + token + `tg_user_id`; (b) пустой/неверный secret → 403; (c) `DEV_AUTH_SECRET` не задан в env → 503; (d) повторный exchange выдаёт новый токен (старый продолжает работать до revoke).
  - **Files:** `app/api/routes/auth.py` (новый), `app/api/schemas/auth.py` (новый), `app/db/models.py` (модель `AuthToken`), `migrations/versions/<new>_add_auth_token.py`, `app/core/config.py` (`DEV_AUTH_SECRET`).

### iOS Foundation

- [ ] **IOS-01**: Создан Xcode-проект `BudgetPlanner.xcodeproj` (iOS 17.0+, SwiftUI app target) в новой папке `/ios/`. Проект собирается на Simulator iPhone 15 Pro без ошибок.
  - **Acceptance:** `xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build` возвращает успех.
- [ ] **IOS-02**: Дизайн-токены портированы из `frontend/src/styles/tokens.css` в `ios/BudgetPlanner/Design/Tokens.swift` — те же цвета (accent, bg-cream, cat-*), радиусы, шрифты San Francisco через `.system(size:weight:)`.
  - **Acceptance:** Snapshot-тест на хост-views с использованием `Color.accent`, `.radiusGlass`, etc. — рендеринг визуально соответствует web-версии (manual visual diff).
- [ ] **IOS-03**: Фоны Aurora Light + Mesh Dark реализованы как SwiftUI-вьюхи (`MeshGradient` для iOS 18+, `LinearGradient` fallback для iOS 17). Glass-эффект через нативный `Material` (`.ultraThinMaterial` / `.thickMaterial`).
  - **Acceptance:** Manual smoke на Simulator — фоны переключаются по светлой/тёмной теме системы.

### iOS Networking

- [ ] **IOS-04**: `APIClient` (URLSession + JSONDecoder с ISO-8601 date strategy) обрабатывает все CRUD endpoints из web-версии — categories, periods, planned, actual, subscriptions, template, settings, onboarding, analytics.
  - **Acceptance:** Integration-тесты против локального dev-backend (через `URLProtocol` mock) — каждый endpoint отвечает 200 и DTO декодируется без ошибок.
  - **Files:** `ios/BudgetPlanner/Networking/APIClient.swift`, `ios/BudgetPlanner/Networking/DTO/*.swift`, `ios/BudgetPlanner/Networking/Endpoints/*.swift`.
- [ ] **IOS-05**: SSE-клиент через `URLSession.bytes(for:)` парсит события `/ai/chat` — каждая `data: {...}` строка декодируется в `SSEEvent` enum (message_delta / message_complete / tool_call / tool_result / usage / error).
  - **Acceptance:** Integration-тест с mock SSE-stream проверяет что AsyncStream<SSEEvent> отдаёт события в правильном порядке для типичного scenario "user message → 2 tool calls → assistant response".

### iOS Auth

- [ ] **IOS-06**: При первом запуске приложение показывает `DevTokenSetupView` — пользователь вводит `DEV_AUTH_SECRET`, приложение вызывает `POST /api/v1/auth/dev-exchange`, токен кладётся в Keychain. При повторных запусках экран не показывается.
  - **Acceptance:** UI-тест на Simulator: первый запуск → setup-screen → ввод секрета → переход на Home; перезапуск → сразу Home без запроса секрета.
- [ ] **IOS-07**: Все запросы к API включают `Authorization: Bearer <token>` из Keychain. При 401/403 — токен инвалидируется, пользователь возвращается на `DevTokenSetupView`.
  - **Acceptance:** Integration-тест: APIClient с истёкшим токеном получает 401 → next запрос содержит auth-trigger → AuthStore переключает state на `unauthenticated`.

### iOS Domain Logic

- [ ] **IOS-08**: `period_for(date, cycle_start_day) -> (date, date)` портирован 1:1 из `app/core/period.py` в `ios/BudgetPlanner/Domain/Period.swift` через `Calendar` с `TimeZone(identifier: "Europe/Moscow")`.
  - **Acceptance:** Все тест-кейсы из `tests/test_period.py` повторены в Swift `PeriodForTests` — выдают идентичные `(period_start, period_end)` пары.
- [ ] **IOS-09**: `MoneyFormatter` (NumberFormatter ru-RU, "1 500,50") и `MoneyParser` (digit-walk без `Float`, как `parseRublesToKopecks` из `frontend/src/utils/format.ts`) реализованы и покрыты тестами.
  - **Acceptance:** XCTest cases — формат "100" → 10000 cents, "1 500,50" → 150050 cents, "1.500,50" → 150050 cents (точки как разделители тысяч), "abc" → nil.

### iOS Onboarding & Home

- [ ] **IOS-10**: 4-step `OnboardingView` (имя / cycle_start_day / starting_balance / promo) с `MoneyParser` для balance-input. По завершению — `POST /api/v1/onboarding/complete`.
  - **Acceptance:** Manual UAT — новый user проходит 4 шага → сервер возвращает 200 + period_id → переход на Home.
- [ ] **IOS-11**: `HomeView` показывает `HeroCard` (баланс + дельта), top-3 категории по расходам, `ForecastCard`, `PeriodSwitcher`. Данные из `GET /periods/current` + `GET /periods/{id}/balance`.
  - **Acceptance:** Manual UAT — Home показывает те же числа что web-версия для одного и того же user/period.

### iOS Core CRUD

- [ ] **IOS-12**: `TransactionsView` с sub-tabs History/Planned. `HistoryView` — `List` actual-транзакций с группировкой по дате и swipe-actions (Edit / Delete). `PlannedView` — `List` категорий с дельтами и inline-редактором `CapEditSheet`.
  - **Acceptance:** Manual UAT — создание/редактирование/удаление транзакции отражается на бэке (видно в web-версии).
- [ ] **IOS-13**: `TransactionEditor` bottom-sheet (`.sheet(presentationDetents: [.medium, .large])`) — поля amount (через `MoneyParser`), category-picker, date-picker, description. Submit вызывает `POST /actual` или `POST /planned`.
  - **Acceptance:** Manual UAT — открытие редактора через FAB, заполнение, save → транзакция появляется в History.
- [ ] **IOS-14**: `CategoriesView` (CRUD категорий + archive) и `SettingsView` (cycle_start_day / notify_days_before / AI toggle) подключены к существующим API.
  - **Acceptance:** Manual UAT — изменение категории / настройки на iOS отражается в web-версии при следующем рефреше.

### iOS Management

- [ ] **IOS-15**: `SubscriptionsView` + `SubscriptionEditor` подключены к `GET/POST/PATCH/DELETE /subscriptions`. `LocalNotifications.swift` планирует `UNCalendarNotificationTrigger` для каждой `is_active` подписки на `next_charge_date - notify_days_before` дней в 09:00.
  - **Acceptance:** Manual UAT — подписка с `next_charge_date` завтра + `notify_days_before=1` → локальная нотификация показывается в 09:00 (можно ускорить через изменение системного времени или короткий test-trigger 5s).
- [ ] **IOS-16**: `TemplateView` показывает шаблон плана (`GET /template/items`) и кнопку "Применить к периоду" (`POST /periods/{id}/apply-template`). `AnalyticsView` — Swift Charts (top categories, line chart trend, forecast).
  - **Acceptance:** Manual UAT — apply-template создаёт планы видимые в `PlannedView`; графики отображают реальные данные из `/analytics/*`.

### iOS AI

- [ ] **IOSAI-01**: `AIChatView` стримит ответы AI через SSE. Каждый message_delta дописывается в текущее сообщение в `ScrollViewReader`. `ToolUseIndicator` (pulse-анимация) показывается во время `tool_call`.
  - **Acceptance:** Manual UAT — пользователь пишет "сколько на еду в марте" → текст печатается посимвольно → tool-indicator пульсирует → итоговый ответ отображается.
- [ ] **IOSAI-02**: `AIProposalSheet` открывается при `tool_call: propose_actual_transaction` или `propose_planned_transaction`. Содержит pre-filled form. На "Сохранить" — стандартный `POST /actual|planned`. На "Изменить" — переход в `TransactionEditor`.
  - **Acceptance:** Manual UAT — пользователь пишет "записал 500 на кофе" → AI показывает proposal-sheet с amount=500, category=Кафе → save → транзакция в History.

### TestFlight Distribution

- [ ] **IOS-17**: Apple Developer Account активирован, App ID зарегистрирован, certificates + provisioning profiles настроены. Telegram Login Widget через `WKWebView` ИЛИ Sign in with Apple заменяет dev-token flow.
  - **Acceptance:** Manual UAT — друг получает TestFlight invite → ставит → авторизуется через TG Login или Sign in with Apple → видит Onboarding или Home.
- [ ] **IOS-18**: Иконка приложения, Launch Screen, скриншоты, privacy manifest (`PrivacyInfo.xcprivacy`) — настроены. Билд загружен в App Store Connect и доступен в TestFlight для internal-tester.
  - **Acceptance:** Билд виден в App Store Connect → TestFlight → Internal Testing → friend's email добавлен в тестеры.

## Future Requirements (deferred to post-v0.6)

| ID | Feature | Reason for deferral |
|----|---------|---------------------|
| IOS-FUT-01 | Apple Watch companion | Outside MVP scope, требует отдельного target |
| IOS-FUT-02 | iOS Widgets (Home Screen / Lock Screen) | Требует WidgetKit-кода, отдельная фаза |
| IOS-FUT-03 | iPad split-view layout | Single-tenant pet, фокус на iPhone |
| IOS-FUT-04 | Offline-режим с локальной БД (SwiftData) | Сильно усложняет state-management; web-версия онлайн-only |
| IOS-FUT-05 | Apple Sign-in for friend access | Требуется только если расширяем доступ — пока single-tenant |
| IOS-FUT-06 | macOS Catalyst-сборка | Не запрашивалось |
| IOS-FUT-07 | APNs server-push (replace local notifications) | Опциональный шаг в Phase 21, не критичен |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Замена web-фронта iOS-клиентом | Оба клиента работают параллельно, никто не отключается |
| Импорт CSV / банковских выписок | Из общего Out of Scope проекта |
| Мультивалютность | Только RUB |
| Биллинг / тарифы | Closed whitelist остаётся |
| Android-приложение | Запрашивался только iOS |
| React Native / Flutter / Capacitor | Пользователь явно выбрал native SwiftUI |

## Traceability

REQ → Phase mapping (заполнено roadmapper'ом 2026-05-08):

| REQ-ID | Phase | Phase Name |
|--------|-------|------------|
| IOSAUTH-01 | 17 | iOS Foundation |
| IOSAUTH-02 | 17 | iOS Foundation |
| IOS-01 | 17 | iOS Foundation |
| IOS-02 | 17 | iOS Foundation |
| IOS-03 | 17 | iOS Foundation |
| IOS-04 | 17 | iOS Foundation |
| IOS-06 | 17 | iOS Foundation |
| IOS-07 | 17 | iOS Foundation |
| IOS-10 | 17 | iOS Foundation |
| IOS-11 | 17 | iOS Foundation |
| IOS-08 | 18 | iOS Core CRUD |
| IOS-09 | 18 | iOS Core CRUD |
| IOS-12 | 18 | iOS Core CRUD |
| IOS-13 | 18 | iOS Core CRUD |
| IOS-14 | 18 | iOS Core CRUD |
| IOS-15 | 19 | iOS Management |
| IOS-16 | 19 | iOS Management |
| IOS-05 | 20 | iOS AI |
| IOSAI-01 | 20 | iOS AI |
| IOSAI-02 | 20 | iOS AI |
| IOS-17 | 21 | TestFlight Distribution |
| IOS-18 | 21 | TestFlight Distribution |

**Coverage:** 22/22 requirements mapped to exactly one phase ✓
