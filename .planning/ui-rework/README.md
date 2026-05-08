# UI Rework Handoff Package

> **Snapshot:** 2026-05-08
> **Назначение:** входные данные для Anthropic Claude Design (полная перерисовка UI TG Budget Planner).
> **Не источник правды:** реальный UI приложения может уйти вперёд между snapshot'ом и началом редизайна.

## Структура

```
.planning/ui-rework/
├── README.md          ← этот файл (навигация + how-to-rebuild)
├── user-stories.md    ← описание функционала по 13 экранам (handoff text)
└── screenshots/       ← PNG-галерея, mobile viewport (390×844, DPR=3 → 1170×Hpx)
    ├── 01-home-expenses.png
    ├── 02-home-income.png
    ├── 03-home-empty.png
    ├── 04-transactions-history.png
    ├── 05-transactions-plan.png
    ├── 06-transactions-history-filtered.png
    ├── 07-analytics.png
    ├── 08-ai-empty.png
    ├── 09-management-hub.png
    ├── 10-onboarding.png
    ├── 11-management-subscriptions.png
    ├── 12-management-template.png
    ├── 13-management-categories.png
    ├── 14-management-settings.png
    ├── 15-management-access.png
    ├── 16-add-transaction-sheet.png
    ├── 17-subscription-edit.png
    └── 18-plan-create-sheet.png
```

## Содержание (18 скриншотов / 13 экранов)

| #  | Экран                  | Состояние                               | Файл                                            |
|----|------------------------|------------------------------------------|-------------------------------------------------|
| 01 | HomeScreen             | Дашборд, tab «Расходы»                  | `screenshots/01-home-expenses.png`              |
| 02 | HomeScreen             | Дашборд, tab «Доходы»                   | `screenshots/02-home-income.png`                |
| 03 | HomeScreen             | Empty state (нулевой баланс)            | `screenshots/03-home-empty.png`                 |
| 04 | TransactionsScreen     | sub-tab «История», список + FAB         | `screenshots/04-transactions-history.png`       |
| 05 | TransactionsScreen     | sub-tab «План», список плановых строк   | `screenshots/05-transactions-plan.png`          |
| 06 | TransactionsScreen     | История с фильтром по категории         | `screenshots/06-transactions-history-filtered.png` |
| 07 | AnalyticsScreen        | Range 1M, secstions Forecast/Top/Trend  | `screenshots/07-analytics.png`                  |
| 08 | AiScreen               | Empty (без сообщений)                   | `screenshots/08-ai-empty.png`                   |
| 09 | ManagementScreen       | Хаб, 5 row-кнопок (owner)               | `screenshots/09-management-hub.png`             |
| 10 | OnboardingScreen       | Первый запуск (`onboarded_at = null`)   | `screenshots/10-onboarding.png`                 |
| 11 | SubscriptionsScreen    | Список подписок                         | `screenshots/11-management-subscriptions.png`   |
| 12 | TemplateScreen         | Список template-строк                   | `screenshots/12-management-template.png`        |
| 13 | CategoriesScreen       | Список категорий                        | `screenshots/13-management-categories.png`      |
| 14 | SettingsScreen         | cycle_start_day + notify_days_before    | `screenshots/14-management-settings.png`        |
| 15 | AccessScreen           | Whitelist + AI usage (owner-only)       | `screenshots/15-management-access.png`          |
| 16 | TransactionsScreen     | FAB → bottom-sheet «Добавить трату»     | `screenshots/16-add-transaction-sheet.png`      |
| 17 | SubscriptionsScreen    | Клик по подписке → edit-sheet           | `screenshots/17-subscription-edit.png`          |
| 18 | TransactionsScreen     | План tab → FAB → create-sheet           | `screenshots/18-plan-create-sheet.png`          |

Все 13 экранов TMA представлены минимум одним скриншотом (см. `user-stories.md` для маппинга экран → файл).

## Как пересобрать snapshot

```bash
# из корня репо
cd frontend
npx playwright test tests/e2e/ui-rework.spec.ts --reporter=list
```

Spec автоматически:
1. Поднимает Vite dev-server на `http://localhost:5173` (см. `frontend/playwright.config.ts > webServer`).
2. Создаёт директорию `.planning/ui-rework/screenshots/` если её нет.
3. Гонит 18 сценариев с моками `page.route('**/api/v1/**', ...)` — реальный backend НЕ нужен.
4. Сохраняет PNG full-page в указанную директорию.

Время прогона: ~20 сек на M-серии Mac.

После успешного прогона — закоммитить новые/обновлённые PNG в репо.

## Технические детали

| Параметр                | Значение                                                              |
|-------------------------|------------------------------------------------------------------------|
| Viewport                | 390×844 (логических CSS-пикселей, как iPhone 14)                       |
| `deviceScaleFactor`     | 3 (PNG получаются 1170×2532 для full-screen)                           |
| `hasTouch` / `isMobile` | `true` / `true`                                                        |
| User-Agent              | iPhone 14 Safari ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 …)`)        |
| Browser                 | Chromium (project из `playwright.config.ts`)                          |
| API mocks               | Полные in-spec `page.route` (см. helper `mockApiRich`)                 |
| Backend                 | НЕ нужен — все запросы перехватываются Playwright'ом                   |
| DEV_MODE контекст       | Клиент шлёт пустой `tg-init-data`; моки игнорируют валидацию           |

## Что покрыто

- ✅ Все 13 TMA-экранов (включая owner-only AccessScreen и Onboarding).
- ✅ Empty-state HomeScreen (нулевой баланс / пустые категории).
- ✅ Two HomeScreen tabs (Расходы / Доходы).
- ✅ Both TransactionsScreen sub-tabs (История / План) + filtered state.
- ✅ Add-transaction bottom-sheet (FAB на Transactions).
- ✅ Best-effort снимки edit-sheet'ов (subscription, plan create).

## Что НЕ покрыто

- ❌ **Real-time AI streaming (SSE)** — события `delta`, `tool_call`, `done` мокать без реального backend сложно. AI-экран снят только в empty-state.
- ❌ **Telegram-specific chrome** (`BackButton`, `MainButton`, statusBar overlay) — рендерится самим Telegram, а не webapp'ом.
- ❌ **Dark theme** — текущий snapshot только light theme; production-webapp подхватывает `colorScheme` из Telegram WebApp.
- ❌ **Loading skeletons и transient error states** — захвачены частично; для прицельного снимка нужны искусственные delays.
- ❌ **Real device interactions** (свайп, pull-to-refresh, haptic feedback) — статичные PNG не передают.
- ❌ **CategoryPicker / DatePicker модалки** внутри edit-sheet'ов.

## Связь с код-базой

- Spec: [`frontend/tests/e2e/ui-rework.spec.ts`](../../frontend/tests/e2e/ui-rework.spec.ts) (533 строки)
- Screen-код: [`frontend/src/screens/`](../../frontend/src/screens/)
- Component-код: [`frontend/src/components/`](../../frontend/src/components/)
- API типы: [`frontend/src/api/types.ts`](../../frontend/src/api/types.ts)
- Backend API контракт: [`docs/HLD.md`](../../docs/HLD.md)
- Project context: [`.planning/PROJECT.md`](../PROJECT.md)
- Project instructions: [`./CLAUDE.md`](../../CLAUDE.md)

## Следующий шаг

1. Загрузить директорию `.planning/ui-rework/` целиком (или `screenshots/` + `user-stories.md`) в Claude Design сессию.
2. Дать design brief: «Сделай редизайн TMA для одиночного пользователя; mobile-first; Telegram theme tokens; ключевая ценность — в один тап записать факт-трату».
3. Получить proposed mockups → итерировать по экранам → сравнить с user-stories.md (что не должно потеряться).

## Snapshot lineage

| Date       | Trigger                      | Notes                                                               |
|------------|------------------------------|---------------------------------------------------------------------|
| 2026-05-08 | Quick task `260508-fib`      | Первая полная mobile-galaxy (18 PNG, 13 экранов).                   |
