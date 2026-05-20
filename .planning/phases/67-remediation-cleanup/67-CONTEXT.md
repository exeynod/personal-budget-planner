# Phase 67: v1.1.2 Remediation & Cleanup - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Spec-driven (review-документ — точная спецификация; grey areas auto-decided)

<domain>
## Phase Boundary

Устранить находки 5-лидового кросс-доменного ревью и провести механический cleanup. **Полная спецификация: `.planning/v1.1.2-MULTILEAD-REVIEW.md`** (читать как источник истины — там severity, file:line, фиксы, проверки для каждого пункта).

Кросс-доменная фаза: затрагивает iOS (Swift), backend (Python/FastAPI), web (React/TS).

### В scope
- **P0 (blockers):** P0-1 backend SubscriptionReadV10 response_model; P0-2 web tsc-build fix; P0-3 iOS suppressForbiddenHandler revert (require_pro=402 подтверждён).
- **P1 (major):** P1-1 BE embeddings user_id; P1-2 BE double-post race; P1-3 iOS error.localizedDescription leak; P1-4 iOS Savings/GoalDetail API-seam + reload-coalesce + тесты; P1-5 iOS SSE 401/403 auth; P1-6 web ui.theme split; P1-7 APIClient auth/date regression-тесты.
- **P2 (minor, 13):** см. таблицу P2 в review-doc.
- **Cleanup:** R1 (iOS дедуп: account-label, banner ViewModifier, LocalNotifications, APIError→RU mapper, dead code), R2 (iOS test-seam unification), R5 (web мёртвый v06-shell + alert→Toast + парсеры), R8 (backend float→cents, get_db, MeResponse-билдер, KindStr), R9 (docs multi-tenant).

### ВНЕ scope (отложено владельцу/спайку — НЕ планировать)
- R3 — схождение legacy/V10 API (крупный риск).
- R4 — OpenAPI codegen (инфра-спайк).
- R6 — судьба двух iOS-шеллов (продуктовое решение).
- R7 — error-policy/BusinessDate абстракции (после стабилизации контракта).
</domain>

<decisions>
## Implementation Decisions

### Структура (для планировщика)
- Группировать по волнам с учётом codebase-независимости (iOS/BE/web independent → могут параллелиться) И file-overlap внутри iOS (APIClient трогают P0-3/P1-5/P1-7; SavingsViewModel — P1-4/R1/R2 → сериализовать).
- Рекомендуемая последовательность из review-doc «Suggested execution order»: сначала P0 (P0-1 backend — самый дешёвый/важный), затем P1 security+iOS, затем cleanup R1/R2 (разблокируют тесты P1-4/P1-7), затем web theme+dead-shell, затем P2/R8/R9.
- Каждый план — атомарные коммиты, проверка билда/тестов соответствующего стека.

### P0-3 / suppressForbiddenHandler (важная деталь)
- `require_pro` отдаёт **402** (PRO_TIER_REQUIRED), не 403 — подтверждено в коде. Удалить флаг `suppressForbiddenHandler`; в `AISuggestCategoryAPI.suggest` полагаться на существующий nil-on-error (402→serverError→catch→nil); восстановить строгий 403→`onUnauthenticated`. Согласовать с P1-5 (SSE 401/403) и P1-7 (тесты).

### R5 / мёртвый web v06-shell
- Сначала определить достижимость: после P1-6 (split ui.theme) v06-web-shell либо нужен, либо мёртв (~50 файлов). Решение по умолчанию (auto): если grep подтверждает, что v06-shell недостижим из UI и не нужен — пометить к удалению, но фактическое удаление ~50 файлов — отдельная задача с осторожностью; в этой фазе как минимум развести ключ (P1-6) и зафиксировать dead-shell-инвентарь. Реальное удаление — на усмотрение планировщика (низкий риск если подтверждённо мёртв).

### Тестовая дисциплина
- iOS: новые .swift → `cd ios && xcodegen generate` перед build; xcodebuild build+test (iPhone 17 Pro) зелёные.
- Backend: pytest для затронутых эндпоинтов (subscriptions response, embeddings, double-post savepoint).
- Web: `npm run build` (tsc -b + vite) зелёный.

### Claude's Discretion
- Точная нарезка планов/волн (планировщик решает по file-overlap).
- Глубина R5 (развести ключ vs полное удаление dead-shell).
- Формулировки RU error-copy в APIError mapper.
</decisions>

<code_context>
## Existing Code Insights

Полный inventory с file:line — в `.planning/v1.1.2-MULTILEAD-REVIEW.md`. Ключевое:
- **Backend:** `app/api/routes/subscriptions.py` (response_model), `app/api/schemas/subscriptions.py` (SubscriptionReadV10 уже есть), `app/api/routes/categories.py` (_refresh_embedding), `app/services/subscriptions.py` (post race), `app/api/dependencies.py:412` (require_pro→402), `app/services/spend_cap.py` (float est_cost).
- **iOS:** `Networking/APIClient.swift` (suppressForbiddenHandler, date decode, error switch), `Networking/SSEClient.swift` (401/403), `Endpoints/AISuggestCategoryAPI.swift`, `Features/Savings/{SavingsViewModel,GoalDetailViewModel}.swift` (нет seam/coalesce), `Features/Transactions/TransactionEditor.swift` (error leak, account-label), `Features/Management/{SettingsView,SubscriptionsView}.swift`, `Domain/LocalNotifications.swift` (dup overloads), `Features/Transactions/AccountPickerLogic.swift` (canonical label). Seam-эталон: `SubscriptionsViewModel.API`.
- **Web:** `frontend/src/api/v10/analytics.ts:19`, `screensV10/Ai/AiView.tsx:182`, `main.tsx` + `screensV10/common/useTheme.ts` (ui.theme collision), `screensV10/.../{SavingsMount,PlanMount,SettingsMount}.tsx` (window.alert), `hooks/useAiCategorize.ts` (stale-guard), `screensV10/.../computeSubscriptions.ts` (date parse).

### Integration Points
- iOS APIClient — cross-cutting (P0-3/P1-5/P1-7 трогают; сериализовать).
- Backend response_model fix разблокирует iOS phase 63 end-to-end.
</code_context>

<specifics>
## Specific Ideas
- Источник истины для каждого пункта — `.planning/v1.1.2-MULTILEAD-REVIEW.md` (ID-ссылки P0-x/P1-x/P2-x/R-x). Планировщик и исполнители читают его.
- Per-phase верификация фаз 62-66 прошла «в коде», но не покрыла сквозной контракт — поэтому P0-1 (backend↔iOS) критичен и нужен integration-тест.
</specifics>

<deferred>
## Deferred Ideas
- R3 (legacy/V10 API convergence), R4 (OpenAPI codegen), R6 (two-shell product decision), R7 (error-policy/BusinessDate abstractions) — вне scope фазы 67, отдельные задачи.
- Web↔iOS parity gaps (AI hint в web AddSheet, chat proposals в web) — бэклог, не блокеры.
</deferred>
