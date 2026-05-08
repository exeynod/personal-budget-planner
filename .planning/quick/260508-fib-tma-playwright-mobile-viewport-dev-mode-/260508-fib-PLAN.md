---
phase: quick-260508-fib
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/tests/e2e/ui-rework.spec.ts
  - .planning/ui-rework/screenshots/
  - .planning/ui-rework/user-stories.md
  - .planning/ui-rework/README.md
autonomous: false
requirements:
  - QUICK-260508-FIB-01  # Полный набор mobile-viewport скриншотов всех TMA-экранов
  - QUICK-260508-FIB-02  # User stories для всех 13 экранов в формате handoff для Claude Design
  - QUICK-260508-FIB-03  # README объясняющий назначение пакета и как его пересобрать
user_setup: []

must_haves:
  truths:
    - "В .planning/ui-rework/screenshots/ существует mobile-viewport (390×844) скриншот для каждого из 13 экранов"
    - "Скриншоты покрывают как минимум одно репрезентативное состояние каждого экрана + ключевые edge-states (empty home, onboarding, FAB sheet, edit-modals)"
    - "user-stories.md содержит секцию для каждого из 13 экранов в формате «Как [роль], я могу [действие], чтобы [цель]» + перечисление UI-элементов"
    - "README.md описывает: назначение пакета (handoff в Claude Design), структуру директории, команду пересборки, snapshot-дату"
    - "Новый Playwright spec лежит в frontend/tests/e2e/ui-rework.spec.ts, не пересекается с легаси ui-audit.spec.ts"
    - "Старая директория frontend/tests/ui-audit-screenshots/ и spec ui-audit.spec.ts остались нетронутыми"
    - "Все Playwright тесты нового spec проходят зелёным локально"
  artifacts:
    - path: "frontend/tests/e2e/ui-rework.spec.ts"
      provides: "Mobile-viewport screenshot suite для handoff"
      min_lines: 250
    - path: ".planning/ui-rework/screenshots/"
      provides: "PNG-галерея всех экранов в mobile viewport"
      contains: "минимум 16 .png файлов"
    - path: ".planning/ui-rework/user-stories.md"
      provides: "User stories по экранам для Claude Design"
      contains: "## HomeScreen"
    - path: ".planning/ui-rework/README.md"
      provides: "Handoff-навигация по пакету"
      contains: "Claude Design"
  key_links:
    - from: "frontend/tests/e2e/ui-rework.spec.ts"
      to: ".planning/ui-rework/screenshots/"
      via: "path.resolve относительно frontend/ — '../.planning/ui-rework/screenshots'"
      pattern: "ui-rework/screenshots"
    - from: "frontend/tests/e2e/ui-rework.spec.ts"
      to: "Playwright devices['iPhone 14']"
      via: "test.use({ ...devices['iPhone 14'] }) или viewport: { width: 390, height: 844 }"
      pattern: "iPhone 14|390"
    - from: ".planning/ui-rework/README.md"
      to: ".planning/ui-rework/screenshots/"
      via: "Markdown-список с относительными ссылками на скриншоты"
      pattern: "screenshots/"
---

<objective>
Подготовить handoff-пакет для Anthropic Claude Design: полная галерея mobile-viewport скриншотов всех 13 экранов TMA + user stories + README. Пакет — входные данные для перерисовки UI.

Purpose: Чем полнее snapshot текущего UI и описание функционала, тем лучше Claude Design сможет предложить redesign. Сейчас существующий ui-audit.spec.ts покрывает только 10 сценариев в Desktop viewport — для TMA (mobile-first) нужен mobile snapshot.

Output:
- frontend/tests/e2e/ui-rework.spec.ts — новый Playwright spec (mobile viewport, 16+ сценариев)
- .planning/ui-rework/screenshots/*.png — галерея PNG (16+)
- .planning/ui-rework/user-stories.md — user stories для 13 экранов
- .planning/ui-rework/README.md — навигация и инструкция пересборки
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@./CLAUDE.md

# Reference: legacy spec для re-use паттерна моков (НЕ модифицировать)
@frontend/tests/e2e/ui-audit.spec.ts
@frontend/playwright.config.ts

# App routing — для понимания путей к экранам
@frontend/src/App.tsx

<interfaces>
<!-- Карта экранов и способы их достижения. Executor использует это вместо exploration. -->

## BottomNav табы (5 шт.)

```typescript
type TabId = 'home' | 'transactions' | 'analytics' | 'ai' | 'management';
```

aria-labels (для page.click):
- 'home' → `button[aria-label="Главная"]`
- 'transactions' → `button[aria-label="Транзакции"]`
- 'analytics' → `button[aria-label="Аналитика"]`
- 'ai' → `button[aria-label="AI"]`
- 'management' → `button[aria-label="Управление"]`

## ManagementView sub-screens (открываются из 'management' таба)

```typescript
type ManagementView = 'subscriptions' | 'template' | 'categories' | 'settings' | 'access';
```

Открыть → клик на таб «Управление», затем клик на label:
- «Подписки», «Шаблон», «Категории», «Настройки», «Доступ» (последний только для owner)

## Особые экраны (не через табы)

- **OnboardingScreen** — рендерится когда `user.onboarded_at === null`. Mock: `/api/v1/me` возвращает `{onboarded_at: null}`.
- **AccessScreen** — открывается через Management → «Доступ». Требует mock `/api/v1/admin/users` и `/api/v1/admin/ai-usage`.
- **HistoryView** — это TransactionsScreen с активным фильтром (через клик по категории на Home).
- **PlannedView** — sub-tab внутри TransactionsScreen.

## API endpoints (для расширения mockApiRich)

Уже замокано в ui-audit.spec.ts: `/me`, `/periods/current`, `/periods/{id}/balance`, `/actual`, `/categories`, `/subscriptions`, `/settings`, `/template`, `/planned`.

Добавить моки для:
- `/api/v1/analytics/**` — для AnalyticsScreen (graceful fallback `[]` уже работает, но желателен realistic mock с timeline data)
- `/api/v1/ai/chat` — для AiScreen (SSE-stream; для скриншота достаточно empty + mock с фиктивными сообщениями через UI manipulation, либо stub conversation state)
- `/api/v1/admin/users` — для AccessScreen
- `/api/v1/admin/ai-usage` — для AccessScreen
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Создать ui-rework.spec.ts с mobile-viewport screenshot suite (16+ сценариев)</name>
  <files>frontend/tests/e2e/ui-rework.spec.ts</files>
  <action>
Создать новый Playwright spec файл `frontend/tests/e2e/ui-rework.spec.ts`. Ключевые требования:

**1. Mobile viewport** — на уровне файла применить:
```typescript
import { test, expect, devices } from '@playwright/test';
test.use({ ...devices['iPhone 14'] });  // 390×844, DPR=3, mobile UA, hasTouch
```

**2. Output directory** — `path.resolve(__dirname, '../../../.planning/ui-rework/screenshots')`. Создавать директорию через `fs.mkdirSync(dir, { recursive: true })` в `test.beforeAll`.

**3. Mock helpers** — переиспользовать паттерн из `frontend/tests/e2e/ui-audit.spec.ts` (СКОПИРОВАТЬ функцию `mockApiRich` и `waitForLoad` целиком, НЕ импортировать). Расширить mock-набор:
- `/api/v1/analytics/**` → возвращать realistic timeline (массив с 4-6 точками) + категорийный breakdown
- `/api/v1/admin/users` → массив из 2-3 фейковых пользователей с разными статусами
- `/api/v1/admin/ai-usage` → объект с usage stats (tokens_used, cost_usd, requests_count)
- `/api/v1/ai/conversations` (если используется) — пустой массив или 1 фейковая беседа
- Дефолтный fallback (последний `if` ветка) уже возвращает `'[]'` — оставить.

**4. Сценарии (16 минимум, каждый = отдельный test() с уникальным префиксом `rework-NN-...`):**

Tab-level:
- 01. Home — expenses tab (full page)
- 02. Home — income tab
- 03. Home — empty state (mock с пустыми категориями + balance=0)
- 04. Transactions — главная (содержит FAB)
- 05. Transactions — Planned sub-tab (клик на «Запланировано» внутри TransactionsScreen)
- 06. Transactions — History с category filter (клик по категории на Home → переход с filter)
- 07. Analytics
- 08. AI — empty (без сообщений)
- 09. Management — hub
- 10. Onboarding (mock onboarded_at=null)

Management sub-screens:
- 11. Subscriptions — list
- 12. Template — list
- 13. Categories — list
- 14. Settings
- 15. Access (mock owner + admin endpoints)

Modal/sheet states:
- 16. Add transaction bottom-sheet (FAB на TransactionsScreen)

ОПЦИОНАЛЬНО (если позволит время, не блокирующее):
- 17. Edit subscription sheet — клик на существующую подписку
- 18. Edit category sheet — клик на категорию из CategoriesScreen
- 19. AI с сообщениями — если есть способ передать messages через initial state (если нет — пропустить)

**5. Screenshot настройки:** `fullPage: true`, формат PNG, имя `NN-screen-state.png` (zero-padded, kebab-case).

**6. Селекторы навигации (не угадывать — использовать из interfaces выше):**
- Табы: `button[aria-label="Главная|Транзакции|Аналитика|AI|Управление"]`
- Management sub-items: `page.locator('text=Подписки|Шаблон|Категории|Настройки|Доступ').first()` (см. `audit-05`/`audit-06` для проверенного паттерна)
- FAB: `button[aria-label="Добавить транзакцию"]`

**7. waitForTimeout** после каждого клика — 200-400ms (как в legacy spec, чтобы анимации/transitions устаканились).

**8. waitForLoad** — клонировать из ui-audit.spec.ts (`expect(page.locator('button[aria-label="Главная"]')).toBeVisible({ timeout: 10000 })`).

НЕ импортировать ничего из `ui-audit.spec.ts` (он легаси, может быть удалён). Скопировать helpers целиком — 50 строк дублирования допустимо для изоляции.

НЕ модифицировать `frontend/playwright.config.ts` — desktop project оставляем для легаси, mobile viewport применяем через `test.use()` внутри нового spec.

DEV_MODE контекст: Playwright грузит страницу через Vite dev-server без Telegram WebApp окружения. `client.ts` отправляет пустой `tg-init-data`, backend (если бы был) с `DEV_MODE=true` бы это принял. Но в наших тестах backend полностью замокан через `page.route` — реальный сервер не нужен. Просто следуем паттерну ui-audit.spec.ts.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx playwright test tests/e2e/ui-rework.spec.ts --reporter=list 2>&1 | tail -40</automated>
  </verify>
  <done>
- Файл frontend/tests/e2e/ui-rework.spec.ts существует
- Все тесты прошли зелёным (минимум 16 PASSED)
- В .planning/ui-rework/screenshots/ создались минимум 16 PNG файлов
- Все скриншоты в mobile viewport (~390px width — проверить размер первого PNG: `file .planning/ui-rework/screenshots/01-home-expenses.png` показывает width=390 или 1170 при DPR=3)
- Старые файлы frontend/tests/e2e/ui-audit.spec.ts и frontend/tests/ui-audit-screenshots/ остались нетронутыми
  </done>
</task>

<task type="auto">
  <name>Task 2: Написать user-stories.md и README.md в .planning/ui-rework/</name>
  <files>.planning/ui-rework/user-stories.md, .planning/ui-rework/README.md</files>
  <action>
**Файл 1: `.planning/ui-rework/user-stories.md`**

Структура (на русском):

```markdown
# User Stories — TG Budget Planner (snapshot 2026-05-08)

> Описание текущего функционала всех экранов TMA. Используется как handoff для перерисовки UI в Claude Design.
> Source of truth — код frontend/src/screens/ на дату snapshot.

## Навигация

5-tab BottomNav: Главная / Транзакции / Аналитика / AI / Управление.
«Управление» — хаб для 5 sub-screens (Подписки / Шаблон / Категории / Настройки / Доступ).
Onboarding и AccessScreen — особые состояния, не в табах.

---

## 1. HomeScreen — Дашборд план/факт

**User story:** Как владелец бюджета, я вижу актуальную дельту план/факт по категориям за текущий период, чтобы понимать остаток до конца месяца.

**UI элементы:**
- Hero-карточка: balance_now + общая дельта (План−Факт для расходов, Факт−План для доходов)
- Tabs: «Расходы» / «Доходы»
- Список категорий с прогресс-барами (planned vs actual)
- Клик по категории → переход в Transactions с фильтром
- PeriodSwitcher (если есть несколько периодов)
- Empty state — когда нет категорий или транзакций

**Скриншоты:** `screenshots/01-home-expenses.png`, `02-home-income.png`, `03-home-empty.png`

---

## 2. TransactionsScreen — Транзакции
... (аналогично)

## 3. PlannedView (sub-tab внутри Transactions)
## 4. HistoryView (filtered Transactions)
## 5. AnalyticsScreen
## 6. AiScreen
## 7. ManagementScreen (хаб)
## 8. SubscriptionsScreen
## 9. TemplateScreen
## 10. CategoriesScreen
## 11. SettingsScreen
## 12. AccessScreen (admin-only)
## 13. OnboardingScreen
```

Каждая секция: 2-3 предложения user story + bullet-list UI-элементов (5-10 пунктов) + ссылки на screenshots/.

Опираться на:
- **HomeScreen**: см. mock в ui-audit.spec.ts — категории с planned/actual, hero balance, tabs «Расходы/Доходы»
- **TransactionsScreen**: содержит FAB, sub-tabs «Все транзакции / Запланировано», список с category filter
- **AnalyticsScreen**: timeline график + breakdown по категориям (читать `frontend/src/screens/AnalyticsScreen.tsx` если нужны точные UI-элементы)
- **AiScreen**: чат с AI-помощником, propose-sheet для предложенных транзакций (читать `AiScreen.tsx`)
- **ManagementScreen**: 5 row-кнопок (Подписки/Шаблон/Категории/Настройки/Доступ — последний owner-only)
- **SubscriptionsScreen**: список повторяющихся платежей с next_charge_date, edit-sheet
- **TemplateScreen**: шаблон плана на месяц (категория × сумма × kind)
- **CategoriesScreen**: CRUD категорий с soft-delete (is_archived)
- **SettingsScreen**: cycle_start_day + notify_days_before
- **AccessScreen**: whitelist пользователей + AI usage stats (admin-only)
- **OnboardingScreen**: первый запуск, выбор cycle_start_day

Где не уверен в UI-элементах — сделать grep по соответствующему файлу:
```bash
grep -n "className\|<button\|<input\|aria-label" frontend/src/screens/AiScreen.tsx | head -30
```

**Файл 2: `.planning/ui-rework/README.md`**

```markdown
# UI Rework Handoff Package

> Snapshot UI TG Budget Planner на дату 2026-05-08.
> Назначение: вход для Anthropic Claude Design (перерисовка UI).
> Это snapshot — не источник правды; реальный UI может уйти вперёд.

## Структура

```
.planning/ui-rework/
├── README.md           ← этот файл
├── user-stories.md     ← описание функционала по экранам
└── screenshots/        ← PNG-галерея, mobile viewport (390×844)
    ├── 01-home-expenses.png
    ├── 02-home-income.png
    └── ... (16+ файлов)
```

## Содержание

| # | Экран | Состояние | Скриншот |
|---|-------|-----------|----------|
| 01 | HomeScreen | Расходы | `screenshots/01-home-expenses.png` |
| 02 | HomeScreen | Доходы | `screenshots/02-home-income.png` |
| ... (все 16+ записей) |

## Как пересобрать

```bash
cd frontend
npx playwright test tests/e2e/ui-rework.spec.ts
```

Output автоматически уйдёт в `.planning/ui-rework/screenshots/` (relative path захардкожен в spec).

## Технические детали

- **Viewport:** iPhone 14 (390×844, DPR=3, hasTouch)
- **API:** все запросы замоканы внутри spec через `page.route('**/api/v1/**', ...)`
- **Реальный backend не нужен** — Vite dev-server поднимается из Playwright config
- **DEV_MODE:** клиент шлёт пустой initData, моки игнорируют валидацию

## Что покрыто

(Список всех 13 экранов с пометками о состояниях.)

## Что НЕ покрыто

- Real-time AI streaming (SSE) — мокать сложно, опускаем
- Telegram-specific UI (BackButton, MainButton) — рендерятся самим Telegram, не webapp'ом
- Dark theme — текущий snapshot только light theme

## Следующий шаг

Загрузить пакет (screenshots + user-stories.md) в Claude Design сессию вместе с design-brief.
```

Заполнить таблицу состояний на основе фактического списка PNG-файлов после Task 1.
  </action>
  <verify>
    <automated>test -f /Users/exy/pet_projects/tg-budget-planner/.planning/ui-rework/user-stories.md && test -f /Users/exy/pet_projects/tg-budget-planner/.planning/ui-rework/README.md && grep -c "^## " /Users/exy/pet_projects/tg-budget-planner/.planning/ui-rework/user-stories.md</automated>
  </verify>
  <done>
- user-stories.md содержит секции для всех 13 экранов (минимум 13 заголовков `## `)
- Каждая секция имеет user story + UI элементы + ссылку на скриншот
- README.md описывает структуру, команду пересборки, snapshot-дату, список покрытия
- Таблица в README соответствует фактическому списку PNG в screenshots/
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human review handoff-пакета перед закрытием</name>
  <what-built>
Полный handoff-пакет в `.planning/ui-rework/`:
- 16+ mobile-viewport PNG скриншотов
- user-stories.md с 13 секциями
- README.md с навигацией и инструкцией пересборки

Новый Playwright spec frontend/tests/e2e/ui-rework.spec.ts (зелёный).
Легаси (ui-audit.spec.ts + tests/ui-audit-screenshots/) не тронут.
  </what-built>
  <how-to-verify>
1. Открыть `.planning/ui-rework/screenshots/` в Finder/файл-менеджере. Пройтись по PNG глазами:
   - Все ли скриншоты mobile-shaped (вертикальные, узкие)?
   - Нет ли пустых/чёрных/обрезанных?
   - Все ли 13 экранов представлены?
2. Открыть `.planning/ui-rework/user-stories.md`. Прочитать 2-3 секции — формулировки достаточно содержательные?
3. Открыть `.planning/ui-rework/README.md`. Понятно ли назначение пакета?
4. Опционально: запустить `cd frontend && npx playwright test tests/e2e/ui-rework.spec.ts --headed` чтобы посмотреть live-захват одного-двух сценариев.
5. Проверить, что легаси цел: `ls frontend/tests/ui-audit-screenshots/ | head -3` и `head -5 frontend/tests/e2e/ui-audit.spec.ts`.

Если всё ок — подтвердить, пакет готов к загрузке в Claude Design.
Если что-то не так (плохой скриншот, пропущенный экран, кривой viewport) — сообщить, какой именно сценарий чинить.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (e.g. "AI screen empty looks broken, retake")</resume-signal>
</task>

</tasks>

<verification>
- 16+ PNG файлов в `.planning/ui-rework/screenshots/`
- Размер первого PNG соответствует mobile viewport (width 390 или 1170 при DPR=3)
- user-stories.md содержит ровно 13 экранных секций
- README.md ссылки на screenshots/ — кликабельные относительные пути
- Playwright suite зелёная: `npx playwright test tests/e2e/ui-rework.spec.ts`
- Легаси нетронут: `frontend/tests/e2e/ui-audit.spec.ts` + `frontend/tests/ui-audit-screenshots/` существуют без изменений (`git status` чистый по этим путям)
</verification>

<success_criteria>
Quick task ship-ready когда:
- [ ] User просмотрел скриншоты глазами и подтвердил «approved»
- [ ] Все 13 экранов представлены минимум одним скриншотом
- [ ] user-stories.md и README.md написаны на русском, без placeholder-ов типа «(заполнить)»
- [ ] Спец frontend/tests/e2e/ui-rework.spec.ts закоммичен (отдельным quick-task коммитом по правилам GSD)
- [ ] Пакет можно одним каталогом (`.planning/ui-rework/`) загрузить в Claude Design
</success_criteria>

<output>
После завершения создать `.planning/quick/260508-fib-tma-playwright-mobile-viewport-dev-mode-/260508-fib-SUMMARY.md` с:
- Что сделано (Playwright spec + 16+ скриншотов + 2 markdown файла)
- Список созданных файлов с количеством строк
- Команда пересборки для будущих snapshot'ов
- Заметки для Claude Design сессии (что обращать внимание)
</output>
