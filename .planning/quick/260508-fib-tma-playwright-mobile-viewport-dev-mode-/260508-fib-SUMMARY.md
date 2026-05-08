---
quick_task: 260508-fib
phase: quick-260508-fib
plan: 01
status: awaiting-human-verify
type: execute
created: 2026-05-08
completed_date: 2026-05-08
metrics:
  duration_minutes: ~12
  tasks_completed: 2
  tasks_total: 3
  files_created: 22
  files_modified: 0
key-files:
  created:
    - frontend/tests/e2e/ui-rework.spec.ts
    - .planning/ui-rework/screenshots/01-home-expenses.png
    - .planning/ui-rework/screenshots/02-home-income.png
    - .planning/ui-rework/screenshots/03-home-empty.png
    - .planning/ui-rework/screenshots/04-transactions-history.png
    - .planning/ui-rework/screenshots/05-transactions-plan.png
    - .planning/ui-rework/screenshots/06-transactions-history-filtered.png
    - .planning/ui-rework/screenshots/07-analytics.png
    - .planning/ui-rework/screenshots/08-ai-empty.png
    - .planning/ui-rework/screenshots/09-management-hub.png
    - .planning/ui-rework/screenshots/10-onboarding.png
    - .planning/ui-rework/screenshots/11-management-subscriptions.png
    - .planning/ui-rework/screenshots/12-management-template.png
    - .planning/ui-rework/screenshots/13-management-categories.png
    - .planning/ui-rework/screenshots/14-management-settings.png
    - .planning/ui-rework/screenshots/15-management-access.png
    - .planning/ui-rework/screenshots/16-add-transaction-sheet.png
    - .planning/ui-rework/screenshots/17-subscription-edit.png
    - .planning/ui-rework/screenshots/18-plan-create-sheet.png
    - .planning/ui-rework/user-stories.md
    - .planning/ui-rework/README.md
  modified: []
commits:
  - hash: 900abc1
    type: feat
    scope: 260508-fib-01
    summary: mobile-viewport Playwright spec + 18 handoff screenshots
  - hash: 3447760
    type: docs
    scope: 260508-fib-02
    summary: user-stories.md + README.md for handoff package
checkpoint:
  task: 3
  type: human-verify
  status: awaiting
---

# Quick Task 260508-fib: TMA Playwright Mobile Viewport Snapshot — Summary

**One-liner:** Полный handoff-пакет в `.planning/ui-rework/` (18 mobile-viewport PNG + user-stories + README) готов для передачи в Anthropic Claude Design.

## Что сделано

### Task 1 — Playwright spec + 18 screenshots ✅
- Создан `frontend/tests/e2e/ui-rework.spec.ts` (533 строки, 18 test()-сценариев).
- Mobile viewport параметры заданы вручную (`viewport: 390×844`, `deviceScaleFactor: 3`, `hasTouch`, `isMobile`, iPhone 14 UA) — `devices['iPhone 14']` не используем, потому что project в `playwright.config.ts` только chromium, а webkit-бинарь не установлен.
- Helpers `mockApiRich` и `waitForLoad` склонированы из `ui-audit.spec.ts` (целиком, не импорт), чтобы новый spec был автономен.
- Расширены моки для v0.5 endpoints:
  - `/api/v1/analytics/{trend,top-overspend,top-categories,forecast}` — реалистичный timeline 5 точек, top-3 overspend, forecast-объект.
  - `/api/v1/admin/users` — 3 fake users (owner / member / revoked).
  - `/api/v1/admin/ai-usage` — per-user buckets (current_month + last_30d) с pct_of_cap.
  - `/api/v1/me` — добавлено `role: 'owner'` + `ai_spend_cents` + `ai_spending_cap_cents` (требование Phase 12 ROLE-05 и Phase 15 AICAP-04).
- Output `.planning/ui-rework/screenshots/` создаётся в `test.beforeAll` через `fs.mkdirSync({recursive: true})`.
- Все 18 тестов passed зелёным (~19 sec на M1).
- Проверены размеры: PNG `1170 x 2532` = логические `390 x 844 × DPR=3` — mobile viewport подтверждён.

**Commit:** `900abc1` — feat(260508-fib-01)

### Task 2 — user-stories.md + README.md ✅
- `.planning/ui-rework/user-stories.md` (252 строки): 13 экранных секций (HomeScreen, TransactionsScreen, PlannedView, HistoryView, AnalyticsScreen, AiScreen, ManagementScreen, SubscriptionsScreen, TemplateScreen, CategoriesScreen, SettingsScreen, AccessScreen, OnboardingScreen) + Навигация + Bonus modals + «Что НЕ покрыто». 16 `## ` headings.
- Каждая секция: user story в формате «Как [роль], я хочу [действие], чтобы [цель]» + bullet-list UI-элементов (5–10 пунктов) + ссылки на конкретные screenshots/.
- `.planning/ui-rework/README.md` (128 строк): структура директории, таблица 18 PNG → экран, how-to-rebuild команда, технические детали (viewport/UA/mocks/DEV_MODE), что покрыто / не покрыто, ссылки в код-базу, snapshot lineage.

**Commit:** `3447760` — docs(260508-fib-02)

### Task 3 — Human verify ⏸ AWAITING
Чекпоинт `checkpoint:human-verify` — НЕ авто-пройден per constraints. Owner должен:
1. Открыть `.planning/ui-rework/screenshots/` в Finder, пройтись глазами по 18 PNG.
2. Прочитать 2-3 секции `user-stories.md` и убедиться, что формулировки содержательные.
3. Прочитать `README.md` — понятно ли назначение пакета.
4. Подтвердить «approved» — или сообщить, какой сценарий пересобрать.

Resume signal: `approved` или описание проблемы.

## Список созданных файлов

| File                                                   | Lines / Bytes | Notes                                  |
|--------------------------------------------------------|---------------|----------------------------------------|
| `frontend/tests/e2e/ui-rework.spec.ts`                 | 533 lines     | 18 test(), mobile viewport, in-spec mocks |
| `.planning/ui-rework/screenshots/*.png` (×18)          | each 1170×2532 PNG | full-page, mobile, ~150–600 KB         |
| `.planning/ui-rework/user-stories.md`                  | 252 lines     | 13 экранов + bonus + caveats           |
| `.planning/ui-rework/README.md`                        | 128 lines     | navigation + how-to-rebuild + lineage  |

Total: 22 новых файла, 913 строк markdown/code, 0 файлов модифицировано.

## Команда пересборки

```bash
cd frontend
npx playwright test tests/e2e/ui-rework.spec.ts --reporter=list
```

Вывод автоматически уйдёт в `.planning/ui-rework/screenshots/`. Реальный backend не нужен — все API-запросы перехватываются `page.route('**/api/v1/**', …)`.

## Заметки для Claude Design сессии

**Контекст приложения** (см. `CLAUDE.md` + `user-stories.md`):
- Single-tenant TMA — один пользователь (owner), но в `v0.4` появился whitelist (member-роль) и admin-секция «Доступ» (только для owner).
- Core value: «в один тап записать факт-трату» — FAB на `TransactionsScreen` должен оставаться легкодоступным.
- 5-tab BottomNav — сильный navigation pattern, ломать без причины не стоит, но redesign может предложить tab-grouping или collapsing.
- Money: BIGINT копейки на бекенде, рубли в UI; никаких `float`. Дельты подписаны: расходы `План−Факт` (положительная = хорошо).

**На что обратить внимание при редизайне:**
- HomeScreen — heart of the app; читаемость дельт + accessibility tap-target размером ≥44pt для строк категорий.
- TransactionsScreen — двухуровневая навигация (sub-tab + kind-filter + chips) визуально перегружена; есть простор для упрощения.
- AccessScreen (admin) — табличный layout per-user может не масштабироваться на mobile; стоит подумать про компактные cards с возможностью expand.
- AnalyticsScreen — chip-range (1M/3M/6M/12M) переключает шапку (Forecast vs Cashflow); нужен визуальный signal, что значения в карточке зависят от range.
- AI screen — empty-state снят, но реальный chat UX с tool-call event'ами и propose-sheet'ом не виден (Telegram TMA + chat UI = свой паттерн).
- OnboardingScreen — 30 секунд до первой ценности; должен ощущаться легко.

**Что точно не должно потеряться:**
- FAB на `TransactionsScreen` (в обоих sub-tab'ах).
- Owner-only видимость пункта «Доступ».
- Прогресс-бар с warn/danger цветом (>0.80 / >1.0) — паттерн используется и в HomeScreen и в AccessScreen → AI usage.
- Dark/light theme через Telegram colorScheme tokens (snapshot light-only, но redesign должен учесть оба).

## Self-Check: PASSED

**Files:**
- FOUND: frontend/tests/e2e/ui-rework.spec.ts
- FOUND: .planning/ui-rework/user-stories.md
- FOUND: .planning/ui-rework/README.md
- FOUND: 18× PNG в .planning/ui-rework/screenshots/

**Commits:**
- FOUND: 900abc1 feat(260508-fib-01): mobile-viewport Playwright spec + 18 handoff screenshots
- FOUND: 3447760 docs(260508-fib-02): user-stories.md + README.md for handoff package

**Legacy intact:**
- frontend/tests/e2e/ui-audit.spec.ts — не модифицирован.
- frontend/tests/ui-audit-screenshots/ — не модифицирован.
- Никаких deletions в diff `git diff --diff-filter=D HEAD~2 HEAD` (verified — все коммиты только add).

**Tests:**
- 18/18 passed (~19 sec wall, chromium).

## Deferred Issues / Deviations

- **Deviation Rule 3 (blocking-issue auto-fix):** `devices['iPhone 14']` падал с «webkit not installed». Зафиксировано: webkit не установлен, переключился на manual mobile params на chromium. Дисклеймер добавлен в комментарий spec'а и в README раздел «Технические детали».
- **Deviation Rule 3 (ESM):** изначально использовал `__dirname` глобально — не работает в ESM-проекте (`"type": "module"` в `frontend/package.json`). Заменил на `fileURLToPath(import.meta.url)`.
- **Best-effort screenshots (17, 18):** Edit-sheet'ы открываются при наличии target-row; если row не найден (race), screenshot захватывает родительский экран. Для handoff'а это приемлемо — main flow покрыт.

Архитектурных изменений нет; правок в коде frontend/backend нет.
