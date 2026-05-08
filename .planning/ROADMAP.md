# Roadmap: TG Budget Planner

## Milestones

- ✅ **v0.2 — MVP** (Phases 1-6) — shipped 2026-05-03 → [archive](milestones/v0.3-REQUIREMENTS.md) (full v0.2 traceability в v0.3 archive at close)
- ✅ **v0.3 — Analytics & AI** (Phases 7-10.2) — shipped 2026-05-06 → [archive](milestones/v0.3-ROADMAP.md)
- ✅ **v0.4 — Multi-Tenant & Admin** (Phases 11-15) — shipped 2026-05-07 → [archive](milestones/v0.4-ROADMAP.md) (live TG smoke deferred to UAT — see [v0.4-MILESTONE-AUDIT.md](v0.4-MILESTONE-AUDIT.md))
- ✅ **v0.5 — Security & AI Hardening** (Phase 16) — shipped 2026-05-07 → [archive](milestones/v0.5-ROADMAP.md)
- 🚧 **v0.6 — iOS App** (Phases 17-21) — planning (started 2026-05-08)

## Phases

<details>
<summary>✅ v0.2 MVP (Phases 1-6) — SHIPPED 2026-05-03</summary>

- [x] Phase 1: Infrastructure & Auth (6/6 plans) — completed 2026-05-02
- [x] Phase 2: Domain Foundation & Onboarding (6/6 plans) — completed 2026-05-02
- [x] Phase 3: Plan Template & Planned Transactions (6/6 plans) — completed 2026-05-03
- [x] Phase 4: Actual Transactions & Bot Commands (6/6 plans) — completed 2026-05-03
- [x] Phase 5: Dashboard & Period Lifecycle (6/6 plans) — completed 2026-05-03
- [x] Phase 6: Subscriptions & Worker Jobs (7/7 plans) — completed 2026-05-03

</details>

<details>
<summary>✅ v0.3 Analytics & AI (Phases 7-10.2) — SHIPPED 2026-05-06</summary>

- [x] Phase 7: Nav Refactor (6/6 plans) — completed 2026-05-05
- [x] Phase 8: Analytics Screen (5/5 plans) — completed 2026-05-05
- [x] Phase 9: AI Assistant (7/7 plans) — completed 2026-05-06
- [x] Phase 10: AI Categorization (5/5 plans) — completed 2026-05-06
- [x] Phase 10.1: AI Cost Optimization (INSERTED, inline) — completed 2026-05-06
- [x] Phase 10.2: AI Hardening + Write-Flow (INSERTED, inline) — completed 2026-05-06

</details>

<details>
<summary>✅ v0.4 Multi-Tenant & Admin (Phases 11-15) — SHIPPED 2026-05-07</summary>

- [x] Phase 11: Multi-Tenancy DB Migration & RLS (7/7 plans) — completed 2026-05-06
- [x] Phase 12: Role-Based Auth Refactor (7/7 plans) — completed 2026-05-07
- [x] Phase 13: Admin UI — Whitelist & AI Usage (8/8 plans) — completed 2026-05-07
- [x] Phase 14: Multi-Tenant Onboarding (7/7 plans) — completed 2026-05-07
- [x] Phase 15: AI Cost Cap Per User (7/7 plans) — completed 2026-05-07

</details>

<details>
<summary>✅ v0.5 Security & AI Hardening (Phase 16) — SHIPPED 2026-05-07</summary>

- [x] Phase 16: Security & AI Hardening (9/9 plans) — completed 2026-05-07

См. [milestones/v0.5-ROADMAP.md](milestones/v0.5-ROADMAP.md) для full phase details.

</details>

### 🚧 v0.6 iOS App (In Planning)

**Milestone Goal:** Native SwiftUI iOS-приложение, эквивалентное web Mini App, с альтернативным Bearer-auth (без TG initData), локальными нотификациями и доставкой через TestFlight для friend.

- [ ] **Phase 17: iOS Foundation** — Backend Bearer auth + Xcode-проект, дизайн-токены, networking layer, Keychain auth, Onboarding + Home read-only пользователю работают на Simulator
- [ ] **Phase 18: iOS Core CRUD** — Daily-use паритет с TG Mini App: Transactions History/Planned, TransactionEditor, Categories, Settings, period_for + MoneyParser порт
- [ ] **Phase 19: iOS Management** — Subscriptions с локальными UNUserNotifications, Template apply, Analytics через Swift Charts
- [ ] **Phase 20: iOS AI** — SSE-клиент + AIChatView со streaming, AIProposalSheet write-flow для propose_actual / propose_planned
- [ ] **Phase 21: TestFlight Distribution** — Apple Developer Account, замена dev-token на TG Login Widget / Sign in with Apple, App Store Connect + TestFlight invite другу

## Phase Details

### Phase 17: iOS Foundation
**Goal**: Working "Hello World" iOS-приложение, в котором пользователь логинится через DEV_AUTH_SECRET и видит реальные данные текущего периода с backend, без поломок web-фронта
**Depends on**: Phase 16 (v0.5 shipped — backend стабилен и не двигается)
**Requirements**: IOSAUTH-01, IOSAUTH-02, IOS-01, IOS-02, IOS-03, IOS-04, IOS-06, IOS-07, IOS-10, IOS-11
**Success Criteria** (what must be TRUE):
  1. Web Mini App в Telegram продолжает работать без изменений: `curl` с валидным `X-Telegram-Init-Data` (без `Authorization`) возвращает 200 на `/api/v1/me`, `/api/v1/periods/current` — pytest regression на старом auth-flow зелёный (IOSAUTH-01).
  2. `POST /api/v1/auth/dev-exchange` с валидным `DEV_AUTH_SECRET` возвращает long-lived Bearer-токен; запрос с этим токеном в `Authorization: Bearer ...` к любому защищённому endpoint работает как owner-user; неверный/пустой secret → 403, отсутствующий env → 503 (IOSAUTH-02).
  3. `xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build` возвращает `BUILD SUCCEEDED` без warnings; приложение запускается на Simulator iPhone 15 Pro (iOS 17+) с Aurora Light / Mesh Dark фонами, переключающимися по системной теме (IOS-01, IOS-02, IOS-03).
  4. Первый запуск показывает `DevTokenSetupView` → ввод секрета → `POST /auth/dev-exchange` → токен в Keychain → переход на Onboarding (новый пользователь) или Home (existing). Перезапуск приложения сразу открывает Home без запроса секрета. На 401/403 от любого endpoint токен инвалидируется и пользователь возвращается на DevTokenSetupView (IOS-06, IOS-07).
  5. `OnboardingView` (4-step: имя / cycle_start_day / starting_balance / promo) проводит нового user через `POST /api/v1/onboarding/complete`; `HomeView` показывает HeroCard с балансом, top-3 категории, ForecastCard и PeriodSwitcher с числами идентичными web-версии для того же user/period (IOS-04 для всех endpoints используемых на этих экранах, IOS-10, IOS-11).
**Plans**: TBD
**UI hint**: yes

### Phase 18: iOS Core CRUD
**Goal**: Полная замена daily-use функциональности TG Mini App — пользователь может вести бюджет с iPhone, не открывая Telegram
**Depends on**: Phase 17 (Foundation — networking, auth, Home работают)
**Requirements**: IOS-08, IOS-09, IOS-12, IOS-13, IOS-14
**Success Criteria** (what must be TRUE):
  1. `period_for(date, cycle_start_day)` в `Domain/Period.swift` через `Calendar(timeZone: Europe/Moscow)` даёт идентичный результат backend `app/core/period.py` для всех тест-кейсов из `tests/test_period.py`, перенесённых в `PeriodForTests.swift` (IOS-08).
  2. `MoneyParser` принимает "100" → 10000 cents, "1 500,50" → 150050, "1.500,50" → 150050, "abc" → nil — без `Float`, через digit-walk; `MoneyFormatter` рендерит "1 500,50 ₽" в ru-RU; XCTest зелёный (IOS-09).
  3. Пользователь нажимает FAB → открывается `TransactionEditor` bottom-sheet с amount-полем (через MoneyParser), category-picker, date-picker, description; submit вызывает `POST /actual` или `POST /planned`; запись появляется в `HistoryView` и баланс на Home пересчитывается (IOS-13).
  4. `TransactionsView` с sub-tabs History/Planned: HistoryView показывает actual-транзакции с группировкой по дате и swipe-actions (Edit/Delete), PlannedView показывает категории с дельтами и inline `CapEditSheet` для plan-cap; все мутации немедленно отражаются в web-версии после refresh (IOS-12).
  5. `CategoriesView` (CRUD + archive через `is_archived`) и `SettingsView` (cycle_start_day, notify_days_before, AI toggle) работают — изменение категории на iOS видно в web-версии и наоборот (IOS-14).
**Plans**: TBD
**UI hint**: yes

### Phase 19: iOS Management
**Goal**: Feature parity с web Management section — подписки с локальными напоминаниями, Template apply, Analytics через нативные Swift Charts
**Depends on**: Phase 18 (Core CRUD — Categories и Settings уже работают, на них опирается Subscriptions)
**Requirements**: IOS-15, IOS-16
**Success Criteria** (what must be TRUE):
  1. `SubscriptionsView` + `SubscriptionEditor` подключены к `GET/POST/PATCH/DELETE /subscriptions`; пользователь может создать/изменить/удалить подписку — изменения видны в web-версии после refresh (IOS-15).
  2. После создания подписки с `next_charge_date = завтра` и `notify_days_before = 1` пользователь получает локальную нотификацию в 09:00 локального времени; `LocalNotifications.swift` использует `UNCalendarNotificationTrigger` и снимает все ранее запланированные нотификации перед перепланированием, чтобы не дублировать (IOS-15).
  3. `TemplateView` показывает список шаблон-строк через `GET /template/items`; кнопка "Применить к периоду" вызывает `POST /periods/{id}/apply-template` и созданные планы немедленно видны в `PlannedView` Phase 18 (IOS-16).
  4. `AnalyticsView` рендерит через Swift Charts top-categories bar chart, line chart trend по месяцам и forecast-карточку — данные из `/analytics/*` endpoints, числа совпадают с web-версией Analytics screen (IOS-16).
**Plans**: TBD
**UI hint**: yes

### Phase 20: iOS AI
**Goal**: Conversational AI-помощник с streaming SSE на iOS, включая propose-and-approve write-flow эквивалентный web-версии (AI никогда не пишет в БД молча)
**Depends on**: Phase 19 (Management — все CRUD endpoints используемые AI tools уже работают на iOS)
**Requirements**: IOS-05, IOSAI-01, IOSAI-02
**Success Criteria** (what must be TRUE):
  1. `SSEClient` через `URLSession.bytes(for:)` парсит `data: {...}` строки от `POST /ai/chat` в `AsyncStream<SSEEvent>` с правильным порядком event-типов (`message_delta`, `message_complete`, `tool_call`, `tool_result`, `usage`, `error`) для типичного scenario "user message → 2 tool calls → assistant response"; integration-тест с mock-stream зелёный (IOS-05).
  2. Пользователь пишет в `AIChatView` "сколько на еду в марте" → текст ответа печатается посимвольно через `message_delta` в `ScrollViewReader` → `ToolUseIndicator` пульсирует во время `tool_call` → итоговый assistant-message отображается полным; нажатие "Очистить" вызывает `DELETE /ai/conversation` (IOSAI-01).
  3. Пользователь пишет "записал 500 на кофе" → AI вызывает `propose_actual_transaction` tool → `AIProposalSheet` открывается поверх chat с pre-filled полями (amount=500₽, category=Кафе, date=сегодня); кнопка "Сохранить" вызывает стандартный `POST /actual` и транзакция появляется в `HistoryView`; кнопка "Изменить" открывает `TransactionEditor` Phase 18 с теми же pre-filled полями (IOSAI-02).
  4. На любом 401/403 от `/ai/chat` (включая 429 от cap-enforcement) SSE-стрим завершается gracefully, ошибка показывается user-friendly сообщением, токен не инвалидируется зря (защита от ложных logout при rate-limit).
**Plans**: TBD
**UI hint**: yes

### Phase 21: TestFlight Distribution
**Goal**: Friend на отдельном Apple ID получает invite, ставит приложение через TestFlight, авторизуется не через DEV_AUTH_SECRET и пользуется
**Depends on**: Phase 20 (полное feature-complete приложение готово к публичной сборке)
**Requirements**: IOS-17, IOS-18
**Success Criteria** (what must be TRUE):
  1. Apple Developer Account активирован ($99 paid), App ID `com.budgetplanner.ios` зарегистрирован в Developer Portal, distribution certificate и provisioning profile (App Store) настроены — Xcode принимает их без warnings при Archive (IOS-17).
  2. Dev-token flow заменён production-flow: либо Telegram Login Widget через `WKWebView` (открывает t.me/login flow и backend получает auth_data + hash), либо Sign in with Apple — friend авторизуется на чистом устройстве без знания `DEV_AUTH_SECRET` и попадает на Onboarding или Home в зависимости от существования user record (IOS-17).
  3. AppIcon (1024×1024 + все размеры через .xcassets), Launch Screen storyboard, минимум 3 скриншота для App Store Connect, `PrivacyInfo.xcprivacy` с задекларированными API usage (UserDefaults reason, Keychain reason) — все обязательные fields в App Store Connect зелёные (IOS-18).
  4. Архивная сборка успешно загружена в App Store Connect (`Validate App` + `Distribute App` без ошибок), доступна в TestFlight → Internal Testing, friend's email добавлен как internal-tester и получает email-приглашение от TestFlight; friend ставит TestFlight, ставит наше приложение, проходит auth-flow и видит Onboarding (IOS-18).
**Plans**: TBD
**UI hint**: yes

## Progress

### Milestone v0.2 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Auth | 6/6 | Complete | 2026-05-02 |
| 2. Domain Foundation & Onboarding | 6/6 | Complete | 2026-05-02 |
| 3. Plan Template & Planned Transactions | 6/6 | Complete | 2026-05-03 |
| 4. Actual Transactions & Bot Commands | 6/6 | Complete | 2026-05-03 |
| 5. Dashboard & Period Lifecycle | 6/6 | Complete | 2026-05-03 |
| 6. Subscriptions & Worker Jobs | 7/7 | Complete | 2026-05-03 |

### Milestone v0.3 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Nav Refactor | 6/6 | Complete | 2026-05-05 |
| 8. Analytics Screen | 5/5 | Complete | 2026-05-05 |
| 9. AI Assistant | 7/7 | Complete | 2026-05-06 |
| 10. AI Categorization | 5/5 | Complete | 2026-05-06 |
| 10.1. AI Cost Optimization (INSERTED) | inline | Complete | 2026-05-06 |
| 10.2. AI Hardening + Write-Flow (INSERTED) | inline | Complete | 2026-05-06 |

### Milestone v0.4 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Multi-Tenancy DB Migration & RLS | 7/7 | Complete (human_needed) | 2026-05-06 |
| 12. Role-Based Auth Refactor | 7/7 | Complete (human_needed) | 2026-05-07 |
| 13. Admin UI — Whitelist & AI Usage | 8/8 | Complete (human_needed) | 2026-05-07 |
| 14. Multi-Tenant Onboarding | 7/7 | Complete (human_needed) | 2026-05-07 |
| 15. AI Cost Cap Per User | 7/7 | Complete (human_needed) | 2026-05-07 |

### Milestone v0.5 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 16. Security & AI Hardening | 9/9 | Complete | 2026-05-07 |

### Milestone v0.6 (In Planning)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 17. iOS Foundation | 0/0 | Not started | - |
| 18. iOS Core CRUD | 0/0 | Not started | - |
| 19. iOS Management | 0/0 | Not started | - |
| 20. iOS AI | 0/0 | Not started | - |
| 21. TestFlight Distribution | 0/0 | Not started | - |

---
*Roadmap reorganized: 2026-05-06 at v0.3 milestone close*
*v0.4 closed: 2026-05-07 — full archive in `milestones/v0.4-ROADMAP.md`*
*v0.5 closed: 2026-05-08 — full archive in `milestones/v0.5-ROADMAP.md`*
*v0.6 added: 2026-05-08 — Phases 17-21 (iOS App), source plan `~/.claude/plans/tender-hopping-simon.md`*
