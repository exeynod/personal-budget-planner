# План доработок: Architectural Convergence + Tech-Debt (v1.1.2 followup)

**Created:** 2026-05-20
**Branch:** v1.0-maximal-poster (не смержена в master)
**Owner decisions baked in:**
- **R6 = ОСТАВИТЬ ОБА ШЕЛЛА** (iOS MainShell↔V10MainShell + web v06-shell) навсегда → извлечь общий доменный слой, чтобы экраны не дрейфовали; web v06-shell НЕ удалять.
- **Внешние библиотеки РАЗРЕШЕНЫ**, когда оправданы (no-third-party — конвенция, не закон). Для R4 это открывает Apple `swift-openapi-generator`.
- **R4 = делать целиком** (полный codegen + миграция потребителей), с качественным планированием.

**Источники истины:**
- `.planning/v1.1.2-MULTILEAD-REVIEW.md` — 5-лидовое ревью (ID находок P0/P1/P2/R1-R9).
- `.planning/phases/67-remediation-cleanup/deferred-items.md` — pre-existing tech-debt, залогированный в фазе 67.
- `.planning/phases/6{2,3,4,6,7}-*/6X-HUMAN-UAT.md` — 5 pending live-smoke.

**Что уже сделано (фаза 67, SHIPPED 2026-05-20):** P0 (3 блокера), P1 (7), P2 (13), cleanup R1/R2/R5/R8/R9. Этот план — **только отложенное**: R3, R4, R6(shared-layer), R7 + pre-existing tech-debt + parity-бэклог.

---

## Предлагаемая структура (3 фазы + бэклог)

| Фаза | Название | Workstreams | Зависит от |
|------|----------|-------------|------------|
| **68** | Tech-Debt Cleanup | A (pre-existing debt) | — (можно сразу, независимо) |
| **69** | Contract Codegen (R4) | B (OpenAPI codegen) | 68 (зелёные тесты как baseline) |
| **70** | Convergence & Abstractions | C (R3 API), D (R6 shared-layer), E (R7) | 69 (codegen — фундамент) |
| **backlog** | Web↔iOS Parity | F | 69/70 |

Порядок намеренный: сначала чистый baseline (A), потом контракт-codegen (B) как фундамент, затем схождение (C/D) и абстракции (E) поверх стабильного контракта.

---

## ФАЗА 68 — Tech-Debt Cleanup (workstream A)

Низкий риск, независимо, высокая ценность (разблокирует чистые test-suites). Можно делать первой и параллельно по стекам.

### A1 · Backend Pro-gating тесты: 402-vs-429 (BLOCKER для чистого pytest)
- **Симптом:** `tests/test_ai_cap_integration.py` (3) + `test_spend_cap_concurrent.py` (2) ждут **429** (cap exceeded), получают **402** PRO_TIER_REQUIRED. `require_pro` (402) срабатывает в зависимостях ДО проверки cap (429).
- **Расследовать:** должен ли pro-user-over-cap получать 429 (а non-pro — 402)? Тесты, вероятно, поднимают pro-юзера, но порядок DI отдаёт 402. Решить: (а) тесты неверны (поправить фикстуру/ожидание), или (б) порядок гейтов неверен (cap-check должен идти после успешного pro-гейта для pro-юзера). Скорее (а)+(б): убедиться, что для pro-юзера cap→429, для non-pro→402; привести тесты в соответствие.
- **Файлы:** `app/api/dependencies.py` (require_pro, enforce_spending_cap ordering), `tests/test_ai_cap_integration.py`, `tests/test_spend_cap_concurrent.py`.
- **Проверка:** pytest этих модулей зелёный; ручной sanity: non-pro→402, pro-over-cap→429.

### A2 · onboarding/complete 422 + `category.code`/`ord` seed-drift
- **Симптом:** `test_seed_creates_14_categories` + `test_e2e_multi_user_lifecycle` падают — `POST /onboarding/complete` → 422; seed-helper не задаёт NOT-NULL `Category.code`/`ord` (дрейф схемы Phase 22). Несколько фаз (62/63/64/67) уже чинили это inline в своих тест-фикстурах — нужен системный фикс seed-helper.
- **Фикс:** починить общий seed-helper (задать `code` ~`^[0-9]{2}$` + `ord`); разобраться с 422 на onboarding/complete (что валидатор отвергает).
- **Файлы:** `tests/conftest.py` / seed-хелперы, `app/api/routes/onboarding*.py`, `tests/test_*`.
- **Проверка:** оба теста зелёные; никакому будущему тесту не нужен inline-фикс seed.

### A3 · Web tsc test-gate (R5/FE-F3 хвост)
- **Симптом:** фаза 67 исключила тест-файлы из prod `tsc -b` (чтобы разблокировать build). Pre-existing type-ошибки в тестах остались: `node:fs`/`__dirname` без `@types/node`, prop-дрейф в `AiView.test.tsx`/`SettingsView.test.tsx`/`TxV10TabDemote.test.tsx`.
- **Фикс:** `npm i -D @types/node`; поправить prop-фикстуры; вернуть тесты под type-check (отдельный `typecheck:test` скрипт ИЛИ обратно в `tsc -b`); убедиться, что CI гоняет и prod-build, и test-typecheck.
- **Файлы:** `frontend/package.json`, `frontend/tsconfig*.json`, три `.test.tsx`.
- **Проверка:** `npm run build` зелёный И тесты проходят type-check; `npx vitest run` зелёный.

### A4 · Косметика: stale doc-комментарий
- `ios/.../Networking/Endpoints/AISuggestCategoryAPI.swift:23` — комментарий «0.5 threshold» (бэкенд 0.35 после P2-5). Comment-only.

**Acceptance фазы 68:** backend pytest полностью зелёный (нет pre-existing фейлов); web build + vitest + test-typecheck зелёные; ноль inline seed-хаков нужно будущим тестам.

---

## ФАЗА 69 — Contract Codegen (R4, workstream B)

**Цель:** единый источник истины для API-контракта — генерировать TS и Swift DTO из FastAPI OpenAPI; убрать 3 рукописных набора типов и «pending schema» заглушки. Архитектор: наибольший ROI против дрейфа.

### B1 · Backend: чистый OpenAPI + dump-таргет
- Убедиться, что FastAPI отдаёт полный корректный `/openapi.json` (все response_model проставлены — после фазы 67 SubscriptionReadV10 уже есть; проверить остальные роуты на «голый dict» вместо схемы).
- Добавить таргет/скрипт дампа `openapi.json` из приложения (в docker `api` или через `python -c "import app; ...dump"`). Зафиксировать схему как артефакт (`contract/openapi.json`), регенерируемый.
- **Проверка:** `openapi.json` генерируется детерминированно; покрывает subscriptions/categories/actuals/me/ai/accounts/savings/goals.

### B2 · Web codegen (openapi-typescript)
- `npm i -D openapi-typescript`; скрипт `gen:api` → `frontend/src/api/generated/schema.ts`.
- Валидировать сгенерированные типы против текущих рукописных `types.ts` (дифф, поймать расхождения — особенно `CategoryV10` «pending schema» Optional-поля).
- **Проверка:** генерация идемпотентна; build зелёный.

### B3 · iOS codegen (внешние libs разрешены)
- **Выбор инструмента (решить в плане):** Apple `swift-openapi-generator` (SPM build-plugin, official) ЛИБО кастомный build-time скрипт (Node/Python) → vanilla `Codable` в `ios/.../Networking/Generated/`.
  - Рекоменд.: оценить `swift-openapi-generator` — это Apple, build-time, типобезопасно; но тянет `swift-openapi-runtime` + меняет транспорт. Если не хотим менять URLSession-транспорт — кастомный скрипт→vanilla Codable проще интегрировать в XcodeGen (sources как generated group). **Планировщик: сравнить, выбрать, обосновать.**
- Сгенерировать DTO; провалидировать против текущих рукописных Codable.
- **Проверка:** генерация идемпотентна; iOS build зелёный; xcodegen подхватывает generated/.

### B4 · Миграция потребителей (read-DTO сначала)
- Заменить рукописные DTO на сгенерированные, начиная с самых расходящихся read-DTO: `CategoryRead`/`CategoryV10`, `Subscription*`, `Me*`, `Actual*`. Убрать «pending schema» Optional-заглушки (синхронизировав `CategoryRead` если поля реально на проводе).
- Web + iOS параллельно (разные стеки).
- **Проверка:** оба клиента собираются на сгенерированных типах; полные test-suites зелёные; ноль behavioral-регрессий.

### B5 · CI sync-guard
- Скрипт/CI-чек: «сгенерированные типы в синхроне со схемой» (regen + git diff пуст). Документировать regen-команду.

**Acceptance фазы 69:** TS+Swift DTO генерируются из OpenAPI; ключевые read-DTO мигрированы; «pending schema» заглушек нет; sync-guard в CI; все 3 стека зелёные.

---

## ФАЗА 70 — Convergence & Abstractions (workstreams C, D, E)

### C · R3 — Схождение legacy/V10 API (после B; ОБА ШЕЛЛА ЖИВУТ)
- C1: Аудит каждого route — legacy enum (`ActualAPI`/`CategoriesAPI`/`SubscriptionsAPI`) vs V10 (`*V10API`). Выбрать canonical (V10 — суперсет).
- C2: Пометить legacy `@available(*, deprecated, message:)`; мигрировать call-sites на canonical там, где **доказуемо эквивалентно** (build+tests как гейт). Где не эквивалентно — оставить + тикет.
- C3: Debt-реестр из «legacy↔V10» комментариев (их десятки) — в `.planning/`.
- **Важно:** схождение на уровне API/DTO, НЕ шеллов. Оба шелла продолжают работать.
- **Проверка:** legacy-enums помечены deprecated; build без новых warnings-as-errors; полные suites зелёные.

### D · R6 — Общий доменный слой iOS (KEEP BOTH)
- D1: Инвентарь экранов, дублированных между `Features/` (v06) и `FeaturesV10/`: Home, Transactions, Subscriptions, Accounts, Plan, Savings, Onboarding, Settings, AI.
- D2: Извлечь общие **ViewModels/Data/бизнес-логику** в shared-слой, который потребляют оба шелла (Views остаются per-shell). Цель: устранить дрейф (разные delete-стратегии, разные mutation-паттерны, разные API per screen).
- D3: Начать с домена наибольшего риска дрейфа (Subscriptions ИЛИ Savings — логика живёт в обоих мирах). По одному домену за раз, с тестами.
- **Проверка:** оба шелла используют общий VM/Data слой для мигрированного домена; поведение идентично; suites зелёные.
- **Риск:** крупно. Делать инкрементально, домен за доменом; не «большой взрыв».

### E · R7 — Cross-cutting абстракции (после B/C)
- E1: **Error-policy injection** — вынести `APIClient` switch (статус→доменная ошибка + logout-callback) в инъектируемую `ErrorHandling`-стратегию; фичи объявляют политику декларативно. Это **корневой фикс** класса бага `suppressForbiddenHandler` (per-call булевы флаги → типизированная политика).
- E2: **BusinessDate тип** — отдельный от audit-времён на всех клиентах; MSK-семантика как свойство типа, не оговорка в decoder. Убирает MSK-decode-pin band-aid. (Может генерироваться R4-codegen'ом.)
- **Проверка:** APIClient не содержит per-call auth-флагов; date-decode без эвристики формата; suites зелёные.

**Acceptance фазы 70:** legacy API deprecated+converged (оба шелла живы); ≥1 домен на общем слое (паттерн задан для остальных); error-policy инъектируема; BusinessDate введён.

---

## BACKLOG — Web↔iOS Parity (workstream F, не блокеры)
- F1: AI category hint в web AddSheet (`screensV10/AddSheet`) — есть в iOS, нет в web. (PII: `description`→`/ai/suggest-category`, debounce, как в legacy.)
- F2: AI chat proposals/tools в web v10 `AiMount` (сейчас рендерит только токены; создание транзакций через чат только в legacy).
- F3: `categoryVisuals` sync-guard — держать набор ключей/подстрок + fallback-формулу (`id % keys.length`) синхронными между `frontend/src/utils/categoryVisuals.ts` и iOS-зеркалом. Идеально — общий источник (или тест-guard).

---

## Pending HUMAN-UAT (live-smoke — ручное, для тебя)
Функционал верифицирован в коде; на устройстве/живом backend не прогонялся. Прогнать на симуляторе/устройстве и отметить через `/gsd-verify-work`:
- `62-HUMAN-UAT.md` (5): GoalDetail load/delete/deposit, NewGoal due-day MSK, deposit disabled-state.
- `63-HUMAN-UAT.md` (5): post/unpost провод, create monthly+счёт+день partial-failure, edit legacy без day=1, notification fire-date восточнее МСК.
- `64-HUMAN-UAT.md` (3): AI chip (Pro), account Picker save, non-Pro 403 silent (no logout).
- `66-HUMAN-UAT.md` (3): theme switch v06→V10, СТАРЫЙ IOS stay+persist, full build.
- `67-HUMAN-UAT.md` (2): iOS 609-suite live run, миграции 0025/0026 на prod/staging.

---

## Окружение и дисциплина (для исполнителя)
- **Ветка:** v1.0-maximal-poster. Коммиты атомарные. End git commit messages с `Co-Authored-By: Claude ...`.
- **iOS:** новые .swift → `cd ios && xcodegen generate` перед build. Build/test: XcodeBuildMCP (`session_show_defaults` сначала, default iPhone 17 Pro) ИЛИ fallback `xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` (нет `make test`). swift-format на тронутые файлы.
- **Backend:** локальный `.venv` БИТЫЙ (symlinks на удалённый python3) → pytest гонять в docker `api`-контейнере (`docker compose up -d --build api`, потом вернуть стек в base+dev). Миграции alembic: revision id ≤32 символов (был overflow). Money BIGINT cents, NO float. Бизнес-даты DATE (MSK на проводе), audit TIMESTAMPTZ UTC. RLS/tenant scope per-request.
- **Web:** `cd frontend && npm run build` (tsc -b + vite) + `npx vitest run`.
- **Дисциплина фазы:** per-codebase build/test гейты на каждый план; code-review→fix→verify в конце фазы. ДЛЯ ЭТИХ архитектурных фаз — **plan-checker ВКЛ** (качество планирования критично; раньше отключали ради токенов).
- **GSD-flow:** добавить фазы 68/69/70 в ROADMAP (с строкой `**Plans:**` сразу под заголовком — иначе `phase.complete` мис-матчит regex), CONTEXT (спец = этот файл + review-doc), plan→execute волнами→review→fix→verify.

## Известные gsd-tool quirks
- `roadmap_complete` в `roadmap.analyze` структурно всегда false для этого ROADMAP-формата → ориентироваться на `disk_status`.
- `phase.complete N` мис-матчит чужую `**Plans:**` строку, если у фазы её нет под заголовком (однажды задел фазу 29 — проверять diff после).
- `state.advance-plan`/`record-metric` не парсят свободный «Current Position» формат STATE.md → обновлять STATE вручную; `roadmap.update-plan-progress` работает.
- requirement-IDs вида P0-1/R4 — из review-doc, НЕ в REQUIREMENTS.md → `requirements.mark-complete` no-op, ожидаемо.
