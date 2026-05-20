# Phase 70: Convergence & Abstractions (R3/R6/R7) - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Mode:** Spec-driven (план-файл — спецификация; нарезка/инкрементальность = планировщик решает)

<domain>
## Phase Boundary

Поверх стабильного codegen-контракта (фаза 69) свести legacy/V10 API (R3), извлечь общий доменный слой iOS чтобы два шелла не дрейфовали (R6), ввести инъектируемые cross-cutting абстракции (R7). Преимущественно iOS-работа.

**Источники истины:**
- `.planning/CONVERGENCE-AND-DEBT-PLAN.md` — §«ФАЗА 70 — Convergence & Abstractions (workstreams C, D, E)» (C/D/E детально) + §«Окружение и дисциплина».
- `.planning/v1.1.2-MULTILEAD-REVIEW.md` — R3/R6/R7 (первоисточник).

**Решения владельца (BAKED IN — критично):**
- **R6 = ОСТАВИТЬ ОБА ШЕЛЛА НАВСЕГДА** (iOS `MainShell` ↔ `V10MainShell` + web v06-shell). Схождение — на уровне API/DTO и доменной логики, **НЕ шеллов**. web v06-shell НЕ удалять. Цель R6: извлечь общий слой, чтобы экраны не дрейфовали (разные delete-стратегии/mutation-паттерны/API per screen).
- Внешние библиотеки разрешены когда оправданы.

Базис: фаза 69 дала единый сгенерированный контракт (`Gen.*` iOS, `generated/schema.ts` web) + sync-guard. Фаза 68 — зелёный baseline (backend 778, web 738, iOS 609).

### В scope

**C · R3 — Схождение legacy/V10 API (ОБА ШЕЛЛА ЖИВУТ)**
- C1: Аудит каждого route — legacy enum-API (`ActualAPI`/`CategoriesAPI`/`SubscriptionsAPI`) vs V10 (`*V10API`). Выбрать canonical (V10 — суперсет).
- C2: Пометить legacy `@available(*, deprecated, message:)`; мигрировать call-sites на canonical там, где **доказуемо эквивалентно** (build+tests — гейт). Где не эквивалентно — оставить + тикет.
- C3: Debt-реестр из «legacy↔V10» комментариев (их десятки) — в `.planning/`.
- Важно: схождение API/DTO, НЕ шеллов.

**D · R6 — Общий доменный слой iOS (KEEP BOTH)**
- D1: Инвентарь экранов, дублированных между `Features/` (v06) и `FeaturesV10/`: Home, Transactions, Subscriptions, Accounts, Plan, Savings, Onboarding, Settings, AI.
- D2: Извлечь общие **ViewModels/Data/бизнес-логику** в shared-слой, потребляемый обоими шеллами (Views остаются per-shell). Цель: устранить дрейф.
- D3: Начать с домена наибольшего риска дрейфа (Subscriptions ИЛИ Savings — логика в обоих мирах). **ПО ОДНОМУ ДОМЕНУ за раз**, с тестами. Эта фаза задаёт ПАТТЕРН на ≥1 домене; остальные домены — follow-up/backlog.
- Риск: крупно. Инкрементально, домен за доменом; НЕ «большой взрыв».

**E · R7 — Cross-cutting абстракции**
- E1: **Error-policy injection** — вынести `APIClient` switch (статус→доменная ошибка + logout-callback) в инъектируемую `ErrorHandling`-стратегию; фичи объявляют политику декларативно. Корневой фикс класса бага `suppressForbiddenHandler` (per-call булевы флаги → типизированная политика). APIClient НЕ должен содержать per-call auth-флагов.
- E2: **BusinessDate тип** — отдельный от audit-времён на клиентах; MSK-семантика как свойство типа, не оговорка в decoder. Убирает MSK-decode-pin band-aid. (Может питаться от R4-codegen дат-типов фазы 69.)

### ВНЕ scope (не планировать)
- Удаление любого шелла (владелец: оба живут).
- Полная миграция ВСЕХ доменов в shared-слой (D задаёт паттерн на ≥1 домене; остальное — backlog).
- Backlog F (web↔iOS parity: AI hint в web AddSheet, chat proposals, categoryVisuals sync). HUMAN-UAT live-smoke.
- Полная миграция write-DTO/мутаций на codegen (хвост 69 — backlog).
</domain>

<decisions>
## Implementation Decisions

### Структура (для планировщика)
- C (R3 API convergence) — относительно механическое (deprecate + migrate equivalent), хороший первый workstream; порождает чистую базу для D.
- E1 (error-policy injection) — корневой фикс, затрагивает APIClient (cross-cutting) → координировать с любыми call-site миграциями C.
- E2 (BusinessDate) — может опираться на codegen дат-типы; самостоятельный.
- D (shared domain) — крупнейший риск; ОДИН домен за фазу (планировщик выбирает Subscriptions ИЛИ Savings, обосновывает). Делать инкрементально.
- Порядок исполнения (sequential на main-дереве): рекомендуется C → E1/E2 → D (D поверх сведённого API + инъектируемых абстракций), но планировщик решает по file-overlap (всё трогает APIClient/Networking — сериализовать аккуратно).
- Каждый план — атомарные коммиты, per-stack build/test гейт; ОБА шелла должны продолжать собираться и работать после каждого плана.

### D — выбор первого домена
- Планировщик выбирает Subscriptions ИЛИ Savings (оба «живут в двух мирах» с дрейфом delete/mutation-стратегий) и обосновывает. Извлекает ViewModel/Data/бизнес-логику в shared, оба шелла потребляют; Views per-shell остаются. Поведение идентично; тесты обоих путей.

### E1 — дизайн инъекции
- `ErrorHandling`-стратегия: тип, инкапсулирующий маппинг статус→доменная ошибка + политику logout (когда 401/403→onUnauthenticated, когда 402→доменная ошибка без logout). Фичи объявляют политику декларативно вместо `suppressForbiddenHandler: Bool` и подобных per-call флагов. Сохранить текущее корректное поведение (после 67-03/67-05: require_pro=402 без logout; 401/403=logout incl. SSE).

### Claude's Discretion
- Точная нарезка планов/волн; выбор первого D-домена; дизайн `ErrorHandling`/`BusinessDate` типов; глубина миграции call-sites в C (что «доказуемо эквивалентно»).
- Где хранить debt-реестр (`.planning/`).
</decisions>

<code_context>
## Existing Code Insights

- **iOS legacy enum-API:** `ios/BudgetPlanner/Networking/Endpoints/` — `ActualAPI`/`CategoriesAPI`/`SubscriptionsAPI` (legacy) vs `*V10API` (V10 суперсет). Десятки «legacy↔V10» комментариев по коду.
- **iOS APIClient:** `ios/BudgetPlanner/Networking/APIClient.swift` — status→error switch, logout-callback (`onUnauthenticated`), MSK date-decode (после 67/69). Транспорт URLSession (НЕ менять без необходимости). После 69 read-DTO мигрированы на `Gen.*`/mirrors.
- **iOS два шелла:** `MainShell` (v06, `Features/*`) ↔ `V10MainShell` (`FeaturesV10/*`). Дублированные экраны/VM. Тумблер `@AppStorage("ui.theme")`. Seam-эталон: `SubscriptionsViewModel.API`, Savings seam (67-07).
- **iOS даты:** decoder с MSK-семантикой / format-эвристикой (band-aid из 67/69). BusinessDate должен стать типом.
- **Backend:** R3 — это про iOS-клиентские enum-API, не backend; backend контракт уже единый (фаза 69). Тесты в docker.

### Окружение / дисциплина
- **iOS:** новые .swift → `cd ios && xcodegen generate` перед build. Build/test: `xcodebuild build/test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | xcbeautify` (нет `make test`; у executor НЕТ XcodeBuildMCP — только xcodebuild CLI). swift-format ТОЛЬКО тронутые файлы (НЕ tree-wide — урок 68-04). Baseline iOS suite 609.
- **ОБА шелла** должны собираться/работать после каждого плана (build обоих путей; тесты обоих).
- **Backend:** pytest в docker (`docker compose -f ... -f docker-compose.test.yml exec -T api /app/.venv/bin/python -m pytest`); restore `docker compose up -d`. Money BIGINT cents. MSK даты на проводе DATE.
- **Web:** `npm run build` + `npm run typecheck:test` + `npx vitest run` (если трогается web; R3/R6/R7 преимущественно iOS — web обычно не затрагивается, кроме сверки контракта).
- Sync-guard: после любых изменений контракта — `bash contract/check_contract_sync.sh` зелёный (но фаза 70 типы не меняет — потребители).
- Коммиты атомарные с `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
</code_context>

<specifics>
## Specific Ideas
- Acceptance фазы 70: legacy-enums помечены `@available(deprecated)` + сведены доказуемо-эквивалентные call-sites (ОБА шелла живы, build без новых warnings-as-errors); ≥1 iOS-домен на общем VM/Data слое (паттерн задан, поведение идентично); APIClient без per-call auth-флагов (error-policy инъектируема); BusinessDate введён (date-decode без эвристики формата); полные suites зелёные.
- Это последняя архитектурная фаза followup'а; после неё — UI/UX ревью-цикл (отдельная задача владельца).
</specifics>

<deferred>
## Deferred Ideas
- Полная миграция остальных доменов в shared-слой (D-паттерн масштабируется в backlog).
- Backlog F (web↔iOS parity). HUMAN-UAT live-smoke. Хвост write-DTO codegen-миграции.
</deferred>
