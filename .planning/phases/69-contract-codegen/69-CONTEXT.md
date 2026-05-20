# Phase 69: Contract Codegen (R4) - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Mode:** Spec-driven (план-файл — спецификация; B3 tool-choice = планировщик решает с обоснованием)

<domain>
## Phase Boundary

Единый источник истины для API-контракта: генерировать TS и Swift DTO из FastAPI OpenAPI; убрать 3 рукописных набора типов и «pending schema» заглушки. Наибольший ROI против дрейфа контракта между backend/web/iOS.

**Источники истины (читать как спецификацию):**
- `.planning/CONVERGENCE-AND-DEBT-PLAN.md` — §«ФАЗА 69 — Contract Codegen (R4, workstream B)» (B1-B5, с проверками) + §«Окружение и дисциплина».
- `.planning/v1.1.2-MULTILEAD-REVIEW.md` — R4 (первоисточник; дрейф контракта, «pending schema»).

**Решения владельца (baked in):**
- Внешние библиотеки РАЗРЕШЕНЫ когда оправданы (no-third-party — конвенция, не закон). Для R4 это открывает Apple `swift-openapi-generator`.
- R4 делать ЦЕЛИКОМ: полный codegen (TS+Swift) + миграция потребителей (read-DTO сначала).

Базис: фаза 68 дала полностью зелёный baseline всех 3 стеков (backend 774 pytest, web build+typecheck:test+vitest 738, iOS suite) — доверенная точка отсчёта для проверки «ноль behavioral-регрессий».

### В scope
- **B1 — Backend: чистый OpenAPI + dump-таргет.** Убедиться, что FastAPI отдаёт полный корректный `/openapi.json` (все `response_model` проставлены — после 67 SubscriptionReadV10 есть; проверить остальные роуты на «голый dict» вместо схемы). Добавить детерминированный dump-скрипт/таргет → артефакт `contract/openapi.json` (регенерируемый). Покрытие: subscriptions/categories/actuals/me/ai/accounts/savings/goals.
- **B2 — Web codegen.** `npm i -D openapi-typescript`; скрипт `gen:api` → `frontend/src/api/generated/schema.ts`. Дифф против текущих рукописных `types.ts` (поймать расхождения, особенно `CategoryV10` «pending schema» Optional-поля). Генерация идемпотентна; build зелёный.
- **B3 — iOS codegen (внешние libs разрешены).** ПЛАНИРОВЩИК сравнивает и выбирает с обоснованием: Apple `swift-openapi-generator` (SPM build-plugin, official, type-safe, НО тянет `swift-openapi-runtime` + меняет транспорт) ЛИБО кастомный build-time скрипт (Node/Python) → vanilla `Codable` в `ios/.../Networking/Generated/` (проще интегрировать в XcodeGen sources-group, сохраняет URLSession-транспорт). Сгенерировать DTO; провалидировать против текущих рукописных Codable. Идемпотентно; iOS build зелёный; xcodegen подхватывает generated/.
- **B4 — Миграция потребителей (read-DTO сначала).** Заменить рукописные DTO на сгенерированные, начиная с самых расходящихся read-DTO: `CategoryRead`/`CategoryV10`, `Subscription*`, `Me*`, `Actual*`. Убрать «pending schema» Optional-заглушки (синхронизировав `CategoryRead` если поля реально на проводе). Web + iOS параллельно. Оба клиента собираются на сгенерированных типах; полные test-suites зелёные; ноль behavioral-регрессий.
- **B5 — CI sync-guard.** Скрипт/CI-чек: «сгенерированные типы в синхроне со схемой» (regen + git diff пуст). Документировать regen-команду.

### ВНЕ scope (не планировать)
- R3 (схождение legacy/V10 API), R6 (shared iOS domain), R7 (error-policy/BusinessDate) — фаза 70. ОДНАКО: если B4 codegen естественно генерирует тип для дат — это вход для R7-E2 BusinessDate в фазе 70, не здесь.
- Backlog F (web↔iOS parity). HUMAN-UAT live-smoke.
- Полная миграция ВСЕХ DTO (write-DTO, мутации) — фаза начинает с read-DTO; остаток может перетечь в 70/бэклог, но «pending schema» заглушки убрать обязательно.
</domain>

<decisions>
## Implementation Decisions

### Структура (для планировщика)
- B1 (backend) — фундамент, делать первым (порождает openapi.json, от которого зависят B2/B3).
- B2 (web) и B3 (iOS) — независимы после B1, могут идти параллельными планами (но исполнять последовательно на main-дереве).
- B4 миграция — после генерации; read-DTO сначала; web и iOS отдельные планы.
- B5 sync-guard — последним.
- Каждый план — атомарные коммиты, per-stack build/test гейт.

### B3 — обязательное сравнение в плане
- Планировщик ДОЛЖЕН сравнить `swift-openapi-generator` vs кастомный скрипт→vanilla Codable по критериям: (1) сохранение URLSession-транспорта (текущий APIClient), (2) интеграция в XcodeGen-workflow (`project.yml`, generated sources group), (3) идемпотентность/детерминизм, (4) объём изменений в потребителях, (5) поддерживаемость. Light-research официальной доки разрешён (context7/WebFetch). Записать выбор + обоснование в план.
- Дефолтная гипотеза (НЕ обязательна): кастомный скрипт→vanilla Codable проще интегрировать без смены транспорта; но если swift-openapi-generator даёт явно лучший type-safety/maintenance при приемлемой интеграции — выбрать его. Решение за планировщиком.

### Детерминизм OpenAPI dump
- Dump должен быть детерминированным (стабильный порядок ключей) чтобы sync-guard (B5) и git-diff работали. Учесть сортировку при сериализации.

### «Pending schema» заглушки
- `CategoryV10`/`CategoryRead` имеют Optional-поля-заглушки, добавленные пока схема была неясна. После codegen: если поля реально на проводе — отразить в backend schema и сгенерировать как есть; если нет — убрать заглушки. Не оставлять «pending» комментарии.

### Claude's Discretion
- Точная нарезка планов/волн.
- B3 tool-choice (с обоснованием).
- Где разместить `contract/openapi.json` и dump-скрипт (repo-root `contract/` или `backend`-папка).
- Формат web `generated/schema.ts` потребления (openapi-typescript даёт `paths`/`components` namespace — как адаптеры маппят на текущие call-sites).
</decisions>

<code_context>
## Existing Code Insights

- **Backend:** FastAPI app (`app/main.py` / `app/api/router.py`), роуты в `app/api/routes/*.py`, схемы в `app/api/schemas/*.py`. После фазы 67 `SubscriptionReadV10` response_model есть. Проверить КАЖДЫЙ роут на наличие `response_model=` (а не возврат голого dict / `JSONResponse`). `/openapi.json` отдаётся FastAPI из коробки. Запуск: docker `api` (локальный .venv битый).
- **Web:** рукописные типы в `frontend/src/api/types.ts` + `frontend/src/api/v10/*.ts`. `CategoryV10` с «pending schema» Optional-полями. Потребители — `screensV10/*` и legacy `screens/*`.
- **iOS:** рукописные Codable DTO в `ios/BudgetPlanner/Networking/` (Models/DTOs + Endpoints/*API.swift). Legacy enum-API (`ActualAPI`/`CategoriesAPI`/`SubscriptionsAPI`) + V10 (`*V10API`). XcodeGen: `ios/project.yml`; новые .swift → `cd ios && xcodegen generate` перед build. Транспорт — URLSession в `APIClient.swift`.

### Окружение / дисциплина
- **Backend:** pytest/run в docker `api` (`docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml exec -T api /app/.venv/bin/python -m pytest ...`); restore `docker compose up -d`. Money BIGINT cents NO float. Бизнес-даты DATE (MSK на проводе), audit TIMESTAMPTZ UTC. Alembic revid ≤32 символов (миграции в 69 маловероятны — это типы, не схема БД).
- **Web:** `cd frontend && npm run build` (tsc -b + vite) + `npm run typecheck:test` + `npx vitest run` зелёные.
- **iOS:** XcodeBuildMCP (`session_show_defaults` сначала, default iPhone 17 Pro) ИЛИ `xcodebuild build/test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` (нет `make test`). swift-format на тронутые файлы (НЕ tree-wide — только свои; см. урок 68-04). `cd ios && xcodegen generate` после добавления generated sources.
- Коммиты атомарные с `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
</code_context>

<specifics>
## Specific Ideas
- Acceptance фазы 69: TS+Swift DTO генерируются из OpenAPI; ключевые read-DTO мигрированы; «pending schema» заглушек нет; sync-guard в CI; все 3 стека зелёные; ноль behavioral-регрессий (фаза 68 baseline — эталон).
- Это ФУНДАМЕНТ для фазы 70 (convergence/abstractions поверх стабильного контракта).
</specifics>

<deferred>
## Deferred Ideas
- R3/R6/R7 — фаза 70. BusinessDate (R7-E2) может питаться от codegen дат-типов.
- Полная миграция write-DTO/мутаций — после read-DTO (70/бэклог), но pending-заглушки убрать в 69.
</deferred>
